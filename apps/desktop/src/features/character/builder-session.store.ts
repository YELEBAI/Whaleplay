/**
 * BuilderSessionStore — Module-level store for NeoBuilder generation state
 * that survives React component mount/unmount cycles.
 *
 * Keyed by builderSessionId. Each session tracks its messages and running
 * generation independently, enabling parallel sessions.
 *
 * When a component unmounts mid-generation, the store keeps accumulating
 * stream deltas. On remount, the component re-subscribes and sees the
 * latest state. The component is responsible for syncing workspace-level
 * state (draft, creationPlan, etc.) after sendMessage completes.
 */

import { useSyncExternalStore, useCallback } from "react";
import { generateId } from "@neo-tavern/shared";
import { generationSessions } from "@/app/generation-session";
import { useSettingsStore } from "@/features/settings/settings.store";
import { runNeoCharacterBuilderTurn } from "@/features/character/neo-character-builder";
import { searchWeb } from "@/features/character/web-search";
import {
  toConversation,
  shouldRunBuilderTurnInBackground,
  getBackgroundResultContent,
  upsertToolEvent,
} from "@/pages/neo-builder/utils";

import type { BuilderMessage, WorldbookDraft } from "@/pages/neo-builder/types";
import type { NeoBuilderTurnResult, NeoBuilderToolEvent } from "@/features/character/neo-character-builder";
import type { CreateCharacterInput } from "@neo-tavern/shared";

// ── Store ──

interface SessionState {
  sessionId: string;
  messages: BuilderMessage[];
  running: boolean;
  error: string | null;
}

type Snapshot = Pick<SessionState, "sessionId" | "messages" | "running" | "error">;

class BuilderSessionStore {
  private sessions = new Map<string, SessionState>();
  private listeners = new Set<() => void>();

  private getOrCreate(sessionId: string): SessionState {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = { sessionId, messages: [], running: false, error: null };
      this.sessions.set(sessionId, session);
    }
    return session;
  }

  restore(sessionId: string, messages: BuilderMessage[]): void {
    const s = this.getOrCreate(sessionId);
    s.messages = messages;
    s.running = false; // never restore running=true — stale
    s.error = null;
    this.notify();
  }

  getSnapshot(sessionId: string): Snapshot {
    const s = this.getOrCreate(sessionId);
    return { sessionId: s.sessionId, messages: s.messages, running: s.running, error: s.error };
  }

  setMessages(sessionId: string, messages: BuilderMessage[]): void {
    this.getOrCreate(sessionId).messages = messages;
    this.notify();
  }

  abort(sessionId: string): void {
    generationSessions.abort(`neo-builder:${sessionId}`);
  }

  // ── Send message (survives unmount, returns result for component to sync) ──

  async sendMessage(
    sessionId: string,
    content: string,
    webSearchEnabled: boolean,
    workspace: {
      draft: CreateCharacterInput | null;
      worldbookDraft: WorldbookDraft | null;
      creationPlan: unknown;
      personalityPalette: unknown;
      mvu: unknown;
      statusBars: unknown;
    },
  ): Promise<NeoBuilderTurnResult | null> {
    const s = this.getOrCreate(sessionId);
    const clean = content.trim();
    if (!clean || s.running) return null;

    const config = useSettingsStore.getState().modelConfig;
    if (!config) {
      s.error = "请先配置 API";
      this.notify();
      return null;
    }

    const assistantId = generateId();
    const backgroundCreation = shouldRunBuilderTurnInBackground(
      clean,
      workspace.creationPlan as never,
      workspace.draft,
      false,
    );
    const userMessage: BuilderMessage = { id: generateId(), role: "user", content: clean, hidden: false };
    const assistantMessage: BuilderMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      pending: true,
      backgroundCreation,
      startedAt: Date.now(),
    };

    s.messages = [...s.messages, userMessage, assistantMessage];
    s.running = true;
    s.error = null;
    this.notify();

    const signal = generationSessions.start(`neo-builder:${sessionId}`).signal;

    try {
      const result = await runNeoCharacterBuilderTurn({
        conversation: toConversation(s.messages.filter((m) => m.id !== assistantMessage.id)),
        existingCharacter: null,
        currentDraft: workspace.draft,
        currentWorldbookEntries: workspace.worldbookDraft?.entries ?? [],
        creationPlan: workspace.creationPlan as never,
        personalityPalette: workspace.personalityPalette as never,
        currentMvu: workspace.mvu as never,
        currentStatusBars: workspace.statusBars as never,
        modelConfig: config,
        scopeId: sessionId,
        webSearchEnabled,
        searchWeb,
        onContentDelta: (delta) => {
          if (backgroundCreation) return;
          s.messages = s.messages.map((m) => (m.id === assistantId ? { ...m, content: `${m.content}${delta}` } : m));
          this.notify();
        },
        onReasoningDelta: (delta) => {
          s.messages = s.messages.map((m) =>
            m.id === assistantId ? { ...m, reasoningContent: `${m.reasoningContent ?? ""}${delta}` } : m,
          );
          this.notify();
        },
        onToolEvent: (event: NeoBuilderToolEvent) => {
          s.messages = s.messages.map((m) =>
            m.id === assistantId ? { ...m, toolEvents: upsertToolEvent(m.toolEvents, event) } : m,
          );
          this.notify();
        },
        signal,
      });

      const keepBackgroundCreation = backgroundCreation && !result.choices?.length && !result.questions?.length;
      s.messages = s.messages.map((m) =>
        m.id === assistantId
          ? {
              ...m,
              content: keepBackgroundCreation ? getBackgroundResultContent(result) : result.content,
              choices: result.choices,
              questions: result.questions,
              backgroundCreation: keepBackgroundCreation,
              reasoningContent: result.reasoningContent,
              toolEvents: result.toolEvents,
              usage: result.usage,
              pending: false,
              completedAt: Date.now(),
            }
          : m,
      );
      return result;
    } catch (err) {
      if (signal.aborted) return null;
      const msg = (err as Error).message || "Generation failed";
      s.error = msg;
      s.messages = s.messages.map((m) =>
        m.id === assistantId
          ? { ...m, content: msg, backgroundCreation: false, pending: false, completedAt: Date.now() }
          : m,
      );
      return null;
    } finally {
      s.running = false;
      this.notify();
    }
  }

  // ── React ──

  subscribe(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notify(): void {
    for (const cb of this.listeners) cb();
  }
}

export const builderSessions = new BuilderSessionStore();

export function useBuilderSession(sessionId: string) {
  const subscribe = useCallback((cb: () => void) => builderSessions.subscribe(cb), []);
  const getSnapshot = useCallback(() => builderSessions.getSnapshot(sessionId), [sessionId]);
  return useSyncExternalStore(subscribe, getSnapshot);
}
