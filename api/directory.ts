// Путь: api/directory.ts
// Серверная функция (Vercel): список институтов / кафедр / преподавателей / групп.
// Вызывается кликом пользователя в окне выбора; результат клиент кэширует на сутки.
import { parseDirectory, validateDirPath } from '../src/domain/directory'
import { fetchTimetablePage } from '../src/server/site'

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  })

export async function GET(request: Request): Promise<Response> {
  const v = validateDirPath(new URL(request.url).searchParams.get('path') ?? '')
  if (!v.ok) return json({ error: v.reason }, 400)

  const page = await fetchTimetablePage('https://www.asu.ru' + v.path)
  if (!page.ok) return json({ error: page.error }, page.status, page.stop ? { 'Retry-After': '1800' } : {})

  // только при разработке: посмотреть, что реально отдал сайт (?raw=1)
  if (process.env.NODE_ENV !== 'production' && new URL(request.url).searchParams.get('raw') === '1') {
    return new Response(page.trace + '\n\n' + page.html.slice(0, 30_000), { headers: { 'content-type': 'text/plain; charset=utf-8' } })
  }

  const items = parseDirectory(page.html, v.path)
  if (items.length === 0) {
    const links = (page.html.match(/<a\b/gi) ?? []).length
    return json({
      error: `На странице не нашлось списка (${page.trace}; ссылок на странице: ${links}).`,
    }, 502)
  }
  return json({ items })
}
