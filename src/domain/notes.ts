// Путь: src/domain/notes.ts
// Заметки: модель, заголовок, поиск, порядок. Без React и без сети.

export interface Note {
  id: string
  title: string
  body: string
  pinned: boolean
  /** к какому долгу относится (необязательно) */
  debtId?: string
  /** когда меняли в последний раз (мс) */
  updatedAt: number
}

const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean)

/** Заголовок: введённый вручную, иначе первая строка текста */
export function noteTitle(n: Note): string {
  return n.title.trim() || lines(n.body)[0] || 'Без названия'
}

/** Одна строка под заголовком: следующая строка текста (если заголовок взят из текста — вторая) */
export function notePreview(n: Note): string {
  const ls = lines(n.body)
  return (n.title.trim() ? ls[0] : ls[1]) ?? ''
}

export const isEmptyNote = (n: Note) => !n.title.trim() && !n.body.trim()

/** Сначала закреплённые, внутри — недавно изменённые выше */
export function sortNotes(ns: Note[]): Note[] {
  return [...ns].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt)
}

/** Поиск по заголовку и тексту без учёта регистра и «ё» */
export function filterNotes(ns: Note[], q: string): Note[] {
  const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е')
  const query = norm(q.trim())
  if (!query) return ns
  return ns.filter((n) => norm(n.title + '\n' + n.body).includes(query))
}

/** «только что», «5 мин назад», «вчера», «12 окт» */
export function fmtNoteDate(at: number, now: number): string {
  const diff = now - at
  if (diff < 60_000) return 'только что'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} мин назад`
  const d = new Date(at), n = new Date(now)
  const day = (x: Date) => Math.floor((x.getTime() - x.getTimezoneOffset() * 60_000) / 86_400_000)
  const gap = day(n) - day(d)
  if (gap === 0) return `сегодня, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (gap === 1) return 'вчера'
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '')
}
