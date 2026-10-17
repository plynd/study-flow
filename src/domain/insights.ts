// Путь: src/domain/insights.ts
// Сводки по расписанию для боковой панели: ближайшая пара, загрузка недели, где застать преподавателей для долгов.
// Только очные пары: дистант в «день студента» и подбор не входит (как везде).
import { debtStatus, type Debt } from './debts'
import type { Lesson } from './schedule'

const inPerson = (ls: Lesson[]) => ls.filter((l) => !l.remote)

/** Номер дня (для разницы дат без часовых поясов) */
function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000)
}

export interface NextLesson {
  lesson: Lesson
  /** идёт прямо сейчас */
  ongoing: boolean
  /** минут до начала (или до конца, если идёт) */
  minutes: number
}

/** Идущая сейчас или ближайшая очная пара. `date` и `min` — сегодняшняя дата и минуты от полуночи. */
export function nextLesson(ls: Lesson[], date: string, min: number): NextLesson | null {
  const today = dayNumber(date)
  let best: NextLesson | null = null
  for (const l of inPerson(ls)) {
    const diff = (dayNumber(l.date) - today) * 1440
    const toStart = diff + l.start - min
    const toEnd = diff + l.end - min
    if (toEnd <= 0) continue // уже прошла
    const cand: NextLesson = toStart <= 0
      ? { lesson: l, ongoing: true, minutes: toEnd }
      : { lesson: l, ongoing: false, minutes: toStart }
    const rank = (c: NextLesson) => (c.ongoing ? -1 : c.minutes)
    if (!best || rank(cand) < rank(best)) best = cand
  }
  return best
}

export interface DayLoad { date: string; pairs: number; minutes: number }

/** Загрузка по дням: сколько очных пар и сколько минут занятий (параллельные пары считаются как одно время) */
export function weekLoad(visible: Lesson[], days: string[]): DayLoad[] {
  return days.map((date) => {
    const ls = inPerson(visible.filter((l) => l.date === date)).sort((a, b) => a.start - b.start)
    let minutes = 0
    let until = -1
    for (const l of ls) {
      const from = Math.max(l.start, until)
      if (l.end > from) minutes += l.end - from
      until = Math.max(until, l.end)
    }
    return { date, pairs: ls.length, minutes }
  })
}

/** «1 ч 20 мин», «45 мин», «2 ч», «2 дн. 2 ч» */
export function fmtDuration(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  if (h >= 24) { const d = Math.floor(h / 24); return h % 24 === 0 ? `${d} дн.` : `${d} дн. ${h % 24} ч` }
  if (h === 0) return `${m} мин`
  return m === 0 ? `${h} ч` : `${h} ч ${m} мин`
}

// ---------- где застать преподавателей, которым сдаются долги ----------

/** Фамилия как ключ сравнения: «Шукшин С.А. (ст.пр.), АлтГУ» и «шукшин» → «шукшин» */
export function surnameKey(name: string): string {
  return name.trim().toLowerCase().replace(/ё/g, 'е').split(/[\s.,(]+/)[0] ?? ''
}

export interface DebtMeeting {
  debt: Debt
  /** есть ли загруженное расписание этого преподавателя */
  hasCalendar: boolean
  /** ближайшая очная пара преподавателя (идёт сейчас или впереди) */
  next: NextLesson | null
}

/**
 * Для каждого незакрытого долга с указанным преподавателем: когда и где его ближайшая очная пара.
 * Преподаватель из долга сопоставляется с загруженным расписанием по фамилии.
 * Сначала те, до кого ближе по времени; без расписания — в конце.
 */
export function debtMeetings(
  debts: Debt[], teachers: { name: string; lessons: Lesson[] }[], date: string, min: number,
): DebtMeeting[] {
  const out: DebtMeeting[] = []
  for (const debt of debts) {
    if (debtStatus(debt) === 'closed' || !debt.teacher?.trim()) continue
    const key = surnameKey(debt.teacher)
    const cal = key ? teachers.find((t) => surnameKey(t.name) === key) : undefined
    out.push({ debt, hasCalendar: !!cal, next: cal ? nextLesson(cal.lessons, date, min) : null })
  }
  const rank = (m: DebtMeeting) => (m.next ? (m.next.ongoing ? -1 : m.next.minutes) : m.hasCalendar ? 1e9 : 2e9)
  return out.sort((a, b) => rank(a) - rank(b))
}
