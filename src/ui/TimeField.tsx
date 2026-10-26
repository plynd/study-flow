// Путь: src/ui/TimeField.tsx
// Выбор времени. Кнопка с временем открывает:
//   • на компьютере — стеклянное окно рядом с кнопкой: ввод с клавиатуры (часы → минуты сами) и круглый циферблат;
//   • на телефоне — лист с двумя барабанами, как в iOS.
// Системное поле type="time" выглядит по-разному в Windows, macOS и на телефоне и не поддаётся стилям, поэтому выбор свой.
import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { fmtTime } from '../domain/schedule'
import Sheet from './Sheet'
import TimePopover, { POP_H, POP_W } from './TimePopover'
import Wheel from './Wheel'

interface Props {
  /** минуты от полуночи */
  value: number
  onChange: (min: number) => void
  /** название для скринридера и заголовок окна */
  label: string
}

type Opened = { kind: 'sheet' } | { kind: 'pop'; left: number; top: number; origin: string; modal?: boolean } | null

export default function TimeField({ value, onChange, label }: Props) {
  const [open, setOpen] = useState<Opened>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const h = Math.floor(value / 60), m = value % 60

  const show = () => {
    const r = btn.current?.getBoundingClientRect()
    if (!r || !matchMedia('(hover: hover) and (pointer: fine)').matches) { setOpen({ kind: 'sheet' }); return }
    const vw = innerWidth, vh = innerHeight
    const mid = (n: number, size: number) => Math.max(8, Math.round((n - size) / 2))
    // Узкое окно (телефонный размер в Telegram на компьютере): рядом с кнопкой места нет, показываем по центру с затемнением
    if (vw < 640 || vh < POP_H + 16) { setOpen({ kind: 'pop', left: mid(vw, POP_W), top: mid(vh, POP_H), origin: '50% 50%', modal: true }); return }
    const left = Math.max(8, Math.min(vw - POP_W - 8, r.right - POP_W))
    const below = r.bottom + 8 + POP_H <= vh - 8
    const above = r.top - 8 - POP_H >= 8
    // не помещается ни снизу, ни сверху — по центру по высоте, рядом с кнопкой по горизонтали
    const top = below ? r.bottom + 8 : above ? r.top - 8 - POP_H : mid(vh, POP_H)
    setOpen({ kind: 'pop', left, top, origin: `${Math.round(r.right - left - r.width / 2)}px ${below ? 'top' : above ? 'bottom' : 'center'}` })
  }

  return (
    <>
      <button ref={btn} type="button" className="time-btn press" aria-label={`${label}: ${fmtTime(value)}`} aria-haspopup="dialog" onClick={show}>
        {fmtTime(value)}
      </button>
      {/* Окна выносим в body: у строк с эффектом стекла свой слой, и fixed внутри них считается от строки, а не от экрана */}
      {open?.kind === 'sheet' && createPortal(
        <Sheet open onClose={() => setOpen(null)} title={label}>
          <div className="wheels">
            <span className="wheel-band" aria-hidden="true" />
            <Wheel count={24} value={h} label="Часы" onChange={(x) => onChange(x * 60 + m)} />
            <span className="wheel-colon" aria-hidden="true">:</span>
            <Wheel count={60} value={m} label="Минуты" onChange={(x) => onChange(h * 60 + x)} />
          </div>
        </Sheet>,
        document.body)}
      {open?.kind === 'pop' && createPortal(
        <TimePopover value={value} onChange={onChange} label={label} pos={open}
          onDone={() => { setOpen(null); btn.current?.focus({ preventScroll: true }) }} />,
        document.body)}
    </>
  )
}
