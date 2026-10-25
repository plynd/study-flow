// Путь: yandex/index.test.ts
import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { handler } from './index'

const TOKEN = '123456:TEST-token'
function initData(id: number, authDate = Math.floor(Date.now() / 1000)): string {
  const fields = { auth_date: String(authDate), user: JSON.stringify({ id }) }
  const check = Object.entries(fields).map(([k, v]) => `${k}=${v}`).sort().join('\n')
  const hash = createHmac('sha256', createHmac('sha256', 'WebAppData').update(TOKEN).digest()).update(check).digest('hex')
  return new URLSearchParams({ ...fields, hash }).toString()
}
const ev = (headers?: Record<string, string>, route = 'nope') => ({ httpMethod: 'GET', queryStringParameters: { route }, headers })

beforeEach(() => { vi.stubEnv('TELEGRAM_BOT_TOKEN', TOKEN); vi.stubEnv('ALLOWED_TG_IDS', '42') })
afterEach(() => { vi.unstubAllEnvs() })

describe('handler: доступ', () => {
  it('предварительный запрос браузера проходит без подписи и разрешает наш заголовок', async () => {
    const r = await handler({ httpMethod: 'OPTIONS' })
    expect(r.statusCode).toBe(204)
    expect(r.headers['access-control-allow-headers']).toContain('x-tg-init-data')
  })
  it('без подписи — 401, и до asu.ru дело не доходит', async () => {
    expect((await handler(ev())).statusCode).toBe(401)
  })
  it('чужой Telegram-аккаунт — 403', async () => {
    expect((await handler(ev({ 'X-Tg-Init-Data': initData(7) }))).statusCode).toBe(403)
  })
  it('свой аккаунт проходит проверку (заголовок в любом регистре); неизвестный адрес — 404 без отладочных данных', async () => {
    const r = await handler(ev({ 'x-TG-init-data': initData(42) }))
    expect(r.statusCode).toBe(404)
    expect(JSON.parse(r.body)).toEqual({ error: 'Неизвестный адрес.' })
  })
  it('частые запросы получают 429 с Retry-After', async () => {
    const h = { 'x-tg-init-data': initData(42) }
    let last = await handler(ev(h))
    for (let i = 0; i < 40 && last.statusCode !== 429; i++) last = await handler(ev(h))
    expect(last.statusCode).toBe(429)
    expect(Number(last.headers['retry-after'])).toBeGreaterThan(0)
  })
})
