// Путь: src/data/sample.ts
import { makeWorks, type Debt } from '../domain/debts'

const done = (n: number, k: number, p: string) =>
  makeWorks(n, p).map((w, i) => ({ ...w, done: i < k }))

// Тестовые данные — потом заменим на настоящие из Supabase
export const sampleDebts: Debt[] = [
  { id: 'd1', subject: 'Теория электрических цепей', teacher: 'Рудакова О.Ю.', requirements: 'Лабы 1–5, защита устно', closedManually: false, works: done(5, 2, 'a') },
  { id: 'd2', subject: 'Компьютерное моделирование', teacher: 'Герман О.И.', requirements: '4 лабораторные в MATLAB', closedManually: false, works: done(4, 4, 'b') },
  { id: 'd3', subject: 'Философия', teacher: 'Шукшин', closedManually: false, works: [] },
  { id: 'd4', subject: 'Электроника', teacher: 'Кузнецова О.В.', notes: 'Договорились закрыть без работ', closedManually: true, works: [] },
]
