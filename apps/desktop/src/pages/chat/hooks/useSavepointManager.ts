import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { chatRepository, chatSavepointRepository, messageRepository } from "@/db/repositories";
import { useChatStore } from "@/features/chat/chat.store";
import type { ChatSavepoint } from "@/db/repositories";
import type { Chat } from "@neo-tavern/shared";
import { toast } from "@/utils/toast";

/**
 * Self-contained hook for savepoint CRUD and dialogs.
 *
 * All savepoint-related state and handlers live here instead of
 * bloating ChatPage. The hook coordinates with repositories and
 * the chat store directly.
 */
export function useSavepointManager(currentChat: Chat | null, isGenerating: boolean) {
  const { t } = useTranslation("chat");
  const loadChat = useChatStore((s) => s.loadChat);

  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [loadDialogOpen, setLoadDialogOpen] = useState(false);
  const [savepointName, setSavepointName] = useState("");
  const [savepoints, setSavepoints] = useState<ChatSavepoint[]>([]);
  const [savingSavepoint, setSavingSavepoint] = useState(false);
  const [loadingSavepoints, setLoadingSavepoints] = useState(false);
  const [restoringSavepointId, setRestoringSavepointId] = useState<string | null>(null);
  const [importingSavepointId, setImportingSavepointId] = useState<string | null>(null);

  const refreshSavepoints = useCallback(async () => {
    if (!currentChat) {
      setSavepoints([]);
      return;
    }
    setLoadingSavepoints(true);
    try {
      setSavepoints(await chatSavepointRepository.listByChatId(currentChat.id));
    } finally {
      setLoadingSavepoints(false);
    }
  }, [currentChat]);

  const closeSaveDialog = useCallback(() => {
    setSaveDialogOpen(false);
    setSavepointName("");
    setSavingSavepoint(false);
  }, []);

  const openLoadDialog = useCallback(async () => {
    if (!currentChat) return;
    setLoadDialogOpen(true);
    await refreshSavepoints();
  }, [currentChat, refreshSavepoints]);

  const handleCreateSavepoint = useCallback(async () => {
    if (!currentChat) return;
    setSavingSavepoint(true);
    try {
      const latestMessages = await messageRepository.listByChatId(currentChat.id);
      await chatSavepointRepository.create({
        chatId: currentChat.id,
        characterId: currentChat.characterId,
        name: savepointName,
        messages: latestMessages,
      });
      toast("success", t("toast.savepointCreated"));
      closeSaveDialog();
      if (loadDialogOpen) void refreshSavepoints();
    } catch {
      toast("error", t("toast.savepointFailed"));
      setSavingSavepoint(false);
    }
  }, [currentChat, savepointName, loadDialogOpen, refreshSavepoints, closeSaveDialog, t]);

  const handleRestoreSavepoint = useCallback(
    async (savepoint: ChatSavepoint) => {
      if (!currentChat || isGenerating) return;
      setRestoringSavepointId(savepoint.id);
      try {
        await messageRepository.replaceByChatId(currentChat.id, savepoint.messages);
        await chatRepository.update(currentChat.id, {});
        await loadChat(currentChat.id);
        setLoadDialogOpen(false);
        toast("success", t("toast.savepointLoaded"));
      } catch {
        toast("error", t("toast.savepointLoadFailed"));
      } finally {
        setRestoringSavepointId(null);
      }
    },
    [currentChat, isGenerating, loadChat, t],
  );

  const handleImportSavepointAsBranch = useCallback(
    async (savepoint: ChatSavepoint) => {
      if (!currentChat || isGenerating) return;
      setImportingSavepointId(savepoint.id);
      try {
        const result = await useChatStore.getState().mergeFromSavepoint(currentChat.id, savepoint.messages);
        if (result.imported > 0) {
          toast("success", t("toast.savepointImportedAsBranch", { count: result.imported }));
        } else {
          toast("info", t("toast.savepointNoNewMessages"));
        }
        setLoadDialogOpen(false);
      } catch (err) {
        toast("error", t("toast.savepointImportFailed", { message: (err as Error).message }));
      } finally {
        setImportingSavepointId(null);
      }
    },
    [currentChat, isGenerating, t],
  );

  const handleDeleteSavepoint = useCallback(
    async (savepointId: string) => {
      await chatSavepointRepository.delete(savepointId);
      if (currentChat) {
        setSavepoints(await chatSavepointRepository.listByChatId(currentChat.id));
      }
      toast("info", t("toast.savepointDeleted"));
    },
    [currentChat, t],
  );

  return {
    saveDialogOpen,
    setSaveDialogOpen,
    loadDialogOpen,
    setLoadDialogOpen,
    savepointName,
    setSavepointName,
    savepoints,
    savingSavepoint,
    loadingSavepoints,
    restoringSavepointId,
    importingSavepointId,
    handleCreateSavepoint,
    handleRestoreSavepoint,
    handleImportSavepointAsBranch,
    handleDeleteSavepoint,
    refreshSavepoints,
    closeSaveDialog,
    openLoadDialog,
  };
}
