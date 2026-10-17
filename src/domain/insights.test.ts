// Путь: src/domain/insights.test.ts
import { describe, expect, it } from 'vitest'
import { debtMeetings, fmtDuration, nextLesson, surnameKey, weekLoad } from './insights'
import type { Debt } from './debts'
import type { Lesson } from './schedule'

const L = (date: string, start: number, end: number, room = '208С', remote = false, uid = `${date}-${start}-${room}`): Lesson =>
  ({ uid, date, start, end, kind: 'лек.', subject: 'Предмет', teacher: 'Т.', room: remote ? '' : room, remote })
const h = (hh: number, mm = 0) => hh * 60 + mm

describe('ближайшая пара', () => {
  const ls = [L('2026-10-13', h(15), h(16, 30)), L('2026-10-13', h(16, 40), h(18, 10)), L('2026-10-14', h(9), h(10, 30))]

  it('до начала: считает минуты', () => {
    const n = nextLesson(ls, '2026-10-13', h(13, 40))!
    expect(n.ongoing).toBe(false)
    expect(n.minutes).toBe(80)
    expect(n.lesson.start).toBe(h(15))
  })

  it('идёт сейчас: показывает, сколько осталось', () => {
    const n = nextLesson(ls, '2026-10-13', h(15, 55))!
    expect(n.ongoing).toBe(true)
    expect(n.minutes).toBe(35)
  })

  it('после последней пары дня — первая пара следующего дня', () => {
    const n = nextLesson(ls, '2026-10-13', h(19))!
    expect(n.lesson.date).toBe('2026-10-14')
    expect(n.minutes).toBe(14 * 60) // 19:00 → 09:00
  })

  it('дистант не считается, а когда всё прошло — пусто', () => {
    expect(nextLesson([L('2026-10-13', h(15), h(16), '', true)], '2026-10-13', h(8))).toBeNull()
    expect(nextLesson(ls, '2026-10-20', 0)).toBeNull()
  })
})

describe('загрузка недели', () => {
  it('считает пары и минуты, параллельное время не дублируется', () => {
    const ls = [L('a', h(9), h(10, 30)), L('a', h(9), h(10, 30), 'Б', false, 'x'), L('a', h(11), h(12)), L('b', h(9), h(10), '', true)]
    expect(weekLoad(ls, ['a', 'b', 'c'])).toEqual([
      { date: 'a', pairs: 3, minutes: 150 },
      { date: 'b', pairs: 0, minutes: 0 },
      { date: 'c', pairs: 0, minutes: 0 },
    ])
  })
})

describe('формат', () => {
  it('длительность', () => {
    expect(fmtDuration(45)).toBe('45 мин')
    expect(fmtDuration(120)).toBe('2 ч')
    expect(fmtDuration(80)).toBe('1 ч 20 мин')
    expect(fmtDuration(50 * 60 + 20)).toBe('2 дн. 2 ч')
    expect(fmtDuration(48 * 60)).toBe('2 дн.')
  })
})

describe('где застать преподавателя для долга', () => {
  const debt = (subject: string, teacher: string | undefined, over: Partial<Debt> = {}): Debt =>
    ({ id: subject, subject, teacher, closedManually: false, works: [{ id: '1', title: 'Р1', done: false }], ...over })
  const teachers = [
    { name: 'Шукшин С.А. (ст.пр.), АлтГУ', lessons: [L('2026-10-17', h(13, 20), h(14, 50), '319С')] },
    { name: 'Герман О.И.', lessons: [] as Lesson[] },
  ]

  it('фамилия как ключ', () => {
    expect(surnameKey('Шукшин С.А. (ст.пр.), АлтГУ')).toBe('шукшин')
    expect(surnameKey('  Шукшин ')).toBe('шукшин')
    expect(surnameKey('Фёдоров И.И.')).toBe('федоров')
  })

  it('сопоставляет по фамилии и считает время до ближайшей пары', () => {
    const r = debtMeetings([debt('Философия', 'Шукшин')], teachers, '2026-10-17', h(12))
    expect(r).toHaveLength(1)
    expect(r[0].hasCalendar).toBe(true)
    expect(r[0].next?.minutes).toBe(80)
  })

  it('закрытые долги и долги без преподавателя пропускаются', () => {
    const closed = debt('Эл.', 'Шукшин', { closedManually: true })
    expect(debtMeetings([closed, debt('X', undefined), debt('Y', '  ')], teachers, '2026-10-17', 0)).toEqual([])
  })

  it('без расписания — в конце; с расписанием, но без будущих пар — перед ними', () => {
    const r = debtMeetings([debt('A', 'Иванов'), debt('B', 'Герман'), debt('C', 'Шукшин')], teachers, '2026-10-17', h(12))
    expect(r.map((x) => x.debt.subject)).toEqual(['C', 'B', 'A'])
    expect(r[2].hasCalendar).toBe(false)
  })
})
