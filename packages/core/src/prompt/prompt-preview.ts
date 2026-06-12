import type { BuiltPrompt } from "@neo-tavern/shared";

export function formatPreview(builtPrompt: BuiltPrompt): string {
  const lines: string[] = [];

  lines.push("# Prompt Preview");
  lines.push("");
  lines.push(`**Token Estimate:** ~${builtPrompt.tokenEstimate} tokens`);
  lines.push(`**Messages:** ${builtPrompt.messages.length}`);
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(builtPrompt.previewText);

  if (builtPrompt.includedContextBlocks.length > 0) {
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push("## Included Context Blocks");
    for (const block of builtPrompt.includedContextBlocks) {
      lines.push(`- [${block.source}] ${block.title} (priority: ${block.priority})`);
    }
  }

  return lines.join("\n");
}
