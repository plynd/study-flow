// Путь: src/domain/notify.ts
// Уведомления от бота: про преподавателей, которым нужно сдать долги.
// Без сети и без хранилища: серверная функция (supabase/functions/notify) даёт сюда данные и текущее время,
// а отсюда получает готовые тексты.
import { debtProgress, debtStatus, type Debt } from './debts'
import { addDays, fmtDate, fmtTime, isHidden, type Hidden, type Lesson, weekdayName } from './schedule'
import { surnameKey } from './insights'
import { type TeacherCal } from './teachers'

export interface NotifySettings {
  /** утренняя сводка по долгам на сегодня */
  morning: boolean
  morningAt: number // минуты от полуночи
  /** вечерняя сводка на завтра */
  evening: boolean
  eveningAt: number
  /** за сколько минут до пары «долгового» преподавателя напомнить, если у тебя в это время окно; 0 — не напоминать */
  before: number
  /** часовой пояс пользователя, например Asia/Barnaul */
  tz: string
}

export const BEFORE_OPTIONS = [0, 10, 15, 30, 60] as const
export const defaultNotify = (): NotifySettings => ({
  morning: false, morningAt: 8 * 60, evening: false, eveningAt: 20 * 60, before: 0, tz: 'Asia/Barnaul',
})

const inDay = (n: unknown) => typeof n === 'number' && n >= 0 && n < 24 * 60

export const isNotifySettings = (v: unknown): v is NotifySettings => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false
  const s = v as Record<string, unknown>
  return typeof s.morning === 'boolean' && typeof s.evening === 'boolean' && inDay(s.morningAt) && inDay(s.eveningAt)
    && typeof s.before === 'number' && s.before >= 0 && s.before <= 24 * 60
    && typeof s.tz === 'string' && s.tz.length > 0 && s.tz.length < 64
}

export const notifyEnabled = (s: NotifySettings) => s.morning || s.evening || s.before > 0

/** Часовой пояс существует (иначе Intl бросит ошибку) */
export function validTz(tz: string): boolean {
  try { new Intl.DateTimeFormat('ru-RU', { timeZone: tz }); return true } catch { return false }
}

/** Какая сейчас дата и сколько минут от полуночи в часовом поясе пользователя */
export function localNow(ms: number, tz: string): { date: string; min: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ms))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0'
  return { date: `${get('year')}-${get('month')}-${get('day')}`, min: +get('hour') * 60 + +get('minute') }
}

// ——— какие преподаватели нужны по долгам ———
const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е')

/** Долг относится к преподавателю, если у них совпадает фамилия: то же правило, что в списке долгов приложения */
export function teacherMatches(debtTeacher: string, cal: TeacherCal): boolean {
  const key = surnameKey(debtTeacher)
  return !!key && key === surnameKey(cal.name)
}

export interface DebtTeacher {
  label: string
  /** расписание преподавателя; нет — он не добавлен в приложение */
  cal?: TeacherCal
  debts: Debt[]
}

/** Незакрытые долги с указанным преподавателем, сгруппированные по человеку */
export function debtTeachers(debts: Debt[], teachers: TeacherCal[]): DebtTeacher[] {
  const groups = new Map<string, DebtTeacher>()
  for (const d of debts) {
    if (debtStatus(d) === 'closed' || !d.teacher?.trim()) continue
    const cal = teachers.find((t) => teacherMatches(d.teacher!, t))
    const key = cal ? `cal:${cal.id}` : `raw:${norm(d.teacher).trim()}`
    const g = groups.get(key) ?? { label: cal?.name ?? d.teacher.trim(), cal, debts: [] }
    g.debts.push(d)
    groups.set(key, g)
  }
  return [...groups.values()]
}

const debtText = (d: Debt): string => {
  if (debtStatus(d) === 'clarify') return `${d.subject} (уточнить требования)`
  const p = debtProgress(d)
  return `${d.subject} (сдано ${p.done} из ${p.total})`
}

// ——— пары преподавателя относительно твоего дня ———
const place = (l: Lesson) => (l.remote ? 'дистанционно' : l.room ? `ауд. ${l.room}` : '')

/** Как пара преподавателя соотносится с твоими парами в этот день */
export function relation(l: Lesson, own: Lesson[]): string {
  const ownIn = own.filter((o) => !o.remote)
  if (ownIn.length === 0) return 'у тебя в этот день нет очных пар'
  const same = ownIn.find((o) => o.start === l.start && o.subject === l.subject && o.teacher === l.teacher)
  if (same) return 'это и твоя пара'
  const busy = ownIn.find((o) => o.start < l.end && l.start < o.end)
  if (busy) return `в это время у тебя «${busy.subject}»`
  const first = Math.min(...ownIn.map((o) => o.start))
  const last = Math.max(...ownIn.map((o) => o.end))
  if (l.end <= first) return 'до твоих пар'
  if (l.start >= last) return 'после твоих пар'
  return 'у тебя окно'
}

const ownOn = (lessons: Lesson[], hidden: Hidden, date: string) =>
  lessons.filter((l) => l.date === date && !isHidden(l, hidden)).sort((a, b) => a.start - b.start)

const inPerson = (cal: TeacherCal, date: string) =>
  cal.lessons.filter((l) => l.date === date && !l.remote).sort((a, b) => a.start - b.start)

export interface DebtCtx {
  lessons: Lesson[]
  hidden: Hidden
  teachers: TeacherCal[]
  debts: Debt[]
}

const plural = (n: number, one: string, few: string, many: string) =>
  `${n} ${n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many}`

const hm = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} ч${min % 60 ? ` ${min % 60} мин` : ''}` : `${min} мин`)
const span = (l: Lesson) => `${fmtTime(l.start)}–${fmtTime(l.end)}`

/**
 * План дня одним списком по времени: твои пары, окна между ними и пары преподавателей, которым что-то должен.
 * Пары преподавателей помечены 🔸. Дистанционные пары преподавателей не показываем.
 */
export function dayText(date: string, label: 'Сегодня' | 'Завтра', ctx: DebtCtx): string | null {
  const own = ownOn(ctx.lessons, ctx.hidden, date)
  const person = own.filter((l) => !l.remote)
  const groups = debtTeachers(ctx.debts, ctx.teachers)
  const notAdded = groups.filter((g) => !g.cal).map((g) => g.label)

  interface Item { start: number; text: string }
  const items: Item[] = own.map((l) => {
    const owner = groups.find((g) => g.cal && g.label && l.teacher && teacherMatches(l.teacher, g.cal))
    return {
      start: l.start,
      text: `${span(l)} · ${l.subject}${l.kind ? ` (${l.kind})` : ''}${place(l) ? ` · ${place(l)}` : ''}${l.teacher ? `\n      ${l.teacher}${owner ? ' 🔸 долг' : ''}` : ''}`,
    }
  })
  let debtLessons = 0
  for (const g of groups) {
    if (!g.cal) continue
    for (const l of inPerson(g.cal, date)) {
      const rel = relation(l, own)
      if (rel === 'это и твоя пара') continue // уже в списке как твоя
      debtLessons++
      items.push({ start: l.start, text: `🔸 ${span(l)} · ${g.label}${place(l) ? ` · ${place(l)}` : ''}\n      долг: ${g.debts.map(debtText).join('; ')}\n      ${rel}` })
    }
  }

  // окна между очными парами от получаса
  const sorted = [...person].sort((a, b) => a.start - b.start)
  let reach = sorted[0]?.end ?? 0
  for (const l of sorted.slice(1)) {
    if (l.start - reach >= 30) items.push({ start: reach, text: `· · · окно ${fmtTime(reach)}–${fmtTime(l.start)} (${hm(l.start - reach)})` })
    reach = Math.max(reach, l.end)
  }

  items.sort((a, b) => a.start - b.start)
  const parts = [plural(person.length, 'пара', 'пары', 'пар')]
  if (sorted.length) parts.push(`${fmtTime(sorted[0].start)}–${fmtTime(reach)}`)
  else if (own.length) parts[0] = 'только дистанционно'
  if (debtLessons) parts.push(`сдать: ${debtLessons}`)

  const head = `📅 ${label}, ${weekdayName(date)} ${fmtDate(date)}`
  const body = items.length ? [parts.join(' · '), items.map((i) => i.text).join('\n\n')] : ['Пар нет.']
  const out = [head, ...body]
  if (debtLessons) out.push('🔸 — преподаватели, у которых у тебя долг')
  if (notAdded.length) out.push(`Расписания нет, добавь в приложении: ${notAdded.join(', ')}`)
  return out.join('\n\n')
}

export interface Message { key: string; text: string }

/** Пора ли слать сводку: время наступило, прошло не больше трёх часов, за этот день ещё не слали. Ключ — что запомнить. */
export function summaryDue(kind: 'morning' | 'evening', s: NotifySettings, now: { date: string; min: number }, sent: ReadonlySet<string>): string | null {
  const at = kind === 'morning' ? s.morningAt : s.eveningAt
  if (!(kind === 'morning' ? s.morning : s.evening)) return null
  if (now.min < at || now.min >= at + 180) return null
  const key = kind === 'morning' ? `mor:${now.date}` : `eve:${addDays(now.date, 1)}`
  return sent.has(key) ? null : key
}

/** Напоминание: у преподавателя по долгу скоро пара, а у тебя сейчас нет своей — самое время идти */
export function dueWindowReminders(ctx: DebtCtx, now: { date: string; min: number }, before: number, sent: ReadonlySet<string>): Message[] {
  if (before <= 0) return []
  const own = ownOn(ctx.lessons, ctx.hidden, now.date)
  if (own.some((o) => !o.remote && o.start <= now.min && now.min < o.end)) return [] // сейчас идёт твоя пара
  const out: Message[] = []
  for (const g of debtTeachers(ctx.debts, ctx.teachers)) {
    if (!g.cal) continue
    for (const l of inPerson(g.cal, now.date)) {
      const key = `win:${l.uid}:${l.date}`
      if (l.start <= now.min || l.start - now.min > before || sent.has(key)) continue
      out.push({
        key,
        text: `⏰ Через ${l.start - now.min} мин пара у ${g.label}: ${fmtTime(l.start)}–${fmtTime(l.end)}${place(l) ? `, ${place(l)}` : ''}\n${relation(l, own)}\nДолг: ${g.debts.map(debtText).join('; ')}`,
      })
    }
  }
  return out
}
