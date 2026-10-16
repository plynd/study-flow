import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET } from './ics'

const link = 'https://www.asu.ru/timetable/students/1/2/3/?file=3.ics'
const call = (url: string) => GET(new Request('http://localhost/api/ics?url=' + encodeURIComponent(url)))
afterEach(() => vi.unstubAllGlobals())
const stub = (res: Response | Error) =>
  vi.stubGlobal('fetch', vi.fn(async () => { if (res instanceof Error) throw res; return res }))

describe('api/ics', () => {
  it('чужую ссылку не открывает и сайт не трогает', async () => {
    stub(new Response('x'))
    const r = await call('https://evil.example/timetable/a/?file=1.ics')
    expect(r.status).toBe(400)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('отдаёт .ics как есть', async () => {
    stub(new Response('BEGIN:VCALENDAR\nEND:VCALENDAR'))
    const r = await call(link)
    expect(r.status).toBe(200)
    expect(await r.text()).toContain('BEGIN:VCALENDAR')
  })
  it.each([403, 429])('при %i останавливается и просит подождать', async (code) => {
    stub(new Response('no', { status: code }))
    const r = await call(link)
    expect(r.status).toBe(429)
    expect(r.headers.get('Retry-After')).toBe('1800')
  })
  it('страница-заглушка вместо .ics — ошибка', async () => {
    stub(new Response('<html></html>'))
    expect((await call(link)).status).toBe(502)
  })
  it('редирект не выполняется', async () => {
    stub(new Response(null, { status: 302, headers: { location: 'https://evil.example' } }))
    expect((await call(link)).status).toBe(502)
  })
  it('сеть недоступна', async () => {
    stub(new Error('down'))
    expect((await call(link)).status).toBe(502)
  })
})

describe('диагностика', () => {
  it('в ответ попадает код причины', async () => {
    const e = Object.assign(new TypeError('fetch failed'), { cause: { code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' } })
    vi.stubGlobal('fetch', vi.fn(async () => { throw e }))
    const r = await call('https://www.asu.ru/timetable/students/1/2/3/?file=3.ics')
    expect(r.status).toBe(502)
    expect((await r.json()).error).toContain('UNABLE_TO_VERIFY_LEAF_SIGNATURE')
  })
})

describe('заголовки запроса', () => {
  it('значения только из латиницы (иначе fetch в Node падает с TypeError)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('BEGIN:VCALENDAR\nEND:VCALENDAR')))
    await call('https://www.asu.ru/timetable/students/1/2/3/?file=3.ics')
    const init = (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0][1]
    for (const v of Object.values(init.headers as Record<string, string>)) {
      expect([...v].every((c) => c.charCodeAt(0) < 256)).toBe(true)
    }
  })
})
