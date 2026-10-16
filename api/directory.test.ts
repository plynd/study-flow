// Путь: api/directory.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET } from './directory'

const call = (path: string) => GET(new Request('http://localhost/api/directory?path=' + encodeURIComponent(path)))
afterEach(() => vi.unstubAllGlobals())

const shell = `<div id="timetable-container"></div><script>request.setRequestHeader('X-CS-ID', 'abc123def');</script>`
const list = '<a href="/timetable/lecturers/17/5/">Кафедра 5</a><a href="/timetable/lecturers/17/6/">Кафедра 6</a>'

describe('api/directory', () => {
  it('двухшаговая загрузка: оболочка, затем тот же адрес с токеном и cookie', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(new Response(shell, { headers: { 'set-cookie': 'sid=42; path=/' } }))
      .mockResolvedValueOnce(new Response(list))
    vi.stubGlobal('fetch', f)
    const r = await call('/timetable/lecturers/17/')
    expect(r.status).toBe(200)
    expect((await r.json()).items).toHaveLength(2)
    expect(f).toHaveBeenCalledTimes(2)
    const h2 = f.mock.calls[1][1].headers as Record<string, string>
    expect(h2['X-CS-ID']).toBe('abc123def')
    expect(h2.Cookie).toBe('sid=42')
    expect(f.mock.calls[1][0]).toBe('https://www.asu.ru/timetable/lecturers/17/')
    for (const c of f.mock.calls) for (const v of Object.values(c[1].headers as Record<string, string>)) {
      expect([...v].every((ch) => ch.charCodeAt(0) < 256)).toBe(true)
    }
  })
  it('чужой путь не запрашивает', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f)
    expect((await call('/etc/passwd')).status).toBe(400)
    expect(f).not.toHaveBeenCalled()
  })
  it('429 на любом шаге — стоп', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 429 })))
    const r = await call('/timetable/lecturers/')
    expect(r.status).toBe(429)
    expect(r.headers.get('Retry-After')).toBe('1800')
  })
  it('страница без списка — понятная ошибка', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<p>пусто</p>')))
    const r = await call('/timetable/lecturers/')
    expect(r.status).toBe(502)
    expect((await r.json()).error).toContain('шаг 1: 200')
  })
  it('пустой ответ на втором шаге виден в диагностике', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(shell))
      .mockResolvedValueOnce(new Response('')))
    const r = await call('/timetable/lecturers/')
    expect((await r.json()).error).toContain('шаг 2: 200, 0 симв.')
  })
})
