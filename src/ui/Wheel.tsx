// Путь: src/ui/Wheel.tsx
// Колесо выбора как в iOS: значения крутятся по кругу, выбранное стоит по центру, остальные меркнут к краям.
// Основа — обычная прокрутка с «примагничиванием» (scroll-snap): так работают и палец, и колесо мыши, и тачпад.
import { useEffect, useLayoutEffect, useRef } from 'react'
import { tick, unlockAudio } from '../platform/haptics'

const ROWS = 5 // сколько строк видно
const ROW_PX = 44 // высота строки в пикселях, не в rem: дробная высота (крупный шрифт на телефоне) накапливает сдвиг и строки уезжают от центра
const COPIES = 3 // значения повторены трижды, чтобы листать бесконечно; стоим всегда на средней копии

interface Props {
  /** сколько значений: 24 часа, 60 минут */
  count: number
  value: number
  onChange: (v: number) => void
  label: string
}

const two = (n: number) => String(n).padStart(2, '0')

export default function Wheel({ count, value, onChange, label }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const rowH = useRef(0)
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const raf = useRef(0)
  const current = useRef(value)
  const lastRow = useRef<number | null>(null)
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange })

  /** Строка по центру и «затухание» остальных. Пишем напрямую в стиль: на каждый кадр прокрутки React не нужен. */
  const paint = () => {
    const el = box.current
    if (!el || !rowH.current) return
    const pos = el.scrollTop / rowH.current
    // каждая строка, проходящая через центр, — один «щелчок» вибрации, как у барабана в iOS
    const row = Math.round(pos)
    if (lastRow.current !== null && row !== lastRow.current) tick()
    lastRow.current = row
    const kids = el.children
    const lo = Math.max(0, Math.floor(pos) - ROWS), hi = Math.min(kids.length - 1, Math.ceil(pos) + ROWS)
    for (let i = lo; i <= hi; i++) {
      const d = Math.abs(i - pos)
      const s = kids[i] as HTMLElement
      s.style.opacity = String(Math.max(0, 1 - d * 0.36))
      s.style.transform = `scale(${Math.max(0.72, 1 - d * 0.1)})`
    }
  }

  const jumpTo = (v: number, smooth = false) => {
    const el = box.current
    if (!el) return
    el.scrollTo({ top: (count + v) * rowH.current, behavior: smooth ? 'smooth' : 'instant' })
  }

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    rowH.current = ROW_PX
    jumpTo(value)
    paint()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // значение изменили снаружи (например, кнопкой): докручиваем колесо
  useEffect(() => {
    if (current.current !== value) { current.current = value; jumpTo(value, true) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  useEffect(() => () => { clearTimeout(settle.current); cancelAnimationFrame(raf.current) }, [])

  const onScroll = () => {
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(paint)
    clearTimeout(settle.current)
    settle.current = setTimeout(() => {
      const el = box.current
      if (!el || !rowH.current) return
      const idx = Math.round(el.scrollTop / rowH.current)
      const v = ((idx % count) + count) % count
      // ушли на крайнюю копию — тихо переносим на среднюю, зритель этого не видит
      if (idx < count || idx >= 2 * count) { el.scrollTo({ top: (count + v) * rowH.current, behavior: 'instant' }); paint() }
      if (v !== current.current) { current.current = v; onChangeRef.current(v) }
    }, 110)
  }

  const step = (d: number) => { const v = (((current.current + d) % count) + count) % count; current.current = v; onChangeRef.current(v); jumpTo(v, true) }

  return (
    <div className="wheel">
      <div ref={box} className="wheel-scroll" role="spinbutton" tabIndex={0} aria-label={label}
        aria-valuemin={0} aria-valuemax={count - 1} aria-valuenow={value} aria-valuetext={two(value)}
        onScroll={onScroll} onPointerDown={unlockAudio}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') { e.preventDefault(); step(-1) }
          else if (e.key === 'ArrowDown') { e.preventDefault(); step(1) }
        }}>
        {Array.from({ length: COPIES * count }, (_, i) => (
          <span key={i} className="wheel-item" aria-hidden="true"
            onClick={() => { const v = i % count; current.current = v; onChangeRef.current(v); box.current?.scrollTo({ top: i * rowH.current, behavior: 'smooth' }) }}>
            {two(i % count)}
          </span>
        ))}
      </div>
    </div>
  )
}
