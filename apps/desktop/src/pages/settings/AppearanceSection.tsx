import { Sun, Moon, Eye, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@neo-tavern/ui";
import { useThemeStore } from "@/app/theme.store";
import type { ThemeOption } from "./types";

interface AppearanceSectionProps {
  themes: ThemeOption[];
  t: (key: string, params?: Record<string, string>) => string;
}

export function AppearanceSection({ themes, t }: AppearanceSectionProps) {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);

  const resolvedLabel =
    resolvedTheme === "dark"
      ? t("appearance.dark")
      : resolvedTheme === "sepia"
        ? t("appearance.eyeCare")
        : t("appearance.light");

  const TitleIcon = resolvedTheme === "dark" ? Moon : resolvedTheme === "sepia" ? Eye : Sun;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="card-title-row">
          <TitleIcon className="h-5 w-5" />
          {t("appearance.title")}
        </CardTitle>
        <CardDescription>{t("appearance.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {themes.map((th) => (
            <button
              key={th.value}
              onClick={() => setTheme(th.value)}
              className={`relative flex flex-col items-center gap-2 rounded-lg border p-4 transition-colors
                ${theme === th.value ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent hover:text-accent-foreground"}`}
            >
              {theme === th.value && <CheckCircle2 className="absolute right-2 top-2 h-3.5 w-3.5" />}
              <th.icon className="h-5 w-5" />
              <span className="text-sm font-medium">{th.label}</span>
            </button>
          ))}
        </div>

        <div className="info-block">
          {t("appearance.activeAppearance", {
            value:
              theme === "system"
                ? t("appearance.systemResolved", { resolved: resolvedLabel })
                : theme === "sepia"
                  ? t("appearance.eyeCare")
                  : theme === "dark"
                    ? t("appearance.dark")
                    : t("appearance.light"),
          })}
        </div>
      </CardContent>
    </Card>
  );
}
