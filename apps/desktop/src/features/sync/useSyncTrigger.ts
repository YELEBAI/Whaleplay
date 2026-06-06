import { useCallback } from "react";
import { useSyncStore } from "./sync.store";
import type { Message } from "@neo-tavern/shared";

/**
 * Hook called after bot message generation completes.
 *
 * When sync is enabled and connected, this would push new messages
 * to paired peers. For now it is a no-op placeholder — the actual
 * sync transport (LAN WebSocket / HTTP push) will be wired when
 * the mobile client exists.
 *
 * Usage (in useSendMessage or ChatPage):
 *
 *   const triggerSync = useSyncTrigger();
 *   // ... after assistant message is persisted:
 *   void triggerSync(newMessages);
 */
export function useSyncTrigger() {
  const enabled = useSyncStore((s) => s.enabled);
  const status = useSyncStore((s) => s.status);

  return useCallback(
    (_newMessages: Message[]) => {
      if (!enabled || status !== "online") return;
      // TODO: push newMessages to paired peers via LAN transport
      // This will be implemented when the mobile sync client exists.
      // For now, the hook exists as a stable interface so callers
      // don't change when sync transport is added later.
    },
    [enabled, status],
  );
}