// Путь: src/data/backupIO.ts
// Чтение и запись копии в localStorage. Логика проверки — в domain/backup.ts.
import { BACKUP_KEYS, makeBackup, type Backup } from '../domain/backup'

const K_PREV = 'backup-before-import-v1'

function readKey(key: string): unknown {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? undefined : JSON.parse(raw)
  } catch { return undefined }
}

/** Копия текущих данных */
export const currentBackup = (): Backup => makeBackup(readKey, Date.now())

/** Записать данные из копии и перезапустить приложение (экраны читают хранилище при запуске).
 *  Перед заменой текущие данные откладываются отдельно, чтобы загрузку можно было отменить. */
export function applyBackup(b: Backup): boolean {
  try {
    localStorage.setItem(K_PREV, JSON.stringify(currentBackup()))
    for (const k of BACKUP_KEYS) if (k in b.data) localStorage.setItem(k, JSON.stringify(b.data[k]))
  } catch { return false }
  location.reload()
  return true
}

/** Есть ли данные «до последней загрузки» и когда они были сохранены */
export function previousBackup(): Backup | null {
  const v = readKey(K_PREV)
  return v && typeof v === 'object' ? (v as Backup) : null
}

/** Вернуть данные, которые были до последней загрузки */
export function restorePrevious(): boolean {
  const prev = previousBackup()
  if (!prev) return false
  try {
    for (const k of BACKUP_KEYS) {
      if (k in prev.data) localStorage.setItem(k, JSON.stringify(prev.data[k]))
      else localStorage.removeItem(k)
    }
    localStorage.removeItem(K_PREV)
  } catch { return false }
  location.reload()
  return true
}
