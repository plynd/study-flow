// Путь: src/data/notifyApi.ts
// Настройки уведомлений (хранятся как остальные данные и синхронизируются) и пробное сообщение от бота.
import { defaultNotify, isNotifySettings, type NotifySettings } from '../domain/notify'
import { SUPABASE_KEY, SUPABASE_URL, supabase } from './supabase'

const KEY = 'notify-v1'
const FUNCTION = (import.meta.env.VITE_NOTIFY_FUNCTION as string | undefined) || 'notify'

export function loadNotify(): NotifySettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) { const v: unknown = JSON.parse(raw); if (isNotifySettings(v)) return v }
  } catch { /* битое значение — берём настройки по умолчанию */ }
  return defaultNotify()
}

export function saveNotify(s: NotifySettings): void {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  try { localStorage.setItem(KEY, JSON.stringify({ ...s, tz: tz || s.tz })) } catch { /* нет хранилища */ }
}

export type TestResult = { ok: true } | { ok: false; message: string }

/** Попросить бота прислать пробное сообщение (нужен вход через Telegram) */
export async function sendTestNotification(): Promise<TestResult> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return { ok: false, message: 'Сервер не подключён.' }
  const { data } = await supabase().auth.getSession()
  const token = data.session?.access_token
  if (!token) return { ok: false, message: 'Сначала нужен вход через Telegram (см. «Синхронизация»).' }
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${FUNCTION}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: SUPABASE_KEY, authorization: `Bearer ${token}` },
      body: '{}',
    })
    const body = await res.json().catch(() => ({})) as { error?: string; code?: string }
    if (res.ok) return { ok: true }
    if (res.status === 404 || body.code === 'NOT_FOUND') return { ok: false, message: 'Функция notify не найдена на сервере: её нужно создать в Supabase.' }
    return { ok: false, message: body.error ?? `Ошибка (${res.status})` }
  } catch {
    return { ok: false, message: 'Нет связи с сервером.' }
  }
}
