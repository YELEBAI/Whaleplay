import { ArrowLeft } from "lucide-react";
import type { Section, SectionWithLabel } from "./types";

interface SettingsSidebarProps {
  section: Section;
  sections: SectionWithLabel[];
  onSelect: (section: Section) => void;
  onBack: () => void;
  onContextClick: () => void;
  t: (key: string) => string;
}

export function SettingsSidebar({ section, sections, onSelect, onBack, onContextClick, t }: SettingsSidebarProps) {
  return (
    <div className="flex w-48 flex-col gap-1 border-r p-4">
      <button
        onClick={onBack}
        className="text-muted-foreground hover:text-foreground mb-4 flex items-center gap-2 px-2 text-sm transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("back")}
      </button>
      {sections.map((s) => (
        <button
          key={s.key}
          onClick={() => (s.key === "context" ? onContextClick() : onSelect(s.key))}
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${section === s.key ? "bg-accent text-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-accent/50"}`}
        >
          <s.icon className="h-4 w-4" />
          {s.label}
        </button>
      ))}
    </div>
  );
}
