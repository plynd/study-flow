// Путь: src/ui/Sheet.tsx
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { pushBack } from '../platform/backStack'
import { SPRING_FLICK, SPRING_SHEET, animateSpring, project, rubberband } from './spring'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  /** слева в шапке (по умолчанию пусто) */
  leading?: ReactNode
  /** справа в шапке (по умолчанию «Готово») */
  trailing?: ReactNode
  children: ReactNode
}

let locks = 0 // сколько листов сейчас блокируют прокрутку страницы

const prefersReduced = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Нижний лист. Правила из «жидких интерфейсов»:
 *  • двигается за пальцем 1:1 (тянуть можно за шапку), сверху — «резина»;
 *  • при отпускании продолжает с той же скоростью и «долетает» туда, куда вёл жест;
 *  • прерываем: схватить лист во время анимации можно в любой момент;
 *  • входит и выходит по одному пути (снизу); при «меньше движения» — просто проявляется.
 */
export default function Sheet({ open, onClose, title, leading, trailing, children }: Props) {
  const [mounted, setMounted] = useState(open)
  const panel = useRef<HTMLDivElement>(null)
  const scrim = useRef<HTMLDivElement>(null)
  const y = useRef(0)
  const stop = useRef<(() => void) | null>(null)
  const wasOpen = useRef(false)
  const releaseV = useRef(0)
  const drag = useRef<{ startPointer: number; startY: number; pid: number; samples: { t: number; p: number }[] } | null>(null)

  // Пока лист уходит, в нём должно оставаться то, что было, — запоминаем последнее содержимое
  const kept = useRef({ title, leading, trailing, children })
  if (open) kept.current = { title, leading, trailing, children }
  const view = open ? { title, leading, trailing, children } : kept.current

  const height = () => panel.current?.offsetHeight ?? 600
  // Сколько нужно проехать вниз, чтобы лист целиком ушёл за край окна (на телефоне и по центру на мониторе)
  const offscreen = () => {
    const r = panel.current?.getBoundingClientRect()
    return r ? window.innerHeight - (r.top - y.current) + 16 : height()
  }

  const apply = () => {
    const p = panel.current
    if (!p) return
    const h = height()
    const t = Math.min(1, Math.max(0, y.current / h))
    if (prefersReduced()) {
      p.style.transform = 'none'
      p.style.opacity = String(1 - t)
    } else {
      p.style.transform = `translate3d(0, ${y.current}px, 0)`
      p.style.opacity = ''
    }
    if (scrim.current) scrim.current.style.opacity = String(1 - t)
  }

  const run = (target: number, spec = SPRING_SHEET, v = 0, done?: () => void) => {
    stop.current?.()
    if (prefersReduced()) { y.current = target; apply(); stop.current = null; done?.(); return }
    stop.current = animateSpring(y.current, target, v, spec, (val) => { y.current = val; apply() }, () => { stop.current = null; done?.() })
  }

  useLayoutEffect(() => {
    if (open && !mounted) { setMounted(true); return }
    if (!panel.current) return
    if (open) {
      if (!wasOpen.current) { y.current = 0; y.current = offscreen(); apply() } // стартуем за нижним краем
      wasOpen.current = true
      run(0)
      panel.current.focus({ preventScroll: true })
    } else if (wasOpen.current) {
      wasOpen.current = false
      const v = releaseV.current
      releaseV.current = 0
      run(offscreen(), SPRING_SHEET, v, () => setMounted(false))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mounted])

  useEffect(() => {
    if (!mounted) return
    locks++
    document.body.style.overflow = 'hidden'
    return () => { if (--locks === 0) document.body.style.overflow = '' }
  }, [mounted])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Кнопка «Назад» Telegram закрывает верхний открытый лист
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose })
  useEffect(() => {
    if (!open) return
    return pushBack(() => closeRef.current())
  }, [open])

  useEffect(() => () => stop.current?.(), [])

  // ——— жест: тянем шапку
  const down = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return // кнопки в шапке остаются кнопками
    stop.current?.() // схватили движущийся лист — берём его текущее положение
    stop.current = null
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { startPointer: e.clientY, startY: y.current, pid: e.pointerId, samples: [{ t: e.timeStamp, p: e.clientY }] }
  }
  const move = (e: PointerEvent) => {
    const d = drag.current
    if (!d) return
    const raw = d.startY + (e.clientY - d.startPointer)
    y.current = raw < 0 ? rubberband(raw, height()) : raw
    apply()
    d.samples.push({ t: e.timeStamp, p: e.clientY })
    if (d.samples.length > 6) d.samples.shift()
  }
  const up = (e: PointerEvent) => {
    const d = drag.current
    if (!d) return
    drag.current = null
    if (e.currentTarget.hasPointerCapture(d.pid)) e.currentTarget.releasePointerCapture(d.pid)
    const first = d.samples[0]
    const last = d.samples[d.samples.length - 1]
    const v = last.t > first.t ? ((last.p - first.p) / (last.t - first.t)) * 1000 : 0
    const projected = y.current + project(v)
    if (projected > height() * 0.45) { releaseV.current = v; onClose() }
    else run(0, Math.abs(v) > 300 ? SPRING_FLICK : SPRING_SHEET, v)
  }

  if (!mounted) return null
  return (
    <div className="sheet-layer">
      <div className="sheet-scrim" ref={scrim} onClick={onClose} />
      <div className="sheet" ref={panel} role="dialog" aria-modal="true" aria-label={view.title} tabIndex={-1}>
        <div className="sheet-head" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          <span className="grabber" aria-hidden="true" />
          <div className="sheet-bar">
            <div className="sheet-side">{view.leading}</div>
            <h2 className="sheet-title">{view.title}</h2>
            <div className="sheet-side end">
              {view.trailing ?? <button className="btn-plain strong" onClick={onClose}>Готово</button>}
            </div>
          </div>
        </div>
        <div className="sheet-body">{view.children}</div>
      </div>
    </div>
  )
}
