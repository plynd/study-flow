// Путь: src/domain/debts.ts
// Модель предметов и расчёт статуса/прогресса. Статус не хранится — он вычисляется из работ.
// Запись исторически называется Debt и лежит под ключом debts-v1: сначала приложение вело только долги.
// Теперь запись — это предмет, а долг он или обычный предмет семестра, говорит поле kind.

export interface Work {
  id: string
  title: string // по умолчанию «Работа 1…N»
  done: boolean // сдана / не сдана, без промежуточных состояний
}

/** Долг (хвост, который надо закрыть) или обычный предмет этого семестра */
export type DebtKind = 'debt' | 'subject'

export interface Debt {
  id: string
  subject: string
  /**
   * Что это за запись. У записей, созданных до появления поля, его нет: они считаются долгами,
   * поэтому старые данные (в браузере, в резервной копии, на сервере) читаются без переделки.
   */
  kind?: DebtKind
  teacher?: string
  requirements?: string // что нужно сделать, текстом
  notes?: string
  closedManually: boolean // «закрыт без работ»
  works: Work[]
}

export const kindOf = (d: Pick<Debt, 'kind'>): DebtKind => (d.kind === 'subject' ? 'subject' : 'debt')
export const isDebt = (d: Pick<Debt, 'kind'>): boolean => kindOf(d) === 'debt'

export type DebtStatus = 'clarify' | 'in_progress' | 'closed'

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

export interface Sections {
  /** незакрытые долги: показываются первыми и только если есть */
  debts: Debt[]
  /** незакрытые предметы семестра */
  subjects: Debt[]
  /** всё закрытое, долги и предметы вместе */
  closed: Debt[]
}

/** Разделы списка. Внутри раздела сначала то, что в работе, потом то, где работы ещё не заданы; порядок добавления сохраняется. */
export function sections(all: Debt[]): Sections {
  const rank = (d: Debt) => (debtStatus(d) === 'in_progress' ? 0 : 1)
  const open = all.filter((d) => debtStatus(d) !== 'closed').sort((a, b) => rank(a) - rank(b)) // сортировка устойчивая
  return {
    debts: open.filter(isDebt),
    subjects: open.filter((d) => !isDebt(d)),
    closed: all.filter((d) => debtStatus(d) === 'closed'),
  }
}

export interface Overview {
  debts: TotalProgress
  subjects: TotalProgress
  /** о чём главная цифра: о долгах, пока есть незакрытые (или кроме долгов ничего нет), иначе о семестре */
  focus: 'debts' | 'subjects'
}

export function overview(all: Debt[]): Overview {
  const debts = totalProgress(all.filter(isDebt))
  const subjects = totalProgress(all.filter((d) => !isDebt(d)))
  const openDebts = debts.debtsTotal - debts.debtsClosed
  return { debts, subjects, focus: openDebts > 0 || subjects.debtsTotal === 0 ? 'debts' : 'subjects' }
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
