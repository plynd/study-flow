// Путь: src/platform/haptics.ts
// Короткая вибрация-«щелчок» на барабанах, переключателях и переключателях режимов (но не на обычных кнопках).
// Идёт через Telegram (iOS и Android) или navigator.vibrate в браузере на Android; в Safari на iPhone вибрации нет.
// Можно выключить в настройках; выбор хранится только на этом устройстве. Звука нет: громкость страницы не отделить от системной.
import { getTelegram } from './telegram'

export interface Feedback { haptic: boolean }
const KEY = 'tick-feedback-v1'

export function parseFeedback(raw: string | null): Feedback {
  try {
    const v = raw ? (JSON.parse(raw) as Partial<Feedback>) : {}
    return { haptic: v.haptic !== false } // по умолчанию включено (старое поле sound больше не используется)
  } catch { return { haptic: true } }
}

const read = (): Feedback => { try { return parseFeedback(localStorage.getItem(KEY)) } catch { return parseFeedback(null) } }
let state = read()
const listeners = new Set<() => void>()

export const loadFeedback = () => state
export function subscribeFeedback(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb) } }
export function saveFeedback(patch: Partial<Feedback>) {
  state = { ...state, ...patch }
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* без хранилища настройка живёт до перезапуска */ }
  listeners.forEach((l) => l())
}

// ——— щелчок ———
let last = 0

export function tick() {
  const now = performance.now()
  if (now - last < 35) return // при быстром пролистывании не стучим чаще, чем ощущается
  last = now
  try {
    if (!state.haptic) return
    const h = getTelegram()?.HapticFeedback
    if (h) h.selectionChanged()
    else navigator.vibrate?.(6)
  } catch { /* старый клиент или запрет: без вибрации можно жить */ }
}

/**
 * Вибрация на переключателях и переключателях режимов: слушаем страницу целиком, чтобы не вешать вызовы на каждый экран.
 * Обычные кнопки сюда не попадают. Барабаны вызывают tick() сами.
 */
export function installHaptics() {
  document.addEventListener('change', (e) => {
    const el = e.target
    if (el instanceof HTMLInputElement && (el.classList.contains('switch') || el.type === 'range')) tick()
  })
  document.addEventListener('click', (e) => {
    const b = e.target instanceof Element ? e.target.closest('.seg button') : null
    if (b && b.getAttribute('aria-selected') !== 'true') tick() // переключатель режимов: щелчок только при смене пункта
  })
}
