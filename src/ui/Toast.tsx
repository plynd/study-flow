// Путь: src/ui/Toast.tsx
import { useEffect, useState } from 'react'
import type { Notice } from './notice'
import { IconCheck } from './icons'

const OUT_MS = 280

/** Сколько висит сообщение: длинный текст читается дольше, с «Отменить» — тоже, чтобы успеть нажать */
function lifetime(n: Notice): number {
  const base = n.text.length > 90 ? 9000 : 5500
  return n.tone === 'error' ? Math.max(base, 8000) : n.action ? Math.max(base, 7000) : base
}

/**
 * Короткое сообщение по центру экрана над нижней панелью: что произошло и, если можно, «Отменить».
 * Исчезает само (ошибка — позже других); можно убрать и касанием.
 */
export default function Toast({ notice, onClose }: { notice: Notice | null; onClose: () => void }) {
  // Показываем последнее сообщение ещё чуть-чуть после закрытия, чтобы успела сыграть анимация ухода
  const [prev, setPrev] = useState<Notice | null>(notice)
  const [shown, setShown] = useState<Notice | null>(notice)
  const [out, setOut] = useState(false)
  if (notice !== prev) {
    setPrev(notice)
    if (notice) { setShown(notice); setOut(false) } else setOut(true)
  }

  useEffect(() => {
    if (!out) return
    const t = setTimeout(() => setShown(null), OUT_MS)
    return () => clearTimeout(t)
  }, [out])

  const id = notice?.id
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(onClose, lifetime(notice))
    return () => clearTimeout(t)
    // таймер привязан к самому сообщению: новое сообщение запускает отсчёт заново
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, onClose])

  if (!shown) return null
  const isError = shown.tone === 'error'
  return (
    <div className="toast-wrap">
      <div className={`toast ${shown.tone}${out ? ' out' : ''}`} key={shown.id} role={isError ? 'alert' : 'status'} onClick={onClose}>
        <span className="toast-icon" aria-hidden="true">{isError ? '!' : <IconCheck size={14} />}</span>
        <span className="toast-text">{shown.text}</span>
        {shown.action && (
          <button className="toast-action press" onClick={(e) => { e.stopPropagation(); shown.action!.run(); onClose() }}>{shown.action.label}</button>
        )}
      </div>
    </div>
  )
}
