// Путь: src/ui/spring.ts
// Пружины и жесты без React: чистая математика, покрыта тестами (spring.test.ts).
// Параметры как у Apple: damping — упругость (1 = без отскока), response — «скорость» в секундах.

export interface SpringSpec { response: number; damping: number }

/** Лист: появление и закрытие */
export const SPRING_SHEET: SpringSpec = { response: 0.38, damping: 1 }
/** Возврат после броска: отскок оправдан, потому что жест нёс импульс */
export const SPRING_FLICK: SpringSpec = { response: 0.3, damping: 0.8 }

/** Один шаг пружины; x — отклонение от цели (px), v — скорость (px/с). Масса = 1. */
export function stepSpring(s: { x: number; v: number }, spec: SpringSpec, dt: number) {
  const k = (2 * Math.PI / spec.response) ** 2
  const c = (4 * Math.PI * spec.damping) / spec.response
  const n = Math.max(1, Math.ceil(dt / 0.004)) // мелкие подшаги: устойчиво даже при редких кадрах
  const h = dt / n
  let { x, v } = s
  for (let i = 0; i < n; i++) {
    v += (-k * x - c * v) * h
    x += v * h
  }
  return { x, v }
}

/** Куда «долетит» жест, если его отпустить со скоростью v (px/с): затухание как у прокрутки */
export function project(v: number, rate = 0.998): number {
  return ((v / 1000) * rate) / (1 - rate)
}

/** Резиновый край: чем дальше за границей, тем слабее элемент следует за пальцем */
export function rubberband(overshoot: number, dimension: number, c = 0.55): number {
  const a = Math.abs(overshoot)
  return Math.sign(overshoot) * (a * dimension * c) / (dimension + c * a)
}

/**
 * Анимация из ТЕКУЩЕГО значения с начальной скоростью (передача импульса от жеста).
 * Возвращает функцию остановки — её можно вызвать в любой момент (прерываемость).
 */
export function animateSpring(
  from: number, to: number, velocity: number, spec: SpringSpec,
  onUpdate: (value: number) => void, onDone?: () => void,
): () => void {
  let s = { x: from - to, v: velocity }
  let last = performance.now()
  let raf = 0
  let stopped = false
  const frame = (now: number) => {
    if (stopped) return
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000))
    last = now
    s = stepSpring(s, spec, dt)
    if (Math.abs(s.x) < 0.3 && Math.abs(s.v) < 3) {
      onUpdate(to)
      onDone?.()
      return
    }
    onUpdate(to + s.x)
    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)
  return () => { stopped = true; cancelAnimationFrame(raf) }
}
