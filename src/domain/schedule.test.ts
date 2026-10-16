import { describe, expect, it } from 'vitest'
import {
  building, dayBounds, emptyHidden, fmtTime, groupByDate, lessonKey, parseIcs,
  visibleLessons, weekday, type Hidden, type Lesson,
} from './schedule'

import ics from './__fixtures__/group.ics?raw'
const all = parseIcs(ics)
const on = (d: string) => all.filter((l) => l.date === d)
const find = (d: string, start: number, teacher: string) =>
  on(d).find((l) => l.start === start && l.teacher.startsWith(teacher)) as Lesson
const bounds = (d: string, h: Hidden) => {
  const b = dayBounds(visibleLessons(on(d), h))
  return b && `${fmtTime(b.start)}–${fmtTime(b.end)}`
}

describe('parseIcs', () => {
  it('читает все 48 событий', () => expect(all).toHaveLength(48))
  it('разбирает поля пары', () => {
    expect(all[0]).toMatchObject({
      uid: '5006418', date: '2026-10-12', start: 680, end: 770, kind: 'лаб.',
      room: '208С', teacher: 'Чечулин Н.В.', remote: false,
      subject: 'Разработка на бизнес-ориентированных языках программирования и low-Code системы',
    })
  })
  it('пары без номера аудитории — дистанционные', () => {
    const remote = all.filter((l) => l.remote)
    expect(remote).toHaveLength(3)
    expect(remote.every((l) => l.subject === 'Правовая культура')).toBe(true)
  })
  it('склеивает сложенные строки и снимает экранирование', () => {
    const t = ['BEGIN:VEVENT', 'UID:1', 'DTSTART;TZID=X:20261012T112000', 'DTEND;TZID=X:20261012T125000',
      'SUMMARY:11:20 лек. Математика\\, часть', ' 2 (101С)', 'LOCATION:101С', 'END:VEVENT'].join('\r\n')
    expect(parseIcs(t)[0].subject).toBe('Математика, часть2')
  })
})

describe('утилиты', () => {
  it('день недели: 12.10.2026 — понедельник', () => expect(weekday('2026-10-12')).toBe(0))
  it('корпус — последняя буква', () => { expect(building('208С')).toBe('С'); expect(building('407аС')).toBe('С'); expect(building('')).toBe('') })
  it('группировка по датам', () => expect(groupByDate(all)).toHaveLength(12))
})

describe('границы дня', () => {
  const noLaw: Hidden = { ...emptyHidden(), subjects: ['Правовая культура'] }
  it('Пн 12.10: 11:20–18:10', () => expect(bounds('2026-10-12', emptyHidden())).toBe('11:20–18:10'))
  it('Пт 16.10: дистант не входит, 16:40–19:50', () => {
    expect(bounds('2026-10-16', emptyHidden())).toBe('16:40–19:50')
    expect(bounds('2026-10-16', noLaw)).toBe('16:40–19:50')
  })
  it('Вт 13.10: 15:00–21:30 при выборе подгруппы', () => {
    const h = { ...emptyHidden(), keys: [lessonKey(find('2026-10-13', 1100, 'Лямкин')), lessonKey(find('2026-10-13', 1200, 'Лямкин'))] }
    expect(bounds('2026-10-13', h)).toBe('15:00–21:30')
  })
  it('Ср 14.10: 11:20–14:50 после скрытия пары 09:40', () => {
    const h = { ...emptyHidden(), keys: [lessonKey(find('2026-10-14', 580, 'Шаповалова'))] }
    expect(bounds('2026-10-14', h)).toBe('11:20–14:50')
  })
  it('Сб 17.10: 13:20–14:50, пара 15:00 скрыта как подгруппа 1', () => {
    const h = { ...noLaw, keys: [lessonKey(find('2026-10-17', 900, 'Чечулин'))] }
    expect(bounds('2026-10-17', h)).toBe('13:20–14:50')
  })
  it('день из одного дистанта — без границ', () => {
    expect(dayBounds(on('2026-10-17').filter((l) => l.remote))).toBeNull()
  })
})

describe('скрытие', () => {
  it('по предмету, ключу и отдельному занятию', () => {
    const l = all[0]
    expect(visibleLessons(all, { ...emptyHidden(), subjects: [l.subject] }).some((x) => x.subject === l.subject)).toBe(false)
    expect(visibleLessons([l], { ...emptyHidden(), uids: [l.uid] })).toHaveLength(0)
    // ключ скрывает пару и на следующей неделе (тот же день и время)
    const next = all.find((x) => x.date === '2026-10-19' && x.start === 580)!
    const prev = { ...next, date: '2026-10-12', uid: 'x' }
    expect(visibleLessons([next], { ...emptyHidden(), keys: [lessonKey(prev)] })).toHaveLength(0)
  })
})

import { addDays, dayBlocks, defaultWeek, fmtWeek, weekStart, weeksOf } from './schedule'

describe('недели', () => {
  it('понедельник недели', () => {
    expect(weekStart('2026-10-17')).toBe('2026-10-12')
    expect(weekStart('2026-10-12')).toBe('2026-10-12')
    expect(weekStart('2026-10-18')).toBe('2026-10-12')
  })
  it('addDays через границу месяца', () => expect(addDays('2026-10-30', 3)).toBe('2026-11-02'))
  it('в файле две недели', () => expect(weeksOf(all)).toEqual(['2026-10-12', '2026-10-19']))
  it('неделя по умолчанию: сегодняшняя, иначе ближайшая', () => {
    const w = weeksOf(all)
    expect(defaultWeek(w, '2026-10-16')).toBe('2026-10-12')
    expect(defaultWeek(w, '2026-10-21')).toBe('2026-10-19')
    expect(defaultWeek(w, '2026-09-01')).toBe('2026-10-12')
    expect(defaultWeek(w, '2027-01-01')).toBe('2026-10-19')
  })
  it('подпись недели', () => {
    expect(fmtWeek('2026-10-12')).toBe('12–18 окт')
    expect(fmtWeek('2026-10-26')).toBe('26 окт – 1 ноя')
  })
})

describe('блоки параллельных пар', () => {
  it('Ср 14.10: 09:40 одна, 11:20 две параллельные, 13:20 две параллельные', () => {
    expect(dayBlocks(on('2026-10-14')).map((b) => b.length)).toEqual([1, 2, 2])
  })
  it('дистанционная пара не склеивается с параллельными', () => {
    expect(dayBlocks(on('2026-10-16')).map((b) => b.length)).toEqual([1, 1, 1])
  })
})
