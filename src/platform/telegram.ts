// Путь: src/platform/telegram.ts
// Связка с Telegram Mini App. В обычном браузере ничего не делает: приложение работает так же, как раньше.
import { backDepth, onBackChange, runBack } from './backStack'

interface TgWebApp {
  initData: string
  platform?: string
  isVersionAtLeast?(version: string): boolean
  requestFullscreen?(): void
  exitFullscreen?(): void
  isFullscreen?: boolean
  HapticFeedback?: { selectionChanged(): void }
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

// ——— Размер окна ———
// Размер окна — свойство устройства (на телефоне нужен весь экран, на компьютере большое окно), поэтому хранится
// только здесь и не попадает ни в резервную копию, ни в синхронизацию.
export type WindowSize = 'auto' | 'normal' | 'large' | 'full'
export const WINDOW_SIZE_LABEL: Record<WindowSize, string> = { auto: 'Авто', normal: 'Обычное', large: 'Большое', full: 'Во весь экран' }
const SIZE_KEY = 'window-size-v1'

export function loadWindowSize(): WindowSize {
  try {
    const v = localStorage.getItem(SIZE_KEY)
    return v === 'normal' || v === 'large' || v === 'full' ? v : 'auto'
  } catch { return 'auto' }
}

export function saveWindowSize(s: WindowSize) {
  try { localStorage.setItem(SIZE_KEY, s) } catch { /* хранилище недоступно: настройка не сохранится, это не страшно */ }
}

/** Что значит «Авто» на этом устройстве: телефон и планшет — весь экран, компьютер — большое окно */
export function autoWindowSize(app: Pick<TgWebApp, 'platform'>): Exclude<WindowSize, 'auto'> {
  return app.platform === 'ios' || app.platform === 'android' ? 'full' : 'large'
}

/** Применить размер. Окно можно раскрыть и вернуть из полного экрана; обратно сжать раскрытое окно Telegram не даёт — до следующего открытия */
export function applyWindowSize(size: WindowSize) {
  const app = getTelegram()
  if (!app) return
  const want = size === 'auto' ? autoWindowSize(app) : size
  if (want === 'full') {
    if (app.isVersionAtLeast?.('8.0')) attempt(() => app.requestFullscreen?.())
    else attempt(() => app.expand())
    return
  }
  if (app.isFullscreen) attempt(() => app.exitFullscreen?.())
  if (want === 'large') attempt(() => app.expand())
}

export function initTelegram() {
  const app = getTelegram()
  if (!app) return
  document.documentElement.classList.add('tg')
  attempt(() => app.ready())
  attempt(() => app.expand())
  applyWindowSize(loadWindowSize())
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
