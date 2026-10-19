// Путь: src/ui/DataButton.tsx
// Кнопка «⋯» в шапке каждой вкладки: открывает окно «Данные» (синхронизация и резервная копия).
import { useSyncState } from '../data/syncEngine'
import { openData } from './dataSheetStore'
import { IconMore } from './icons'

export default function DataButton() {
  const { status } = useSyncState()
  const alert = status === 'error' || status === 'offline'
  return (
    <button className="icon-btn press" aria-label={alert ? 'Данные: есть проблема с синхронизацией' : 'Данные и синхронизация'} onClick={openData}>
      <IconMore />
      {alert && <span className="alert-dot" aria-hidden="true" />}
    </button>
  )
}
