// Путь: src/platform/backStack.test.ts
import { describe, expect, it, vi } from 'vitest'
import { backDepth, onBackChange, pushBack, runBack } from './backStack'

describe('стек «Назад»', () => {
  it('пустой стек: делать нечего', () => {
    expect(backDepth()).toBe(0)
    expect(runBack()).toBe(false)
  })

  it('выполняется верхнее действие, предыдущие остаются', () => {
    const a = vi.fn(), b = vi.fn()
    const offA = pushBack(a)
    const offB = pushBack(b)
    expect(runBack()).toBe(true)
    expect(b).toHaveBeenCalledTimes(1)
    expect(a).not.toHaveBeenCalled()
    offB()
    runBack()
    expect(a).toHaveBeenCalledTimes(1)
    offA()
    expect(backDepth()).toBe(0)
  })

  it('убрать из середины можно, остальные не страдают', () => {
    const a = vi.fn(), b = vi.fn(), c = vi.fn()
    const offA = pushBack(a); const offB = pushBack(b); const offC = pushBack(c)
    offB()
    expect(backDepth()).toBe(2)
    runBack()
    expect(c).toHaveBeenCalled()
    offC(); offA()
  })

  it('подписчик узнаёт об изменениях, отписка работает', () => {
    const l = vi.fn()
    const unsub = onBackChange(l)
    const off = pushBack(() => {})
    off()
    expect(l).toHaveBeenCalledTimes(2)
    unsub()
    pushBack(() => {})()
    expect(l).toHaveBeenCalledTimes(2)
  })
})
