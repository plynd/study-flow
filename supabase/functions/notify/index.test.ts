// Путь: supabase/functions/notify/index.test.ts
import { describe, expect, it } from 'vitest'
import { planForUser } from './index'

const lesson = (uid: string, start: number, extra = {}) => ({ uid, date: '2026-10-19', start, end: start + 95, kind: 'пр.з.', subject: 'Физика', teacher: 'Рудакова О.Ю.', room: '208С', remote: false, ...extra })
const rud = { id: 'r', name: 'Рудакова О.Ю.', lessons: [lesson('t1', 11 * 60 + 20)] }
const debt = { id: 'd', subject: 'Матан', teacher: 'Рудакова', closedManually: false, works: [] }
const settings = { morning: true, morningAt: 8 * 60, evening: true, eveningAt: 20 * 60, before: 15, tz: 'Asia/Barnaul' }
const rows = { 'notify-v1': settings, 'schedule-lessons-v1': [lesson('a', 9 * 60, { teacher: 'Иванов' })], 'schedule-teachers-v1': [rud], 'debts-v1': [debt] }
// время по Барнаулу (UTC+7)
const at = (h: number, m: number) => Date.UTC(2026, 9, 19, h - 7, m)

describe('planForUser', () => {
  it('утром — сводка, один раз', () => {
    const first = planForUser(rows, new Set(), at(8, 5))
    expect(first.map((m) => m.key)).toEqual(['mor:2026-10-19'])
    expect(first[0].text).toContain('Рудакова')
    expect(planForUser(rows, new Set(first.map((m) => m.key)), at(8, 10))).toEqual([])
  })
  it('перед парой преподавателя в окне — напоминание', () => {
    expect(planForUser(rows, new Set(), at(11, 10)).map((m) => m.key)).toEqual(['win:t1:2026-10-19'])
  })
  it('вечером — на завтра; если у преподавателя завтра пар нет, ключ запоминается без текста', () => {
    const m = planForUser(rows, new Set(), at(20, 5))
    expect(m).toEqual([{ key: 'eve:2026-10-20', text: '' }])
  })
  it('без настроек или выключено — тишина', () => {
    expect(planForUser({ ...rows, 'notify-v1': undefined }, new Set(), at(8, 5))).toEqual([])
    expect(planForUser({ ...rows, 'notify-v1': { ...settings, morning: false, evening: false, before: 0 } }, new Set(), at(8, 5))).toEqual([])
  })
  it('битые данные не ломают', () => {
    expect(() => planForUser({ ...rows, 'schedule-lessons-v1': 'мусор', 'schedule-hidden-v1': 5, 'debts-v1': 7 }, new Set(), at(8, 5))).not.toThrow()
  })
})
