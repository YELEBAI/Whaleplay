import { useState, type ReactNode } from "react";
import { Button, Input, Label } from "@neo-tavern/ui";
import { KeyRound } from "lucide-react";
import { sessionSync } from "@/db/kv";

declare global {
  interface Window {
    __TAURI__?: unknown;
  }
}

/**
 * Checks whether the current environment requires LAN authentication.
 * Tauri WebView and localhost dev skip auth.
 */
function requiresAuth(): boolean {
  if (typeof window === "undefined") return false;
  // Tauri always uses localhost/tauri.localhost, skip auth
  if (window.__TAURI__) return false;
  const host = window.location.hostname;
  return host !== "localhost" && host !== "127.0.0.1" && !host.endsWith(".localhost");
}

export function LoginGate({ children }: { children: ReactNode }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [authed, setAuthed] = useState(() => !requiresAuth());

  const handleLogin = async () => {
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setError("Invalid password");
        return;
      }
      const data = (await res.json()) as { token: string };
      sessionSync.set("auth-token", data.token);
      setAuthed(true);
    } catch {
      setError("Connection failed. Is the LAN server running?");
    }
  };

  if (!authed) {
    return (
      <div className="bg-background flex min-h-screen items-center justify-center">
        <div className="w-full max-w-sm space-y-6 p-8">
          <div className="space-y-2 text-center">
            <KeyRound className="text-muted-foreground mx-auto h-10 w-10" />
            <h1 className="text-xl font-bold">NeoTavern</h1>
            <p className="text-muted-foreground text-sm">LAN access requires authentication</p>
          </div>
          <div className="space-y-4">
            <div>
              <Label>Password</Label>
              <Input
                type="password"
                value={password}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                onKeyDown={(e: React.KeyboardEvent) => e.key === "Enter" && handleLogin()}
                placeholder="Enter the LAN password"
                autoFocus
              />
            </div>
            {error && <p className="text-destructive text-xs">{error}</p>}
            <Button onClick={handleLogin} className="w-full">
              Unlock
            </Button>
          </div>
          <p className="text-muted-foreground text-center text-[10px]">
            Find the password in Settings → Appearance → LAN Server on the desktop app.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
