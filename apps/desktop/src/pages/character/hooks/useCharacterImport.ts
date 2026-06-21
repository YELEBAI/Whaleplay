import { useState, type RefObject } from "react";
import { useCharacterStore } from "@/features/character/character.store";
import { useSettingsStore } from "@/features/settings/settings.store";
import { useWorldbookStore } from "@/features/settings/worldbook.store";
import { settingsRepository, worldbookRepository } from "@/db/repositories";
import { parseJsonCharacterCard, parsePngCharacterCard, type ParsedCharacterCard } from "@/utils/parse-character-card";
import { toast } from "@/utils/toast";
import type { CreateCharacterInput } from "@neo-tavern/shared";
import {
  pngAvatarDataUrl,
  getErrorMessage,
  buildImportedRegexPreset,
  buildImportedWorldbook,
  rollbackImportedResources,
} from "../utils";

/**
 * Manages the character card import flow: parses PNG/JSON files, extracts
 * avatar + regex presets + worldbook entries, creates the character.
 */
export function useCharacterImport(fileInputRef: RefObject<HTMLInputElement | null>) {
  const [importing, setImporting] = useState(false);
  const { createCharacter } = useCharacterStore();

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting(true);

    const rollback = async (resources: { regexPresetId?: string; worldbookId?: string }) => {
      await rollbackImportedResources(resources);
    };

    const isPng = file.type === "image/png";
    let avatar: string | undefined;
    let card: ParsedCharacterCard | null;

    try {
      const buf = await file.arrayBuffer();
      if (isPng) {
        card = await parsePngCharacterCard(buf);
        if (card) avatar = await pngAvatarDataUrl(buf);
      } else {
        const text = new TextDecoder().decode(buf);
        card = parseJsonCharacterCard(text);
      }
    } catch (err) {
      toast("error", `解析角色卡失败：${getErrorMessage(err)}`);
      setImporting(false);
      event.target.value = "";
      return;
    }

    if (!card) {
      toast("error", "未能从文件中解析出角色数据");
      event.target.value = "";
      return;
    }

    const charName = card.name || file.name.replace(/\.(json|png)$/i, "");
    const now = new Date().toISOString();
    const regexPreset = buildImportedRegexPreset(card, charName, now);
    const worldbook = buildImportedWorldbook(card, charName, now);

    const existingPresets = useSettingsStore.getState().regexPresets;
    const regexPresetId = regexPreset ? regexPreset.id : undefined;

    const existingWorldbooks = useWorldbookStore.getState().worldbooks;
    const worldbookId = worldbook ? worldbook.id : undefined;

    try {
      if (regexPreset) {
        await settingsRepository.saveRegexRules([...existingPresets, regexPreset]);
        await useSettingsStore.getState().loadRegexRules();
      }
      if (worldbook) {
        await worldbookRepository.save([...existingWorldbooks, worldbook]);
        await useWorldbookStore.getState().loadWorldbooks();
      }

      const characterInput: CreateCharacterInput = {
        name: charName,
        description: card.description || "",
        personality: card.personality || "",
        scenario: card.scenario || "",
        firstMessage: card.firstMessage || "",
        exampleDialogues: card.exampleDialogues || "",
      };

      await createCharacter({
        ...characterInput,
        avatar,
        regexPresetId,
        worldbookId,
      });

      const importedParts: string[] = ["Character"];
      if (avatar) importedParts.push("avatar");
      if (regexPreset) importedParts.push(regexPreset.rules.length + " regex rules");
      if (worldbook) importedParts.push(worldbook.entries.length + " worldbook entries");

      toast("success", `Imported: ${importedParts.join(", ")}`);
    } catch (err) {
      await rollback({ regexPresetId, worldbookId });
      toast("error", `Import failed: ${getErrorMessage(err)}`);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return { importing, handleImportFile };
}
