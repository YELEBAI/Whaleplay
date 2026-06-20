import { generateId } from "@neo-tavern/shared";
import type { MessageUsage } from "@neo-tavern/shared";
import { usage } from "../kv";
import { usageKeys } from "../storage/keys";
import { loadArray } from "../storage/repository-helpers";

export type SecondaryApiUsageSource = "memory-compressor" | "image-planner";

export interface SecondaryApiUsageRecord {
  id: string;
  chatId: string;
  source: SecondaryApiUsageSource;
  label: string;
  modelConfigId?: string | null;
  model?: string;
  usage: MessageUsage;
  createdAt: string;
}

export interface CreateSecondaryApiUsageInput {
  chatId: string;
  source: SecondaryApiUsageSource;
  label: string;
  modelConfigId?: string | null;
  model?: string;
  usage?: MessageUsage;
}

async function loadAll(): Promise<SecondaryApiUsageRecord[]> {
  return loadArray<SecondaryApiUsageRecord>(usage, usageKeys.secondaryApi);
}

async function saveAll(records: SecondaryApiUsageRecord[]) {
  await usage.setJson(usageKeys.secondaryApi, records);
}

function hasUsageData(usage?: MessageUsage) {
  return !!usage && Object.values(usage).some((value) => typeof value === "number");
}

export const secondaryApiUsageRepository = {
  async listByChatId(chatId: string): Promise<SecondaryApiUsageRecord[]> {
    return (await loadAll())
      .filter((record) => record.chatId === chatId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  async create(input: CreateSecondaryApiUsageInput): Promise<SecondaryApiUsageRecord | null> {
    if (!hasUsageData(input.usage)) return null;
    const record: SecondaryApiUsageRecord = {
      id: generateId(),
      chatId: input.chatId,
      source: input.source,
      label: input.label,
      modelConfigId: input.modelConfigId,
      model: input.model,
      usage: input.usage ?? {},
      createdAt: new Date().toISOString(),
    };
    const all = await loadAll();
    all.push(record);
    await saveAll(all);
    return record;
  },

  async deleteByChatId(chatId: string): Promise<void> {
    await saveAll((await loadAll()).filter((record) => record.chatId !== chatId));
  },
};
