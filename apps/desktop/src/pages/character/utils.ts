import { sessionSync } from "@/db/kv";
import type { RegexPreset, RegexRule, Worldbook } from "@neo-tavern/shared";
import { generateId } from "@neo-tavern/shared";
import type { ParsedCharacterCard } from "@/utils/parse-character-card";
import { useSettingsStore } from "@/features/settings/settings.store";
import { useWorldbookStore } from "@/features/settings/worldbook.store";
import { settingsRepository, worldbookRepository } from "@/db/repositories";

const SIDEBAR_CHAR_TTL_MS = 60_000; // 1 minute

export function readCachedSidebarCharId(): string | null {
  try {
    const raw = sessionSync.get("character-sidebar-char");
    if (!raw) return null;
    const { charId, ts } = JSON.parse(raw) as { charId: string; ts: number };
    if (Date.now() - ts > SIDEBAR_CHAR_TTL_MS) {
      sessionSync.remove("character-sidebar-char");
      return null;
    }
    return charId;
  } catch {
    return null;
  }
}

export function writeCachedSidebarCharId(charId: string) {
  sessionSync.setJson("character-sidebar-char", { charId, ts: Date.now() });
}

export function clearCachedSidebarCharId() {
  sessionSync.remove("character-sidebar-char");
}

const IMPORT_AVATAR_MAX_EDGE = 384;
const IMPORT_AVATAR_WEBP_QUALITY = 0.72;
const IMPORT_AVATAR_JPEG_QUALITY = 0.78;
const MAX_ORIGINAL_AVATAR_DATA_URL_CHARS = 256_000;

export function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    for (let j = 0; j < chunk.length; j++) {
      binary += String.fromCharCode(chunk[j]);
    }
  }

  return btoa(binary);
}

export function originalPngAvatarDataUrl(buffer: ArrayBuffer) {
  return `data:image/png;base64,${arrayBufferToBase64(buffer)}`;
}

export function readBlobAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read avatar blob"));
    reader.readAsDataURL(blob);
  });
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}

export function loadImageElement(blob: Blob) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to decode avatar image"));
    };
    image.src = url;
  });
}

export async function loadAvatarImageSource(
  blob: Blob,
): Promise<CanvasImageSource & { width: number; height: number; close?: () => void }> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    return { ...bitmap, close: () => bitmap.close() };
  }
  const image = await loadImageElement(blob);
  return image;
}

export async function pngAvatarDataUrl(buffer: ArrayBuffer): Promise<string | undefined> {
  const original = originalPngAvatarDataUrl(buffer);
  if (original.length <= MAX_ORIGINAL_AVATAR_DATA_URL_CHARS) return original;

  const blob = new Blob([buffer], { type: "image/png" });
  const source = await loadAvatarImageSource(blob);
  const { width, height } = source;
  const scale = Math.min(1, IMPORT_AVATAR_MAX_EDGE / Math.max(width, height));
  const targetWidth = Math.round(width * scale);
  const targetHeight = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    source.close?.();
    return original;
  }
  ctx.drawImage(source, 0, 0, targetWidth, targetHeight);
  source.close?.();

  const webp = await canvasToBlob(canvas, "image/webp", IMPORT_AVATAR_WEBP_QUALITY);
  if (webp) return readBlobAsDataUrl(webp);
  const jpeg = await canvasToBlob(canvas, "image/jpeg", IMPORT_AVATAR_JPEG_QUALITY);
  if (jpeg) return readBlobAsDataUrl(jpeg);
  return original;
}

export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export function buildImportedRegexPreset(card: ParsedCharacterCard, charName: string, now: string): RegexPreset | null {
  const regexRules: RegexRule[] = [];
  for (const script of card.regexScripts) {
    if (script.disabled || !script.findRegex) continue;
    const match = script.findRegex.match(/^\/(.+)\/([a-z]*)$/);
    if (!match) continue;
    const isDisplayRule = script.markdownOnly && !script.promptOnly;
    if (!isDisplayRule) continue;
    regexRules.push({
      id: generateId(),
      presetId: "",
      name: script.scriptName || "Imported Rule",
      pattern: match[1],
      displayTemplate: script.replaceString || "",
      stripFromPrompt: true,
      enabled: true,
      createdAt: now,
    });
  }

  if (regexRules.length === 0) return null;

  const presetId = generateId();
  for (const rule of regexRules) rule.presetId = presetId;
  return {
    id: presetId,
    name: charName + " Regex",
    description: "Auto-imported with " + charName,
    rules: regexRules,
    isGlobal: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function buildImportedWorldbook(card: ParsedCharacterCard, charName: string, now: string): Worldbook | null {
  if (card.worldbookEntries.length === 0) return null;

  const worldbookId = generateId();
  return {
    id: worldbookId,
    name: card.worldbookName || charName + " Lorebook",
    description: "Imported with " + charName,
    entries: card.worldbookEntries.map((entry) => ({
      id: generateId(),
      worldbookId,
      title: entry.title,
      keys: entry.keys,
      content: entry.content,
      priority: entry.priority,
      type: entry.always ? ("always" as const) : ("trigger" as const),
      triggerMode: entry.triggerMode,
      enabled: entry.enabled,
      createdAt: now,
      updatedAt: now,
    })),
    createdAt: now,
    updatedAt: now,
  };
}

export async function rollbackImportedResources(resources: { regexPresetId?: string; worldbookId?: string }) {
  if (resources.regexPresetId) {
    const presets = useSettingsStore.getState().regexPresets.filter((p) => p.id !== resources.regexPresetId);
    await settingsRepository.saveRegexRules(presets);
    await useSettingsStore.getState().loadRegexRules();
  }
  if (resources.worldbookId) {
    const worldbooks = useWorldbookStore.getState().worldbooks.filter((w) => w.id !== resources.worldbookId);
    await worldbookRepository.save(worldbooks);
    await useWorldbookStore.getState().loadWorldbooks();
  }
}
