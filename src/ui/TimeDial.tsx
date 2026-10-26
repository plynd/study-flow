// Путь: src/ui/TimeDial.tsx
// Круглый циферблат для выбора времени на компьютере (как в Android, но в стиле стекла).
// Часы: два кольца, снаружи 00–11, внутри 12–23. Минуты: одно кольцо с подписями каждые 5, но выбирать можно любую минуту.
// Стрелка движется пружиной: её можно подхватить и перенаправить в любой момент, а при смене режима она плавно «переезжает».
import { useEffect, useLayoutEffect, useRef } from 'react'

export type DialMode = 'h' | 'm'

const SIZE = 244
const C = SIZE / 2
const R_OUT = 92
const R_IN = 60

const two = (n: number) => String(n).padStart(2, '0')
const rad = (deg: number) => (deg * Math.PI) / 180
const at = (deg: number, r: number) => ({ x: C + r * Math.sin(rad(deg)), y: C - r * Math.cos(rad(deg)) })
const wrap = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180 // кратчайший поворот

interface Props {
  mode: DialMode
  hour: number
  minute: number
  /** final — палец/мышь отпущены */
  onPick: (mode: DialMode, v: number, final: boolean) => void
}

export default function TimeDial({ mode, hour, minute, onPick }: Props) {
  const line = useRef<HTMLSpanElement>(null)
  const thumb = useRef<HTMLSpanElement>(null)
  const st = useRef({ a: 0, r: R_OUT, va: 0, vr: 0, ta: 0, tr: R_OUT, raf: 0, last: 0, ready: false })

  // куда должна смотреть стрелка
  const baseA = mode === 'h' ? (hour % 12) * 30 : minute * 6
  const baseR = mode === 'h' && hour >= 12 ? R_IN : R_OUT

  const paint = () => {
    const s = st.current
    if (line.current) { line.current.style.width = `${s.r}px`; line.current.style.transform = `rotate(${s.a - 90}deg)` }
    if (thumb.current) { const p = at(s.a, s.r); thumb.current.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)` }
  }

  const tick = (t: number) => {
    const s = st.current
    const dt = Math.min(0.032, (t - s.last) / 1000 || 0.016)
    s.last = t
    const k = 460, c = 2 * Math.sqrt(k) * 0.9 // почти критическое затухание: без заметного качания
    s.va += (-k * (s.a - s.ta) - c * s.va) * dt; s.a += s.va * dt
    s.vr += (-k * (s.r - s.tr) - c * s.vr) * dt; s.r += s.vr * dt
    if (Math.abs(s.a - s.ta) < 0.04 && Math.abs(s.va) < 0.4 && Math.abs(s.r - s.tr) < 0.04 && Math.abs(s.vr) < 0.4) {
      s.a = s.ta; s.r = s.tr; s.va = s.vr = 0; s.raf = 0; paint(); return
    }
    paint()
    s.raf = requestAnimationFrame(tick)
  }

  useLayoutEffect(() => {
    const s = st.current
    if (!s.ready) { s.ready = true; s.a = s.ta = baseA; s.r = s.tr = baseR; paint(); return }
    s.ta += wrap(baseA - s.ta) // относительно прошлой цели: не делаем лишних оборотов
    s.tr = baseR
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { s.a = s.ta; s.r = s.tr; s.va = s.vr = 0; paint(); return }
    if (!s.raf) { s.last = performance.now(); s.raf = requestAnimationFrame(tick) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseA, baseR])

  useEffect(() => () => cancelAnimationFrame(st.current.raf), [])

  const pick = (e: React.PointerEvent<HTMLDivElement>, final: boolean) => {
    const box = e.currentTarget.getBoundingClientRect()
    const dx = e.clientX - (box.left + box.width / 2), dy = e.clientY - (box.top + box.height / 2)
    const deg = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360
    if (mode === 'h') {
      const idx = Math.round(deg / 30) % 12
      const inner = Math.hypot(dx, dy) < (R_OUT + R_IN) / 2 + 2
      onPick('h', idx + (inner ? 12 : 0), final)
    } else onPick('m', Math.round(deg / 6) % 60, final)
  }

  const drag = useRef(false)
  const labelMinute = minute % 5 === 0
  const thumbText = mode === 'h' ? two(hour) : labelMinute ? two(minute) : ''

  return (
    <div className="dial" style={{ width: SIZE, height: SIZE }} role="group" aria-label={mode === 'h' ? 'Выбор часа' : 'Выбор минут'}
      onPointerDown={(e) => { drag.current = true; e.currentTarget.setPointerCapture(e.pointerId); pick(e, false) }}
      onPointerMove={(e) => { if (drag.current) pick(e, false) }}
      onPointerUp={(e) => { if (!drag.current) return; drag.current = false; pick(e, true) }}
      onPointerCancel={() => { drag.current = false }}>
      <span className="dial-dot" aria-hidden="true" />
      <span ref={line} className="dial-line" aria-hidden="true" />
      <span ref={thumb} className={`dial-thumb${thumbText ? '' : ' tiny'}`} aria-hidden="true">{thumbText}</span>

      <div className={`dial-labels${mode === 'h' ? ' on' : ''}`} aria-hidden="true">
        {Array.from({ length: 24 }, (_, h) => {
          const p = at((h % 12) * 30, h >= 12 ? R_IN : R_OUT)
          return <span key={h} className={h >= 12 ? 'in' : ''} style={{ left: p.x, top: p.y }}>{h === 0 ? '00' : h}</span>
        })}
      </div>
      <div className={`dial-labels${mode === 'm' ? ' on' : ''}`} aria-hidden="true">
        {Array.from({ length: 12 }, (_, i) => {
          const p = at(i * 30, R_OUT)
          return <span key={i} style={{ left: p.x, top: p.y }}>{two(i * 5)}</span>
        })}
      </div>
    </div>
  )
}
