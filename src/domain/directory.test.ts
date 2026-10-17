// Путь: src/domain/directory.test.ts
import { describe, expect, it } from 'vitest'
import { depthOf, icsUrlFor, isLeaf, parsePager, parseTotal, parseDirectory, parseSearch, searchUrl, validateDirPath, validatePage, validateQuery } from './directory'
import links from './__fixtures__/lecturers-links.html?raw'
import searchResult from './__fixtures__/search-result.html?raw'
import realLecturers from './__fixtures__/search-lecturers-4.html?raw'
import realMany from './__fixtures__/search-students-many.html?raw'
import realStudents from './__fixtures__/search-students-4.html?raw'

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
  it('адрес поиска как на сайте', () =>
    expect(searchUrl('Гер', 'lecturers')).toBe('https://www.asu.ru/timetable/search/lecturers/?query=%D0%93%D0%B5%D1%80'))
  it('настоящая страница результатов: преподаватель, кафедра и институт в подписи', () => {
    const r = parseSearch(searchResult, 'lecturers')
    expect(r).toHaveLength(1)
    expect(r[0].path).toBe('/timetable/lecturers/17/82/597/')
    expect(r[0].name).toBe('Герман О.И. (доц.)')
    expect(r[0].hint).toContain('Экономической безопасности')
    expect(r[0].hint).toContain('МИЭМИС')
  })
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

describe('листание результатов поиска', () => {
  const link = (qs: string) => `<a href="/timetable/search/lecturers/?query=Иван&amp;${qs}">x</a>`
  const html = `<ul class="pager">${link('PAGEN_1=1')}${link('PAGEN_1=2')}${link('PAGEN_1=3')}</ul><a href="/other/?PAGEN_1=9">чужая</a>`

  it('находит следующую страницу и имя параметра по ссылкам сайта', () => {
    expect(parsePager(html, 'lecturers')).toEqual({ param: 'PAGEN_1', n: 2 })
    expect(parsePager(html, 'lecturers', 2)).toEqual({ param: 'PAGEN_1', n: 3 })
  })
  it('на последней странице и без листания — null', () => {
    expect(parsePager(html, 'lecturers', 3)).toBeNull()
    expect(parsePager('<a href="/timetable/search/lecturers/?query=Иван">все</a>', 'lecturers')).toBeNull()
  })
  it('чужие ссылки и другой раздел не считаются', () => {
    expect(parsePager('<a href="/other/?query=a&PAGEN_1=2">x</a>', 'lecturers')).toBeNull()
    expect(parsePager(link('PAGEN_1=2'), 'students')).toBeNull()
  })
  it('адрес с номером страницы; странные параметры отбрасываются', () => {
    expect(searchUrl('Иван', 'lecturers', { param: 'PAGEN_1', n: 2 })).toBe('https://www.asu.ru/timetable/search/lecturers/?query=%D0%98%D0%B2%D0%B0%D0%BD&PAGEN_1=2')
    expect(validatePage('PAGEN_1', 2)).toEqual({ param: 'PAGEN_1', n: 2 })
    for (const [k, n] of [['query', 2], ['a&b', 2], ['1abc', 2], ['p', 1], ['p', 101], ['p', 2.5]] as const) expect(validatePage(k, n)).toBeNull()
  })
})

describe('настоящие страницы поиска asu.ru', () => {
  it('преподаватели: имя, кафедра и институт в подписи', () => {
    const r = parseSearch(realLecturers, 'lecturers')
    expect(r).toHaveLength(4)
    expect(r[0]).toEqual({
      name: 'Иванов А.В. (доц.)', path: '/timetable/lecturers/20/54/630/',
      hint: 'Конституционного и международного права, Юридический (ЮИ)',
    })
  })
  it('группы: в подписи институт, разные формы обучения не смешиваются', () => {
    const r = parseSearch(realStudents, 'students')
    expect(r.map((x) => x.name)).toEqual(['2.409-1', '2.409з', '2.409зи', '2.409и'])
    expect(r[0]).toEqual({ name: '2.409-1', path: '/timetable/students/17/2129441703/', hint: 'МИЭМИС (ЭФ)' })
  })
  it('«Всего найдено» читается, листания на странице с 4 результатами нет', () => {
    expect(parseTotal(realLecturers)).toBe(4)
    expect(parseTotal(realStudents)).toBe(4)
    expect(parsePager(realLecturers, 'lecturers')).toBeNull()
    expect(parseTotal('<p>ничего</p>')).toBeNull()
  })
  it('листание внутри блока pagination находится и без query в ссылке', () => {
    const html = '<div class="l-box pagination"><a href="?PAGEN_1=2">2</a><a href="?PAGEN_1=3">3</a></div>'
    expect(parsePager(html, 'lecturers')).toEqual({ param: 'PAGEN_1', n: 2 })
  })
})

describe('настоящая страница с листанием (569 групп, по 20 на странице)', () => {
  it('20 результатов, всего 569 — по категории «групп», а не 744 по всему поиску', () => {
    expect(parseSearch(realMany, 'students')).toHaveLength(20)
    expect(parseTotal(realMany)).toBe(569)
  })
  it('сайт листает параметром page: с первой страницы идём на вторую, со второй — на третью', () => {
    expect(parsePager(realMany, 'students')).toEqual({ param: 'page', n: 2 })
    expect(parsePager(realMany, 'students', 2)).toEqual({ param: 'page', n: 3 })
  })
  it('ссылка на последнюю страницу («29») не перескакивает через промежуточные', () => {
    expect(parsePager(realMany, 'students', 5)).toEqual({ param: 'page', n: 6 })
    expect(parsePager(realMany, 'students', 29)).toBeNull()
  })
})
