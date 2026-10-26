// Путь: src/ui/TimePopover.tsx
// Выпадающее окно выбора времени для компьютера: часы и минуты можно набрать с клавиатуры или выбрать на циферблате.
// Набрал две цифры часов — курсор сам прыгает в минуты. Стекло, как у остальных плавающих слоёв.
import { useEffect, useRef, useState } from 'react'
import TimeDial, { type DialMode } from './TimeDial'

const two = (n: number) => String(n).padStart(2, '0')
export const POP_W = 288
export const POP_H = 404

interface Props {
  value: number
  onChange: (min: number) => void
  /** окно закрылось (после анимации) */
  onDone: () => void
  label: string
  /** где показать: левый верх и откуда «вырастает» окно */
  pos: { left: number; top: number; origin: string }
}

export default function TimePopover({ value, onChange, onDone, label, pos }: Props) {
  const h = Math.floor(value / 60), m = value % 60
  const [mode, setMode] = useState<DialMode>('h')
  const [edit, setEdit] = useState<{ f: DialMode; text: string } | null>(null)
  const [closing, setClosing] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const hRef = useRef<HTMLInputElement>(null)
  const mRef = useRef<HTMLInputElement>(null)

  const close = () => {
    if (closing) return
    setClosing(true)
    setTimeout(onDone, matchMedia('(prefers-reduced-motion: reduce)').matches ? 120 : 260)
  }
  const closeRef = useRef(close)
  useEffect(() => { closeRef.current = close })

  useEffect(() => { hRef.current?.focus() }, [])
  useEffect(() => {
    const down = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) closeRef.current() }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); closeRef.current() } }
    const away = () => closeRef.current()
    document.addEventListener('pointerdown', down, true)
    document.addEventListener('keydown', key)
    window.addEventListener('resize', away)
    window.addEventListener('scroll', away, true)
    return () => {
      document.removeEventListener('pointerdown', down, true)
      document.removeEventListener('keydown', key)
      window.removeEventListener('resize', away)
      window.removeEventListener('scroll', away, true)
    }
  }, [])

  const setH = (v: number) => onChange(v * 60 + m)
  const setM = (v: number) => onChange(h * 60 + v)

  const typed = (f: DialMode, raw: string) => {
    // первая цифра после входа в поле заменяет всё, дальше цифры дописываются (максимум две)
    const d = raw.replace(/\D/g, '').slice(edit?.f === f ? -2 : -1)
    if (d === '') { setEdit({ f, text: '' }); return }
    const n = +d
    if (f === 'h') {
      if (d.length === 2 || n > 2) { setH(Math.min(23, n)); setEdit(null); mRef.current?.focus() } // часы набраны — сразу минуты
      else { setH(n); setEdit({ f, text: d }) }
    } else if (d.length === 2 || n > 5) { setM(Math.min(59, n)); setEdit(null) }
    else { setM(n); setEdit({ f, text: d }) }
  }

  const field = (f: DialMode) => {
    const v = f === 'h' ? h : m
    return (
      <input ref={f === 'h' ? hRef : mRef} className={`tp-num${mode === f ? ' on' : ''}`} inputMode="numeric" autoComplete="off"
        aria-label={f === 'h' ? 'Часы' : 'Минуты'} value={edit?.f === f ? edit.text : two(v)}
        onFocus={() => { setMode(f); setEdit(null) }}
        onBlur={() => setEdit(null)}
        onChange={(e) => typed(f, e.target.value)}
        onKeyDown={(e) => {
          const max = f === 'h' ? 23 : 59
          if (e.key === 'Enter') { e.preventDefault(); close() }
          else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault()
            const nv = (v + (e.key === 'ArrowUp' ? 1 : -1) + max + 1) % (max + 1)
            if (f === 'h') setH(nv); else setM(nv)
            setEdit(null)
          } else if (e.key === 'Backspace' && f === 'm' && edit?.text === '') { e.preventDefault(); hRef.current?.focus() }
          else if (e.key === ':' || (e.key === 'ArrowRight' && f === 'h')) { e.preventDefault(); mRef.current?.focus() }
          else if (e.key === 'ArrowLeft' && f === 'm') { e.preventDefault(); hRef.current?.focus() }
        }} />
    )
  }

  return (
    <div ref={root} className={`tp${closing ? ' out' : ''}`} role="dialog" aria-label={label}
      style={{ left: pos.left, top: pos.top, width: POP_W, transformOrigin: pos.origin }}>
      <p className="tp-title">{label}</p>
      <div className="tp-fields">
        {field('h')}
        <span className="tp-colon" aria-hidden="true">:</span>
        {field('m')}
      </div>
      <TimeDial mode={mode} hour={h} minute={m}
        onPick={(md, v, final) => {
          if (md === 'h') setH(v); else setM(v)
          if (final && md === 'h') mRef.current?.focus() // час выбран — переходим к минутам
        }} />
      <button type="button" className="tp-done press" onClick={close}>Готово</button>
    </div>
  )
}
