// Путь: src/domain/debts.test.ts
import { describe, expect, it } from 'vitest'
import { debtProgress, debtStatus, makeWorks, worksFromTitles, totalProgress, type Debt } from './debts'

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
