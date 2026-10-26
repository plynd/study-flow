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
  onEvent?(event: string, cb: () => void): void
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
// Размер окна — свойство устройства (на телефоне нужен весь экран, на компьютере обычное окно), поэтому хранится
// только здесь и не попадает ни в резервную копию, ни в синхронизацию.
// Приложение не может менять размер окна Telegram на компьютере (expand() там ничего не делает), поэтому выбор один:
// обычное окно или весь экран. Если переключить полный экран кнопкой самого Telegram, приложение запоминает и это.
export type WindowSize = 'auto' | 'normal' | 'full'
export const WINDOW_SIZE_LABEL: Record<WindowSize, string> = { auto: 'Авто', normal: 'Обычное', full: 'Во весь экран' }
const SIZE_KEY = 'window-size-v1'
const sizeListeners = new Set<() => void>()

export function loadWindowSize(): WindowSize {
  try {
    const v = localStorage.getItem(SIZE_KEY)
    return v === 'normal' || v === 'full' ? v : 'auto' // старое «большое» больше не существует: считаем «авто»
  } catch { return 'auto' }
}

export function saveWindowSize(s: WindowSize) {
  try { localStorage.setItem(SIZE_KEY, s) } catch { /* хранилище недоступно: настройка не сохранится, это не страшно */ }
  sizeListeners.forEach((l) => l())
}

/** Подписка на смену сохранённого размера (для экрана настроек) */
export function subscribeWindowSize(cb: () => void) {
  sizeListeners.add(cb)
  return () => { sizeListeners.delete(cb) }
}

/** Что значит «Авто»: телефон и планшет — весь экран; на компьютере размер не трогаем — какой окно сделал Telegram или ты сам, потянув за край */
export function autoWindowSize(app: Pick<TgWebApp, 'platform'>): Exclude<WindowSize, 'auto'> {
  return app.platform === 'ios' || app.platform === 'android' ? 'full' : 'normal'
}

/**
 * Применить размер. Окно на компьютере приложение менять не умеет: expand() там ничего не делает, а размер окна задаёт сам Telegram.
 * Поэтому доступно только «весь экран» и возврат из него.
 */
let ownChangeAt = 0 // когда приложение само меняло размер: события Telegram сразу после этого не считаем действием пользователя

/** Пользователь переключил полный экран кнопкой самого Telegram — запоминаем его выбор */
function rememberFullscreen(app: TgWebApp) {
  if (Date.now() - ownChangeAt < 1500) return
  saveWindowSize(app.isFullscreen ? 'full' : 'normal')
}

export function applyWindowSize(size: WindowSize) {
  const app = getTelegram()
  if (!app) return
  ownChangeAt = Date.now()
  const want = size === 'auto' ? autoWindowSize(app) : size
  if (want === 'full') {
    if (app.isVersionAtLeast?.('8.0')) attempt(() => app.requestFullscreen?.())
    else attempt(() => app.expand())
    return
  }
  if (app.isFullscreen) attempt(() => app.exitFullscreen?.())
}

export function initTelegram() {
  const app = getTelegram()
  if (!app) return
  document.documentElement.classList.add('tg')
  attempt(() => app.ready())
  attempt(() => app.expand())
  applyWindowSize(loadWindowSize())
  attempt(() => app.onEvent?.('fullscreenChanged', () => rememberFullscreen(app)))
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
