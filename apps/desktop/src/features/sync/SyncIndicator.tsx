import { Wifi, WifiOff, RefreshCw } from "lucide-react";
import { useSyncStore, type SyncStatus } from "./sync.store";

const STATUS_MAP: Record<SyncStatus, {
  Icon: typeof Wifi;
  color: string;
  pulse: boolean;
  label: string;
}> = {
  disabled: { Icon: WifiOff, color: "text-muted-foreground/40", pulse: false, label: "同步未启用" },
  offline:   { Icon: WifiOff, color: "text-muted-foreground", pulse: false, label: "离线" },
  connecting:{ Icon: RefreshCw, color: "text-yellow-400", pulse: true, label: "连接中..." },
  online:    { Icon: Wifi, color: "text-emerald-400", pulse: true, label: "已连接" },
};

export function SyncIndicator() {
  const status = useSyncStore((s) => s.status);
  const peers = useSyncStore((s) => s.peers);
  const { Icon, color, pulse, label } = STATUS_MAP[status];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ${color}`}
      title={peers.length > 0 ? `${label} · ${peers.length} 个设备` : label}
    >
      <Icon className={`h-3 w-3 ${pulse ? "animate-pulse" : ""}`} />
      {status !== "disabled" && (
        <span className="hidden sm:inline">{label}</span>
      )}
    </span>
  );
}