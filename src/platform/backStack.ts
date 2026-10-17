// Путь: src/platform/backStack.ts
// Стек «что закрыть по кнопке „Назад“»: открытый лист, потом что-то ещё. Не зависит ни от React, ни от Telegram.
type Handler = () => void

const stack: Handler[] = []
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

/** Добавляет действие «Назад»; возвращает функцию, которая его убирает */
export function pushBack(handler: Handler): () => void {
  stack.push(handler)
  notify()
  return () => {
    const i = stack.lastIndexOf(handler)
    if (i >= 0) stack.splice(i, 1)
    notify()
  }
}

export const backDepth = () => stack.length

/** Выполняет верхнее действие. false — стек пуст, «Назад» делать нечего */
export function runBack(): boolean {
  const top = stack[stack.length - 1]
  if (!top) return false
  top()
  return true
}

/** Подписка на изменения: нужна, чтобы показывать и прятать кнопку Telegram */
export function onBackChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
