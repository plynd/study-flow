// Путь: src/data/readDebts.ts
// Прочитать долги из хранилища (для экранов, которым они нужны только для показа).
import type { Debt } from '../domain/debts'

export function readDebts(): Debt[] {
  try {
    const raw = localStorage.getItem('debts-v1')
    if (raw) return JSON.parse(raw) as Debt[]
  } catch { /* нет хранилища */ }
  return []
}
