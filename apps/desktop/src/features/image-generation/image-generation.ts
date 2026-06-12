import { createModelProvider } from "@neo-tavern/core";
import { generateId } from "@neo-tavern/shared";
import type { MessageImage, ModelConfig } from "@neo-tavern/shared";
import { shouldOmitTemperatureForModel } from "@/features/settings/model-capabilities";
import { getBackend } from "@/platform";

export type ImageGenerationMode = "manual" | "auto";
export type ImageGenerationPreset = "fast" | "balanced" | "quality" | "custom";
export type ImageSeedMode = "random" | "fixed";

interface ComfyWorkflowNode {
  class_type?: unknown;
  inputs?: Record<string, unknown>;
  [key: string]: unknown;
}

export const IMAGE_SAMPLER_OPTIONS = [
  "euler",
  "euler_ancestral",
  "dpmpp_2m",
  "dpmpp_2m_sde",
  "dpmpp_sde",
  "dpmpp_3m_sde",
  "ddim",
] as const;

export const IMAGE_SCHEDULER_OPTIONS = [
  "normal",
  "karras",
  "exponential",
  "sgm_uniform",
  "simple",
  "ddim_uniform",
] as const;

export const IMAGE_GENERATION_PARAMETER_PRESETS: Array<{
  id: Exclude<ImageGenerationPreset, "custom">;
  label: string;
  description: string;
  settings: Pick<ImageGenerationSettings, "steps" | "cfgScale" | "samplerName" | "scheduler" | "denoise">;
}> = [
  {
    id: "balanced",
    label: "Balanced",
    description: "Stable roleplay scenes with moderate speed.",
    settings: { steps: 28, cfgScale: 7, samplerName: "dpmpp_2m", scheduler: "karras", denoise: 1 },
  },
  {
    id: "fast",
    label: "Fast",
    description: "Quick drafts for frequent chat images.",
    settings: { steps: 18, cfgScale: 6, samplerName: "euler", scheduler: "normal", denoise: 1 },
  },
  {
    id: "quality",
    label: "Quality",
    description: "Slower, cleaner scene illustrations.",
    settings: { steps: 36, cfgScale: 7.5, samplerName: "dpmpp_2m_sde", scheduler: "karras", denoise: 1 },
  },
];

export const IMAGE_RESOLUTION_OPTIONS = [
  { label: "Portrait 768x1024", width: 768, height: 1024 },
  { label: "Portrait 832x1216", width: 832, height: 1216 },
  { label: "Square 1024x1024", width: 1024, height: 1024 },
  { label: "Landscape 1024x768", width: 1024, height: 768 },
  { label: "Landscape 1216x832", width: 1216, height: 832 },
  { label: "Wide 1344x768", width: 1344, height: 768 },
] as const;

export interface ImageGenerationSettings {
  enabled: boolean;
  mode: ImageGenerationMode;
  worldbookReferenceEnabled: boolean;
  comfyUrl: string;
  comfyWorkflowJson: string;
  promptInstruction: string;
  negativePrompt: string;
  width: number;
  height: number;
  maxImages: number;
  generationPreset: ImageGenerationPreset;
  steps: number;
  cfgScale: number;
  samplerName: string;
  scheduler: string;
  denoise: number;
  seedMode: ImageSeedMode;
  fixedSeed: number;
  plannerConfigId: string | null;
}

export interface ImageMarker {
  index: number;
  prompt: string;
}

export interface ImagePlannerWorldbookReference {
  title: string;
  content: string;
}

export const DEFAULT_IMAGE_GENERATION_SETTINGS: ImageGenerationSettings = {
  enabled: false,
  mode: "manual",
  worldbookReferenceEnabled: true,
  comfyUrl: "http://127.0.0.1:8188",
  comfyWorkflowJson: "",
  promptInstruction: [
    "触发生图时，你需要为这条回复挑选适合插图的画面，并生成英文图片提示词。",
    "优先选择画面价值最高的关键场景；除非正文完全没有可见画面，否则至少生成 1 张图。",
    "图片提示词必须是英文，描述可见画面：角色外观、动作、场景、光照、构图、情绪氛围和画风。",
    "不要把用户或角色的台词写进图片，不要生成文字、水印、UI、漫画分镜编号。",
    "图片应对应正文中的具体段落，不能全部堆到正文结尾。",
  ].join("\n"),
  negativePrompt: "text, watermark, logo, blurry, low quality, extra fingers, deformed hands, bad anatomy",
  width: 768,
  height: 1024,
  maxImages: 2,
  generationPreset: "balanced",
  steps: 28,
  cfgScale: 7,
  samplerName: "dpmpp_2m",
  scheduler: "karras",
  denoise: 1,
  seedMode: "random",
  fixedSeed: 1,
  plannerConfigId: null,
};

export function clampImageCount(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_IMAGE_GENERATION_SETTINGS.maxImages;
  return Math.min(6, Math.max(0, Math.round(value)));
}

export function clampImageSize(value: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  const rounded = Math.round(value / 8) * 8;
  return Math.min(2048, Math.max(256, rounded));
}

function clampNumber(value: number, fallback: number, min: number, max: number, decimals = 0) {
  if (!Number.isFinite(value)) return fallback;
  const factor = 10 ** decimals;
  return Math.min(max, Math.max(min, Math.round(value * factor) / factor));
}

export function normalizeImageSettings(input: Partial<ImageGenerationSettings>): ImageGenerationSettings {
  return {
    ...DEFAULT_IMAGE_GENERATION_SETTINGS,
    ...input,
    enabled: input.enabled ?? DEFAULT_IMAGE_GENERATION_SETTINGS.enabled,
    mode: input.mode === "auto" ? "auto" : "manual",
    worldbookReferenceEnabled:
      input.worldbookReferenceEnabled ?? DEFAULT_IMAGE_GENERATION_SETTINGS.worldbookReferenceEnabled,
    comfyUrl: (input.comfyUrl || DEFAULT_IMAGE_GENERATION_SETTINGS.comfyUrl).replace(/\/$/, ""),
    width: clampImageSize(Number(input.width), DEFAULT_IMAGE_GENERATION_SETTINGS.width),
    height: clampImageSize(Number(input.height), DEFAULT_IMAGE_GENERATION_SETTINGS.height),
    maxImages: clampImageCount(Number(input.maxImages)),
    generationPreset: ["fast", "balanced", "quality", "custom"].includes(String(input.generationPreset))
      ? (input.generationPreset as ImageGenerationPreset)
      : DEFAULT_IMAGE_GENERATION_SETTINGS.generationPreset,
    steps: clampNumber(Number(input.steps), DEFAULT_IMAGE_GENERATION_SETTINGS.steps, 1, 150),
    cfgScale: clampNumber(Number(input.cfgScale), DEFAULT_IMAGE_GENERATION_SETTINGS.cfgScale, 0, 30, 1),
    samplerName: input.samplerName || DEFAULT_IMAGE_GENERATION_SETTINGS.samplerName,
    scheduler: input.scheduler || DEFAULT_IMAGE_GENERATION_SETTINGS.scheduler,
    denoise: clampNumber(Number(input.denoise), DEFAULT_IMAGE_GENERATION_SETTINGS.denoise, 0, 1, 2),
    seedMode: input.seedMode === "fixed" ? "fixed" : "random",
    fixedSeed: clampNumber(Number(input.fixedSeed), DEFAULT_IMAGE_GENERATION_SETTINGS.fixedSeed, 0, 4_294_967_295),
    plannerConfigId: input.plannerConfigId?.trim() || null,
  };
}

export function extractImageMarkers(content: string, maxImages = Number.POSITIVE_INFINITY): ImageMarker[] {
  const markers: ImageMarker[] = [];
  const regex = /\[image\]([\s\S]*?)(?:\[\/image\]|\[image\])/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null && markers.length < maxImages) {
    const prompt = match[1]?.trim();
    if (prompt) {
      markers.push({ index: markers.length, prompt });
    }
  }

  return markers;
}

function splitContentSegments(content: string) {
  const parts = content.split(/(\n{2,})/g);
  const segments: Array<{ index: number; text: string; partIndex: number }> = [];

  for (let i = 0; i < parts.length; i += 2) {
    const text = parts[i]?.trim();
    if (!text) continue;
    segments.push({ index: segments.length + 1, text, partIndex: i });
  }

  if (segments.length <= 1) {
    const lines = content.split(/(\n)/g);
    const lineSegments: Array<{ index: number; text: string; partIndex: number }> = [];
    for (let i = 0; i < lines.length; i += 2) {
      const text = lines[i]?.trim();
      if (!text) continue;
      lineSegments.push({ index: lineSegments.length + 1, text, partIndex: i });
    }
    return { parts: lines, segments: lineSegments.length > 0 ? lineSegments : segments };
  }

  return { parts, segments };
}

function insertPlannedMarkers(
  content: string,
  plans: Array<{ afterSegment: number; prompt: string }>,
  maxImages: number,
) {
  const { parts, segments } = splitContentSegments(content);
  if (segments.length === 0) return content;

  const validPlans = plans
    .filter((plan) => plan.prompt?.trim())
    .slice(0, maxImages)
    .sort((a, b) => b.afterSegment - a.afterSegment);

  for (const plan of validPlans) {
    const target = segments[Math.min(Math.max(1, Math.round(plan.afterSegment || 1)), segments.length) - 1];
    if (!target) continue;
    parts[target.partIndex] = `${parts[target.partIndex].trimEnd()}\n\n[image]${plan.prompt.trim()}[/image]`;
  }

  return parts.join("");
}

function parsePlannerJson(content: string): Array<{ afterSegment: number; prompt: string }> {
  const trimmed = content.trim();
  const jsonText =
    trimmed.match(/```json\s*([\s\S]*?)```/i)?.[1] ?? trimmed.match(/```\s*([\s\S]*?)```/)?.[1] ?? trimmed;
  const data = JSON.parse(jsonText);
  const items = Array.isArray(data) ? data : data?.images;
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    afterSegment: Number(item.afterSegment ?? item.after_segment ?? item.after ?? item.segment ?? 1),
    prompt: String(item.prompt ?? "").trim(),
  }));
}

function clipPlannerReference(content: string, maxChars: number) {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function formatPlannerWorldbookReferences(references: ImagePlannerWorldbookReference[] = []) {
  const valid = references.filter((reference) => reference.title.trim() && reference.content.trim()).slice(0, 8);

  if (valid.length === 0) return "";

  return [
    "【World Book References】",
    "These entries matched keywords in the reply. Use only visible facts from them when writing image prompts: character appearance, clothing, species, objects, locations, lighting, symbols, and scene constraints.",
    "Do not quote the references. Do not add invisible lore unless it changes visible appearance.",
    "",
    ...valid.map((reference, index) =>
      [`### ${index + 1}. ${reference.title}`, clipPlannerReference(reference.content, 1200)].join("\n"),
    ),
  ].join("\n\n");
}

export async function planImageMarkersWithModel(options: {
  content: string;
  settings: ImageGenerationSettings;
  plannerConfig: ModelConfig;
  worldbookReferences?: ImagePlannerWorldbookReference[];
  userId?: string;
  signal?: AbortSignal;
}) {
  const { content, settings, plannerConfig, worldbookReferences, userId, signal } = options;
  if (!settings.enabled || settings.maxImages <= 0) return { content };
  if (extractImageMarkers(content, 1).length > 0) return { content };

  const { segments } = splitContentSegments(content);
  if (segments.length === 0) return { content };

  const provider = createModelProvider(plannerConfig);
  const worldbookReferenceText = settings.worldbookReferenceEnabled
    ? formatPlannerWorldbookReferences(worldbookReferences)
    : "";
  const result = await provider.generate({
    model: plannerConfig.model,
    omitTemperature: shouldOmitTemperatureForModel(plannerConfig),
    temperature: Math.min(plannerConfig.temperature ?? 0.2, 0.4),
    maxTokens: Math.min(Math.max(800, plannerConfig.maxTokens || 2048), 4096),
    reasoningEffort: plannerConfig.reasoningEffort || undefined,
    userId,
    signal,
    messages: [
      {
        role: "system",
        content: [
          "你是 Whale Play 的剧情插图规划器。",
          settings.mode === "auto"
            ? "这是自动生图模式在主回复完成后触发的请求。"
            : "这是用户主动点击某条回复的生图按钮后触发的请求。",
          "你只判断正文中哪里适合插入图片，并为 ComfyUI 编写英文生图提示词。",
          "图片提示词需要尽量继承正文和参考资料中的可见设定，尤其是角色外貌、服装、物品、地点和氛围。",
          "不要改写正文，不要续写剧情，不要解释。",
          settings.promptInstruction,
          `最多输出 ${settings.maxImages} 张图。除非正文完全没有可见画面，否则至少输出 1 张图。`,
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          "下面是按段落编号的正文。请选择适合插图的段落编号，图片会插在该段落后面。",
          '只输出 JSON：{"images":[{"afterSegment":1,"prompt":"English image prompt"}]}',
          "",
          ...(worldbookReferenceText ? [worldbookReferenceText, ""] : []),
          segments.map((segment) => `【${segment.index}】${segment.text}`).join("\n\n"),
        ].join("\n"),
      },
    ],
  });

  try {
    const plans = parsePlannerJson(result.content);
    if (plans.length === 0) return { content, usage: result.usage };
    return {
      content: insertPlannedMarkers(content, plans, settings.maxImages),
      usage: result.usage,
    };
  } catch {
    return { content, usage: result.usage };
  }
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function replacePlaceholders(value: unknown, replacements: Record<string, string | number>): unknown {
  if (typeof value === "string") {
    return value.replace(
      /\{\{\s*(prompt|positive_prompt|positivePrompt|positive|negative_prompt|negativePrompt|negative|seed|width|height|steps|cfg|cfgScale|sampler|samplerName|sampler_name|scheduler|denoise)\s*\}\}/gi,
      (_match, key: string) => {
        const normalized = key.toLowerCase();
        if (normalized === "positive" || normalized === "positive_prompt" || normalized === "positiveprompt")
          return String(replacements.prompt);
        if (normalized === "negative" || normalized === "negative_prompt" || normalized === "negativeprompt")
          return String(replacements.negativePrompt);
        if (normalized === "cfgscale") return String(replacements.cfg);
        if (normalized === "sampler" || normalized === "samplername" || normalized === "sampler_name")
          return String(replacements.samplerName);
        return String(replacements[normalized] ?? "");
      },
    );
  }
  if (Array.isArray(value)) return value.map((item) => replacePlaceholders(item, replacements));
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      output[key] = replacePlaceholders(inner, replacements);
    }
    return output;
  }
  return value;
}

function autoFillCommonWorkflowNodes(
  workflow: Record<string, ComfyWorkflowNode>,
  prompt: string,
  settings: ImageGenerationSettings,
  seed: number,
) {
  const clipNodes = Object.values(workflow).filter(
    (node: ComfyWorkflowNode) =>
      String(node?.class_type || "")
        .toLowerCase()
        .includes("cliptextencode") &&
      node?.inputs &&
      typeof node.inputs.text === "string",
  );

  if (clipNodes[0]?.inputs) clipNodes[0].inputs.text = prompt;
  if (clipNodes[1]?.inputs) clipNodes[1].inputs.text = settings.negativePrompt;

  for (const node of Object.values(workflow)) {
    const classType = String(node.class_type || "").toLowerCase();
    const inputs = node.inputs;
    if (!inputs) continue;

    if (classType.includes("ksampler") && "seed" in inputs) inputs.seed = seed;
    if (classType.includes("ksampler")) {
      if ("steps" in inputs) inputs.steps = settings.steps;
      if ("cfg" in inputs) inputs.cfg = settings.cfgScale;
      if ("sampler_name" in inputs) inputs.sampler_name = settings.samplerName;
      if ("scheduler" in inputs) inputs.scheduler = settings.scheduler;
      if ("denoise" in inputs) inputs.denoise = settings.denoise;
    }
    if (classType.includes("emptylatent")) {
      if ("width" in inputs) inputs.width = settings.width;
      if ("height" in inputs) inputs.height = settings.height;
    }
  }
}

function buildComfyPrompt(workflowJson: string, prompt: string, settings: ImageGenerationSettings) {
  if (!workflowJson.trim()) throw new Error("ComfyUI workflow JSON is empty.");

  const seed = settings.seedMode === "fixed" ? settings.fixedSeed : Math.floor(Math.random() * 1_000_000_000);
  const parsed = JSON.parse(workflowJson);
  const cloned = deepClone(parsed);
  const replaced = replacePlaceholders(cloned, {
    prompt,
    negativePrompt: settings.negativePrompt,
    seed,
    width: settings.width,
    height: settings.height,
    steps: settings.steps,
    cfg: settings.cfgScale,
    samplerName: settings.samplerName,
    scheduler: settings.scheduler,
    denoise: settings.denoise,
  }) as Record<string, ComfyWorkflowNode>;

  autoFillCommonWorkflowNodes(replaced, prompt, settings, seed);
  return replaced;
}

async function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function canFallbackToDirectFetch(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("__tauri") ||
    message.includes("window.__tauri") ||
    message.includes("not implemented on this platform") ||
    (message.includes("invoke") && message.includes("not a function")) ||
    (message.includes("cannot read") && message.includes("invoke"))
  );
}

async function invokeComfy<T>(promise: Promise<T>): Promise<T | undefined> {
  try {
    return await promise;
  } catch (error) {
    if (canFallbackToDirectFetch(error)) return undefined;
    const err = new Error(getErrorMessage(error));
    (err as Error & { cause: unknown }).cause = error;
    throw err;
  }
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
}

async function fetchComfyImageDataUrlDirect(
  baseUrl: string,
  image: { filename: string; subfolder?: string; type?: string },
  signal?: AbortSignal,
) {
  throwIfAborted(signal);
  const url = new URL(`${baseUrl}/view`);
  url.searchParams.set("filename", image.filename);
  if (image.subfolder) url.searchParams.set("subfolder", image.subfolder);
  if (image.type) url.searchParams.set("type", image.type);
  const response = await fetch(url.toString(), { signal });
  throwIfAborted(signal);
  if (!response.ok) throw new Error(`ComfyUI image fetch failed: ${response.status}`);
  return blobToDataUrl(await response.blob());
}

async function getComfyImageDataUrl(
  baseUrl: string,
  image: { filename: string; subfolder?: string; type?: string },
  signal?: AbortSignal,
) {
  throwIfAborted(signal);
  const proxied = await invokeComfy(
    getBackend().comfy.getImageDataUrl(baseUrl, image.filename, image.subfolder || null, image.type || null),
  );
  throwIfAborted(signal);
  if (proxied) return proxied;
  return fetchComfyImageDataUrlDirect(baseUrl, image, signal);
}

async function queueComfyPrompt(
  baseUrl: string,
  workflow: Record<string, ComfyWorkflowNode>,
  clientId: string,
  signal?: AbortSignal,
) {
  throwIfAborted(signal);
  const proxied = await invokeComfy(
    getBackend().comfy.queuePrompt(baseUrl, workflow, clientId),
  );
  throwIfAborted(signal);
  if (proxied) return proxied;

  const response = await fetch(`${baseUrl}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow, client_id: clientId }),
    signal,
  });
  throwIfAborted(signal);

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`ComfyUI prompt failed: ${response.status} ${errorText.slice(0, 200)}`);
  }

  return response.json();
}

async function getComfyHistory(baseUrl: string, promptId: string, signal?: AbortSignal) {
  throwIfAborted(signal);
  const proxied = await invokeComfy(
    getBackend().comfy.getHistory(baseUrl, promptId),
  );
  throwIfAborted(signal);
  if (proxied) return proxied;

  const response = await fetch(`${baseUrl}/history/${promptId}`, { signal });
  throwIfAborted(signal);
  if (!response.ok) return null;
  return response.json();
}

async function getComfySystemStats(baseUrl: string, signal?: AbortSignal) {
  throwIfAborted(signal);
  const proxied = await invokeComfy(
    getBackend().comfy.getSystemStats(baseUrl),
  );
  throwIfAborted(signal);
  if (proxied) return proxied;

  const response = await fetch(`${baseUrl}/system_stats`, { signal });
  throwIfAborted(signal);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`ComfyUI connection failed: ${response.status} ${errorText.slice(0, 160)}`);
  }

  return response.json().catch(() => ({}));
}

async function sleep(ms: number, signal?: AbortSignal) {
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(resolve, ms);
    const onAbort = () => {
      window.clearTimeout(timeout);
      reject(new DOMException("Aborted", "AbortError"));
    };
    if (signal) signal.addEventListener("abort", onAbort, { once: true });
  });
}

export async function generateComfyImage(prompt: string, settings: ImageGenerationSettings, signal?: AbortSignal) {
  throwIfAborted(signal);
  const baseUrl = settings.comfyUrl.replace(/\/$/, "");
  const workflow = buildComfyPrompt(settings.comfyWorkflowJson, prompt, settings);
  const clientId = `whale-play-${generateId()}`;

  const queued = await queueComfyPrompt(baseUrl, workflow, clientId, signal);
  throwIfAborted(signal);
  const promptId = queued?.prompt_id;
  if (!promptId) throw new Error("ComfyUI did not return a prompt_id.");

  const started = Date.now();
  while (Date.now() - started < 120_000) {
    throwIfAborted(signal);
    const history = await getComfyHistory(baseUrl, promptId, signal);
    const entry = history?.[promptId] as Record<string, unknown> | undefined;
    const outputs: unknown[] = entry?.outputs ? Object.values(entry.outputs as Record<string, unknown>) : [];
    for (const output of outputs as Record<string, unknown>[]) {
      const image = (output.images as Array<{ filename: string; subfolder?: string; type?: string }> | undefined)?.[0];
      if (image?.filename) {
        const dataUrl = await getComfyImageDataUrl(baseUrl, image, signal);
        throwIfAborted(signal);
        return dataUrl;
      }
    }
    await sleep(1200, signal);
  }

  throw new Error("ComfyUI generation timed out after 120 seconds.");
}

export async function testComfyConnection(settings: ImageGenerationSettings, signal?: AbortSignal) {
  const baseUrl = settings.comfyUrl.replace(/\/$/, "");
  const data = await getComfySystemStats(baseUrl, signal);
  return {
    ok: true,
    system: typeof data?.system?.os === "string" ? data.system.os : "ComfyUI",
    devices: Array.isArray(data?.devices) ? data.devices.length : 0,
  };
}

export function createGeneratingImages(markers: ImageMarker[]): MessageImage[] {
  const now = new Date().toISOString();
  return markers.map((marker) => ({
    id: generateId(),
    prompt: marker.prompt,
    status: "generating",
    createdAt: now,
  }));
}
