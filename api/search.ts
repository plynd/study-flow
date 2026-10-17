// Путь: api/search.ts
// Серверная функция (Vercel): поиск преподавателя или группы по названию — как форма поиска на сайте.
import { parsePager, parseTotal, parseSearch, searchUrl, validatePage, validateQuery, type DirKind } from '../src/domain/directory.js'
import { fetchTimetablePage } from '../src/server/site.js'

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  })

async function handle(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams
  const kind = params.get('in')
  if (kind !== 'lecturers' && kind !== 'students') return json({ error: 'Укажи, что искать.' }, 400)
  const v = validateQuery(params.get('q') ?? '')
  if (!v.ok) return json({ error: v.reason }, 400)

  // следующая страница: имя параметра берём из ссылок самого сайта (ответ первой страницы), проверяем и передаём дальше
  const pp = params.get('pp'), pn = params.get('pn')
  const ref = pp && pn ? validatePage(pp, Number(pn)) : null
  if (pp && pn && !ref) return json({ error: 'Недопустимый номер страницы.' }, 400)

  const page = await fetchTimetablePage(searchUrl(v.q, kind as DirKind, ref ?? undefined))
  if (!page.ok) return json({ error: page.error }, page.status, page.stop ? { 'Retry-After': '1800' } : {})

  // только при разработке: посмотреть, что отдал сайт (?raw=1)
  if (process.env.NODE_ENV !== 'production' && params.get('raw') === '1') {
    return new Response(page.trace + '\n\n' + page.html.slice(0, 30_000), { headers: { 'content-type': 'text/plain; charset=utf-8' } })
  }
  const items = parseSearch(page.html, kind as DirKind)
  // для диагностики, если ничего не нашлось: что за страница пришла
  const hrefs = [...page.html.matchAll(/<a\b[^>]*?href\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1])
  const sample = [...new Set(hrefs.filter((h) => h.includes('timetable')))].slice(0, 6).map((h) => h.slice(0, 80))
  // начало текста страницы без разметки — если страница короткая, это обычно сообщение сайта
  const text = page.html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300)
  const debug = `${page.trace}; ссылок: ${hrefs.length}; примеры: ${sample.join(' , ') || 'нет'}; текст: «${text}»`
  return json({ items, more: parsePager(page.html, kind as DirKind, ref?.n ?? 1), total: parseTotal(page.html), debug })
}

/** Любой неожиданный сбой отдаём понятным JSON, а не пустой страницей ошибки */
export async function GET(request: Request): Promise<Response> {
  try { return await handle(request) } catch (e) {
    return json({ error: `Сбой на сервере: ${(e as Error)?.message ?? String(e)}` }, 500)
  }
}
