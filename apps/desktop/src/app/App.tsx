import { useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'
import { router } from './router'
import { seedTestCharacter, seedBuiltinRegex, seedLunaWorldbook, seedWritingPreset, seedSeraphina, seedEldoriaWorldbook } from './seed'
import { ToastContainer, useToast } from '@neo-tavern/ui'
import { useSettingsStore } from '@/features/settings/settings.store'
import { useWorldbookStore } from '@/features/settings/worldbook.store'
import { ThemeProvider } from './theme'
import { migrateLocalStorageToAppStore } from '@/db/storage'

let seeded = false

function AppContent() {
  const { toasts, addToast, removeToast } = useToast()
  ;(window as any).__toast = addToast

  useEffect(() => {
    if (seeded) return
    seeded = true
    void (async () => {
      await migrateLocalStorageToAppStore()
      await seedTestCharacter()
      await seedBuiltinRegex()
      await seedLunaWorldbook()
      await seedWritingPreset()
      await seedSeraphina()
      await seedEldoriaWorldbook()
      await useSettingsStore.getState().loadAllConfigs()
      await useSettingsStore.getState().loadContextTokens()
      await useSettingsStore.getState().loadRegexRules()
      await useSettingsStore.getState().loadPersona()
      await useWorldbookStore.getState().loadWorldbooks()
    })()
  }, [])

  return (
    <>
      <RouterProvider router={router} />
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
  )
}

export function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  )
}
