// Путь: src/domain/sources.ts
// Источники расписания: проверка ссылок, пауза между обновлениями, «обновлено N мин назад».

export const COOLDOWN_MS = 30 * 60 * 1000 // не чаще раза в 30 минут на источник
export const PAUSE_MS = 1500 // пауза между запросами к сайту

export type UrlCheck = { ok: true; url: string } | { ok: false; reason: string }

/** Пускаем только ссылки вида https://www.asu.ru/timetable/…/?file=<число>.ics */
export function validateIcsUrl(input: string): UrlCheck {
  let u: URL
  try { u = new URL(input.trim()) } catch { return { ok: false, reason: 'Это не ссылка.' } }
  if (u.protocol !== 'https:') return { ok: false, reason: 'Нужна ссылка https://.' }
  if (u.hostname !== 'www.asu.ru' && u.hostname !== 'asu.ru') return { ok: false, reason: 'Ссылка должна вести на asu.ru.' }
  if (u.port || u.username || u.password) return { ok: false, reason: 'Ссылка выглядит подозрительно.' }
  if (!u.pathname.startsWith('/timetable/')) return { ok: false, reason: 'Ссылка должна вести в раздел /timetable/.' }
  const q = [...u.searchParams.entries()]
  if (q.length !== 1 || q[0][0] !== 'file' || !/^\d+\.ics$/.test(q[0][1])) {
    return { ok: false, reason: 'Нужна ссылка на файл расписания: …/?file=ЧИСЛО.ics.' }
  }
  return { ok: true, url: `https://${u.hostname}${u.pathname}?file=${q[0][1]}` }
}

export const canRefresh = (updatedAt: number | undefined, now: number) =>
  updatedAt === undefined || now - updatedAt >= COOLDOWN_MS

export const minutesLeft = (updatedAt: number, now: number) =>
  Math.max(1, Math.ceil((COOLDOWN_MS - (now - updatedAt)) / 60000))

export function agoText(updatedAt: number | undefined, now: number): string {
  if (updatedAt === undefined) return 'ещё не обновлялось'
  const m = Math.floor((now - updatedAt) / 60000)
  if (m < 1) return 'обновлено только что'
  if (m < 60) return `обновлено ${m} мин назад`
  const h = Math.floor(m / 60)
  if (h < 24) return `обновлено ${h} ч назад`
  return `обновлено ${Math.floor(h / 24)} дн. назад`
}

/** По адресу видно, что это страница преподавателя: /timetable/lecturers/… */
export const isLecturerUrl = (input: string) => /\/timetable\/lecturers\//.test(input)
