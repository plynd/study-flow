// Путь: api/search.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET } from './search'

const call = (qs: string) => GET(new Request('http://localhost/api/search?' + qs))
afterEach(() => vi.unstubAllGlobals())

const shell = `<div id="timetable-container"></div><script>request.setRequestHeader('X-CS-ID', 'a1b2c3');</script>`
const result = `<ul>
  <li><a href="/timetable/lecturers/17/82/597/">Герман О.И.</a>, кафедра информатики</li>
  <li><a href="/timetable/lecturers/5/9/12/">Германова А.А.</a> — кафедра истории</li></ul>`

describe('api/search', () => {
  it('ищет на сайте, запрос уходит закодированным', async () => {
    const f = vi.fn().mockResolvedValueOnce(new Response(shell)).mockResolvedValueOnce(new Response(result))
    vi.stubGlobal('fetch', f)
    const r = await call('in=lecturers&q=' + encodeURIComponent('Герм'))
    const body = await r.json()
    expect(r.status).toBe(200)
    expect(body.items.map((i: { name: string }) => i.name)).toEqual(['Герман О.И.', 'Германова А.А.'])
    expect(f.mock.calls[0][0]).toBe('https://www.asu.ru/timetable/search/lecturers/?query=%D0%93%D0%B5%D1%80%D0%BC')
  })
  it('короткий или странный запрос на сайт не уходит', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f)
    for (const q of ['ab', '', 'x'.repeat(41), 'a<b>c', 'abc&search_in=rooms']) {
      expect((await call('in=lecturers&q=' + encodeURIComponent(q))).status).toBe(400)
    }
    expect((await call('in=rooms&q=abcd')).status).toBe(400)
    expect(f).not.toHaveBeenCalled()
  })
  it('429 — стоп', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 429 })))
    expect((await call('in=lecturers&q=abcd')).status).toBe(429)
  })
  it('следующая страница: номер уходит на сайт, а в ответе — есть ли ещё', async () => {
    const pager = `<a href="/timetable/search/lecturers/?query=abcd&PAGEN_1=2">2</a><a href="/timetable/search/lecturers/?query=abcd&PAGEN_1=3">3</a>`
    const f = vi.fn().mockResolvedValueOnce(new Response(shell)).mockResolvedValueOnce(new Response(result + pager))
    vi.stubGlobal('fetch', f)
    const body = await (await call('in=lecturers&q=abcd&pp=PAGEN_1&pn=2')).json()
    expect(f.mock.calls[0][0]).toBe('https://www.asu.ru/timetable/search/lecturers/?query=abcd&PAGEN_1=2')
    expect(body.more).toEqual({ param: 'PAGEN_1', n: 3 })
  })
  it('странный номер страницы на сайт не уходит', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f)
    for (const qs of ['pp=a%26b&pn=2', 'pp=PAGEN_1&pn=1', 'pp=query&pn=2', 'pp=PAGEN_1&pn=abc']) {
      expect((await call('in=lecturers&q=abcd&' + qs)).status).toBe(400)
    }
    expect(f).not.toHaveBeenCalled()
  })
})
