// Путь: src/data/api.ts
// Адрес серверных функций. Локально и без настройки — свои `/api/…` (их отдаёт Vite).
// Если задан VITE_API_BASE (адрес функции в Yandex Cloud), запросы идут туда: asu.ru не отвечает на зарубежные адреса,
// а у Yandex Cloud серверы в России.
export type ApiName = 'ics' | 'directory' | 'search'

export function apiUrl(name: ApiName, params: Record<string, string | number>, base = import.meta.env.VITE_API_BASE as string | undefined): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) q.set(k, String(v))
  if (!base) return `/api/${name}?${q}`
  // без integration=raw: так Yandex передаёт в функцию HTTP-запрос со всеми параметрами (в raw приходит только тело)
  return `${base.replace(/\/+$/, '')}?route=${name}&${q}`
}
