import { create } from "zustand";

// ── Types ─────────────────────────────────────────────

export interface SyncPeer {
  deviceId: string;
  deviceName: string;
  pairedAt: string;
}

export type SyncStatus = "disabled" | "offline" | "connecting" | "online";

interface SyncState {
  /** Whether sync is enabled in settings */
  enabled: boolean;
  /** Current connection status */
  status: SyncStatus;
  /** Paired peers (empty until actual sync is implemented) */
  peers: SyncPeer[];
  /** Timestamp of last successful sync */
  lastSyncAt: string | null;
  /** LAN server port for QR pairing */
  lanPort: number;

  // Actions
  setEnabled: (enabled: boolean) => void;
  setStatus: (status: SyncStatus) => void;
  addPeer: (peer: SyncPeer) => void;
  removePeer: (deviceId: string) => void;
  markSynced: () => void;
  setLanPort: (port: number) => void;
}

// ── Store ─────────────────────────────────────────────

export const useSyncStore = create<SyncState>((set) => ({
  enabled: false,
  status: "disabled",
  peers: [],
  lastSyncAt: null,
  lanPort: 9876,

  setEnabled: (enabled) =>
    set({ enabled, status: enabled ? "offline" : "disabled" }),

  setStatus: (status) => set({ status }),

  addPeer: (peer) =>
    set((s) => ({
      peers: s.peers.some((p) => p.deviceId === peer.deviceId)
        ? s.peers
        : [...s.peers, peer],
    })),

  removePeer: (deviceId) =>
    set((s) => ({
      peers: s.peers.filter((p) => p.deviceId !== deviceId),
    })),

  markSynced: () => set({ lastSyncAt: new Date().toISOString() }),

  setLanPort: (port) => set({ lanPort: port }),
}));