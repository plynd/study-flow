// Путь: src/domain/debts.test.ts
import { describe, expect, it } from 'vitest'
import { debtProgress, debtStatus, isDebt, kindOf, makeWorks, overview, sections, worksFromTitles, totalProgress, type Debt } from './debts'

const debt = (over: Partial<Debt> = {}): Debt => ({
  id: 'd', subject: 'Предмет', closedManually: false, works: [], ...over,
})
const withDone = (n: number, done: number) =>
  makeWorks(n).map((w, i) => ({ ...w, done: i < done }))

describe('debtStatus', () => {
  it('нет работ → уточнить требования', () => {
    expect(debtStatus(debt())).toBe('clarify')
  })
  it('есть несданные → в работе', () => {
    expect(debtStatus(debt({ works: withDone(4, 1) }))).toBe('in_progress')
  })
  it('все сданы → закрыт', () => {
    expect(debtStatus(debt({ works: withDone(3, 3) }))).toBe('closed')
  })
  it('закрыт вручную без работ → закрыт', () => {
    expect(debtStatus(debt({ closedManually: true }))).toBe('closed')
  })
  it('закрыт вручную важнее несданных работ', () => {
    expect(debtStatus(debt({ closedManually: true, works: withDone(2, 0) }))).toBe('closed')
  })
})

describe('debtProgress', () => {
  it('сдано 2 из 5', () => {
    expect(debtProgress(debt({ works: withDone(5, 2) }))).toEqual({ done: 2, total: 5 })
  })
  it('без требований 0 из 0', () => {
    expect(debtProgress(debt())).toEqual({ done: 0, total: 0 })
  })
  it('закрыт вручную 1 из 1', () => {
    expect(debtProgress(debt({ closedManually: true }))).toEqual({ done: 1, total: 1 })
  })
})

describe('totalProgress', () => {
  it('считает по предметам и по работам, долги без требований отдельно', () => {
    const list = [
      debt({ id: '1', works: withDone(4, 4) }),
      debt({ id: '2', works: withDone(5, 2) }),
      debt({ id: '3' }),
      debt({ id: '4', closedManually: true }),
    ]
    expect(totalProgress(list)).toEqual({
      debtsClosed: 2, debtsTotal: 4, worksDone: 6, worksTotal: 9, unclear: 1,
    })
  })
  it('пустой список', () => {
    expect(totalProgress([])).toEqual({
      debtsClosed: 0, debtsTotal: 0, worksDone: 0, worksTotal: 0, unclear: 0,
    })
  })
})

describe('долг или предмет семестра', () => {
  it('старая запись без поля kind — долг', () => {
    expect(kindOf(debt())).toBe('debt')
    expect(isDebt(debt())).toBe(true)
  })
  it('явное значение читается, мусор считается долгом', () => {
    expect(kindOf(debt({ kind: 'subject' }))).toBe('subject')
    expect(kindOf(debt({ kind: 'debt' }))).toBe('debt')
    expect(kindOf({ kind: 'что-то' as never })).toBe('debt')
  })
})

describe('sections', () => {
  const list = [
    debt({ id: 'd-new' }), // долг, требования не уточнены
    debt({ id: 's-work', kind: 'subject', works: withDone(3, 1) }),
    debt({ id: 'd-work', works: withDone(2, 0) }),
    debt({ id: 's-done', kind: 'subject', works: withDone(2, 2) }),
    debt({ id: 'd-done', closedManually: true }),
    debt({ id: 's-new', kind: 'subject' }),
  ]
  const ids = (l: Debt[]) => l.map((d) => d.id)

  it('долги и предметы отдельно, закрытое — общим разделом', () => {
    const s = sections(list)
    expect(ids(s.debts)).toEqual(['d-work', 'd-new']) // сначала то, что в работе
    expect(ids(s.subjects)).toEqual(['s-work', 's-new'])
    expect(ids(s.closed)).toEqual(['s-done', 'd-done'])
  })
  it('смена вида переносит запись в другой раздел, работы и прогресс остаются', () => {
    const moved = list.map((d) => (d.id === 'd-work' ? { ...d, kind: 'subject' as const } : d))
    const s = sections(moved)
    expect(ids(s.debts)).toEqual(['d-new'])
    expect(ids(s.subjects)).toEqual(['s-work', 'd-work', 's-new'])
    expect(s.subjects[1].works).toEqual(list[2].works)
  })
  it('нет долгов — раздел долгов пустой', () => {
    expect(sections(list.filter((d) => d.kind === 'subject')).debts).toEqual([])
  })
})

describe('overview', () => {
  it('пока есть незакрытые долги, главная цифра о долгах', () => {
    const o = overview([debt({ id: '1', works: withDone(2, 1) }), debt({ id: '2', closedManually: true }), debt({ id: '3', kind: 'subject', works: withDone(4, 1) })])
    expect(o.focus).toBe('debts')
    expect([o.debts.debtsClosed, o.debts.debtsTotal]).toEqual([1, 2])
    expect([o.subjects.worksDone, o.subjects.worksTotal]).toEqual([1, 4])
  })
  it('долги закрыты и есть предметы — о семестре', () => {
    expect(overview([debt({ id: '1', closedManually: true }), debt({ id: '2', kind: 'subject' })]).focus).toBe('subjects')
    expect(overview([debt({ id: '2', kind: 'subject' })]).focus).toBe('subjects')
  })
  it('есть только долги (даже закрытые) или пусто — о долгах', () => {
    expect(overview([debt({ id: '1', closedManually: true })]).focus).toBe('debts')
    expect(overview([]).focus).toBe('debts')
  })
})

describe('makeWorks', () => {
  it('называет Работа 1…N', () => {
    expect(makeWorks(3).map((w) => w.title)).toEqual(['Работа 1', 'Работа 2', 'Работа 3'])
  })
})

describe('worksFromTitles', () => {
  it('одна работа на строку, пустые строки и пробелы пропускаем', () => {
    const w = worksFromTitles('  Лаба 1: Excel \n\nКурсовая\n   \n', 'x')
    expect(w.map((x) => x.title)).toEqual(['Лаба 1: Excel', 'Курсовая'])
    expect(w.map((x) => x.id)).toEqual(['x1', 'x2'])
    expect(w.every((x) => !x.done)).toBe(true)
  })
  it('пустой текст — работ нет, не больше 30', () => {
    expect(worksFromTitles('  \n ')).toEqual([])
    expect(worksFromTitles(Array.from({ length: 40 }, (_, i) => `р${i}`).join('\n'))).toHaveLength(30)
  })
})
