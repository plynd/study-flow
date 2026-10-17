// Путь: src/domain/teachers.test.ts
import { describe, expect, it } from 'vitest'
import { emptyHidden, parseIcs, visibleLessons, type Hidden, type Lesson } from './schedule'
import { classifyCalendar, icsName, matchesFor, teacherDay, upsertTeacher } from './teachers'
import ics from './__fixtures__/group.ics?raw'

const all = parseIcs(ics)
const own = (d: string, h: Hidden = emptyHidden()) => visibleLessons(all.filter((l) => l.date === d), h)

let n = 0
const g = (date: string, start: number, room = '319С', subject = 'Компьютерное моделирование'): Lesson => ({
  uid: 'g' + n++, date, start, end: start + 90, kind: 'лаб.', subject, teacher: 'Герман О.И.', room, remote: !/\d/.test(room),
})
const summary = (d: ReturnType<typeof teacherDay>) =>
  d.entries.map((e) => `${e.lesson.start / 60 | 0}:${String(e.lesson.start % 60).padStart(2, '0')} ${e.tag}${e.match ? ' совпадает' : ''}${e.inWindow ? ' в окне' : ''}`)

describe('teacherDay', () => {
  it('Пн 12.10: 15:00 и 16:40 совпадают, 18:20 после', () => {
    const t = [g('2026-10-12', 900), g('2026-10-12', 1000), g('2026-10-12', 1100)]
    expect(summary(teacherDay(own('2026-10-12'), t, true))).toEqual(
      ['15:00 inside совпадает', '16:40 inside совпадает', '18:20 after'])
  })
  it('Пт 16.10: из пар «до» только последняя (15:00), 16:40 совпадает', () => {
    const t = [g('2026-10-16', 680), g('2026-10-16', 800), g('2026-10-16', 900), g('2026-10-16', 1000)]
    const h = { ...emptyHidden(), subjects: ['Правовая культура'] }
    expect(summary(teacherDay(own('2026-10-16', h), t, true))).toEqual(['15:00 before', '16:40 inside совпадает'])
  })
  it('без «совпадений» пара с тем же началом пропадает', () => {
    const t = [g('2026-10-12', 900), g('2026-10-12', 1100)]
    expect(summary(teacherDay(own('2026-10-12'), t, false))).toEqual(['18:20 after'])
  })
  it('пара внутри окна без совпадения помечается «в окне»', () => {
    // Вт 13.10 день 15:00–21:30; своя пара 15:00, 16:40, 18:20, 20:00 — берём время 17:00 (1020)
    const t = [g('2026-10-13', 1020)]
    expect(summary(teacherDay(own('2026-10-13'), t, true))).toEqual(['17:00 inside в окне'])
  })
  it('дистанционные пары преподавателя скрыты, но посчитаны', () => {
    const t = [g('2026-10-16', 1100, ''), g('2026-10-16', 1200, '')]
    const r = teacherDay(own('2026-10-16'), t, true)
    expect(r.entries).toHaveLength(0)
    expect(r.hiddenRemote).toBe(2)
  })
  it('день без очных пар студента: простой список очных пар', () => {
    const t = [g('2026-10-15', 800), g('2026-10-15', 900, '')]
    const r = teacherDay([], t, true)
    expect(r.entries.map((e) => e.tag)).toEqual(['free'])
    expect(r.hiddenRemote).toBe(1)
  })
  it('та же пара у группы студента не дублируется', () => {
    const mine = own('2026-10-12')[0]
    const copy: Lesson = { ...mine, uid: 'copy' }
    expect(teacherDay(own('2026-10-12'), [copy], true).entries).toHaveLength(0)
  })
})

describe('вспомогательное', () => {
  it('название календаря', () => expect(icsName(ics)).toBe('Группа 2.409-1, АлтГУ'))
  it('настройка совпадений: общая и переопределение', () => {
    expect(matchesFor({ id: '1', name: 'x', lessons: [] }, true)).toBe(true)
    expect(matchesFor({ id: '1', name: 'x', lessons: [], showMatches: false }, true)).toBe(false)
  })
})

describe('classifyCalendar', () => {
  it('файл группы распознаётся по названию', () => expect(classifyCalendar(icsName(ics), all)).toBe('group'))
  it('группа без названия, но с разными преподавателями — не преподаватель', () =>
    expect(classifyCalendar(null, all)).toBe('unknown'))
  it('все пары ведёт один человек — это преподаватель', () => {
    const t = [g('2026-10-12', 900), g('2026-10-12', 1000), g('2026-10-16', 900)]
    expect(classifyCalendar('Герман О.И.', t)).toBe('teacher')
  })
  it('мало пар — не делаем выводов', () => expect(classifyCalendar('X', [g('2026-10-12', 900)])).toBe('unknown'))
})

describe('upsertTeacher', () => {
  const t = (id: string, name: string, sourceUrl?: string) => ({ id, name, lessons: [], sourceUrl })
  it('добавляет нового', () => {
    const r = upsertTeacher([], 'Шукшин', [], 'u1', undefined, 5, () => 'n1')
    expect(r).toEqual([{ id: 'n1', name: 'Шукшин', lessons: [], sourceUrl: 'u1', updatedAt: 5 }])
  })
  it('обновляет существующего по ссылке, не плодя дубли', () => {
    const r = upsertTeacher([t('a', 'Старое имя', 'u1')], 'Новое имя', [], 'u1', undefined, 7)
    expect(r).toHaveLength(1)
    expect(r[0].updatedAt).toBe(7)
  })
  it('находит по названию, если ссылки нет', () => {
    expect(upsertTeacher([t('a', 'Герман')], 'Герман', [])).toHaveLength(1)
  })
})
