/**
 * BuilderSessionStore — Module-level store for NeoBuilder messages and
 * the current page-bound generation state.
 *
 * Keyed by builderSessionId. Each session tracks its messages and running
 * generation independently, enabling parallel sessions.
 *
 * Generation is intentionally not kept alive across page unmounts. The page
 * calls abort() during cleanup so switching away stops the current turn.
 */

import { useSyncExternalStore, useCallback } from "react";
import { generateId } from "@neo-tavern/shared";
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
  controller: AbortController | null;
  snapshot: Snapshot;
}

type Snapshot = Pick<SessionState, "sessionId" | "messages" | "running" | "error">;

class BuilderSessionStore {
  private sessions = new Map<string, SessionState>();
  private listeners = new Set<() => void>();

  private getOrCreate(sessionId: string): SessionState {
    let session = this.sessions.get(sessionId);
    if (!session) {
      const snapshot: Snapshot = {
        sessionId,
        messages: [],
        running: false,
        error: null,
      };
      session = { ...snapshot, controller: null, snapshot };
      this.sessions.set(sessionId, session);
    }
    return session;
  }

  private refreshSnapshot(session: SessionState): void {
    session.snapshot = {
      sessionId: session.sessionId,
      messages: session.messages,
      running: session.running,
      error: session.error,
    };
  }

  private commit(session: SessionState): void {
    this.refreshSnapshot(session);
    this.notify();
  }

  restore(sessionId: string, messages: BuilderMessage[]): void {
    const s = this.getOrCreate(sessionId);
    s.messages = messages;
    s.running = false; // never restore running=true — stale
    s.error = null;
    s.controller = null;
    this.commit(s);
  }

  getSnapshot(sessionId: string): Snapshot {
    return this.getOrCreate(sessionId).snapshot;
  }

  setMessages(sessionId: string, messages: BuilderMessage[]): void {
    const s = this.getOrCreate(sessionId);
    s.messages = messages;
    this.commit(s);
  }

  abort(sessionId: string): void {
    const s = this.getOrCreate(sessionId);
    s.controller?.abort();
    s.controller = null;
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
      this.commit(s);
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
    const controller = new AbortController();
    s.controller = controller;
    this.commit(s);

    const { signal } = controller;

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
          this.commit(s);
        },
        onReasoningDelta: (delta) => {
          s.messages = s.messages.map((m) =>
            m.id === assistantId ? { ...m, reasoningContent: `${m.reasoningContent ?? ""}${delta}` } : m,
          );
          this.commit(s);
        },
        onToolEvent: (event: NeoBuilderToolEvent) => {
          s.messages = s.messages.map((m) =>
            m.id === assistantId ? { ...m, toolEvents: upsertToolEvent(m.toolEvents, event) } : m,
          );
          this.commit(s);
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
      if (signal.aborted) {
        s.messages = s.messages.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: m.content || "生成已停止。",
                backgroundCreation: false,
                pending: false,
                completedAt: Date.now(),
              }
            : m,
        );
        return null;
      }
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
      if (s.controller === controller) s.controller = null;
      this.commit(s);
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
