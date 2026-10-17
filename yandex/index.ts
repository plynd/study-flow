// Путь: yandex/index.ts
// Обёртка для Yandex Cloud Functions: те же три функции, что и в api/, но на российских серверах
// (asu.ru не отвечает на запросы с зарубежных адресов, в том числе с Vercel).
// Собирается в один файл командой `npm run build:yandex` → yandex/dist/index.js.
import { GET as search } from '../api/search.js'
import { GET as directory } from '../api/directory.js'
import { GET as ics } from '../api/ics.js'

interface YandexEvent {
  httpMethod?: string
  path?: string
  url?: string
  queryStringParameters?: Record<string, string> | null
  multiValueQueryStringParameters?: Record<string, string[]> | null
  params?: Record<string, string> | null
  rawQueryString?: string
}
interface YandexResponse { statusCode: number; headers: Record<string, string>; body: string }

const ROUTES: Record<string, (r: Request) => Promise<Response>> = { search, directory, ics }

// Страницу открывает браузер с другого адреса (Vercel), поэтому разрешаем чтение: только GET без особых заголовков
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-expose-headers': 'Retry-After' }

/** Параметры запроса: Yandex кладёт их в разные поля в зависимости от режима вызова, берём из любого */
export function queryOf(event: YandexEvent): Record<string, string> {
  const out: Record<string, string> = {}
  const fromUrl = (event.rawQueryString ?? (event.url ?? '').split('?')[1] ?? '')
  for (const [k, v] of new URLSearchParams(fromUrl)) out[k] = v
  for (const [k, v] of Object.entries(event.multiValueQueryStringParameters ?? {})) if (v?.length) out[k] = String(v[0])
  for (const src of [event.params, event.queryStringParameters]) {
    for (const [k, v] of Object.entries(src ?? {})) if (v != null) out[k] = String(v)
  }
  return out
}

/** Какую из трёх функций вызвали: ?route=search, а если параметра нет — по последнему отрезку адреса */
export function routeOf(event: YandexEvent): string {
  const q = queryOf(event)
  if (q.route) return q.route
  const path = (event.path ?? event.url ?? '').split('?')[0]
  return path.split('/').filter(Boolean).pop() ?? ''
}

export async function handler(event: YandexEvent): Promise<YandexResponse> {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' }
  if (event.httpMethod && event.httpMethod !== 'GET') return { statusCode: 405, headers: CORS, body: '' }

  const name = routeOf(event)
  const fn = Object.hasOwn(ROUTES, name) ? ROUTES[name] : undefined
  if (!fn) {
    return { statusCode: 404, headers: { ...CORS, 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify({ error: 'Неизвестный адрес.', debug: { keys: Object.keys(event), url: event.url, path: event.path, payload: JSON.stringify((event as {payload?: unknown}).payload ?? null).slice(0, 1500), query: queryOf(event) } }) }
  }

  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(queryOf(event))) {
    if (k !== 'route' && k !== 'integration') params.set(k, String(v))
  }
  const res = await fn(new Request(`https://localhost/api/${name}?${params}`))
  const headers: Record<string, string> = { ...CORS }
  res.headers.forEach((v, k) => { headers[k] = v })
  return { statusCode: res.status, headers, body: await res.text() }
}
