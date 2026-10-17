// Путь: src/data/fetchIcs.ts
// Один запрос к нашему серверу за .ics (сервер сам ходит на asu.ru). stop=true — сайт просит остановиться.
import { apiUrl } from './api'

export async function fetchIcs(url: string): Promise<{ text: string } | { error: string; stop: boolean }> {
  try {
    const r = await fetch(apiUrl('ics', { url }))
    if (r.ok) return { text: await r.text() }
    let msg = `Ошибка ${r.status}.`
    try { msg = (await r.json()).error ?? msg } catch { /* не json */ }
    return { error: msg, stop: r.status === 429 }
  } catch {
    return { error: 'Нет связи с сервером приложения (на телефоне — проверь интернет).', stop: true }
  }
}
