// Путь: src/data/auth.ts
// Вход: сессия Supabase либо уже сохранена, либо выдаётся функцией telegram-auth по подписанным данным Telegram.
import { getTelegram } from '../platform/telegram'
import { SUPABASE_KEY, SUPABASE_URL, supabase } from './supabase'

export type AuthResult = { ok: true } | { ok: false; reason: 'no-telegram' | 'failed'; message?: string }

export async function ensureSession(): Promise<AuthResult> {
  const sb = supabase()
  const { data } = await sb.auth.getSession()
  if (data.session) return { ok: true }

  const tg = getTelegram()
  if (!tg) return { ok: false, reason: 'no-telegram' }

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/telegram-auth`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: SUPABASE_KEY! },
      body: JSON.stringify({ initData: tg.initData }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, reason: 'failed', message: body.error ?? `Ошибка входа (${res.status})` }
    const { error } = await sb.auth.setSession({ access_token: body.access_token, refresh_token: body.refresh_token })
    return error ? { ok: false, reason: 'failed', message: error.message } : { ok: true }
  } catch {
    return { ok: false, reason: 'failed', message: 'Функция входа telegram-auth не отвечает: проверь, что она задеплоена и у неё выключен Verify JWT' }
  }
}
