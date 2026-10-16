// Путь: src/ui/Toast.tsx
import { useEffect } from 'react'
import type { Notice } from './notice'

/**
 * Короткое сообщение над нижней панелью: что произошло и, если можно, «Отменить».
 * Обычное исчезает само; ошибка остаётся, пока её не закроют.
 */
export default function Toast({ notice, onClose }: { notice: Notice | null; onClose: () => void }) {
  const id = notice?.id
  const long = (notice?.text.length ?? 0) > 90
  const isError = notice?.tone === 'error'
  useEffect(() => {
    if (id === undefined || isError) return
    const t = setTimeout(onClose, long ? 9000 : 5500)
    return () => clearTimeout(t)
  }, [id, isError, long, onClose])

  if (!notice) return null
  return (
    <div className={`toast ${notice.tone}`} key={notice.id} role={isError ? 'alert' : 'status'}>
      <span className="toast-text">{notice.text}</span>
      {notice.action && (
        <button className="toast-action" onClick={() => { notice.action!.run(); onClose() }}>{notice.action.label}</button>
      )}
      <button className="toast-close" aria-label="Закрыть" onClick={onClose}>✕</button>
    </div>
  )
}
