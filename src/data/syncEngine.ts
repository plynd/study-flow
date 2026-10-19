// Путь: src/data/syncEngine.ts
// Синхронизация локального хранилища с Supabase. Приложение по-прежнему читает и пишет localStorage,
// а этот модуль замечает записи, отправляет их на сервер и забирает чужие изменения. Решения — в domain/sync.ts.
import { useSyncExternalStore } from 'react'
import { BACKUP_KEYS, type Backup, BACKUP_APP, BACKUP_VERSION } from '../domain/backup'
import { isTrivial, planSync, type KeyMeta } from '../domain/sync'
import { ensureSession } from './auth'
import { supabase, supabaseConfigured } from './supabase'

const K_META = 'sync-meta-v1'          // что отправлено, а что нет (не входит в копию и не синхронизируется)
const K_STASH = 'sync-conflicts-v1'    // версии, замещённые при конфликте, чтобы ничего не терять молча
const PUSH_DELAY_MS = 1500
const RETRY_MS = 30_000
const PULL_EVERY_MS = 30_000

interface Row { key: string; value: unknown; updated_at: string }

export type SyncStatus = 'off' | 'connecting' | 'synced' | 'saving' | 'offline' | 'error'
export interface SyncState { status: SyncStatus; at?: number; message?: string }

// ——— состояние для интерфейса ———
let state: SyncState = { status: 'off' }
const listeners = new Set<() => void>()
const setState = (s: SyncState) => { state = s; listeners.forEach((l) => l()) }
export const getSyncState = () => state
export function useSyncState(): SyncState {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l) } }, getSyncState)
}

// ——— хранилище служебных данных ———
const isKey = (k: string): boolean => (BACKUP_KEYS as readonly string[]).includes(k)
function readJson<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback } catch { return fallback }
}
const writeJson = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* нет места или хранилища */ } }

const readMeta = () => readJson<Record<string, KeyMeta>>(K_META, {})
const writeMeta = (m: Record<string, KeyMeta>) => writeJson(K_META, m)

/** Версии, замещённые при конфликте, в виде обычной копии (чтобы её можно было сохранить и загрузить) */
export function stashedBackup(): Backup | null {
  const s = readJson<Record<string, { value: unknown; at: number }>>(K_STASH, {})
  const keys = Object.keys(s)
  if (!keys.length) return null
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: Math.max(...keys.map((k) => s[k].at)), data: Object.fromEntries(keys.map((k) => [k, s[k].value])) }
}
export const clearStash = () => { try { localStorage.removeItem(K_STASH) } catch { /* ничего */ } }

// ——— слежение за записями ———
let applying = false  // мы сами пишем данные с сервера, это не «правка пользователя»
let pushTimer: ReturnType<typeof setTimeout> | undefined
let ready = false     // есть сессия, можно ходить на сервер
let mounted = false   // интерфейс уже показан: забранные данные придётся применять перезагрузкой

export const markMounted = () => { mounted = true }

function markDirty(key: string) {
  const meta = readMeta()
  meta[key] = { dirtyAt: Date.now(), remoteAt: meta[key]?.remoteAt ?? null }
  writeMeta(meta)
  schedulePush(PUSH_DELAY_MS)
}

function watchWrites() {
  const proto = Storage.prototype
  const original = proto.setItem
  proto.setItem = function (this: Storage, key: string, value: string) {
    const tracked = this === localStorage && isKey(key) && !applying
    const changed = tracked && this.getItem(key) !== String(value)
    original.call(this, key, value)
    if (changed) markDirty(key)
  }
}

// ——— отправка ———
function schedulePush(delay: number) {
  clearTimeout(pushTimer)
  pushTimer = setTimeout(() => { void pushDirty() }, delay)
}

const failure = (e: unknown): SyncState =>
  navigator.onLine === false || e instanceof TypeError
    ? { status: 'offline', message: 'Нет связи, отправлю позже' }
    : { status: 'error', message: e instanceof Error ? e.message : 'Ошибка синхронизации' }

async function pushDirty(): Promise<void> {
  if (!ready) return
  const meta = readMeta()
  const sent = Object.keys(meta).filter((k) => isKey(k) && meta[k].dirtyAt != null && localStorage.getItem(k) !== null)
  if (!sent.length) { setState({ status: 'synced', at: state.at ?? Date.now() }); return }

  const snapshot = Object.fromEntries(sent.map((k) => [k, meta[k].dirtyAt]))
  setState({ status: 'saving', at: state.at })
  try {
    const sb = supabase()
    const { data: u } = await sb.auth.getUser()
    if (!u.user) throw new Error('Нет входа')
    const rows = sent.map((k) => ({ user_id: u.user.id, key: k, value: JSON.parse(localStorage.getItem(k)!) }))
    const { data, error } = await sb.from('user_data').upsert(rows, { onConflict: 'user_id,key' }).select('key,updated_at')
    if (error) throw new Error(error.message)

    const now = readMeta()
    for (const row of data ?? []) {
      const m = now[row.key] ?? { dirtyAt: null, remoteAt: null }
      // если за время отправки данные снова изменили, правка остаётся «неотправленной»
      now[row.key] = { dirtyAt: m.dirtyAt === snapshot[row.key] ? null : m.dirtyAt, remoteAt: row.updated_at }
    }
    writeMeta(now)
    setState({ status: 'synced', at: Date.now() })
    if (Object.values(now).some((m) => m.dirtyAt != null)) schedulePush(PUSH_DELAY_MS)
  } catch (e) {
    setState(failure(e))
    schedulePush(RETRY_MS)
  }
}

// ——— получение ———
export async function syncNow(): Promise<void> {
  if (!ready) return
  try {
    const { data, error } = await supabase().from('user_data').select('key,value,updated_at')
    if (error) throw new Error(error.message)

    const remote: Record<string, Row> = Object.fromEntries(((data ?? []) as Row[]).filter((r) => isKey(r.key)).map((r) => [r.key, r]))
    const meta = readMeta()
    const plan = planSync(BACKUP_KEYS, (k) => localStorage.getItem(k) !== null, meta,
      Object.fromEntries(Object.entries(remote).map(([k, r]) => [k, r.updated_at])))

    const stash = readJson<Record<string, { value: unknown; at: number }>>(K_STASH, {})
    let applied = false
    for (const k of BACKUP_KEYS) {
      const action = plan[k]
      if (action === 'push' && meta[k]?.dirtyAt == null) meta[k] = { dirtyAt: Date.now(), remoteAt: meta[k]?.remoteAt ?? null }
      if (action !== 'pull' && action !== 'pull-stash') continue
      if (action === 'pull-stash') {
        try {
          const local: unknown = JSON.parse(localStorage.getItem(k)!)
          if (!isTrivial(local)) stash[k] = { value: local, at: Date.now() }
        } catch { /* битое значение не откладываем */ }
      }
      applying = true
      try { localStorage.setItem(k, JSON.stringify(remote[k].value)) } finally { applying = false }
      meta[k] = { dirtyAt: null, remoteAt: remote[k].updated_at }
      applied = true
    }
    writeMeta(meta)
    if (Object.keys(stash).length) writeJson(K_STASH, stash)

    setState({ status: 'synced', at: Date.now() })
    if (Object.values(meta).some((m) => m.dirtyAt != null)) await pushDirty()
    if (applied && mounted) location.reload()   // экраны читают хранилище при запуске
  } catch (e) {
    setState(failure(e))
  }
}

// ——— запуск ———
let lastPull = 0
function pullSoon() {
  if (!ready || document.visibilityState !== 'visible' || Date.now() - lastPull < PULL_EVERY_MS) return
  lastPull = Date.now()
  void syncNow()
}

let listening = false

/** Вход и первая синхронизация. Можно вызывать повторно: кнопка «Синхронизировать сейчас» после ошибки входа делает именно это. */
async function connect(): Promise<void> {
  setState({ status: 'connecting' })
  const auth = await ensureSession().catch(() => ({ ok: false as const, reason: 'failed' as const, message: 'Не удалось войти' }))
  if (!auth.ok) {
    setState(auth.reason === 'no-telegram' ? { status: 'off', message: 'Вход пока только через Telegram' } : { status: 'error', message: auth.message })
    return
  }
  ready = true
  lastPull = Date.now()
  if (!listening) {
    listening = true
    document.addEventListener('visibilitychange', pullSoon)
    window.addEventListener('online', () => { lastPull = 0; pullSoon() })
  }
  await syncNow()
}

/** Вызывается один раз при старте, до показа интерфейса. Ничего не бросает: без сети приложение работает с локальными данными. */
export async function initSync(): Promise<void> {
  if (!supabaseConfigured) return
  watchWrites()
  await connect()
}

/** Кнопка «Синхронизировать сейчас»: если входа ещё нет, пробуем войти заново, иначе просто обновляем данные */
export async function retrySync(): Promise<void> {
  if (!supabaseConfigured) return
  if (ready) await syncNow()
  else await connect()
}
