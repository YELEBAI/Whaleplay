import { useRef, useState } from "react";
import { Image as ImageIcon, Plug, Upload } from "lucide-react";
import {
  Button,
  Input,
  Label,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Textarea,
  cn,
} from "@neo-tavern/ui";
import { useSettingsStore } from "@/features/settings/settings.store";
import {
  generateComfyImage,
  IMAGE_GENERATION_PARAMETER_PRESETS,
  IMAGE_RESOLUTION_OPTIONS,
  IMAGE_SAMPLER_OPTIONS,
  IMAGE_SCHEDULER_OPTIONS,
  normalizeImageSettings,
  testComfyConnection,
} from "@/features/image-generation/image-generation";
import { toast } from "@/utils/toast";
import type { ImageSectionProps } from "./types";

function SwitchButton({ checked, onClick, label }: { checked: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
        checked ? "bg-primary" : "bg-muted-foreground/30",
      )}
    >
      <span
        className={cn(
          "bg-background inline-block h-5 w-5 rounded-full shadow-sm transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

export function ImageSection({ t }: ImageSectionProps) {
  const imageGeneration = useSettingsStore((s) => s.imageGeneration);
  const updateImageGenerationSettings = useSettingsStore((s) => s.updateImageGenerationSettings);
  const modelConfigs = useSettingsStore((s) => s.modelConfigs);

  const workflowFileInputRef = useRef<HTMLInputElement>(null);
  const [testingComfyConnection, setTestingComfyConnection] = useState(false);
  const [testingComfyImage, setTestingComfyImage] = useState(false);
  const [comfyTestMessage, setComfyTestMessage] = useState("");
  const [comfyTestImage, setComfyTestImage] = useState<string | null>(null);

  const handleWorkflowFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      updateImageGenerationSettings({ comfyWorkflowJson: JSON.stringify(parsed, null, 2) });
      toast("success", `Imported workflow "${file.name}"`);
    } catch {
      toast("error", "Invalid ComfyUI workflow JSON");
    }
  };

  const applyImageParameterPreset = (presetId: string) => {
    const preset = IMAGE_GENERATION_PARAMETER_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    updateImageGenerationSettings({
      generationPreset: preset.id,
      ...preset.settings,
    });
  };

  const resolutionSelectValue = IMAGE_RESOLUTION_OPTIONS.some(
    (option) => option.width === imageGeneration.width && option.height === imageGeneration.height,
  )
    ? `${imageGeneration.width}x${imageGeneration.height}`
    : "custom";

  const handleImageResolutionChange = (value: string) => {
    const option = IMAGE_RESOLUTION_OPTIONS.find((item) => `${item.width}x${item.height}` === value);
    if (!option) return;
    updateImageGenerationSettings({
      width: option.width,
      height: option.height,
      generationPreset: "custom",
    });
  };

  const handleTestComfyConnection = async () => {
    setTestingComfyConnection(true);
    setComfyTestMessage("");
    try {
      const result = await testComfyConnection(normalizeImageSettings(imageGeneration));
      const deviceText =
        result.devices > 0 ? `${result.devices} device${result.devices === 1 ? "" : "s"}` : "no device info";
      setComfyTestMessage(`Connected: ${result.system}, ${deviceText}`);
      toast("success", "ComfyUI connected");
    } catch (err) {
      const message = (err as Error).message || "ComfyUI connection failed";
      setComfyTestMessage(message);
      toast("error", message);
    } finally {
      setTestingComfyConnection(false);
    }
  };

  const handleTestComfyImage = async () => {
    setTestingComfyImage(true);
    setComfyTestImage(null);
    setComfyTestMessage("Generating test image...");
    try {
      const image = await generateComfyImage(
        "masterpiece, cozy fantasy tavern library, warm lantern light, open book on wooden table, cinematic composition, highly detailed",
        normalizeImageSettings(imageGeneration),
      );
      setComfyTestImage(image);
      setComfyTestMessage("Test image generated successfully.");
      toast("success", "ComfyUI image generated");
    } catch (err) {
      const message = (err as Error).message || "ComfyUI image test failed";
      setComfyTestMessage(message);
      toast("error", message);
    } finally {
      setTestingComfyImage(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="card-title-row">
                <ImageIcon className="h-5 w-5" />
                Image Generation
              </CardTitle>
              <CardDescription>{t("image.description")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="setting-row">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t("image.enable")}</p>
                  <p className="text-muted-foreground mt-1 text-xs">{t("image.description")}</p>
                </div>
                <SwitchButton
                  checked={imageGeneration.enabled}
                  onClick={() => updateImageGenerationSettings({ enabled: !imageGeneration.enabled })}
                  label="Toggle image generation"
                />
              </div>

              <div className="space-y-3">
                <div>
                  <Label>Trigger Mode</Label>
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => updateImageGenerationSettings({ mode: "manual" })}
                      className={cn(
                        "rounded-md border p-3 text-left transition-colors",
                        imageGeneration.mode === "manual" ? "border-primary bg-primary/10" : "hover:bg-accent/50",
                      )}
                    >
                      <p className="text-sm font-medium">{t("image.modeManual")}</p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        Show an image button on each AI reply. Click only when you want pictures.
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => updateImageGenerationSettings({ mode: "auto" })}
                      className={cn(
                        "rounded-md border p-3 text-left transition-colors",
                        imageGeneration.mode === "auto" ? "border-primary bg-primary/10" : "hover:bg-accent/50",
                      )}
                    >
                      <p className="text-sm font-medium">{t("image.modeAuto")}</p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        After every AI reply, ask the secondary API to plan images and send them to ComfyUI.
                      </p>
                    </button>
                  </div>
                </div>

                <div>
                  <Label htmlFor="planner-config">{t("image.plannerConfig")}</Label>
                  <select
                    id="planner-config"
                    value={imageGeneration.plannerConfigId ?? ""}
                    onChange={(e) => updateImageGenerationSettings({ plannerConfigId: e.target.value || null })}
                    className="bg-background h-10 w-full rounded-md border px-3 text-sm"
                  >
                    <option value="">Select a profile before generating images</option>
                    {modelConfigs.map((cfg) => (
                      <option key={cfg.id} value={cfg.id}>
                        {cfg.name || cfg.model} · {cfg.model}
                      </option>
                    ))}
                  </select>
                  <p className="text-muted-foreground mt-1 text-xs">
                    This profile writes image prompts. ComfyUI handles the final image generation.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("image.settings")}</CardTitle>
              <CardDescription>
                These values fill common ComfyUI KSampler and latent size inputs, and can also be used as workflow
                placeholders.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Parameter Preset</Label>
                <div className="mt-2 grid gap-2 md:grid-cols-3">
                  {IMAGE_GENERATION_PARAMETER_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyImageParameterPreset(preset.id)}
                      className={cn(
                        "rounded-md border p-3 text-left transition-colors",
                        imageGeneration.generationPreset === preset.id
                          ? "border-primary bg-primary/10"
                          : "hover:bg-accent/50",
                      )}
                    >
                      <p className="text-sm font-medium">{preset.label}</p>
                      <p className="text-muted-foreground mt-1 text-xs">{preset.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <div className="md:col-span-2">
                  <Label htmlFor="image-resolution">Resolution</Label>
                  <select
                    id="image-resolution"
                    value={resolutionSelectValue}
                    onChange={(e) => handleImageResolutionChange(e.target.value)}
                    className="bg-background h-10 w-full rounded-md border px-3 text-sm"
                  >
                    {resolutionSelectValue === "custom" && (
                      <option value="custom">
                        Custom {imageGeneration.width}x{imageGeneration.height}
                      </option>
                    )}
                    {IMAGE_RESOLUTION_OPTIONS.map((option) => (
                      <option key={`${option.width}x${option.height}`} value={`${option.width}x${option.height}`}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="image-steps">Steps</Label>
                  <Input
                    id="image-steps"
                    type="number"
                    min="1"
                    max="150"
                    value={imageGeneration.steps}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      updateImageGenerationSettings({ steps: Number(e.target.value), generationPreset: "custom" })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="image-cfg">CFG</Label>
                  <Input
                    id="image-cfg"
                    type="number"
                    min="0"
                    max="30"
                    step="0.1"
                    value={imageGeneration.cfgScale}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      updateImageGenerationSettings({
                        cfgScale: Number(e.target.value),
                        generationPreset: "custom",
                      })
                    }
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <div>
                  <Label htmlFor="image-sampler">Sampler</Label>
                  <select
                    id="image-sampler"
                    value={imageGeneration.samplerName}
                    onChange={(e) =>
                      updateImageGenerationSettings({ samplerName: e.target.value, generationPreset: "custom" })
                    }
                    className="bg-background h-10 w-full rounded-md border px-3 text-sm"
                  >
                    {IMAGE_SAMPLER_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="image-scheduler">Scheduler</Label>
                  <select
                    id="image-scheduler"
                    value={imageGeneration.scheduler}
                    onChange={(e) =>
                      updateImageGenerationSettings({ scheduler: e.target.value, generationPreset: "custom" })
                    }
                    className="bg-background h-10 w-full rounded-md border px-3 text-sm"
                  >
                    {IMAGE_SCHEDULER_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="image-denoise">Denoise</Label>
                  <Input
                    id="image-denoise"
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    value={imageGeneration.denoise}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      updateImageGenerationSettings({
                        denoise: Number(e.target.value),
                        generationPreset: "custom",
                      })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="image-max">Images / Trigger</Label>
                  <Input
                    id="image-max"
                    type="number"
                    min="0"
                    max="6"
                    value={imageGeneration.maxImages}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      updateImageGenerationSettings({ maxImages: Number(e.target.value) })
                    }
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
                <div>
                  <Label htmlFor="image-seed-mode">Seed Mode</Label>
                  <select
                    id="image-seed-mode"
                    value={imageGeneration.seedMode}
                    onChange={(e) =>
                      updateImageGenerationSettings({ seedMode: e.target.value === "fixed" ? "fixed" : "random" })
                    }
                    className="bg-background h-10 w-full rounded-md border px-3 text-sm"
                  >
                    <option value="random">Random</option>
                    <option value="fixed">Fixed</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="image-fixed-seed">Fixed Seed</Label>
                  <Input
                    id="image-fixed-seed"
                    type="number"
                    min="0"
                    max="4294967295"
                    value={imageGeneration.fixedSeed}
                    disabled={imageGeneration.seedMode !== "fixed"}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      updateImageGenerationSettings({ fixedSeed: Number(e.target.value) })
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Prompt Rules</CardTitle>
              <CardDescription>Instructions sent to the secondary image-planning API.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="image-instruction">Planner Instruction</Label>
                <Textarea
                  id="image-instruction"
                  value={imageGeneration.promptInstruction}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    updateImageGenerationSettings({ promptInstruction: e.target.value })
                  }
                  rows={6}
                  className="font-mono text-xs"
                />
                <p className="text-muted-foreground mt-1 text-xs">
                  This is sent only to the secondary image planner in manual and auto modes.
                </p>
              </div>

              <div>
                <Label htmlFor="negative-prompt">Negative Prompt</Label>
                <Textarea
                  id="negative-prompt"
                  value={imageGeneration.negativePrompt}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    updateImageGenerationSettings({ negativePrompt: e.target.value })
                  }
                  rows={3}
                  className="font-mono text-xs"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>ComfyUI Connection</CardTitle>
              <CardDescription>Local server and workflow used for every image.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="comfy-url">ComfyUI URL</Label>
                <Input
                  id="comfy-url"
                  value={imageGeneration.comfyUrl}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    updateImageGenerationSettings({ comfyUrl: e.target.value })
                  }
                  placeholder="http://127.0.0.1:8188"
                  className="font-mono text-xs"
                />
                <p className="text-muted-foreground mt-1 text-xs">
                  Uses /prompt, /history/&lt;prompt_id&gt;, and /view.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  onClick={handleTestComfyConnection}
                  disabled={testingComfyConnection || testingComfyImage}
                >
                  <Plug className="mr-2 h-4 w-4" />
                  {testingComfyConnection ? "Testing..." : "Test Connection"}
                </Button>
                <Button
                  onClick={handleTestComfyImage}
                  disabled={testingComfyConnection || testingComfyImage || !imageGeneration.comfyWorkflowJson.trim()}
                >
                  <ImageIcon className="mr-2 h-4 w-4" />
                  {testingComfyImage ? "Generating..." : "Test Image"}
                </Button>
              </div>
              {comfyTestMessage && (
                <div className="bg-background/70 text-muted-foreground rounded-md border px-3 py-2 text-xs">
                  {comfyTestMessage}
                </div>
              )}
              {comfyTestImage && (
                <img
                  src={comfyTestImage}
                  alt="ComfyUI test output"
                  className="bg-background max-h-72 w-full rounded-md border object-contain"
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>Workflow</CardTitle>
                  <CardDescription>Paste or import a ComfyUI API workflow JSON.</CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => workflowFileInputRef.current?.click()}
                  className="shrink-0"
                >
                  <Upload className="mr-1 h-3.5 w-3.5" />
                  JSON
                </Button>
              </div>
              <input
                ref={workflowFileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleWorkflowFileImport}
                className="hidden"
              />
            </CardHeader>
            <CardContent>
              <Textarea
                value={imageGeneration.comfyWorkflowJson}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  updateImageGenerationSettings({ comfyWorkflowJson: e.target.value })
                }
                rows={18}
                placeholder='{"1":{"class_type":"CLIPTextEncode","inputs":{"text":"{{prompt}}"}}}'
                className="font-mono text-xs"
              />
              <p className="text-muted-foreground mt-2 text-xs">
                Placeholders: {"{{prompt}}"}, {"{{negativePrompt}}"}, {"{{seed}}"}, {"{{width}}"}, {"{{height}}"},{" "}
                {"{{steps}}"}, {"{{cfg}}"}, {"{{samplerName}}"}, {"{{scheduler}}"}, {"{{denoise}}"}.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
