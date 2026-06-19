import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet, useNavigate, type NavLinkRenderProps } from "react-router";
import { check } from "@tauri-apps/plugin-updater";
import { device } from "@/db/kv";
import {
  User,
  Settings,
  Home,
  LayoutTemplate,
  BookOpen,
  Sparkles,
  PenTool,
  History,
  Minus,
  Square,
  X,
} from "lucide-react";
import { cn } from "@neo-tavern/ui";

async function withCurrentWindow(action: (appWindow: import("@tauri-apps/api/window").Window) => Promise<void>) {
  if (typeof window === "undefined") return;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await action(getCurrentWindow());
  } catch {
    /* Window API is unavailable outside the Tauri shell. */
  }
}

function WindowTitleBar() {
  return (
    <div
      data-tauri-drag-region
      onMouseDown={(event) => {
        if (event.button !== 0 || event.detail > 1) return;
        void withCurrentWindow((appWindow) => appWindow.startDragging());
      }}
      onDoubleClick={() => void withCurrentWindow((appWindow) => appWindow.toggleMaximize())}
      className="absolute top-0 right-0 left-16 z-50 flex h-7 items-stretch justify-end bg-transparent"
    >
      <button
        type="button"
        className="text-muted-foreground hover:bg-accent hover:text-foreground flex w-12 items-center justify-center transition-colors"
        title="Minimize"
        aria-label="Minimize"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={() => void withCurrentWindow((appWindow) => appWindow.minimize())}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className="text-muted-foreground hover:bg-accent hover:text-foreground flex w-12 items-center justify-center transition-colors"
        title="Maximize"
        aria-label="Maximize"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={() => void withCurrentWindow((appWindow) => appWindow.toggleMaximize())}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        <Square className="h-3 w-3" />
      </button>
      <button
        type="button"
        className="text-muted-foreground hover:bg-destructive hover:text-destructive-foreground flex w-12 items-center justify-center transition-colors"
        title="Close"
        aria-label="Close"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={() => void withCurrentWindow((appWindow) => appWindow.close())}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function Layout() {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const [updateDot, setUpdateDot] = useState(false);
  const [lastChatId, setLastChatId] = useState<string | null>(null);

  useEffect(() => {
    device.get("last-chat-id").then((r) => {
      if (r.status === "found") {
        setLastChatId(r.value);
        return;
      }
      setLastChatId(typeof localStorage === "undefined" ? null : localStorage.getItem("neo:last-chat-id"));
    });
  }, []);

  // Check for updates on mount — show red dot if available
  useEffect(() => {
    void (async () => {
      try {
        const update = await check();
        if (update) setUpdateDot(true);
      } catch {
        /* ignore */
      }
    })();
  }, []);

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
    <div className="bg-background relative flex h-screen">
      <WindowTitleBar />
      <aside className="app-rail flex w-16 flex-col items-center gap-2 border-r py-4">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }: NavLinkRenderProps) =>
              cn(
                "text-muted-foreground hover:text-foreground hover:bg-accent flex h-12 w-12 flex-col items-center justify-center rounded-lg transition-colors",
                isActive && "bg-accent text-foreground",
              )
            }
            title={item.label}
          >
            <item.icon className="h-5 w-5" />
          </NavLink>
        ))}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Recent chat shortcut */}
        {lastChatId && (
          <button
            onClick={() => navigate(`/chat/${lastChatId}`)}
            className="text-muted-foreground hover:text-foreground hover:bg-accent flex h-12 w-12 flex-col items-center justify-center rounded-lg transition-colors"
            title={t("nav.recentChat", "最近对话")}
          >
            <History className="h-5 w-5" />
          </button>
        )}

        <div className="relative flex h-12 items-center justify-center">
          {updateDot && <span className="absolute -top-0.5 -right-1 h-2 w-2 rounded-full bg-red-500" />}
          <button
            onClick={() => navigate("/about")}
            className="text-muted-foreground hover:text-foreground -rotate-90 text-xs leading-none font-medium whitespace-nowrap transition-colors"
          >
            WHALE
          </button>
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden pt-7">
        <Outlet />
      </main>
    </div>
  );
}
