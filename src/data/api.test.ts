// Путь: src/data/api.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiFetch, apiUrl } from './api'

describe('адрес серверных функций', () => {
  it('без настройки — свои /api', () => {
    expect(apiUrl('search', { in: 'students', q: '2.409' }, undefined)).toBe('/api/search?in=students&q=2.409')
    expect(apiUrl('ics', { url: 'https://www.asu.ru/a?file=1.ics' }, '')).toBe('/api/ics?url=https%3A%2F%2Fwww.asu.ru%2Fa%3Ffile%3D1.ics')
  })
  it('с адресом Yandex Cloud — туда, с названием функции в route', () => {
    expect(apiUrl('directory', { path: '/timetable/' }, 'https://functions.yandexcloud.net/abc123/'))
      .toBe('https://functions.yandexcloud.net/abc123?route=directory&path=%2Ftimetable%2F')
  })
  it('кириллица в запросе кодируется', () => {
    expect(apiUrl('search', { in: 'lecturers', q: 'Иванов' }, undefined)).toContain('q=%D0%98%D0%B2%D0%B0%D0%BD%D0%BE%D0%B2')
  })
})

describe('apiFetch: подпись Telegram для функции в Yandex Cloud', () => {
  const calls: unknown[][] = []
  const setup = (base: string, initData: string) => {
    vi.stubEnv('VITE_API_BASE', base)
    vi.stubGlobal('window', { Telegram: { WebApp: { initData } } })
    vi.stubGlobal('fetch', (...a: unknown[]) => { calls.push(a); return Promise.resolve(new Response('{}')) })
  }
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); calls.length = 0 })

  it('с адресом функции и данными Telegram шлёт заголовок', async () => {
    setup('https://f.example/x', 'auth_date=1&hash=abc')
    await apiFetch('directory', { path: '/a/' })
    expect(calls[0][1]).toEqual({ headers: { 'x-tg-init-data': 'auth_date=1&hash=abc' } })
  })
  it('без данных Telegram или со своими /api заголовка нет', async () => {
    setup('https://f.example/x', '')
    await apiFetch('directory', { path: '/a/' })
    setup('', 'auth_date=1&hash=abc')
    await apiFetch('directory', { path: '/a/' })
    expect(calls.map((c) => c[1])).toEqual([undefined, undefined])
  })
})
