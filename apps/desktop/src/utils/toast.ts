import type { ToastItem } from "@neo-tavern/ui"

declare global {
  interface Window {
    __toast?: (type: ToastItem["type"], message: string) => void
  }
}

export function toast(type: ToastItem["type"], message: string) {
  window.__toast?.(type, message)
}
