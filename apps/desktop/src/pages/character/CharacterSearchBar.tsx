import { Search, X, LayoutGrid, List } from "lucide-react";
import { Button, Input } from "@neo-tavern/ui";
import type { ViewMode } from "./types";

export function SearchBar({
  searchExpanded,
  searchQuery,
  viewMode,
  onSearchToggle,
  onSearchChange,
  onViewModeChange,
  t,
}: {
  searchExpanded: boolean;
  searchQuery: string;
  viewMode: ViewMode;
  onSearchToggle: () => void;
  onSearchChange: (query: string) => void;
  onViewModeChange: (mode: ViewMode) => void;
  t: (key: string) => string;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 px-4 py-2">
      {searchExpanded ? (
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2" />
          <Input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t("search.placeholder")}
            className="h-8 pl-8"
            autoFocus
          />
          {searchQuery && (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
              onClick={() => onSearchChange("")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ) : (
        <div className="flex-1" />
      )}
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8"
        onClick={onSearchToggle}
        title={t(searchExpanded ? "search.close" : "search.open")}
      >
        {searchExpanded ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
      </Button>
      <div className="flex items-center gap-0.5 rounded-md border p-0.5">
        <button
          type="button"
          onClick={() => onViewModeChange("grid")}
          className={`rounded p-1 transition-colors ${viewMode === "grid" ? "bg-accent" : "hover:bg-accent/50"}`}
          title={t("view.grid")}
        >
          <LayoutGrid className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onViewModeChange("list")}
          className={`rounded p-1 transition-colors ${viewMode === "list" ? "bg-accent" : "hover:bg-accent/50"}`}
          title={t("view.list")}
        >
          <List className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
