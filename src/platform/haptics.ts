// Путь: src/platform/haptics.ts
// Короткая вибрация «щелчка» при перелистывании барабана. В Telegram — его собственная обратная связь (iOS и Android),
// в обычном браузере на Android — navigator.vibrate. В Safari на iPhone и на компьютере вибрации нет, там ничего не происходит.
import { getTelegram } from './telegram'

let last = 0

export function tick() {
  const now = performance.now()
  if (now - last < 35) return // при быстром пролистывании не стучим чаще, чем ощущается
  last = now
  try {
    const h = getTelegram()?.HapticFeedback
    if (h) h.selectionChanged()
    else navigator.vibrate?.(6)
  } catch { /* старый клиент или запрет: без вибрации можно жить */ }
}
