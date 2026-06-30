import { useCallback, useRef, useState } from "react";
import { runChatTurn, type ChatStrategy, type TurnContext, type TurnPhase } from "@neo-tavern/core";

export function useChatTurn(strategy: ChatStrategy) {
  const [phase, setPhase] = useState<TurnPhase>("idle");
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const executeTurn = useCallback(
    async (ctx: TurnContext) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setError(null);

      try {
        return await runChatTurn(strategy, ctx, {
          signal: controller.signal,
          onPhaseChange: setPhase,
        });
      } catch (err) {
        setError(err as Error);
        setPhase("idle");
        throw err;
      }
    },
    [strategy],
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { phase, error, executeTurn, abort };
}
