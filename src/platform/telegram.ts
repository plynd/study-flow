// Путь: src/platform/telegram.ts
// Связка с Telegram Mini App. В обычном браузере ничего не делает: приложение работает так же, как раньше.
import { backDepth, onBackChange, runBack } from './backStack'

interface TgWebApp {
  initData: string
  ready(): void
  expand(): void
  disableVerticalSwipes?(): void
  setHeaderColor?(color: string): void
  setBackgroundColor?(color: string): void
  setBottomBarColor?(color: string): void
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void }
}
declare global { interface Window { Telegram?: { WebApp?: TgWebApp } } }

/** Объект Telegram, только если страницу действительно открыли внутри Telegram (в браузере initData пустой) */
export function getTelegram(): TgWebApp | null {
  const app = window.Telegram?.WebApp
  return app && app.initData ? app : null
}

const attempt = (fn: () => void) => { try { fn() } catch { /* старый клиент Telegram: функции может не быть */ } }

/** Цвет шапки и фона Telegram — как фон приложения, чтобы не было полосы другого цвета */
function paint(app: TgWebApp) {
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
  if (!/^#[0-9a-f]{6}$/i.test(bg)) return
  attempt(() => app.setHeaderColor?.(bg))
  attempt(() => app.setBackgroundColor?.(bg))
  attempt(() => app.setBottomBarColor?.(bg))
}

export function initTelegram() {
  const app = getTelegram()
  if (!app) return
  attempt(() => app.ready())
  attempt(() => app.expand())
  // Листы тянутся вниз пальцем; без этого Telegram принял бы такой жест за «свернуть приложение»
  attempt(() => app.disableVerticalSwipes?.())

  paint(app)
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => paint(app))

  // Кнопка «Назад» Telegram закрывает верхний открытый лист и видна, только пока есть что закрывать
  app.BackButton.onClick(() => { runBack() })
  const sync = () => attempt(() => (backDepth() > 0 ? app.BackButton.show() : app.BackButton.hide()))
  onBackChange(sync)
  sync()
}
