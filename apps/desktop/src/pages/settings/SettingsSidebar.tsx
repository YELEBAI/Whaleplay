import { ArrowLeft } from "lucide-react"
import type { Section, SectionWithLabel } from "./types"

interface SettingsSidebarProps {
  section: Section
  sections: SectionWithLabel[]
  onSelect: (section: Section) => void
  onBack: () => void
  onContextClick: () => void
  t: (key: string) => string
}

export function SettingsSidebar({
  section,
  sections,
  onSelect,
  onBack,
  onContextClick,
  t,
}: SettingsSidebarProps) {
  return (
    <div className="w-48 border-r p-4 flex flex-col gap-1">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4 px-2"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("back")}
      </button>
      {sections.map((s) => (
        <button
          key={s.key}
          onClick={() =>
            s.key === "context" ? onContextClick() : onSelect(s.key)
          }
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors
            ${section === s.key ? "bg-accent text-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-accent/50"}`}
        >
          <s.icon className="h-4 w-4" />
          {s.label}
        </button>
      ))}
    </div>
  )
}
