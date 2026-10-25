// Путь: yandex/auth.test.ts
import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { makeLimiter, verifyTelegram } from './auth'

const TOKEN = '123456:TEST-token'
const NOW = 1_800_000_000

/** Собрать initData так же, как это делает Telegram */
function sign(fields: Record<string, string>, token = TOKEN): string {
  const check = Object.entries(fields).map(([k, v]) => `${k}=${v}`).sort().join('\n')
  const secret = createHmac('sha256', 'WebAppData').update(token).digest()
  const hash = createHmac('sha256', secret).update(check).digest('hex')
  return new URLSearchParams({ ...fields, hash }).toString()
}
const user = (id: number) => JSON.stringify({ id, first_name: 'Д' })

describe('verifyTelegram', () => {
  const good = sign({ auth_date: String(NOW), user: user(42) })
  it('пускает подписанные данные разрешённого человека', () => {
    expect(verifyTelegram(good, TOKEN, '7, 42', NOW + 10)).toEqual({ ok: true, id: 42 })
  })
  it('чужой Telegram-аккаунт — 403', () => {
    expect(verifyTelegram(good, TOKEN, '7', NOW)).toMatchObject({ ok: false, status: 403 })
  })
  it('без данных, без подписи, с чужой подписью — 401', () => {
    expect(verifyTelegram(undefined, TOKEN, '42', NOW)).toMatchObject({ ok: false, status: 401 })
    expect(verifyTelegram('auth_date=1&user=%7B%7D', TOKEN, '42', NOW)).toMatchObject({ ok: false, status: 401 })
    expect(verifyTelegram(sign({ auth_date: String(NOW), user: user(42) }, 'other:token'), TOKEN, '42', NOW)).toMatchObject({ ok: false, status: 401 })
  })
  it('подмена данных ломает подпись', () => {
    const forged = good.replace(encodeURIComponent(user(42)), encodeURIComponent(user(7)))
    expect(forged).not.toBe(good)
    expect(verifyTelegram(forged, TOKEN, '7,42', NOW)).toMatchObject({ ok: false, status: 401 })
  })
  it('устаревшие данные не принимаем', () => {
    expect(verifyTelegram(good, TOKEN, '42', NOW + 25 * 3600)).toMatchObject({ ok: false, status: 401 })
  })
  it('не настроено — 500, а не «пускаем всех»', () => {
    expect(verifyTelegram(good, undefined, '42', NOW)).toMatchObject({ ok: false, status: 500 })
    expect(verifyTelegram(good, TOKEN, '', NOW)).toMatchObject({ ok: false, status: 500 })
  })
})

describe('makeLimiter', () => {
  it('пропускает max запросов за окно, потом просит подождать, потом снова пускает', () => {
    const lim = makeLimiter(2, 1000)
    expect(lim(1, 0).ok).toBe(true)
    expect(lim(1, 100).ok).toBe(true)
    expect(lim(1, 200)).toEqual({ ok: false, retryAfterSec: 1 })
    expect(lim(2, 200).ok).toBe(true) // у другого человека своя очередь
    expect(lim(1, 1001).ok).toBe(true)
  })
})
