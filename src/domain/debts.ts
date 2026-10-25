// Путь: src/domain/debts.ts
// Модель долгов и расчёт статуса/прогресса. Статус не хранится — он вычисляется из работ.

export interface Work {
  id: string
  title: string // по умолчанию «Работа 1…N»
  done: boolean // сдана / не сдана, без промежуточных состояний
}

export interface Debt {
  id: string
  subject: string
  teacher?: string
  requirements?: string // что нужно сделать, текстом
  notes?: string
  closedManually: boolean // «закрыт без работ»
  works: Work[]
}

export type DebtStatus = 'clarify' | 'in_progress' | 'closed'

export const STATUS_LABEL: Record<DebtStatus, string> = {
  clarify: 'Уточнить требования',
  in_progress: 'В работе',
  closed: 'Закрыт',
}

export function debtStatus(debt: Debt): DebtStatus {
  if (debt.closedManually) return 'closed'
  if (debt.works.length === 0) return 'clarify'
  return debt.works.every((w) => w.done) ? 'closed' : 'in_progress'
}

export interface Progress {
  done: number
  total: number
}

// Прогресс по одному долгу (для полосы). Закрытый вручную без работ считается 1 из 1.
export function debtProgress(debt: Debt): Progress {
  if (debt.works.length === 0) {
    return debt.closedManually ? { done: 1, total: 1 } : { done: 0, total: 0 }
  }
  return { done: debt.works.filter((w) => w.done).length, total: debt.works.length }
}

export interface TotalProgress {
  // основной показатель — по предметам
  debtsClosed: number
  debtsTotal: number
  // вспомогательный — по работам (долги без требований не входят)
  worksDone: number
  worksTotal: number
  // долги без требований, подписываются отдельно
  unclear: number
}

export function totalProgress(debts: Debt[]): TotalProgress {
  const r: TotalProgress = {
    debtsClosed: 0,
    debtsTotal: debts.length,
    worksDone: 0,
    worksTotal: 0,
    unclear: 0,
  }
  for (const d of debts) {
    const s = debtStatus(d)
    if (s === 'closed') r.debtsClosed++
    if (s === 'clarify') r.unclear++
    if (d.works.length > 0) {
      r.worksTotal += d.works.length
      r.worksDone += d.works.filter((w) => w.done).length
    }
  }
  return r
}

// Названия по умолчанию: «Работа 1…N»
export function makeWorks(count: number, idPrefix = 'w'): Work[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${idPrefix}${i + 1}`,
    title: `Работа ${i + 1}`,
    done: false,
  }))
}

/** Работы по списку названий: по одному в строке, пустые строки пропускаем, не больше 30 */
export function worksFromTitles(text: string, idPrefix = 'w'): Work[] {
  return text.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 30)
    .map((title, i) => ({ id: `${idPrefix}${i + 1}`, title, done: false }))
}
