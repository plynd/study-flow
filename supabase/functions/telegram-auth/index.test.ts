// Путь: supabase/functions/telegram-auth/index.test.ts
import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { handler, verifyInitData } from './index'

const TOKEN = '123456:TEST-TOKEN'
const NOW = 1_800_000_000

/** Собирает initData так же, как Telegram: подпись по отсортированным строкам key=value */
function sign(fields: Record<string, string>, token = TOKEN): string {
  const check = Object.entries(fields).map(([k, v]) => `${k}=${v}`).sort().join('\n')
  const secret = createHmac('sha256', 'WebAppData').update(token).digest()
  const hash = createHmac('sha256', secret).update(check).digest('hex')
  return new URLSearchParams({ ...fields, hash }).toString()
}
const fields = (over: Record<string, string> = {}) => ({
  auth_date: String(NOW - 60), query_id: 'AAH', user: JSON.stringify({ id: 42, first_name: 'Дмитрий', username: 'dm' }), ...over,
})

describe('проверка initData', () => {
  it('принимает правильно подписанные данные', async () => {
    const r = await verifyInitData(sign(fields()), TOKEN, NOW)
    expect(r).toEqual({ ok: true, user: { id: 42, first_name: 'Дмитрий', username: 'dm' } })
  })
  it('отклоняет подпись от другого токена', async () => {
    const r = await verifyInitData(sign(fields(), 'other:token'), TOKEN, NOW)
    expect(r.ok).toBe(false)
  })
  it('отклоняет подмену пользователя', async () => {
    const p = new URLSearchParams(sign(fields()))
    p.set('user', JSON.stringify({ id: 1 }))
    expect((await verifyInitData(p.toString(), TOKEN, NOW)).ok).toBe(false)
  })
  it('отклоняет данные без подписи и устаревшие', async () => {
    expect((await verifyInitData('auth_date=1', TOKEN, NOW)).ok).toBe(false)
    expect((await verifyInitData(sign(fields({ auth_date: String(NOW - 90_000) })), TOKEN, NOW)).ok).toBe(false)
  })
})

describe('обработчик', () => {
  it('без секретов и не-POST отвечает ошибкой, а не падает', async () => {
    expect((await handler(new Request('https://x/', { method: 'GET' }))).status).toBe(405)
    expect((await handler(new Request('https://x/', { method: 'OPTIONS' }))).status).toBe(204)
    expect((await handler(new Request('https://x/', { method: 'POST', body: '{}' }))).status).toBe(500)
  })
})
