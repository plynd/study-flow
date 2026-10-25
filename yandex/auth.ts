// Путь: yandex/auth.ts
// Проверка, что запрос пришёл из Mini App в Telegram от разрешённого человека, и ограничение частоты.
// initData подписан Telegram токеном бота: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
import { createHmac, timingSafeEqual } from 'node:crypto'

const MAX_AGE_SEC = 24 * 60 * 60 // данные старше суток не принимаем

export type Check = { ok: true; id: number } | { ok: false; status: 401 | 403 | 500; error: string }

export function verifyTelegram(
  initData: string | undefined, botToken: string | undefined, allowedIds: string | undefined, nowSec = Math.floor(Date.now() / 1000),
): Check {
  if (!botToken) return { ok: false, status: 500, error: 'Функция не настроена: нет TELEGRAM_BOT_TOKEN.' }
  const allowed = (allowedIds ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (allowed.length === 0) return { ok: false, status: 500, error: 'Функция не настроена: нет ALLOWED_TG_IDS.' }
  if (!initData) return { ok: false, status: 401, error: 'Открой приложение из Telegram.' }

  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash) return { ok: false, status: 401, error: 'Нет подписи Telegram.' }
  params.delete('hash')
  const check = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n')
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest()
  const expected = createHmac('sha256', secret).update(check).digest('hex')
  const a = Buffer.from(expected), b = Buffer.from(hash)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, status: 401, error: 'Подпись Telegram не подошла.' }

  const date = Number(params.get('auth_date'))
  if (!Number.isFinite(date) || nowSec - date > MAX_AGE_SEC || date - nowSec > 300) {
    return { ok: false, status: 401, error: 'Данные входа устарели: открой приложение заново.' }
  }
  let id: number
  try { id = (JSON.parse(params.get('user') ?? '') as { id: unknown }).id as number } catch { id = NaN }
  if (typeof id !== 'number' || !Number.isFinite(id)) return { ok: false, status: 401, error: 'Нет данных пользователя.' }
  if (!allowed.includes(String(id))) return { ok: false, status: 403, error: 'Этот аккаунт не допущен.' }
  return { ok: true, id }
}

/** Не больше `max` запросов от одного человека за `windowMs`; хранится в памяти экземпляра функции */
export function makeLimiter(max: number, windowMs: number) {
  const hits = new Map<number, number[]>()
  return (id: number, now = Date.now()): { ok: true } | { ok: false; retryAfterSec: number } => {
    const recent = (hits.get(id) ?? []).filter((t) => now - t < windowMs)
    if (recent.length >= max) {
      hits.set(id, recent)
      return { ok: false, retryAfterSec: Math.max(1, Math.ceil((windowMs - (now - recent[0])) / 1000)) }
    }
    recent.push(now)
    hits.set(id, recent)
    return { ok: true }
  }
}
