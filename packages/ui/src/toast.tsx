import { useEffect, useState, useCallback } from 'react'
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react'
import { cn } from './lib/utils'

export interface ToastItem {
  id: string
  type: 'success' | 'error' | 'info'
  message: string
}

interface ToastProps {
  toasts: ToastItem[]
  onRemove: (id: string) => void
}

export function ToastContainer({ toasts, onRemove }: ToastProps) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  )
}

function Toast({ toast, onRemove }: { toast: ToastItem; onRemove: (id: string) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onRemove(toast.id), 4000)
    return () => clearTimeout(timer)
  }, [toast.id, onRemove])

  const icons = {
    success: <CheckCircle className="h-4 w-4 text-green-500" />,
    error: <AlertCircle className="h-4 w-4 text-red-500" />,
    info: <Info className="h-4 w-4 text-blue-500" />,
  }

  const colors = {
    success: 'border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800',
    error: 'border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-800',
    info: 'border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800',
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border px-4 py-3 shadow-lg text-sm animate-slide-in-right',
        colors[toast.type]
      )}
    >
      {icons[toast.type]}
      <span className="flex-1">{toast.message}</span>
      <button onClick={() => onRemove(toast.id)} className="opacity-50 hover:opacity-100">
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const addToast = useCallback((type: ToastItem['type'], message: string) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { id, type, message }])
    return id
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return { toasts, addToast, removeToast }
}
