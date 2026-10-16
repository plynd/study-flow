// Путь: src/domain/schedule.ts
// Разбор .ics расписания АлтГУ и правила скрытия пар.
// Время хранится как локальное (дата + минуты от полуночи): часовой пояс файла один и тот же.

export interface Lesson {
  uid: string
  date: string // ГГГГ-ММ-ДД
  start: number // минуты от полуночи
  end: number
  kind: string // лек. / лаб. / пр.з.
  subject: string
  teacher: string
  room: string // «208С»; пусто у дистанционных
  remote: boolean // нет номера аудитории → дистанционная
}

const unescapeIcs = (s: string) =>
  s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1')

function parseLocal(v: string): { date: string; min: number } | null {
  const m = /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/.exec(v)
  if (!m) return null
  return { date: `${m[1]}-${m[2]}-${m[3]}`, min: +m[4] * 60 + +m[5] }
}

export function parseIcs(text: string): Lesson[] {
  // склейка «сложенных» строк: продолжение начинается с пробела или табуляции
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n')
  const lessons: Lesson[] = []
  let cur: Record<string, string> | null = null
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') cur = {}
    else if (line === 'END:VEVENT') {
      if (cur) {
        const l = toLesson(cur)
        if (l) lessons.push(l)
      }
      cur = null
    } else if (cur) {
      const i = line.indexOf(':')
      if (i > 0) cur[line.slice(0, i).split(';')[0]] = line.slice(i + 1)
    }
  }
  return lessons.sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start || a.uid.localeCompare(b.uid))
}

function toLesson(p: Record<string, string>): Lesson | null {
  const s = p.DTSTART && parseLocal(p.DTSTART)
  const e = p.DTEND && parseLocal(p.DTEND)
  if (!s || !e || !p.UID || !p.SUMMARY) return null
  // «ЧЧ:ММ тип Предмет (аудитория)»
  const m = /^\d{1,2}:\d{2}\s+(\S+)\s+(.*)\s+\(([^()]*)\)\s*$/.exec(unescapeIcs(p.SUMMARY))
  const kind = m?.[1] ?? ''
  const subject = (m?.[2] ?? unescapeIcs(p.SUMMARY)).trim()
  const room = (p.LOCATION ? unescapeIcs(p.LOCATION) : (m?.[3] ?? '')).trim()
  const teacher = unescapeIcs(p.DESCRIPTION ?? '').replace(/\s*\([^()]*\)\s*$/, '').trim()
  return {
    uid: p.UID, date: s.date, start: s.min, end: e.min,
    kind, subject, teacher, room,
    remote: !/\d/.test(room),
  }
}

// ---------- даты и время ----------
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
/** 0 = понедельник */
export function weekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
}
export const weekdayName = (date: string) => WEEKDAYS[weekday(date)]
export const fmtDate = (date: string) => `${date.slice(8, 10)}.${date.slice(5, 7)}`
export const fmtTime = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

// ---------- скрытие ----------
// Три уровня: предмет целиком, «подгруппа» (пара повторяется каждую неделю), отдельное занятие.
export interface Hidden {
  subjects: string[]
  keys: string[]
  uids: string[]
}
export const emptyHidden = (): Hidden => ({ subjects: [], keys: [], uids: [] })

/** Ключ «моей» пары из параллельных: предмет + преподаватель + день недели + время */
export const lessonKey = (l: Lesson) => `${l.subject}|${l.teacher}|${weekday(l.date)}|${l.start}`

export const isHidden = (l: Lesson, h: Hidden) =>
  h.subjects.includes(l.subject) || h.keys.includes(lessonKey(l)) || h.uids.includes(l.uid)

export const visibleLessons = (ls: Lesson[], h: Hidden) => ls.filter((l) => !isHidden(l, h))

/** Параллельные пары: одно время, одна дата, больше одной — выбираем свою */
export function parallelOf(l: Lesson, all: Lesson[]): Lesson[] {
  return all.filter((x) => x.uid !== l.uid && x.date === l.date && x.start === l.start && !x.remote && !l.remote)
}

// ---------- день ----------
export function groupByDate(ls: Lesson[]): [string, Lesson[]][] {
  const map = new Map<string, Lesson[]>()
  for (const l of ls) map.set(l.date, [...(map.get(l.date) ?? []), l])
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}

/** День студента: от начала первой до конца последней очной пары. Дистант не считается. */
export function dayBounds(visible: Lesson[]): { start: number; end: number } | null {
  const inPerson = visible.filter((l) => !l.remote)
  if (inPerson.length === 0) return null
  return {
    start: Math.min(...inPerson.map((l) => l.start)),
    end: Math.max(...inPerson.map((l) => l.end)),
  }
}

/** Корпус — буква в конце номера аудитории («208С» → «С») */
export const building = (room: string) => /[A-Za-zА-Яа-я]$/.exec(room)?.[0] ?? ''

// ---------- недели ----------
const pad = (n: number) => String(n).padStart(2, '0')
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}
/** Понедельник недели, в которую попадает дата */
export const weekStart = (date: string) => addDays(date, -weekday(date))

/** Все недели от первой до последней (подряд, включая пустые) */
export function weeksOf(ls: Lesson[]): string[] {
  if (ls.length === 0) return []
  const starts = ls.map((l) => weekStart(l.date)).sort()
  const out: string[] = []
  for (let w = starts[0]; w <= starts[starts.length - 1]; w = addDays(w, 7)) out.push(w)
  return out
}

/** Какую неделю показать сразу: с сегодняшним днём, а если её нет в файле — ближайшую */
export function defaultWeek(weeks: string[], today: string): string {
  const w = weekStart(today)
  if (weeks.includes(w)) return w
  return today < weeks[0] ? weeks[0] : weeks[weeks.length - 1]
}

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
export function fmtWeek(start: string): string {
  const end = addDays(start, 6)
  const m = (d: string) => MONTHS[+d.slice(5, 7) - 1]
  const a = +start.slice(8), b = +end.slice(8)
  return m(start) === m(end) ? `${a}–${b} ${m(end)}` : `${a} ${m(start)} – ${b} ${m(end)}`
}

/**
 * Разбивает пары дня на блоки: одиночная пара или группа параллельных
 * (одно время, обе очные) — для подсветки на экране.
 */
export function dayBlocks(ls: Lesson[]): Lesson[][] {
  const blocks: Lesson[][] = []
  for (const l of ls) {
    const last = blocks[blocks.length - 1]
    if (last && !l.remote && !last[0].remote && last[0].start === l.start) last.push(l)
    else blocks.push([l])
  }
  return blocks
}
