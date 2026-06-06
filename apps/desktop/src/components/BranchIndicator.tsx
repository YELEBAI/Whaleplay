import { GitFork } from "lucide-react";

interface BranchIndicatorProps {
  forkCount: number;
  onClick: () => void;
}

export function BranchIndicator({ forkCount, onClick }: BranchIndicatorProps) {
  return (
    <div className="my-2 flex items-center gap-2">
      <div className="h-px flex-1 bg-border" />
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
      >
        <GitFork className="h-3 w-3" />
        <span>{forkCount} 个分支</span>
      </button>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}