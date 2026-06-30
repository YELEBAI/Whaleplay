import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Message } from "@neo-tavern/shared";
import { toast } from "@/utils/toast";

interface UseChatMessageActionsParams {
  messages: Message[];
  updateMessage: (messageId: string, content: string) => Promise<void>;
  deleteMessages: (messageIds: string[]) => Promise<void>;
}

export function useChatMessageActions({ messages, updateMessage, deleteMessages }: UseChatMessageActionsParams) {
  const { t } = useTranslation("chat");
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deleteMsgTarget, setDeleteMsgTarget] = useState<Message | null>(null);
  const [thinkingMsg, setThinkingMsg] = useState<Message | null>(null);

  const copyMessage = useCallback(
    async (content: string, msgId: string) => {
      try {
        await navigator.clipboard.writeText(content);
        setCopiedId(msgId);
        setTimeout(() => setCopiedId(null), 2000);
      } catch {
        toast("error", t("toast.copyFailed"));
      }
    },
    [t],
  );

  const deleteTarget = useCallback(async () => {
    if (!deleteMsgTarget) return;
    try {
      const ids = [deleteMsgTarget.id];
      if (deleteMsgTarget.role === "user") {
        const idx = messages.findIndex((message) => message.id === deleteMsgTarget.id);
        const next = idx >= 0 ? messages[idx + 1] : undefined;
        if (next?.role === "assistant") ids.push(next.id);
      }
      await deleteMessages(ids);
      setDeleteMsgTarget(null);
      toast("info", ids.length > 1 ? t("toast.messagesDeleted") : t("toast.messageDeleted"));
    } catch {
      toast("error", t("toast.deleteFailed"));
    }
  }, [deleteMsgTarget, deleteMessages, messages, t]);

  const saveEdit = useCallback(
    async (content: string) => {
      if (!editingMsgId || !content.trim()) return;
      try {
        await updateMessage(editingMsgId, content.trim());
        setEditingMsgId(null);
        toast("success", t("toast.messageUpdated"));
      } catch {
        toast("error", t("toast.updateFailed"));
      }
    },
    [editingMsgId, t, updateMessage],
  );

  return {
    copiedId,
    editingMsgId,
    deleteMsgTarget,
    thinkingMsg,
    copyMessage,
    startEdit: (message: Message) => setEditingMsgId(message.id),
    cancelEdit: () => setEditingMsgId(null),
    saveEdit,
    requestDelete: setDeleteMsgTarget,
    clearDeleteTarget: () => setDeleteMsgTarget(null),
    deleteTarget,
    viewReasoning: setThinkingMsg,
    clearThinkingMessage: () => setThinkingMsg(null),
  };
}
