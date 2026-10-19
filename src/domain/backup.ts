// Путь: src/domain/backup.ts
// Резервная копия: что в неё входит, как собрать и как проверить чужой файл перед загрузкой.
// Без React и без доступа к хранилищу: чтение и запись — в data/backupIO.ts.

import { isNotifySettings } from './notify'

/** Ключи хранилища, которые входят в копию. Кэш списков сайта (dir-cache-v1) не входит: он восстанавливается сам. */
export const BACKUP_KEYS = [
  'debts-v1', 'notes-v1', 'schedule-lessons-v1', 'schedule-hidden-v1',
  'schedule-teachers-v1', 'schedule-show-matches-v1', 'schedule-own-source-v1', 'notify-v1',
] as const
export type BackupKey = (typeof BACKUP_KEYS)[number]

export const BACKUP_APP = 'debts-app'
export const BACKUP_VERSION = 1

export interface Backup {
  app: typeof BACKUP_APP
  version: number
  /** когда сделана (мс) */
  exportedAt: number
  data: Partial<Record<BackupKey, unknown>>
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown) => typeof v === 'string'
const arrOf = (v: unknown, ok: (x: unknown) => boolean) => Array.isArray(v) && v.every(ok)

const CHECKS: Record<BackupKey, (v: unknown) => boolean> = {
  'debts-v1': (v) => arrOf(v, (d) => isObj(d) && isStr(d.id) && isStr(d.subject) && typeof d.closedManually === 'boolean'
    && arrOf(d.works, (w) => isObj(w) && isStr(w.id) && isStr(w.title) && typeof w.done === 'boolean')),
  'notes-v1': (v) => arrOf(v, (n) => isObj(n) && isStr(n.id) && isStr(n.title) && isStr(n.body)
    && typeof n.pinned === 'boolean' && typeof n.updatedAt === 'number'),
  'schedule-lessons-v1': (v) => arrOf(v, isLesson),
  'schedule-hidden-v1': (v) => isObj(v) && arrOf(v.subjects, isStr) && arrOf(v.keys, isStr) && arrOf(v.uids, isStr),
  'schedule-teachers-v1': (v) => arrOf(v, (t) => isObj(t) && isStr(t.id) && isStr(t.name) && arrOf(t.lessons, isLesson)),
  'schedule-show-matches-v1': (v) => typeof v === 'boolean',
  'schedule-own-source-v1': (v) => isObj(v) && isStr(v.url),
  'notify-v1': isNotifySettings,
}

function isLesson(l: unknown): boolean {
  return isObj(l) && isStr(l.uid) && isStr(l.date) && typeof l.start === 'number' && typeof l.end === 'number'
    && isStr(l.subject) && isStr(l.teacher) && isStr(l.room) && typeof l.remote === 'boolean'
}

/** Собрать копию из того, что лежит в хранилище (`read` возвращает уже разобранное значение или undefined) */
export function makeBackup(read: (key: BackupKey) => unknown, now: number): Backup {
  const data: Backup['data'] = {}
  for (const k of BACKUP_KEYS) {
    const v = read(k)
    if (v !== undefined && CHECKS[k](v)) data[k] = v
  }
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: now, data }
}

export type ParseResult = { ok: true; backup: Backup } | { ok: false; error: string }

/** Проверить текст файла. Любая сломанная часть — отказ целиком, чтобы не загрузить половину. */
export function parseBackup(text: string): ParseResult {
  let raw: unknown
  try { raw = JSON.parse(text) } catch { return { ok: false, error: 'Это не файл копии: не удалось прочитать.' } }
  if (!isObj(raw) || raw.app !== BACKUP_APP || !isObj(raw.data)) return { ok: false, error: 'Это не файл копии этого приложения.' }
  if (typeof raw.version !== 'number' || raw.version > BACKUP_VERSION) {
    return { ok: false, error: 'Файл сделан более новой версией приложения. Обнови приложение и попробуй снова.' }
  }
  const data: Backup['data'] = {}
  for (const k of BACKUP_KEYS) {
    if (!(k in raw.data)) continue
    if (!CHECKS[k](raw.data[k])) return { ok: false, error: `Файл повреждён: раздел «${k}» не прошёл проверку. Ничего не загружено.` }
    data[k] = raw.data[k]
  }
  if (Object.keys(data).length === 0) return { ok: false, error: 'В файле нет данных этого приложения.' }
  return { ok: true, backup: { app: BACKUP_APP, version: raw.version, exportedAt: typeof raw.exportedAt === 'number' ? raw.exportedAt : 0, data } }
}

export interface BackupSummary { debts: number; notes: number; lessons: number; teachers: number }

const len = (v: unknown) => (Array.isArray(v) ? v.length : 0)

export function summarize(b: Backup): BackupSummary {
  return {
    debts: len(b.data['debts-v1']), notes: len(b.data['notes-v1']),
    lessons: len(b.data['schedule-lessons-v1']), teachers: len(b.data['schedule-teachers-v1']),
  }
}

/** Имя файла: debts-backup-2026-10-17.json (по местной дате) */
export function backupFileName(at: number): string {
  const d = new Date(at)
  const p = (n: number) => String(n).padStart(2, '0')
  return `debts-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`
}
