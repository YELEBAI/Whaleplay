import type { DisplayBlock } from "@neo-tavern/core";
import { SideBlockView, TemplateDisplayBlockView } from "./ChatDisplay";
import { ImageDisplayBlockView } from "./ImageBlocks";
import type { MessageListActions, RenderedMessage } from "./types";

interface MessageDisplayBlocksProps {
  item: RenderedMessage;
  fontSize: number;
  actions: MessageListActions;
}

export function MessageDisplayBlocks({ item, fontSize, actions }: MessageDisplayBlocksProps) {
  const { msg, split, displayContent, isStreamingAi, hasDisplayContent } = item;
  let imageBlockIndex = 0;

  if (split?.displayBlocks && split.displayBlocks.length > 0 && hasDisplayContent) {
    return (
      <div className="space-y-2">
        {split.displayBlocks.map((block: DisplayBlock, index: number) => {
          if (block.type === "image") {
            const currentImageIndex = imageBlockIndex++;
            return (
              <ImageDisplayBlockView
                key={index}
                prompt={block.content}
                image={msg.images?.[currentImageIndex]}
                fontSize={fontSize}
                onDelete={() => void actions.deleteImage(msg.id, currentImageIndex, block.content)}
                onEditPrompt={() => actions.editImagePrompt(msg, currentImageIndex, block.content)}
                onRegenerate={() => void actions.regenerateImage(msg.id, currentImageIndex, block.content)}
              />
            );
          }

          if (block.type === "template") {
            return <TemplateDisplayBlockView key={index} block={block} fontSize={fontSize} />;
          }

          if (block.type === "dialogue") {
            return (
              <div key={index} className="bg-accent/40 relative mt-3 rounded-md border p-3 first:mt-0">
                <span className="bg-primary text-primary-foreground absolute -top-2.5 left-3 rounded px-2 py-0.5 text-[10px] font-semibold">
                  {block.speaker}
                </span>
                <p className="pt-0.5 wrap-break-word whitespace-pre-wrap" style={{ fontSize: `${fontSize}px` }}>
                  {block.content}
                </p>
              </div>
            );
          }

          return (
            <p
              key={index}
              className="leading-relaxed wrap-break-word whitespace-pre-wrap"
              style={{ fontSize: `${fontSize}px` }}
            >
              {block.content}
            </p>
          );
        })}
      </div>
    );
  }

  if (isStreamingAi && !hasDisplayContent) return null;

  return (
    <p className="leading-relaxed wrap-break-word whitespace-pre-wrap" style={{ fontSize: `${fontSize}px` }}>
      {displayContent}
    </p>
  );
}

export function MessageSideBlocks({
  message,
  fontSize,
  actions,
}: {
  message: RenderedMessage;
  fontSize: number;
  actions: MessageListActions;
}) {
  return (
    <>
      {message.split?.sideBlocks.map((side, index) => (
        <div key={index} style={{ fontSize: `${fontSize}px` }}>
          <SideBlockView side={side} fontSize={fontSize} onAction={actions.setInput} />
        </div>
      ))}
    </>
  );
}
