// Путь: src/domain/directory.ts
// Справочник расписания АлтГУ: институты → кафедры → преподаватели, институты → группы.
// Разбираем страницу по ссылкам, а не по вёрстке: адреса вида /timetable/lecturers/<ин>/<каф>/<id>/.

export type DirKind = 'lecturers' | 'students'
export interface DirItem { name: string; path: string }

/** Глубина «листа»: преподаватель /lecturers/ин/каф/id/ — 3, группа /students/ин/id/ — 2 */
export const LEAF_DEPTH: Record<DirKind, number> = { lecturers: 3, students: 2 }

export const rootPath = (kind: DirKind) => `/timetable/${kind}/`

const norm = (s: string) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim()
const stripTags = (s: string) => s.replace(/<[^>]*>/g, ' ')

/** Допустимые для запроса страницы: корень и до трёх числовых уровней */
export function validateDirPath(path: string): { ok: true; kind: DirKind; path: string } | { ok: false; reason: string } {
  const m = /^\/timetable\/(lecturers|students)\/((?:\d+\/){0,3})$/.exec(path)
  if (!m) return { ok: false, reason: 'Недопустимый раздел расписания.' }
  return { ok: true, kind: m[1] as DirKind, path }
}

export const depthOf = (path: string, kind: DirKind) =>
  path.slice(rootPath(kind).length).split('/').filter(Boolean).length

export const isLeaf = (item: DirItem, kind: DirKind) => depthOf(item.path, kind) >= LEAF_DEPTH[kind]

/**
 * Достаёт из страницы ссылки ровно на один уровень глубже текущей.
 * Дубли по адресу убираются, пустые подписи пропускаются.
 */
export function parseDirectory(html: string, basePath: string): DirItem[] {
  const m = /^\/timetable\/(lecturers|students)\//.exec(basePath)
  if (!m) return []
  const seen = new Map<string, string>()
  const re = /<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  for (let a = re.exec(html); a; a = re.exec(html)) {
    // относительные («17/», «../17/») и полные адреса приводим к пути на сайте
    let href: string
    try { href = new URL(a[1].replace(/&amp;/g, '&'), 'https://www.asu.ru' + basePath).pathname } catch { continue }
    if (!href.startsWith(basePath) || !href.endsWith('/')) continue
    const rest = href.slice(basePath.length).split('/').filter(Boolean)
    if (rest.length !== 1 || !/^\d+$/.test(rest[0])) continue
    const name = norm(stripTags(a[2]))
    if (!name || seen.has(href)) continue
    seen.set(href, name)
  }
  return [...seen].map(([path, name]) => ({ name, path })).sort((x, y) => x.name.localeCompare(y.name, 'ru'))
}

/** Адрес .ics по адресу страницы: …/<id>/ → …/<id>/?file=<id>.ics */
export function icsUrlFor(path: string): string {
  const id = path.split('/').filter(Boolean).pop() ?? ''
  return `https://www.asu.ru${path}?file=${id}.ics`
}

// ---------- поиск по фамилии (как на сайте: /timetable/search/?query=…&search_in=…) ----------
export interface SearchItem extends DirItem { hint?: string }

/** Запрос: 3–40 символов — буквы, цифры, пробел, точка, дефис */
export function validateQuery(q: string): { ok: true; q: string } | { ok: false; reason: string } {
  const t = q.trim().replace(/\s+/g, ' ')
  if (t.length < 3) return { ok: false, reason: 'Введи хотя бы 3 буквы.' }
  if (t.length > 40 || !/^[\p{L}\p{N} .\-]+$/u.test(t)) return { ok: false, reason: 'Недопустимые символы в запросе.' }
  return { ok: true, q: t }
}

export const searchUrl = (q: string, kind: DirKind) =>
  `https://www.asu.ru/timetable/search/${kind}/?query=${encodeURIComponent(q)}`

const LEAF_RE: Record<DirKind, RegExp> = {
  lecturers: /^\/timetable\/lecturers\/\d+\/\d+\/\d+\/$/,
  students: /^\/timetable\/students\/\d+\/\d+\/$/,
}

/**
 * Из страницы результатов берём преподавателей / группы.
 * Разметка сайта: <li class="schedule_search_results-item"> — внутри ссылка на лист и ссылки на кафедру и институт (подпись).
 * Если таких блоков нет — запасной вариант: любые ссылки на листья.
 */
export function parseSearch(html: string, kind: DirKind): SearchItem[] {
  const out = new Map<string, SearchItem>()
  const toPath = (href: string) => {
    try { return new URL(href.replace(/&amp;/g, '&'), 'https://www.asu.ru/timetable/search/').pathname } catch { return '' }
  }
  const anchors = (chunk: string) => [...chunk.matchAll(/<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((m) => ({ path: toPath(m[1]), text: norm(stripTags(m[2])) }))

  const blocks = html.split(/<li\b[^>]*schedule_search_results-item["' ]/i).slice(1)
  for (const block of blocks) {
    const chunk = block.split(/<\/li>/i)[0]
    const as = anchors(chunk)
    const leaf = as.find((a) => LEAF_RE[kind].test(a.path) && a.text)
    if (!leaf || out.has(leaf.path)) continue
    const hint = as.filter((a) => a !== leaf && a.text && !LEAF_RE[kind].test(a.path)).map((a) => a.text).join(', ')
    out.set(leaf.path, { name: leaf.text, path: leaf.path, ...(hint ? { hint } : {}) })
  }
  if (out.size > 0) return [...out.values()]

  // запасной вариант: ссылки на листья и короткая подпись сразу после
  const re = /<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  for (let a = re.exec(html); a; a = re.exec(html)) {
    const path = toPath(a[1])
    if (!LEAF_RE[kind].test(path)) continue
    const name = norm(stripTags(a[2]))
    if (!name || out.has(path)) continue
    const tail = html.slice(re.lastIndex, re.lastIndex + 400).split(/<a\b|<\/li>|<\/tr>|<\/p>|<br/i)[0]
    const hint = norm(stripTags(tail)).replace(/^[\s,;:–—-]+/, '')
    out.set(path, { name, path, ...(hint && hint.length <= 100 ? { hint } : {}) })
  }
  return [...out.values()]
}
