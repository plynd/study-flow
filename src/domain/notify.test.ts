// Путь: src/domain/notify.test.ts
import { describe, expect, it } from 'vitest'
import type { Debt } from './debts'
import {
  debtDayText, debtTeachers, defaultNotify, dueWindowReminders, isNotifySettings, localNow, relation, summaryDue,
  teacherMatches, type DebtCtx, type NotifySettings,
} from './notify'
import type { Lesson } from './schedule'
import type { TeacherCal } from './teachers'

const L = (uid: string, date: string, start: number, extra: Partial<Lesson> = {}): Lesson => ({
  uid, date, start, end: start + 95, kind: 'пр.з.', subject: 'Физика', teacher: 'Иванов И.И.', room: '208С', remote: false, ...extra,
})
const S = (extra: Partial<NotifySettings> = {}): NotifySettings => ({ ...defaultNotify(), ...extra })
const D = (id: string, teacher: string | undefined, extra: Partial<Debt> = {}): Debt => ({
  id, subject: 'Матан', teacher, closedManually: false, works: [{ id: 'w1', title: 'Работа 1', done: true }, { id: 'w2', title: 'Работа 2', done: false }], ...extra,
})
const T = (id: string, name: string, lessons: Lesson[]): TeacherCal => ({ id, name, lessons })

const DAY = '2026-10-19'
const hidden = { subjects: [], keys: [], uids: [] }

describe('localNow', () => {
  it('переводит в часовой пояс пользователя, в том числе через полночь', () => {
    expect(localNow(Date.UTC(2026, 9, 19, 18, 30), 'Asia/Barnaul')).toEqual({ date: '2026-10-20', min: 90 })
    expect(localNow(Date.UTC(2026, 9, 19, 5, 5), 'Asia/Barnaul')).toEqual({ date: '2026-10-19', min: 12 * 60 + 5 })
  })
})

describe('isNotifySettings', () => {
  it('принимает настройки и отвергает мусор', () => {
    expect(isNotifySettings(defaultNotify())).toBe(true)
    expect(isNotifySettings({ ...defaultNotify(), before: -1 })).toBe(false)
    expect(isNotifySettings({ ...defaultNotify(), eveningAt: 2000 })).toBe(false)
    expect(isNotifySettings(null)).toBe(false)
    expect(isNotifySettings([])).toBe(false)
  })
})

describe('преподаватели по долгам', () => {
  const rud = T('r', 'Рудакова О.Ю.', [])
  it('сравниваем фамилии (первое слово), регистр и ё не важны', () => {
    expect(teacherMatches('Рудакова', rud)).toBe(true)
    expect(teacherMatches('рудакова о.ю.', rud)).toBe(true)
    expect(teacherMatches('Кузнецова', T('k', 'Кузнецов А.А.', []))).toBe(false)
    expect(teacherMatches('Фёдорова', T('f', 'Федорова Н.', []))).toBe(true)
  })
  it('закрытые долги и долги без преподавателя не считаются; один человек — одна группа', () => {
    const g = debtTeachers([D('1', 'Рудакова'), D('2', 'Рудакова О.Ю.', { subject: 'Физика' }), D('3', undefined), D('4', 'Рудакова', { closedManually: true }), D('5', 'Петров')], [rud])
    expect(g.map((x) => [x.label, x.debts.length, !!x.cal])).toEqual([['Рудакова О.Ю.', 2, true], ['Петров', 1, false]])
  })
})

describe('relation', () => {
  const own = [L('a', DAY, 9 * 60), L('b', DAY, 13 * 60)]
  it('до, после, окно, занят, твоя пара', () => {
    expect(relation(L('t', DAY, 7 * 60), own)).toBe('до твоих пар')
    expect(relation(L('t', DAY, 16 * 60), own)).toBe('после твоих пар')
    expect(relation(L('t', DAY, 11 * 60 + 20), own)).toBe('у тебя окно')
    expect(relation(L('t', DAY, 9 * 60 + 30), own)).toContain('Физика')
    expect(relation(L('t', DAY, 9 * 60), own)).toBe('это и твоя пара')
    expect(relation(L('t', DAY, 9 * 60), [])).toContain('нет очных пар')
  })
})

describe('debtDayText', () => {
  const rud = T('r', 'Рудакова О.Ю.', [L('t1', DAY, 11 * 60 + 20, { teacher: 'Рудакова О.Ю.' }), L('t2', DAY, 15 * 60, { remote: true, room: '' }), L('t3', '2026-10-20', 9 * 60)])
  const ctx: DebtCtx = { lessons: [L('a', DAY, 9 * 60), L('b', DAY, 13 * 60)], hidden, teachers: [rud], debts: [D('1', 'Рудакова')] }
  it('перечисляет очные пары преподавателя с пометкой про окно, дистант не показывает', () => {
    const t = debtDayText(DAY, 'Сегодня', ctx)!
    expect(t).toContain('Сегодня')
    expect(t).toContain('Рудакова О.Ю. — Матан (сдано 1 из 2)')
    expect(t).toContain('11:20–12:55, ауд. 208С: у тебя окно')
    expect(t).not.toContain('15:00')
  })
  it('скрытые пары не мешают и не считаются', () => {
    const t = debtDayText(DAY, 'Сегодня', { ...ctx, hidden: { subjects: ['Физика'], keys: [], uids: [] } })!
    expect(t).toContain('нет очных пар')
  })
  it('нет очных пар ни у кого — слать нечего', () => {
    expect(debtDayText('2026-10-21', 'Завтра', ctx)).toBeNull()
    expect(debtDayText(DAY, 'Сегодня', { ...ctx, debts: [] })).toBeNull()
  })
  it('преподавателя без расписания упоминаем в конце, но сам он сообщение не вызывает', () => {
    expect(debtDayText(DAY, 'Сегодня', { ...ctx, debts: [D('1', 'Петров')] })).toBeNull()
    expect(debtDayText(DAY, 'Сегодня', { ...ctx, debts: [D('1', 'Рудакова'), D('2', 'Петров')] })).toContain('Расписания нет, добавь в приложении: Петров')
  })
  it('долг без требований подписан', () => {
    expect(debtDayText(DAY, 'Сегодня', { ...ctx, debts: [D('1', 'Рудакова', { works: [] })] })).toContain('уточнить требования')
  })
})

describe('summaryDue', () => {
  const s = S({ morning: true, morningAt: 8 * 60, evening: true, eveningAt: 20 * 60 })
  it('утро: после времени, не позже чем через три часа, один раз на день', () => {
    expect(summaryDue('morning', s, { date: DAY, min: 7 * 60 + 59 }, new Set())).toBeNull()
    expect(summaryDue('morning', s, { date: DAY, min: 8 * 60 }, new Set())).toBe('mor:2026-10-19')
    expect(summaryDue('morning', s, { date: DAY, min: 11 * 60 }, new Set())).toBeNull()
    expect(summaryDue('morning', s, { date: DAY, min: 8 * 60 }, new Set(['mor:2026-10-19']))).toBeNull()
  })
  it('вечер: ключ — завтрашний день; выключено — тишина', () => {
    expect(summaryDue('evening', s, { date: DAY, min: 20 * 60 }, new Set())).toBe('eve:2026-10-20')
    expect(summaryDue('evening', S(), { date: DAY, min: 20 * 60 }, new Set())).toBeNull()
  })
})

describe('dueWindowReminders', () => {
  const rud = T('r', 'Рудакова О.Ю.', [L('t1', DAY, 11 * 60 + 20, { teacher: 'Рудакова О.Ю.' })])
  const ctx: DebtCtx = { lessons: [L('a', DAY, 9 * 60), L('b', DAY, 13 * 60)], hidden, teachers: [rud], debts: [D('1', 'Рудакова')] }
  it('за N минут до пары, если у тебя окно', () => {
    const r = dueWindowReminders(ctx, { date: DAY, min: 11 * 60 + 5 }, 15, new Set())
    expect(r).toHaveLength(1)
    expect(r[0].key).toBe('win:t1:2026-10-19')
    expect(r[0].text).toContain('Через 15 мин')
    expect(r[0].text).toContain('Матан')
  })
  it('рано, поздно, уже отправлено, выключено — тихо', () => {
    expect(dueWindowReminders(ctx, { date: DAY, min: 10 * 60 }, 15, new Set())).toEqual([])
    expect(dueWindowReminders(ctx, { date: DAY, min: 11 * 60 + 21 }, 15, new Set())).toEqual([])
    expect(dueWindowReminders(ctx, { date: DAY, min: 11 * 60 + 5 }, 15, new Set(['win:t1:2026-10-19']))).toEqual([])
    expect(dueWindowReminders(ctx, { date: DAY, min: 11 * 60 + 5 }, 0, new Set())).toEqual([])
  })
  it('если сейчас идёт твоя пара — не отвлекаем', () => {
    const busy = { ...ctx, lessons: [L('c', DAY, 10 * 60 + 40)] }
    expect(dueWindowReminders(busy, { date: DAY, min: 11 * 60 + 5 }, 15, new Set())).toEqual([])
  })
})
