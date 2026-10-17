// Путь: src/data/api.test.ts
import { describe, expect, it } from 'vitest'
import { apiUrl } from './api'

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
