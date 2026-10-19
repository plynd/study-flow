// Путь: src/ui/dataSheetStore.ts
// Окно «Данные» одно на всё приложение, а открывать его можно с любой вкладки.
import { useSyncExternalStore } from 'react'

let open = false
const listeners = new Set<() => void>()
const set = (v: boolean) => { open = v; listeners.forEach((l) => l()) }

export const openData = () => set(true)
export const closeData = () => set(false)
export const useDataOpen = (): boolean =>
  useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l) } }, () => open)
