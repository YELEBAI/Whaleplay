/**
 * GenerationSessionManager — App-level singleton that manages AI generation
 * abort controllers independently of React component lifecycle.
 *
 * Components call start() to register a generation and receive an AbortSignal.
 * The signal survives component unmount — only explicit abort() or starting
 * a new generation with the same key will cancel it.
 *
 * Supports parallel generations via unique keys.
 */

type SessionKey = string;

interface ActiveSession {
  key: SessionKey;
  controller: AbortController;
  startedAt: number;
}

class GenerationSessionManager {
  private active = new Map<SessionKey, ActiveSession>();
  private listeners = new Set<() => void>();

  /** Register a new generation, aborting any existing one with the same key.
   * Returns the AbortController so callers can read controller.signal. */
  start(key: SessionKey): AbortController {
    this.abort(key);
    const controller = new AbortController();
    this.active.set(key, { key, controller, startedAt: Date.now() });
    this.notify();
    return controller;
  }

  /** Abort and remove a specific generation. */
  abort(key: SessionKey): void {
    const session = this.active.get(key);
    if (session) {
      session.controller.abort();
      this.active.delete(key);
      this.notify();
    }
  }

  /** Check if a generation with the given key is currently active. */
  isActive(key: SessionKey): boolean {
    return this.active.has(key);
  }

  /** Abort all active generations (e.g., on app shutdown). */
  abortAll(): void {
    for (const key of [...this.active.keys()]) {
      this.abort(key);
    }
  }

  /** Get count of active generations. */
  get activeCount(): number {
    return this.active.size;
  }

  // ── React integration (useSyncExternalStore) ──

  subscribe(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notify(): void {
    for (const cb of this.listeners) {
      cb();
    }
  }
}

export const generationSessions = new GenerationSessionManager();

// ── React hook ──

import { useSyncExternalStore, useCallback } from "react";

/** React hook: returns whether a generation is active for the given key. */
export function useGenerationActive(key: SessionKey): boolean {
  const subscribe = useCallback((cb: () => void) => generationSessions.subscribe(cb), []);
  const getSnapshot = useCallback(() => generationSessions.isActive(key), [key]);
  return useSyncExternalStore(subscribe, getSnapshot);
}
