import { describe, expect, it } from 'vitest'
import { parseFeedback } from './haptics'

describe('parseFeedback', () => {
  it('по умолчанию вибрация включена', () => {
    expect(parseFeedback(null)).toEqual({ haptic: true })
    expect(parseFeedback('мусор')).toEqual({ haptic: true })
  })
  it('читает выключенную; старое поле sound игнорируется', () => {
    expect(parseFeedback('{"haptic":false}')).toEqual({ haptic: false })
    expect(parseFeedback('{"haptic":true,"sound":false}')).toEqual({ haptic: true })
  })
})
