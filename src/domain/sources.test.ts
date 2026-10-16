// Путь: src/domain/sources.test.ts
import { describe, expect, it } from 'vitest'
import { agoText, canRefresh, isLecturerUrl, minutesLeft, validateIcsUrl } from './sources'

const ok = 'https://www.asu.ru/timetable/students/12/3/2129441703/?file=2129441703.ics'
describe('validateIcsUrl', () => {
  it('принимает ссылку на .ics', () => expect(validateIcsUrl(ok)).toEqual({ ok: true, url: ok }))
  it('отбрасывает лишнее в адресе, оставляя только file', () => {
    expect(validateIcsUrl(ok + '#x')).toMatchObject({ ok: true, url: ok })
  })
  it.each([
    'не ссылка',
    'http://www.asu.ru/timetable/a/?file=1.ics',
    'https://evil.example/timetable/a/?file=1.ics',
    'https://www.asu.ru.evil.example/timetable/a/?file=1.ics',
    'https://user:pw@www.asu.ru/timetable/a/?file=1.ics',
    'https://www.asu.ru:8443/timetable/a/?file=1.ics',
    'https://www.asu.ru/other/a/?file=1.ics',
    'https://www.asu.ru/timetable/a/?file=../../etc.ics',
    'https://www.asu.ru/timetable/a/?file=1.ics&x=2',
    'https://www.asu.ru/timetable/a/',
  ])('отклоняет %s', (u) => expect(validateIcsUrl(u).ok).toBe(false))
})

describe('обновление', () => {
  const t = 1_000_000_000
  it('первый раз можно, потом через 30 минут', () => {
    expect(canRefresh(undefined, t)).toBe(true)
    expect(canRefresh(t, t + 29 * 60000)).toBe(false)
    expect(canRefresh(t, t + 30 * 60000)).toBe(true)
  })
  it('сколько ждать', () => expect(minutesLeft(t, t + 10 * 60000)).toBe(20))
  it('подпись «обновлено N назад»', () => {
    expect(agoText(undefined, t)).toBe('ещё не обновлялось')
    expect(agoText(t, t + 20000)).toBe('обновлено только что')
    expect(agoText(t, t + 5 * 60000)).toBe('обновлено 5 мин назад')
    expect(agoText(t, t + 3 * 3600000)).toBe('обновлено 3 ч назад')
    expect(agoText(t, t + 50 * 3600000)).toBe('обновлено 2 дн. назад')
  })
})

describe('isLecturerUrl', () => {
  it('ссылка преподавателя', () => expect(isLecturerUrl('https://www.asu.ru/timetable/lecturers/1/2/3/?file=3.ics')).toBe(true))
  it('ссылка не преподавателя', () => expect(isLecturerUrl(ok)).toBe(false))
})
