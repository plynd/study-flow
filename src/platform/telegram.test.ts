import { describe, expect, it } from 'vitest'
import { autoWindowSize } from './telegram'

describe('autoWindowSize', () => {
  it('на телефоне — весь экран', () => {
    expect(autoWindowSize({ platform: 'ios' })).toBe('full')
    expect(autoWindowSize({ platform: 'android' })).toBe('full')
  })
  it('на компьютере и в вебе — обычное окно', () => {
    for (const platform of ['tdesktop', 'macos', 'weba', 'webk', 'unknown', undefined]) expect(autoWindowSize({ platform })).toBe('normal')
  })
})
