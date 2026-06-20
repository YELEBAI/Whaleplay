import { getBackend } from "@/platform";
import type { RagMemorySettings } from "./rag-settings";
import { embedTextsBuiltin } from "./builtin-embedding";

function cleanBaseUrl(baseUrl: string) {
  return (baseUrl || "http://127.0.0.1:11434").replace(/\/$/, "");
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "Unknown error");
}

async function directOllamaJson<T>(
  baseUrl: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${cleanBaseUrl(baseUrl)}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Ollama HTTP ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
  }
  return response.json() as Promise<T>;
}

export async function checkOllama(baseUrl: string) {
  try {
    return await getBackend().ollama.check(cleanBaseUrl(baseUrl));
  } catch (nativeError) {
    try {
      return await directOllamaJson<Record<string, unknown>>(baseUrl, "/api/version");
    } catch (directError) {
      throw new Error(`${getErrorMessage(nativeError)} | direct fetch failed: ${getErrorMessage(directError)}`);
    }
  }
}

export async function pullOllamaModel(baseUrl: string, model: string) {
  try {
    return await getBackend().ollama.pull(cleanBaseUrl(baseUrl), model);
  } catch (nativeError) {
    try {
      return await directOllamaJson<Record<string, unknown>>(baseUrl, "/api/pull", {
        method: "POST",
        body: JSON.stringify({ name: model, stream: false }),
      });
    } catch (directError) {
      throw new Error(`${getErrorMessage(nativeError)} | direct fetch failed: ${getErrorMessage(directError)}`);
    }
  }
}

export async function embedTexts(
  settings: Pick<RagMemorySettings, "embeddingProvider" | "builtinModel" | "ollamaBaseUrl" | "embeddingModel">,
  input: string[],
  onProgress?: (message: string) => void,
) {
  const texts = input.map((text) => text.trim()).filter(Boolean);
  if (texts.length === 0) return [];

  if (settings.embeddingProvider === "builtin") {
    return embedTextsBuiltin(settings, texts, onProgress);
  }

  try {
    return await getBackend().ollama.embed(cleanBaseUrl(settings.ollamaBaseUrl), settings.embeddingModel, texts);
  } catch (nativeError) {
    try {
      const data = await directOllamaJson<{ embeddings?: number[][] }>(settings.ollamaBaseUrl, "/api/embed", {
        method: "POST",
        body: JSON.stringify({ model: settings.embeddingModel, input: texts }),
      });
      if (!Array.isArray(data.embeddings)) throw new Error("Missing embeddings array");
      return data.embeddings;
    } catch (directError) {
      throw new Error(`${getErrorMessage(nativeError)} | direct fetch failed: ${getErrorMessage(directError)}`);
    }
  }
}
