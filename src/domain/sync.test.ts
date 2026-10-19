// Путь: src/domain/sync.test.ts
import { describe, expect, it } from 'vitest'
import { isTrivial, planKey, planSync } from './sync'

const T1 = '2026-10-19T10:00:00.000Z'
const T2 = '2026-10-19T11:00:00.000Z'
const ms = (iso: string) => Date.parse(iso)

describe('planKey', () => {
  it('на сервере пусто: отправляем то, что есть, иначе ничего', () => {
    expect(planKey(true, undefined, null)).toBe('push')
    expect(planKey(false, undefined, null)).toBe('none')
  })
  it('здесь пусто, на сервере есть: забираем', () => {
    expect(planKey(false, undefined, T1)).toBe('pull')
  })
  it('всё совпадает: ничего не делаем', () => {
    expect(planKey(true, { dirtyAt: null, remoteAt: T1 }, T1)).toBe('none')
  })
  it('правок нет, на сервере новее: забираем без конфликта', () => {
    expect(planKey(true, { dirtyAt: null, remoteAt: T1 }, T2)).toBe('pull')
  })
  it('первая встреча, данные и тут, и там: побеждает сервер, наши откладываем', () => {
    expect(planKey(true, undefined, T1)).toBe('pull-stash')
    expect(planKey(true, { dirtyAt: null, remoteAt: null }, T1)).toBe('pull-stash')
  })
  it('правки есть, сервер не менялся: отправляем', () => {
    expect(planKey(true, { dirtyAt: ms(T2), remoteAt: T1 }, T1)).toBe('push')
  })
  it('правки есть и сервер тоже менялся: побеждает более поздний, проигравший откладывается', () => {
    expect(planKey(true, { dirtyAt: ms(T2) + 1, remoteAt: T1 }, T2)).toBe('push')
    expect(planKey(true, { dirtyAt: ms(T1), remoteAt: '2026-10-19T09:00:00.000Z' }, T2)).toBe('pull-stash')
  })
  it('устройство ещё не синхронизировалось, а на сервере данные: выигрывает сервер, даже если здесь есть «правки»', () => {
    // например, экран при первом запуске записал пустой список и пометил его изменённым
    expect(planKey(true, { dirtyAt: ms(T2) + 1, remoteAt: null }, T2)).toBe('pull-stash')
    expect(planKey(true, { dirtyAt: ms(T1), remoteAt: null }, T2)).toBe('pull-stash')
  })
})

describe('planSync', () => {
  it('раскладывает решения по ключам', () => {
    const r = planSync(['a', 'b', 'c'], (k) => k !== 'b', { a: { dirtyAt: null, remoteAt: T1 } }, { a: T1, b: T1 })
    expect(r).toEqual({ a: 'none', b: 'pull', c: 'push' })
  })
})

describe('isTrivial', () => {
  it('узнаёт пустые значения по умолчанию', () => {
    for (const v of [[], {}, false, { url: '' }, { subjects: [], keys: [], uids: [] }, null]) expect(isTrivial(v)).toBe(true)
  })
  it('настоящие данные не считает пустыми', () => {
    for (const v of [[1], { url: 'https://x' }, { subjects: ['Физика'], keys: [] }, 'текст']) expect(isTrivial(v)).toBe(false)
  })
})
