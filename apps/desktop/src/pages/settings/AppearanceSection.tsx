import { Sun, Moon, Eye, Monitor, CheckCircle2, Waves } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@neo-tavern/ui";
import { useThemeStore, type Theme } from "@/app/theme.store";

export function AppearanceSection({ t }: { t: (key: string, params?: Record<string, string>) => string }) {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);

  const themes = [
    { value: "light" as Theme, icon: Sun, label: t("appearance.light") },
    { value: "dark" as Theme, icon: Moon, label: t("appearance.dark") },
    { value: "sepia" as Theme, icon: Eye, label: t("appearance.eyeCare") },
    { value: "blue" as Theme, icon: Waves, label: t("appearance.blue") },
    { value: "system" as Theme, icon: Monitor, label: t("appearance.system") },
  ];

  const resolvedLabel =
    resolvedTheme === "dark"
      ? t("appearance.dark")
      : resolvedTheme === "blue"
        ? t("appearance.blue")
        : resolvedTheme === "sepia"
          ? t("appearance.eyeCare")
          : t("appearance.light");

  const TitleIcon =
    resolvedTheme === "dark" ? Moon : resolvedTheme === "blue" ? Waves : resolvedTheme === "sepia" ? Eye : Sun;

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
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          {themes.map((th) => (
            <button
              key={th.value}
              onClick={() => setTheme(th.value)}
              className={`relative flex flex-col items-center gap-2 rounded-lg border p-4 transition-colors ${
                theme === th.value
                  ? "app-sidebar-gradient border-border/90 text-foreground shadow-sm"
                  : "border-border bg-background/35 text-muted-foreground hover:bg-accent/70 hover:text-foreground"
              }`}
            >
              {theme === th.value && <CheckCircle2 className="text-foreground absolute top-2 right-2 h-3.5 w-3.5" />}
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
                  : theme === "blue"
                    ? t("appearance.blue")
                    : theme === "dark"
                      ? t("appearance.dark")
                      : t("appearance.light"),
          })}
        </div>
      </CardContent>
    </Card>
  );
}
