// Путь: supabase/functions/notify/index.ts
// Уведомления от бота. Функцию раз в 5 минут вызывает планировщик Supabase (supabase/notify.sql):
// она смотрит данные каждого пользователя, находит, что пора отправить, и пишет ему в Telegram.
// Ещё её вызывает приложение (кнопка «Отправить пробное»): тогда приходит сессия пользователя, а не секрет планировщика.
//
// Секреты (Edge Functions → Secrets): TELEGRAM_BOT_TOKEN, CRON_SECRET (любая длинная случайная строка).
// SUPABASE_URL, SUPABASE_ANON_KEY и SUPABASE_SERVICE_ROLE_KEY Supabase подставляет сам.
// В настройках функции выключить «Verify JWT»: подлинность проверяем сами (секрет или сессия).
//
// В редактор Supabase вставляется собранный файл function.js (npm run build:notify), а не этот.
import type { Debt } from '../../../src/domain/debts'
import {
  type DebtCtx, type Message, dayText, defaultNotify, dueWindowReminders, isNotifySettings, localNow, notifyEnabled, summaryDue, validTz,
} from '../../../src/domain/notify'
import { addDays, emptyHidden, type Hidden, type Lesson } from '../../../src/domain/schedule'
import type { TeacherCal } from '../../../src/domain/teachers'

const KEYS = ['debts-v1', 'schedule-lessons-v1', 'schedule-hidden-v1', 'schedule-teachers-v1', 'notify-v1']

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])

/** Что отправить одному пользователю прямо сейчас. Чистая функция: данные и время приходят снаружи. */
export function planForUser(rows: Record<string, unknown>, sent: ReadonlySet<string>, nowMs: number): Message[] {
  const raw = rows['notify-v1']
  if (!isNotifySettings(raw)) return []
  const settings = { ...defaultNotify(), ...raw, tz: validTz(raw.tz) ? raw.tz : defaultNotify().tz }
  if (!notifyEnabled(settings)) return []

  const hiddenRaw = rows['schedule-hidden-v1'] as Hidden | undefined
  const ctx: DebtCtx = {
    lessons: arr<Lesson>(rows['schedule-lessons-v1']),
    hidden: hiddenRaw && Array.isArray(hiddenRaw.subjects) ? { ...emptyHidden(), ...hiddenRaw } : emptyHidden(),
    teachers: arr<TeacherCal>(rows['schedule-teachers-v1']),
    debts: arr<Debt>(rows['debts-v1']),
  }
  const now = localNow(nowMs, settings.tz)
  const out: Message[] = dueWindowReminders(ctx, now, settings.before, sent)

  // Если слать нечего, всё равно запоминаем, что за этот день решили: не пересчитывать каждые 5 минут
  const morning = summaryDue('morning', settings, now, sent)
  if (morning) out.push({ key: morning, text: dayText(now.date, 'Сегодня', ctx) ?? '' })
  const evening = summaryDue('evening', settings, now, sent)
  if (evening) out.push({ key: evening, text: dayText(addDays(now.date, 1), 'Завтра', ctx) ?? '' })
  return out
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info, x-cron-secret',
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json; charset=utf-8' } })

// deno-lint-ignore no-explicit-any
const env = (name: string): string | undefined => (globalThis as any).Deno?.env.get(name)

const tgIdOf = (email: string | undefined, meta: Record<string, unknown> | undefined): number | null => {
  if (typeof meta?.tg_id === 'number') return meta.tg_id
  const m = /^tg(\d+)@/.exec(email ?? '')
  return m ? Number(m[1]) : null
}

async function sendTelegram(token: string, chatId: number, text: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, link_preview_options: { is_disabled: true } }),
  })
  if (res.ok) return { ok: true }
  const body = await res.json().catch(() => ({})) as { description?: string }
  return { ok: false, error: body.description ?? `Telegram ответил ${res.status}` }
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json(405, { error: 'Только POST.' })

  const token = env('TELEGRAM_BOT_TOKEN')
  const url = env('SUPABASE_URL')
  const anon = env('SUPABASE_ANON_KEY')
  const service = env('SUPABASE_SERVICE_ROLE_KEY')
  const cronSecret = env('CRON_SECRET')
  if (!token || !url || !anon || !service) return json(500, { error: 'Функция не настроена: нет секретов.' })

  const admin = { apikey: service, authorization: `Bearer ${service}`, 'content-type': 'application/json' }
  const rest = (path: string, init?: RequestInit) => fetch(`${url}/rest/v1/${path}`, { ...init, headers: { ...admin, ...(init?.headers as object) } })

  // ——— пробное сообщение из приложения: по сессии пользователя ———
  const bearer = /^Bearer (.+)$/.exec(req.headers.get('authorization') ?? '')?.[1]
  const cronHeader = req.headers.get('x-cron-secret')
  const isCron = !!cronSecret && cronHeader === cronSecret
  if (!isCron) {
    if (!bearer) return json(401, { error: 'Нет входа.' })
    const who = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, authorization: `Bearer ${bearer}` } })
    if (!who.ok) return json(401, { error: 'Сессия не подошла. Открой приложение в Telegram заново.' })
    const u = await who.json() as { email?: string; user_metadata?: Record<string, unknown> }
    const chat = tgIdOf(u.email, u.user_metadata)
    if (!chat) return json(400, { error: 'Не найден Telegram-аккаунт.' })
    const r = await sendTelegram(token, chat, '✅ Уведомления работают. Это пробное сообщение.')
    return r.ok
      ? json(200, { ok: true })
      : json(502, { error: `Бот не смог написать: ${r.error}. Открой чат с ботом и нажми «Запустить» (Start).` })
  }

  // ——— плановая проверка всех пользователей ———
  const dataRes = await rest(`user_data?select=user_id,key,value&key=in.(${KEYS.join(',')})`)
  if (!dataRes.ok) return json(502, { error: 'Не удалось прочитать данные.', detail: (await dataRes.text()).slice(0, 300) })
  const byUser = new Map<string, Record<string, unknown>>()
  for (const r of await dataRes.json() as { user_id: string; key: string; value: unknown }[]) {
    byUser.set(r.user_id, { ...byUser.get(r.user_id), [r.key]: r.value })
  }

  const since = new Date(Date.now() - 3 * 86400_000).toISOString()
  const sentRes = await rest(`notify_sent?select=user_id,key&sent_at=gt.${since}`)
  const sentBy = new Map<string, Set<string>>()
  if (sentRes.ok) for (const r of await sentRes.json() as { user_id: string; key: string }[]) {
    sentBy.set(r.user_id, (sentBy.get(r.user_id) ?? new Set()).add(r.key))
  }

  const now = Date.now()
  const report: { user: string; sent: number; failed?: string }[] = []
  for (const [userId, rows] of byUser) {
    const messages = planForUser(rows, sentBy.get(userId) ?? new Set(), now)
    if (messages.length === 0) continue

    const ures = await fetch(`${url}/auth/v1/admin/users/${userId}`, { headers: admin })
    const u = ures.ok ? await ures.json() as { email?: string; user_metadata?: Record<string, unknown> } : null
    const chat = u ? tgIdOf(u.email, u.user_metadata) : null
    if (!chat) { report.push({ user: userId, sent: 0, failed: 'нет Telegram-аккаунта' }); continue }

    let count = 0
    for (const m of messages) {
      if (m.text) {
        const r = await sendTelegram(token, chat, m.text)
        if (!r.ok) { report.push({ user: userId, sent: count, failed: r.error }); break }
        count++
      }
      // запоминаем после отправки: лучше редкий повтор, чем потерянное сообщение
      await rest('notify_sent', { method: 'POST', headers: { prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify({ user_id: userId, key: m.key }) })
    }
    report.push({ user: userId, sent: count })
  }

  await rest(`notify_sent?sent_at=lt.${new Date(now - 7 * 86400_000).toISOString()}`, { method: 'DELETE' })
  return json(200, { ok: true, report })
}

// deno-lint-ignore no-explicit-any
const deno = (globalThis as any).Deno
if (deno?.serve) deno.serve(handler)
