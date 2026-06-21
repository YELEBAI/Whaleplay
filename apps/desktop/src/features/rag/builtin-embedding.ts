import type { RagMemorySettings } from "./rag-settings";

type ProgressStatus = { status?: string; file?: string; progress?: number; loaded?: number; total?: number };
type ProgressCallback = (message: string) => void;

type FeatureExtractionPipeline = (
  input: string | string[],
  options?: { pooling?: "mean"; normalize?: boolean },
) => Promise<{ tolist?: () => unknown; data?: Float32Array | number[]; dims?: number[] } | unknown>;

let pipelineCache: { model: string; promise: Promise<FeatureExtractionPipeline> } | null = null;

function progressToText(progress: ProgressStatus) {
  if (progress.status === "progress" && typeof progress.progress === "number") {
    const name = progress.file ? ` ${progress.file}` : "";
    return `下载中${name} ${Math.round(progress.progress)}%`;
  }
  if (progress.status === "ready") return "内置模型已加载";
  if (progress.status === "initiate") return progress.file ? `准备下载 ${progress.file}` : "准备下载模型";
  if (progress.status === "done") return progress.file ? `${progress.file} 下载完成` : "模型文件下载完成";
  return progress.status || "正在准备内置模型";
}

async function loadPipeline(model: string, onProgress?: ProgressCallback): Promise<FeatureExtractionPipeline> {
  if (pipelineCache?.model === model) return pipelineCache.promise;

  pipelineCache = {
    model,
    promise: (async () => {
      const transformers = await import("@huggingface/transformers");
      const env = transformers.env as { useBrowserCache?: boolean; useFSCache?: boolean; useWasmCache?: boolean };
      env.useBrowserCache = true;
      env.useWasmCache = true;

      return transformers.pipeline("feature-extraction", model, {
        progress_callback: (progress: ProgressStatus) => onProgress?.(progressToText(progress)),
      }) as Promise<FeatureExtractionPipeline>;
    })(),
  };

  return pipelineCache.promise;
}

function normalizeOutput(raw: unknown, count: number): number[][] {
  const tensor = raw as { tolist?: () => unknown; data?: Float32Array | number[]; dims?: number[] };
  const listed = tensor?.tolist?.();
  if (Array.isArray(listed)) {
    if (Array.isArray(listed[0])) {
      return (listed as unknown[][]).map((row) => row.map(Number).filter(Number.isFinite));
    }
    return [listed.map(Number).filter(Number.isFinite)];
  }

  if (tensor?.data && tensor?.dims && tensor.dims.length >= 2) {
    const data = Array.from(tensor.data).map(Number);
    const rows = count;
    const cols = Math.floor(data.length / Math.max(1, rows));
    return Array.from({ length: rows }, (_unused, row) => data.slice(row * cols, (row + 1) * cols));
  }

  return [];
}

export async function downloadBuiltinEmbeddingModel(settings: Pick<RagMemorySettings, "builtinModel">, onProgress?: ProgressCallback) {
  await loadPipeline(settings.builtinModel, onProgress);
}

export async function embedTextsBuiltin(
  settings: Pick<RagMemorySettings, "builtinModel">,
  input: string[],
  onProgress?: ProgressCallback,
) {
  const texts = input.map((text) => text.trim()).filter(Boolean);
  if (texts.length === 0) return [];
  const extractor = await loadPipeline(settings.builtinModel, onProgress);
  const raw = await extractor(texts, { pooling: "mean", normalize: true });
  return normalizeOutput(raw, texts.length);
}
