import { useState } from "react";
import { X, Plus, Pencil, Check, GitBranch } from "lucide-react";
import type { Message } from "@neo-tavern/shared";

interface BranchPanelProps {
  /** All messages at this fork point (same parentId) */
  branches: Message[];
  activeLeafId: string | null;
  onSwitch: (leafId: string) => void;
  onCreateBranch: (parentId: string) => void;
  getBranchName: (leafId: string) => string;
  onRename: (leafId: string, name: string) => void;
  onClose: () => void;
}

export function BranchPanel({
  branches,
  activeLeafId,
  onSwitch,
  onCreateBranch,
  getBranchName,
  onRename,
  onClose,
}: BranchPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const parentId = branches[0]?.parentId;

  // Sort: active branch first, then by creation time
  const sorted = [...branches].sort((a, b) => {
    if (a.id === activeLeafId) return -1;
    if (b.id === activeLeafId) return 1;
    return a.createdAt.localeCompare(b.createdAt);
  });

  const activeBranch = sorted.find((b) => b.id === activeLeafId);

  function startRename(leafId: string, currentName: string) {
    setEditingId(leafId);
    setEditValue(currentName);
  }

  function commitRename() {
    if (editingId && editValue.trim()) {
      onRename(editingId, editValue.trim());
    }
    setEditingId(null);
    setEditValue("");
  }

  function getPreview(msg: Message): string {
    const content = (msg.content ?? "").trim();
    if (!content && !msg.reasoningContent) return "(空消息)";
    const text = (msg.reasoningContent ?? "") || content;
    return text.length > 50 ? text.slice(0, 50) + "…" : text;
  }

  return (
    <div className="border bg-card rounded-lg shadow-lg w-80 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
          <span>分支 ({branches.length})</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-0.5 hover:bg-muted transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Branch list */}
      <div className="max-h-64 overflow-y-auto p-1">
        {sorted.map((branch) => {
          const isActive = branch.id === activeLeafId;
          const name = getBranchName(branch.id);
          const preview = getPreview(branch);

          return (
            <button
              key={branch.id}
              type="button"
              onClick={() => onSwitch(branch.id)}
              className={`w-full text-left px-3 py-2 rounded-md transition-colors flex items-start gap-2 group ${
                isActive
                  ? "bg-primary/10 border border-primary/30"
                  : "hover:bg-muted border border-transparent"
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {editingId === branch.id ? (
                    <div className="flex items-center gap-1 flex-1" onClick={(e) => e.stopPropagation()}>
                      <input
                        className="flex-1 text-xs border rounded px-1.5 py-0.5 bg-background"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename();
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={commitRename}
                        className="p-0.5 rounded hover:bg-background"
                      >
                        <Check className="h-3 w-3 text-green-600" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className={`text-xs font-medium truncate ${isActive ? "text-primary" : ""}`}>
                        {name}
                      </span>
                      {isActive && (
                        <span className="shrink-0 rounded-full bg-primary px-1.5 py-0 text-[10px] font-medium text-primary-foreground">
                          当前
                        </span>
                      )}
                    </>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                  {preview}
                </div>
              </div>
              {!isActive && editingId !== branch.id && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    startRename(branch.id, name);
                  }}
                  className="shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-muted-foreground/10 transition-opacity mt-0.5"
                  title="重命名"
                >
                  <Pencil className="h-3 w-3 text-muted-foreground" />
                </button>
              )}
            </button>
          );
        })}
      </div>

      {/* New branch button */}
      <div className="border-t p-2">
        <button
          type="button"
          onClick={() => parentId && onCreateBranch(parentId)}
          className="w-full flex items-center justify-center gap-1.5 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:border-primary/50 hover:bg-muted/50 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>从此处新建分支</span>
        </button>
      </div>
    </div>
  );
}