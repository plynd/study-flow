// Путь: src/domain/backup.test.ts
import { describe, expect, it } from 'vitest'
import { backupFileName, makeBackup, parseBackup, summarize } from './backup'

const debt = { id: 'a', subject: 'Философия', closedManually: false, works: [{ id: '1', title: 'Р1', done: true }] }
const note = { id: 'n', title: 'T', body: 'B', pinned: false, updatedAt: 1 }
const lesson = { uid: 'u', date: '2026-10-14', start: 540, end: 630, kind: 'лек.', subject: 'S', teacher: 'T', room: '1', remote: false }
const store: Record<string, unknown> = { 'debts-v1': [debt], 'notes-v1': [note], 'schedule-lessons-v1': [lesson], 'schedule-show-matches-v1': true }
const read = (k: string) => store[k]

describe('резервная копия', () => {
  it('собирает только то, что есть и корректно', () => {
    const b = makeBackup(read, 5)
    expect(Object.keys(b.data).sort()).toEqual(['debts-v1', 'notes-v1', 'schedule-lessons-v1', 'schedule-show-matches-v1'])
    expect(b.exportedAt).toBe(5)
  })

  it('битое значение в хранилище в копию не попадает', () => {
    const b = makeBackup((k) => (k === 'debts-v1' ? [{ id: 1 }] : undefined), 0)
    expect(b.data).toEqual({})
  })

  it('туда и обратно без потерь', () => {
    const text = JSON.stringify(makeBackup(read, 7))
    const r = parseBackup(text)
    expect(r.ok).toBe(true)
    if (r.ok) expect(summarize(r.backup)).toEqual({ debts: 1, notes: 1, lessons: 1, teachers: 0 })
  })

  it('отказывает: не JSON, чужой файл, новая версия, пустой, сломанный раздел', () => {
    const bad = (o: unknown) => parseBackup(JSON.stringify(o))
    expect(parseBackup('{{').ok).toBe(false)
    expect(bad({ hello: 1 }).ok).toBe(false)
    expect(bad({ app: 'debts-app', version: 99, data: { 'debts-v1': [] } }).ok).toBe(false)
    expect(bad({ app: 'debts-app', version: 1, data: {} }).ok).toBe(false)
    const broken = bad({ app: 'debts-app', version: 1, data: { 'debts-v1': [debt], 'notes-v1': [{ id: 'x' }] } })
    expect(broken.ok).toBe(false)
    if (!broken.ok) expect(broken.error).toContain('notes-v1')
  })

  it('лишние ключи (кэш, чужие) игнорируются', () => {
    const r = parseBackup(JSON.stringify({ app: 'debts-app', version: 1, data: { 'debts-v1': [debt], 'dir-cache-v1': { x: 1 }, evil: 1 } }))
    expect(r.ok && Object.keys(r.backup.data)).toEqual(['debts-v1'])
  })

  it('имя файла по дате', () => {
    expect(backupFileName(new Date(2026, 9, 7, 12).getTime())).toBe('debts-backup-2026-10-07.json')
  })
})
