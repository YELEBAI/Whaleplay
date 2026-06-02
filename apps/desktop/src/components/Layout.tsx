import { useTranslation } from "react-i18next";
import { NavLink, Outlet } from "react-router-dom";
import { User, Settings, Home, LayoutTemplate, BookOpen, Sparkles, PenTool } from "lucide-react";
import { cn } from "@neo-tavern/ui";

export function Layout() {
  const { t } = useTranslation("common");

  const navItems = [
    { to: "/", icon: Home, label: t("nav.home") },
    { to: "/character", icon: User, label: t("nav.characters") },
    { to: "/character-builder", icon: PenTool, label: t("nav.builder", "Builder") },
    { to: "/preset", icon: LayoutTemplate, label: t("nav.presets") },
    { to: "/worldbook", icon: BookOpen, label: t("nav.worldbook") },
    { to: "/persona", icon: Sparkles, label: t("nav.persona") },
    { to: "/settings", icon: Settings, label: t("nav.settings") },
  ];

  return (
    <div className="flex h-screen bg-background">
      <aside className="w-16 flex flex-col items-center border-r bg-card py-4 gap-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center justify-center w-12 h-12 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors",
                isActive && "bg-accent text-foreground",
              )
            }
            title={item.label}
          >
            <item.icon className="h-5 w-5" />
          </NavLink>
        ))}
        <div className="flex-1" />
        <div className="text-xs text-muted-foreground font-medium -rotate-90 whitespace-nowrap mb-4">WHALE</div>
      </aside>
      <main className="flex-1 flex flex-col overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
