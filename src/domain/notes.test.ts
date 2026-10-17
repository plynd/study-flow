// Путь: src/domain/notes.test.ts
import { describe, expect, it } from 'vitest'
import { filterNotes, fmtNoteDate, isEmptyNote, noteTitle, notePreview, sortNotes, type Note } from './notes'

const N = (o: Partial<Note> = {}): Note => ({ id: 'x', title: '', body: '', pinned: false, updatedAt: 0, ...o })

describe('заметки', () => {
  it('заголовок: свой, иначе первая строка, иначе заглушка', () => {
    expect(noteTitle(N({ title: ' Билеты ', body: 'a' }))).toBe('Билеты')
    expect(noteTitle(N({ body: '\n  Список вопросов\nещё' }))).toBe('Список вопросов')
    expect(noteTitle(N())).toBe('Без названия')
  })

  it('превью не повторяет заголовок', () => {
    expect(notePreview(N({ title: 'T', body: 'первая\nвторая' }))).toBe('первая')
    expect(notePreview(N({ body: 'первая\nвторая' }))).toBe('вторая')
    expect(notePreview(N({ body: 'одна' }))).toBe('')
  })

  it('пустая заметка', () => {
    expect(isEmptyNote(N({ body: '  \n ' }))).toBe(true)
    expect(isEmptyNote(N({ title: 'a' }))).toBe(false)
  })

  it('порядок: закреплённые, потом свежие; исходный массив не меняется', () => {
    const a = N({ id: 'a', updatedAt: 1 }), b = N({ id: 'b', updatedAt: 3 }), c = N({ id: 'c', updatedAt: 2, pinned: true })
    const src = [a, b, c]
    expect(sortNotes(src).map((n) => n.id)).toEqual(['c', 'b', 'a'])
    expect(src.map((n) => n.id)).toEqual(['a', 'b', 'c'])
  })

  it('поиск без регистра и ё', () => {
    const ns = [N({ id: '1', body: 'Зачёт по ФИЗИКЕ' }), N({ id: '2', title: 'Философия' })]
    expect(filterNotes(ns, 'зачет').map((n) => n.id)).toEqual(['1'])
    expect(filterNotes(ns, 'физик').map((n) => n.id)).toEqual(['1'])
    expect(filterNotes(ns, '  ')).toHaveLength(2)
  })

  it('дата', () => {
    const now = new Date(2026, 9, 17, 15, 0).getTime()
    expect(fmtNoteDate(now - 5_000, now)).toBe('только что')
    expect(fmtNoteDate(now - 5 * 60_000, now)).toBe('5 мин назад')
    expect(fmtNoteDate(new Date(2026, 9, 17, 9, 5).getTime(), now)).toBe('сегодня, 09:05')
    expect(fmtNoteDate(new Date(2026, 9, 16, 23, 0).getTime(), now)).toBe('вчера')
    expect(fmtNoteDate(new Date(2026, 9, 1, 12, 0).getTime(), now)).toMatch(/1 окт/)
  })
})
