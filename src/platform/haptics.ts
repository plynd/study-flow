// Путь: src/platform/haptics.ts
// «Щелчок» барабана: короткая вибрация и тихий звук, как у барабана в iOS. Вибрация — через Telegram (iOS и Android)
// или navigator.vibrate в браузере на Android; звук — короткий синтезированный тик (Web Audio), файлов нет.
// В Safari на iPhone вибрации нет. Звук на iPhone глушится переключателем «без звука».
// Оба эффекта можно выключить в настройках; выбор хранится только на этом устройстве.
import { getTelegram } from './telegram'

export interface Feedback { haptic: boolean; sound: boolean }
const KEY = 'tick-feedback-v1'

export function parseFeedback(raw: string | null): Feedback {
  try {
    const v = raw ? (JSON.parse(raw) as Partial<Feedback>) : {}
    return { haptic: v.haptic !== false, sound: v.sound !== false } // по умолчанию всё включено
  } catch { return { haptic: true, sound: true } }
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

// ——— звук ———
let ctx: AudioContext | null = null

/** Браузер разрешает звук только после касания пользователя: вызываем из обработчика нажатия (открытие выбора времени) */
export function unlockAudio() {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    ctx ??= new Ctor()
    if (ctx.state === 'suspended') void ctx.resume()
  } catch { /* звука не будет — остальное работает */ }
}

function click() {
  if (!ctx || ctx.state !== 'running') return
  const t = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(2300, t)
  osc.frequency.exponentialRampToValueAtTime(900, t + 0.02) // быстрое падение тона — сухой «тик», а не писк
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(0.16, t + 0.002)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.03)
  osc.connect(gain).connect(ctx.destination)
  osc.start(t)
  osc.stop(t + 0.04)
}

// ——— щелчок ———
let last = 0

export function tick() {
  const now = performance.now()
  if (now - last < 35) return // при быстром пролистывании не стучим чаще, чем ощущается
  last = now
  try {
    if (state.haptic) {
      const h = getTelegram()?.HapticFeedback
      if (h) h.selectionChanged()
      else navigator.vibrate?.(6)
    }
    if (state.sound) click()
  } catch { /* старый клиент или запрет: без обратной связи можно жить */ }
}
