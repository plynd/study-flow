// Путь: src/ui/spring.test.ts
import { describe, expect, it } from 'vitest'
import { SPRING_FLICK, SPRING_SHEET, project, rubberband, stepSpring } from './spring'

function run(spec: typeof SPRING_SHEET, x0: number, v0 = 0, seconds = 2) {
  let s = { x: x0, v: v0 }
  const xs: number[] = []
  for (let t = 0; t < seconds; t += 1 / 60) { s = stepSpring(s, spec, 1 / 60); xs.push(s.x) }
  return xs
}

describe('пружина', () => {
  it('без отскока при damping 1: не пересекает цель и приходит в ноль', () => {
    const xs = run(SPRING_SHEET, 400)
    expect(xs.every((x) => x >= -0.01)).toBe(true)
    expect(Math.abs(xs[xs.length - 1])).toBeLessThan(0.5)
  })

  it('с damping 0.8 есть отскок, но он затухает', () => {
    const xs = run(SPRING_FLICK, 400)
    expect(xs.some((x) => x < -1)).toBe(true)
    expect(Math.abs(xs[xs.length - 1])).toBeLessThan(0.5)
  })

  it('начальная скорость сохраняется: с толчком к цели приходит быстрее', () => {
    const slow = run(SPRING_SHEET, 400, 0).findIndex((x) => x < 20)
    const fast = run(SPRING_SHEET, 400, -2000).findIndex((x) => x < 20)
    expect(fast).toBeLessThan(slow)
  })
})

describe('проекция импульса', () => {
  it('1000 px/с даёт около 500 px пути, знак сохраняется', () => {
    expect(project(1000)).toBeGreaterThan(450)
    expect(project(1000)).toBeLessThan(550)
    expect(project(-1000)).toBeLessThan(-450)
    expect(project(0)).toBe(0)
  })
})

describe('резиновый край', () => {
  it('следует слабее пальца, растёт монотонно и не превышает размер', () => {
    const a = rubberband(50, 600)
    const b = rubberband(200, 600)
    expect(a).toBeLessThan(50)
    expect(b).toBeGreaterThan(a)
    expect(rubberband(100000, 600)).toBeLessThan(600 / 0.55 + 1)
    expect(rubberband(-50, 600)).toBe(-a)
  })
})
