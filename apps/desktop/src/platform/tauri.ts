/**
 * Tauri backend — wraps all invoke() calls behind the typed Backend interface.
 * This is the ONLY file in the frontend that imports @tauri-apps/api/core.
 */

import type { Backend } from "./types";

const { invoke } = await import("@tauri-apps/api/core");

export const tauriBackend: Backend = {
  store: {
    get: (key) => invoke<string | null>("app_store_get", { key }),
    set: (key, value) => invoke("app_store_set", { key, value }),
    remove: (key) => invoke("app_store_remove", { key }),
    entries: () => invoke<Record<string, string>>("app_store_entries"),
    batch: (ops) => invoke("app_store_batch", { operations: ops }),
  },

  db: {
    initMessages: (legacyJson) => invoke("sqlite_init_messages", { legacyMessagesJson: legacyJson }),
    listMessages: (chatId) => invoke("sqlite_list_messages_by_chat_id", { chatId }),
    listRecentMessages: (chatId, limit) => invoke("sqlite_list_recent_messages_by_chat_id", { chatId, limit }),
    listChildMessages: (parentId) => invoke("sqlite_list_child_messages", { parentId }),
    createMessage: (message) => invoke("sqlite_create_message", { message }),
    updateMessage: (id, content) => invoke("sqlite_update_message", { id, content }),
    patchMessage: (id, patch) => invoke("sqlite_patch_message", { id, patch }),
    deleteMessage: (id) => invoke("sqlite_delete_message", { id }),
    deleteMessages: (ids) => invoke("sqlite_delete_messages", { ids }),
    deleteByChatId: (chatId) => invoke("sqlite_delete_messages_by_chat_id", { chatId }),
    replaceByChatId: (chatId, messages) => invoke("sqlite_replace_messages_by_chat_id", { chatId, messages }),
    migrateParentIds: () => invoke("sqlite_migrate_parent_ids", {}),
    mergeFromSavepoint: (messages) => invoke("sqlite_merge_from_savepoint", { messages }),
  },

  agenticPlay: {
    initFromJson: (json) => invoke("sqlite_init_agentic_play_states", { legacyStatesJson: json }),
    get: (chatId) => invoke("sqlite_get_agentic_play_state", { chatId }),
    upsert: (record) => invoke("sqlite_upsert_agentic_play_state", { record }),
    delete: (chatId) => invoke("sqlite_delete_agentic_play_state", { chatId }),
    clearAll: () => invoke("sqlite_clear_agentic_play_states"),
  },

  file: {
    pickFolder: () => invoke<string | null>("pick_folder"),
    saveTextFile: (defaultFilename, content) => invoke<string | null>("save_text_file", { defaultFilename, content }),
    saveWorkspaceDir: (sessionId, entriesJson) => invoke("save_workspace_dir", { sessionId, entriesJson }),
    deleteWorkspaceDir: (sessionId) => invoke("delete_workspace_dir", { sessionId }),
    saveDebugPrompt: (folder, filename, content) => invoke<string>("save_debug_prompt", { folder, filename, content }),
    writeFileToPath: (path, content) => invoke("write_file_to_path", { path, content }),
  },

  search: {
    webSearch: (query, limit) => invoke("web_search", { query, limit }),
  },

  comfy: {
    getSystemStats: (baseUrl) => invoke("comfy_get_system_stats", { baseUrl }),
    queuePrompt: (baseUrl, workflow, clientId) => invoke("comfy_queue_prompt", { baseUrl, prompt: workflow, clientId }),
    getHistory: (baseUrl, promptId) => invoke("comfy_get_history", { baseUrl, promptId }),
    getImageDataUrl: (baseUrl, filename, subfolder, imageType) =>
      invoke<string>("comfy_get_image_data_url", { baseUrl, filename, subfolder, imageType }),
  },
};
