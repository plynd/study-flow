// Путь: supabase/functions/telegram-auth/index.ts
// Вход через Telegram. Приложение присылает initData (подписанные Telegram данные о пользователе),
// функция проверяет подпись токеном бота и возвращает сессию Supabase.
// Без зависимостей: только fetch и crypto, поэтому вставляется в редактор Supabase как есть.
//
// Секреты (Edge Functions → Secrets): TELEGRAM_BOT_TOKEN (обязательно), ALLOWED_TG_IDS (через запятую, необязательно).
// SUPABASE_URL, SUPABASE_ANON_KEY и SUPABASE_SERVICE_ROLE_KEY Supabase подставляет сам.
// В настройках функции выключить «Verify JWT»: на входе у пользователя ещё нет сессии.

const enc = new TextEncoder()
const MAX_AGE_SEC = 24 * 60 * 60 // данные старше суток не принимаем

async function hmac(key: ArrayBuffer | string, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', typeof key === 'string' ? enc.encode(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return crypto.subtle.sign('HMAC', k, enc.encode(data))
}
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')

export interface TgUser { id: number; first_name?: string; last_name?: string; username?: string }
export type InitCheck = { ok: true; user: TgUser } | { ok: false; reason: string }

/** Проверка подписи initData по правилам Telegram: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app */
export async function verifyInitData(initData: string, botToken: string, nowSec = Math.floor(Date.now() / 1000)): Promise<InitCheck> {
  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash) return { ok: false, reason: 'нет подписи' }
  params.delete('hash')
  const check = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n')
  const secret = await hmac('WebAppData', botToken)
  const expected = hex(await hmac(secret, check))
  // сравнение без раннего выхода, чтобы по времени ответа нельзя было подбирать подпись
  let diff = expected.length ^ hash.length
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ (hash.charCodeAt(i) || 0)
  if (diff !== 0) return { ok: false, reason: 'подпись не совпала' }
  const date = Number(params.get('auth_date'))
  if (!Number.isFinite(date) || nowSec - date > MAX_AGE_SEC || date - nowSec > 300) return { ok: false, reason: 'данные устарели' }
  try {
    const user = JSON.parse(params.get('user') ?? '') as TgUser
    if (typeof user.id !== 'number') throw new Error()
    return { ok: true, user }
  } catch {
    return { ok: false, reason: 'нет данных пользователя' }
  }
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json; charset=utf-8' } })

// deno-lint-ignore no-explicit-any
const env = (name: string): string | undefined => (globalThis as any).Deno?.env.get(name)

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json(405, { error: 'Только POST.' })

  const botToken = env('TELEGRAM_BOT_TOKEN')
  const url = env('SUPABASE_URL')
  const anon = env('SUPABASE_ANON_KEY')
  const service = env('SUPABASE_SERVICE_ROLE_KEY')
  if (!botToken || !url || !anon || !service) return json(500, { error: 'Функция не настроена: нет секретов.' })

  let initData = ''
  try { initData = String((await req.json()).initData ?? '') } catch { /* ниже ответим ошибкой */ }
  if (!initData) return json(400, { error: 'Нет initData.' })

  const res = await verifyInitData(initData, botToken)
  if (!res.ok) return json(401, { error: `Не удалось подтвердить вход через Telegram (${res.reason}).` })

  // Личное приложение: если задан список, пускаем только перечисленных
  const allowed = (env('ALLOWED_TG_IDS') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (allowed.length && !allowed.includes(String(res.user.id))) return json(403, { error: 'Этот аккаунт не допущен.' })

  // Пользователь Supabase на каждый Telegram-ID. Пароль выводится из токена бота, знает его только эта функция.
  const email = `tg${res.user.id}@users.noreply.studyflow.app`
  const password = hex(await hmac(botToken, `pw:${res.user.id}`))

  const create = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: service, authorization: `Bearer ${service}`, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { tg_id: res.user.id, username: res.user.username ?? null, first_name: res.user.first_name ?? null } }),
  })
  // 422 — пользователь уже есть, это нормально
  if (!create.ok && create.status !== 422) return json(502, { error: 'Не удалось создать пользователя.', detail: (await create.text()).slice(0, 300) })

  const login = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!login.ok) return json(502, { error: 'Не удалось войти.', detail: (await login.text()).slice(0, 300) })
  const s = await login.json()
  return json(200, { access_token: s.access_token, refresh_token: s.refresh_token, expires_in: s.expires_in })
}

// deno-lint-ignore no-explicit-any
const deno = (globalThis as any).Deno
if (deno?.serve) deno.serve(handler)
