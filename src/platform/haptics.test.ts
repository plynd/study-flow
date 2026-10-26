import { describe, expect, it } from 'vitest'
import { parseFeedback } from './haptics'

describe('parseFeedback', () => {
  it('по умолчанию вибрация и звук включены', () => {
    expect(parseFeedback(null)).toEqual({ haptic: true, sound: true })
    expect(parseFeedback('мусор')).toEqual({ haptic: true, sound: true })
  })
  it('читает выключенные по отдельности', () => {
    expect(parseFeedback('{"sound":false}')).toEqual({ haptic: true, sound: false })
    expect(parseFeedback('{"haptic":false,"sound":true}')).toEqual({ haptic: false, sound: true })
  })
})
