// Серверная функция (Vercel): берёт .ics с сайта расписания и отдаёт приложению.
// Только ссылки asu.ru/timetable/…?file=N.ics; редиректы не следуем; при 403/429 останавливаемся.
import { validateIcsUrl } from '../src/domain/sources'

const json = (body: unknown, status: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  })

export async function GET(request: Request): Promise<Response> {
  const target = new URL(request.url).searchParams.get('url') ?? ''
  const v = validateIcsUrl(target)
  if (!v.ok) return json({ error: v.reason }, 400)

  let res: Response
  try {
    res = await fetch(v.url, {
      redirect: 'manual',
      headers: { 'User-Agent': 'debts-app/0.1 (personal student project)', Accept: 'text/calendar' },
      signal: AbortSignal.timeout(20_000),
    })
  } catch (e) {
    // причина нужна для диагностики: таймаут, DNS, сертификат и т.п.
    const err = e as {
      name?: string; message?: string
      cause?: { code?: string; message?: string; errors?: { code?: string }[] }
    }
    const detail = err.cause?.code ?? err.cause?.errors?.[0]?.code ?? err.cause?.message
      ?? [err.name, err.message].filter(Boolean).join(': ') ?? 'неизвестно'
    return json({ error: `Сайт расписания не ответил (${detail}).`, detail }, 502)
  }

  if (res.status === 403 || res.status === 429) {
    return json({
      error: 'Сайт расписания ограничил запросы. Останавливаемся: попробуй позже или загрузи файл вручную.',
      siteStatus: res.status,
    }, 429, { 'Retry-After': '1800' })
  }
  if (!res.ok) return json({ error: `Сайт расписания ответил ошибкой ${res.status}.` }, 502)

  const text = await res.text()
  if (!text.trimStart().startsWith('BEGIN:VCALENDAR')) {
    return json({ error: 'Сайт вернул не .ics (возможно, страницу-заглушку).' }, 502)
  }
  return new Response(text, {
    headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'no-store' },
  })
}
