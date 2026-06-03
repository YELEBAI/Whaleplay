import { Pencil, RotateCcw, Trash2, Check, X, Image as ImageIcon } from "lucide-react";
import { Button } from "@neo-tavern/ui";
import { generateId, type MessageImage, type ModelConfig } from "@neo-tavern/shared";
import { useSettingsStore } from "@/features/settings/settings.store";
import { settingsRepository } from "@/db/repositories";

export function ImageIconSpinner({ status }: { status?: MessageImage["status"] }) {
  if (status === "deleted") return <Trash2 className="mx-auto h-5 w-5 text-muted-foreground" />;
  if (status === "error") return <X className="mx-auto h-5 w-5 text-destructive" />;
  if (status === "done") return <Check className="mx-auto h-5 w-5 text-green-500" />;
  return <ImageIcon className="mx-auto h-5 w-5 animate-pulse text-primary" />;
}

export function ImageDisplayBlockView({
  prompt,
  image,
  fontSize,
  onDelete,
  onEditPrompt,
  onRegenerate,
}: {
  prompt: string;
  image?: MessageImage;
  fontSize: number;
  onDelete: () => void;
  onEditPrompt: () => void;
  onRegenerate: () => void;
}) {
  const displayPrompt = image?.prompt?.trim() || prompt;
  const isGenerating = image?.status === "generating";
  const isDeleted = image?.status === "deleted";
  const statusText = isDeleted
    ? "图片已删除"
    : image?.status === "error"
      ? "图片生成失败"
      : isGenerating
        ? "ComfyUI 生图中"
        : "图片尚未生成";

  return (
    <div className="group relative rounded-lg border border-primary/20 bg-primary/5 p-2">
      <div className="absolute right-3 top-3 z-10 flex gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7 bg-background/90 shadow-sm backdrop-blur"
          onClick={onEditPrompt}
          title="修改图片提示词"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7 bg-background/90 shadow-sm backdrop-blur"
          onClick={onRegenerate}
          disabled={isGenerating}
          title="重新生成图片"
        >
          <RotateCcw className={`h-3.5 w-3.5 ${isGenerating ? "animate-spin" : ""}`} />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7 bg-background/90 text-destructive shadow-sm backdrop-blur hover:text-destructive"
          onClick={onDelete}
          disabled={isDeleted}
          title="删除图片"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      {image?.status === "done" && image.src ? (
        <img
          src={image.src}
          alt={displayPrompt}
          className="max-h-[520px] w-full rounded-md object-contain bg-background"
        />
      ) : (
        <div className="flex min-h-32 items-center justify-center rounded-md border border-dashed bg-background/50">
          <div className="space-y-2 text-center">
            <ImageIconSpinner status={image?.status} />
            <p className="text-xs text-muted-foreground">{statusText}</p>
          </div>
        </div>
      )}
      <details className="mt-2 text-muted-foreground">
        <summary className="cursor-pointer text-xs">Image prompt</summary>
        <p className="mt-1 whitespace-pre-wrap text-xs" style={{ fontSize: `${Math.max(11, fontSize - 3)}px` }}>
          {displayPrompt}
        </p>
        {image?.error && <p className="mt-1 whitespace-pre-wrap text-xs text-destructive">{image.error}</p>}
      </details>
    </div>
  );
}

export function ensureImageSlots(images: MessageImage[] | undefined, imageIndex: number, prompt: string) {
  const now = new Date().toISOString();
  const next = [...(images ?? [])];

  while (next.length <= imageIndex) {
    next.push({
      id: generateId(),
      prompt,
      status: "deleted",
      createdAt: now,
      updatedAt: now,
    });
  }

  return next;
}

export function clipImageReference(content: string, maxChars: number) {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

export async function resolveImagePlannerConfig(configId: string | null): Promise<ModelConfig | null> {
  if (!configId) return null;
  const stateConfig = useSettingsStore.getState().modelConfigs.find((config) => config.id === configId);
  return stateConfig ?? settingsRepository.getModelConfig(configId);
}
