// Путь: src/domain/directory.test.ts
import { describe, expect, it } from 'vitest'
import { depthOf, icsUrlFor, isLeaf, parseDirectory, parseSearch, searchUrl, validateDirPath, validateQuery } from './directory'
import links from './__fixtures__/lecturers-links.html?raw'

describe('parseDirectory', () => {
  const base = '/timetable/lecturers/17/1109745016/'
  it('достаёт преподавателей кафедры из реальных ссылок, без дублей', () => {
    const items = parseDirectory(links, base)
    expect(items.map((i) => i.name)).toEqual(expect.arrayContaining(['Чечулин Н.В.', 'Стерлягов С.П.', 'Шаповалова С.В.']))
    expect(new Set(items.map((i) => i.path)).size).toBe(items.length)
    expect(items.find((i) => i.name.startsWith('Стерлягов'))?.path).toBe('/timetable/lecturers/17/1109745016/525/')
  })
  it('берёт только следующий уровень и чужие разделы пропускает', () => {
    const html = `
      <a href="/timetable/lecturers/17/">Институт</a>
      <a href="/timetable/lecturers/17/5/">Кафедра <b>5</b></a>
      <a href="/timetable/lecturers/17/5/99/">Иванов И.И.</a>
      <a href="/timetable/rooms/7/166/">Аудитория</a>
      <a href="/timetable/lecturers/17/6/">Кафедра 6</a>
      <a href="/timetable/lecturers/17/7/?date=20261012-20261018">Кафедра 7</a>
      <a href="/timetable/lecturers/17/8/"> </a>`
    expect(parseDirectory(html, '/timetable/lecturers/17/')).toEqual([
      { name: 'Кафедра 5', path: '/timetable/lecturers/17/5/' },
      { name: 'Кафедра 6', path: '/timetable/lecturers/17/6/' },
      { name: 'Кафедра 7', path: '/timetable/lecturers/17/7/' },
    ])
  })
  it('корень: институты', () => {
    const html = '<a href="/timetable/lecturers/5/">ИГН</a><a href="/timetable/lecturers/17/">МИЭМИС (ЭФ)</a>'
    expect(parseDirectory(html, '/timetable/lecturers/').map((i) => i.path)).toEqual(['/timetable/lecturers/5/', '/timetable/lecturers/17/'])
  })
})

describe('разные виды ссылок', () => {
  it('относительные и полные адреса', () => {
    const html = `<a href="17/">Относительная</a>
      <a href='/timetable/students/5/'>Одинарные кавычки</a>
      <a href="https://www.asu.ru/timetable/students/9/">Полная</a>
      <a href="../lecturers/3/">Чужой раздел</a>
      <a href="./?date=20261012-20261018">Неделя</a>`
    // порядок — по названию: Одинарные кавычки, Относительная, Полная
    expect(parseDirectory(html, '/timetable/students/').map((i) => i.path)).toEqual([
      '/timetable/students/5/', '/timetable/students/17/', '/timetable/students/9/',
    ])
  })
})

describe('пути', () => {
  it('допустимые и недопустимые', () => {
    expect(validateDirPath('/timetable/lecturers/').ok).toBe(true)
    expect(validateDirPath('/timetable/students/17/').ok).toBe(true)
    for (const bad of ['/timetable/rooms/', '/timetable/lecturers', '/timetable/lecturers/../x/', '/etc/passwd', '/timetable/lecturers/17/?x=1', 'https://evil.example/timetable/lecturers/']) {
      expect(validateDirPath(bad).ok).toBe(false)
    }
  })
  it('лист: преподаватель — 3 уровня, группа — 2', () => {
    expect(isLeaf({ name: 'x', path: '/timetable/lecturers/17/5/99/' }, 'lecturers')).toBe(true)
    expect(isLeaf({ name: 'x', path: '/timetable/lecturers/17/5/' }, 'lecturers')).toBe(false)
    expect(isLeaf({ name: 'x', path: '/timetable/students/17/2129/' }, 'students')).toBe(true)
    expect(depthOf('/timetable/lecturers/17/', 'lecturers')).toBe(1)
  })
  it('адрес .ics', () => expect(icsUrlFor('/timetable/lecturers/17/82/597/')).toBe('https://www.asu.ru/timetable/lecturers/17/82/597/?file=597.ics'))
})

describe('поиск', () => {
  it('запрос: длина и символы', () => {
    expect(validateQuery('  Гер ')).toEqual({ ok: true, q: 'Гер' })
    expect(validateQuery('Ге').ok).toBe(false)
    expect(validateQuery('Иванов-Петров И.').ok).toBe(true)
    expect(validateQuery('a&b=c').ok).toBe(false)
  })
  it('адрес поиска', () => expect(searchUrl('Гер', 'lecturers')).toContain('search_in=lecturers'))
  it('результаты: только преподаватели, без дублей, с подписью', () => {
    const html = `<a href="/timetable/lecturers/17/82/597/">Герман О.И.</a>, кафедра информатики<br>
      <a href="/timetable/lecturers/17/82/597/">Герман О.И.</a>
      <a href="/timetable/lecturers/17/82/">Кафедра</a>
      <a href="/timetable/rooms/7/1/">Аудитория</a>`
    expect(parseSearch(html, 'lecturers')).toEqual([
      { name: 'Герман О.И.', path: '/timetable/lecturers/17/82/597/', hint: 'кафедра информатики' },
    ])
  })
  it('группы: два уровня', () => {
    const html = '<a href="/timetable/students/17/2129441703/">2.409-1</a>'
    expect(parseSearch(html, 'students')).toHaveLength(1)
    expect(parseSearch(html, 'lecturers')).toHaveLength(0)
  })
})
