// Путь: src/domain/sync.ts
// Правила синхронизации: что делать с каждым ключом — отправить, забрать или ничего. Без сети и без хранилища.

/** Что известно о ключе на этом устройстве */
export interface KeyMeta {
  /** когда (мс) данные менялись и ещё не ушли на сервер; null — всё отправлено */
  dirtyAt: number | null
  /** метка времени строки на сервере (updated_at), с которой данные совпадали в последний раз */
  remoteAt: string | null
}

export type SyncAction =
  | 'none'
  | 'push'        // отправить на сервер
  | 'pull'        // забрать с сервера
  | 'pull-stash'  // забрать с сервера, а локальную версию сохранить отдельно (был конфликт)

/**
 * Решение по одному ключу. Принцип: ничего не теряем молча.
 *  • есть только здесь — отправляем; есть только там — забираем;
 *  • у нас нет несохранённых правок — берём серверное, если оно новее известного;
 *  • правки есть и на сервере что-то новее — побеждает более поздняя, а проигравшая версия откладывается (stash);
 *  • устройство ещё ни разу не синхронизировалось (remoteAt пуст), а на сервере уже есть данные — выигрывает сервер, наши
 *    откладываем. Иначе пустые значения по умолчанию, которые экраны записывают при первом запуске, затёрли бы чужие данные.
 */
export function planKey(hasLocal: boolean, meta: KeyMeta | undefined, remoteAt: string | null): SyncAction {
  const dirty = meta?.dirtyAt != null
  if (remoteAt === null) return hasLocal ? 'push' : 'none'
  if (!hasLocal) return 'pull'
  if (meta?.remoteAt == null) return 'pull-stash'        // первая встреча: и тут, и там уже что-то есть
  if (!dirty) return meta.remoteAt === remoteAt ? 'none' : 'pull'
  // есть несохранённые правки
  if (meta!.remoteAt === remoteAt) return 'push'         // сервер не менялся с тех пор — просто отправляем
  return meta!.dirtyAt! >= Date.parse(remoteAt) ? 'push' : 'pull-stash'
}

export function planSync(
  keys: readonly string[],
  hasLocal: (k: string) => boolean,
  meta: Record<string, KeyMeta | undefined>,
  remote: Record<string, string | undefined>,
): Record<string, SyncAction> {
  const out: Record<string, SyncAction> = {}
  for (const k of keys) out[k] = planKey(hasLocal(k), meta[k], remote[k] ?? null)
  return out
}

/** Пустое значение по умолчанию ([], {subjects: []}, false, {url: ''}): откладывать его при конфликте незачем */
export function isTrivial(v: unknown): boolean {
  if (v === null || v === undefined || typeof v === 'boolean') return true
  if (typeof v === 'string') return v.trim() === ''
  if (Array.isArray(v)) return v.length === 0
  if (typeof v === 'object') return Object.values(v as object).every(isTrivial)
  return false
}
