// Путь: src/server/site.ts
// Загрузка страниц asu.ru/timetable так же, как это делает сама страница:
// сначала оболочка (в ней одноразовый токен), потом тот же адрес с заголовком X-CS-ID.
// Один запрос — один клик пользователя; редиректы не выполняем; при 403/429 останавливаемся.

const UA = 'debts-app/0.1 (personal student project)'

export type PageResult =
  | { ok: true; html: string; trace: string }
  | { ok: false; status: number; error: string; stop: boolean }

const fail = (status: number, error: string, stop = false): PageResult => ({ ok: false, status, error, stop })

async function get(url: string, extra: Record<string, string> = {}): Promise<Response> {
  return fetch(url, {
    redirect: 'manual',
    headers: { 'User-Agent': UA, Accept: 'text/html', ...extra },
    signal: AbortSignal.timeout(20_000),
  })
}

function blocked(res: Response): PageResult | null {
  if (res.status === 403 || res.status === 429) {
    return fail(429, 'Сайт расписания ограничил запросы. Останавливаемся: попробуй позже.', true)
  }
  if (!res.ok) return fail(502, `Сайт расписания ответил ошибкой ${res.status}.`)
  return null
}

export async function fetchTimetablePage(url: string): Promise<PageResult> {
  let shell: Response
  try { shell = await get(url) } catch (e) { return fail(502, `Сайт расписания не ответил (${reason(e)}).`) }
  const bad = blocked(shell)
  if (bad) return bad
  const html = await shell.text()

  const token = /setRequestHeader\(\s*'X-CS-ID'\s*,\s*'([0-9a-f]+)'\s*\)/i.exec(html)?.[1]
  const cookies = (shell.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0])
  const t1 = `шаг 1: ${shell.status}, ${html.length} симв., токен: ${token ? 'есть' : 'нет'}, cookie: ${cookies.length}`
  if (!token) return { ok: true, html, trace: t1 } // страница отдана целиком

  try {
    // как делает страница: тот же адрес, заголовок X-CS-ID, страница-источник и обычные для XHR заголовки
    const res = await get(url, {
      'X-CS-ID': token,
      Accept: '*/*',
      Referer: url,
      'Accept-Language': 'ru',
      ...(cookies.length ? { Cookie: cookies.join('; ') } : {}),
    })
    const bad2 = blocked(res)
    if (bad2) return bad2
    const body = await res.text()
    return { ok: true, html: body, trace: `${t1}; шаг 2: ${res.status}, ${body.length} симв.` }
  } catch (e) {
    return fail(502, `Сайт расписания не ответил (${reason(e)}).`)
  }
}

export function reason(e: unknown): string {
  const err = e as { name?: string; message?: string; cause?: { code?: string; message?: string; errors?: { code?: string }[] } }
  return err.cause?.code ?? err.cause?.errors?.[0]?.code ?? err.cause?.message
    ?? ([err.name, err.message].filter(Boolean).join(': ') || 'неизвестно')
}
