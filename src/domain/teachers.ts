// Путь: src/domain/teachers.ts
// Подбор пар преподавателя к дню студента.
// Правила: дистанционные пары преподавателя не показываем (только считаем);
// у дня студента берём последнюю пару «до», все «внутри» и первую «после».
import { dayBounds, type Lesson } from './schedule'

export type Tag = 'before' | 'inside' | 'after' | 'free'

export interface TeacherEntry {
  lesson: Lesson
  tag: Tag
  /** пара студента, с которой совпадает по времени начала */
  match?: Lesson
  /** внутри дня, но не совпадает ни с одной парой — «в окне» */
  inWindow?: boolean
}

export interface TeacherDay {
  entries: TeacherEntry[]
  /** скрыто пар без аудитории (дистанционных) */
  hiddenRemote: number
}

const sameLesson = (a: Lesson, b: Lesson) =>
  a.start === b.start && a.teacher === b.teacher && a.subject === b.subject

/**
 * own — видимые пары студента за этот день; teacher — все пары преподавателя за этот день.
 * showMatches=false убирает пары, совпадающие по времени с парой студента.
 */
export function teacherDay(own: Lesson[], teacher: Lesson[], showMatches: boolean): TeacherDay {
  const hiddenRemote = teacher.filter((l) => l.remote).length
  const t = teacher.filter((l) => !l.remote).sort((a, b) => a.start - b.start)
  const ownIn = own.filter((l) => !l.remote)
  const bounds = dayBounds(own)

  // день без очных пар студента — просто список очных пар преподавателя
  if (!bounds) return { entries: t.map((lesson) => ({ lesson, tag: 'free' as const })), hiddenRemote }

  // дубль (та же пара у группы студента) показываем один раз — как пару студента
  const rest = t.filter((l) => !ownIn.some((o) => sameLesson(o, l)))

  const before: Lesson[] = []
  const after: Lesson[] = []
  const entries: TeacherEntry[] = []
  for (const l of rest) {
    if (l.end <= bounds.start) before.push(l)
    else if (l.start >= bounds.end) after.push(l)
    else {
      const match = ownIn.find((o) => o.start === l.start)
      if (match && !showMatches) continue
      entries.push({ lesson: l, tag: 'inside', match, inWindow: !match })
    }
  }
  const lastBefore = before[before.length - 1]
  const firstAfter = after[0]
  return {
    entries: [
      ...(lastBefore ? [{ lesson: lastBefore, tag: 'before' as const }] : []),
      ...entries,
      ...(firstAfter ? [{ lesson: firstAfter, tag: 'after' as const }] : []),
    ],
    hiddenRemote,
  }
}

/** Название календаря из .ics (X-WR-CALNAME) — обычно имя преподавателя или группы */
export function icsName(text: string): string | null {
  const m = /^X-WR-CALNAME[^:]*:(.*)$/m.exec(text.replace(/\r/g, ''))
  return m ? m[1].replace(/\\([,;\\])/g, '$1').trim() || null : null
}

export interface TeacherCal {
  id: string
  name: string
  lessons: Lesson[]
  /** показывать совпадающие по времени пары: undefined — как в общей настройке */
  showMatches?: boolean
  /** откуда обновлять и когда обновляли в последний раз (мс) */
  sourceUrl?: string
  updatedAt?: number
}

export const matchesFor = (t: TeacherCal, defaultShow: boolean) => t.showMatches ?? defaultShow

export type CalendarKind = 'group' | 'teacher' | 'unknown'

/**
 * Чьё это расписание — группы или преподавателя. Нужно, чтобы не вставить одно вместо другого.
 * Группа: название начинается с «Группа». Преподаватель: все пары ведёт один человек (пар ≥ 3).
 * Если не уверены — 'unknown' (пропускаем как есть).
 */
export function classifyCalendar(name: string | null, lessons: Lesson[]): CalendarKind {
  if (name && /^\s*групп/i.test(name)) return 'group'
  const teachers = new Set(lessons.map((l) => l.teacher).filter(Boolean))
  if (lessons.length >= 3 && teachers.size === 1) return 'teacher'
  return 'unknown'
}
