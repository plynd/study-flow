// Путь: src/data/addTeacher.ts
// Добавить преподавателя по ссылке из поиска: один запрос, проверка «это точно преподаватель», сохранение в общий список.
import { parseIcs } from '../domain/schedule'
import { validateIcsUrl } from '../domain/sources'
import { classifyCalendar, icsName, upsertTeacher } from '../domain/teachers'
import { fetchIcs } from './fetchIcs'
import { setTeachers } from './teachersStore'

export async function addTeacherFromUrl(rawUrl: string): Promise<{ ok: boolean; msg: string; name?: string }> {
  const v = validateIcsUrl(rawUrl)
  if (!v.ok) return { ok: false, msg: v.reason }
  const r = await fetchIcs(v.url)
  if ('error' in r) return { ok: false, msg: r.error }
  const lessons = parseIcs(r.text)
  if (lessons.length === 0) return { ok: false, msg: 'В расписании нет ни одной пары. Возможно, его ещё не опубликовали.' }
  const name = icsName(r.text)
  if (classifyCalendar(name, lessons) === 'group') return { ok: false, msg: `Это расписание группы («${name}»), а не преподавателя.` }
  const title = name ?? 'Преподаватель'
  setTeachers((ts) => upsertTeacher(ts, title, lessons, v.url))
  return { ok: true, msg: 'Расписание преподавателя добавлено', name: title }
}
