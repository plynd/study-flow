// Путь: src/screens/DataScreen.tsx
// Вкладка «Данные»: синхронизация и резервная копия (сохранить в файл и загрузить обратно).
import { useState } from 'react'
import { applyBackup, currentBackup, previousBackup, restorePrevious } from '../data/backupIO'
import { backupFileName, parseBackup, summarize, type Backup } from '../domain/backup'
import { loadNotify, saveNotify, sendTestNotification } from '../data/notifyApi'
import { BEFORE_OPTIONS, type NotifySettings } from '../domain/notify'
import { clearStash, retrySync, stashedBackup, useSyncState } from '../data/syncEngine'

const fmt = (at: number) => (at ? new Date(at).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : 'неизвестно когда')

const syncTitle = (st: string) => ({
  off: 'Не подключена', connecting: 'Подключаюсь…', synced: 'Данные синхронизированы', saving: 'Сохраняю…', offline: 'Нет связи', error: 'Ошибка синхронизации',
} as Record<string, string>)[st] ?? st

function syncSub(st: string, at?: number, message?: string): string {
  if (st === 'synced' && at) return `Последний раз: ${new Date(at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}. Одинаково в Telegram и на других устройствах.`
  if (st === 'off') return message ?? 'Данные хранятся только на этом устройстве.'
  return message ?? ''
}

export default function DataScreen({ active }: { active: boolean }) {
  const [pending, setPending] = useState<Backup | null>(null)
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null)
  const prev = active ? previousBackup() : null
  const sync = useSyncState()
  const [, bump] = useState(0)
  const [nt, setNt] = useState<NotifySettings>(loadNotify)
  const [testing, setTesting] = useState(false)
  const [testMsg, setTestMsg] = useState<{ text: string; error?: boolean } | null>(null)
  const stash = active ? stashedBackup() : null

  function save(b: Backup = currentBackup()) {
    const blob = new Blob([JSON.stringify(b, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = backupFileName(b.exportedAt)
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    setMsg({ text: 'Файл сохранён. Если он не появился в загрузках, нажми «Скопировать текстом» и вставь в заметки или сообщение себе.' })
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(currentBackup()))
      setMsg({ text: 'Скопировано. Вставь куда-нибудь, где это не потеряется. Загрузить обратно можно только файлом .json.' })
    } catch { setMsg({ text: 'Не удалось скопировать. Используй «Сохранить в файл».', error: true }) }
  }

  async function pick(file: File | undefined) {
    if (!file) return
    const r = parseBackup(await file.text())
    if (r.ok) { setPending(r.backup); setMsg(null) } else { setPending(null); setMsg({ text: r.error, error: true }) }
  }

  const patchNt = (p: Partial<NotifySettings>) => { const next = { ...nt, ...p }; setNt(next); saveNotify(next) }
  const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
  const setTime = (field: 'morningAt' | 'eveningAt', v: string) => {
    const [h, m] = v.split(':').map(Number)
    if (Number.isFinite(h) && Number.isFinite(m)) patchNt({ [field]: h * 60 + m })
  }

  async function test() {
    setTesting(true); setTestMsg(null)
    const r = await sendTestNotification()
    setTesting(false)
    setTestMsg(r.ok ? { text: 'Отправлено. Загляни в чат с ботом.' } : { text: r.message, error: true })
  }

  const sum = pending ? summarize(pending) : null

  return (
    <main>
      <header className="navbar">
        <h1 className="large-title">Данные</h1>
      </header>
      <p className="caption subtitle">Синхронизация и резервная копия</p>

      <div className="data-wrap">
      <h3 className="section-title">Синхронизация</h3>
      <div className="group">
        <div className="row">
          <span className="row-main">
            <span className="row-title">{syncTitle(sync.status)}</span>
            <span className="row-sub">{syncSub(sync.status, sync.at, sync.message)}</span>
          </span>
        </div>
        {(sync.status === 'synced' || sync.status === 'offline' || sync.status === 'error') && (
          <button className="row accent" onClick={() => { void retrySync() }}><span className="row-title">Синхронизировать сейчас</span></button>
        )}
      </div>
      {stash && (
        <>
          <p className="footnote">
            При синхронизации часть данных на этом устройстве заменили более новыми с сервера. Прежние версии не пропали, их можно сохранить в файл.
          </p>
          <div className="group">
            <button className="row accent" onClick={() => save(stash)}><span className="row-title">Сохранить замещённые данные</span></button>
            <button className="row danger" onClick={() => { clearStash(); bump((n) => n + 1) }}><span className="row-title">Удалить замещённые данные</span></button>
          </div>
        </>
      )}

      <h3 className="section-title">Уведомления</h3>
      <div className="group">
        <label className="row">
          <span className="row-main">
            <span className="row-title">Утром: у кого сегодня пары</span>
            <span className="row-sub">Преподаватели, которым должен сдать долги</span>
          </span>
          <input type="checkbox" role="switch" className="switch" checked={nt.morning} onChange={(e) => patchNt({ morning: e.target.checked })} />
        </label>
        {nt.morning && (
          <label className="row">
            <span className="row-main"><span className="row-title">Время утреннего</span></span>
            <input type="time" className="input boxed" style={{ width: 'auto' }} value={hhmm(nt.morningAt)} onChange={(e) => setTime('morningAt', e.target.value)} />
          </label>
        )}
        <label className="row">
          <span className="row-main">
            <span className="row-title">Вечером: то же на завтра</span>
            <span className="row-sub">Чтобы заранее решить, когда идти</span>
          </span>
          <input type="checkbox" role="switch" className="switch" checked={nt.evening} onChange={(e) => patchNt({ evening: e.target.checked })} />
        </label>
        {nt.evening && (
          <label className="row">
            <span className="row-main"><span className="row-title">Время вечернего</span></span>
            <input type="time" className="input boxed" style={{ width: 'auto' }} value={hhmm(nt.eveningAt)} onChange={(e) => setTime('eveningAt', e.target.value)} />
          </label>
        )}
        <label className="row">
          <span className="row-main">
            <span className="row-title">Перед парой преподавателя</span>
            <span className="row-sub">Только если у тебя в это время нет своей пары</span>
          </span>
          <select className="input boxed" style={{ width: 'auto' }} value={nt.before} onChange={(e) => patchNt({ before: +e.target.value })}>
            {BEFORE_OPTIONS.map((m) => <option key={m} value={m}>{m === 0 ? 'Выключено' : `за ${m} мин`}</option>)}
          </select>
        </label>
        <button className="row accent" disabled={testing} onClick={() => { void test() }}>
          <span className="row-title">{testing ? 'Отправляю…' : 'Отправить пробное сообщение'}</span>
        </button>
      </div>
      {testMsg && <p className={`footnote ${testMsg.error ? 'err-text' : ''}`}>{testMsg.text}</p>}
      <p className="footnote">
        Присылает бот про преподавателей из твоих незакрытых долгов: нужна фамилия в поле «Преподаватель» долга и тот же преподаватель в расписании. Один раз открой чат с ботом и нажми «Запустить». Расписание берётся из последнего обновления в приложении.
      </p>

      <p className="footnote">
        Файл копии — запасной способ не потерять данные и перенести их куда угодно.
      </p>

      <h3 className="section-title">Сохранить</h3>
      <div className="group">
        <button className="row accent" onClick={() => save()}><span className="row-title">Сохранить в файл</span></button>
        <button className="row accent" onClick={copy}><span className="row-title">Скопировать текстом</span></button>
      </div>

      <h3 className="section-title">Загрузить</h3>
      <div className="group">
        <label className="row accent">
          <span className="row-title">Загрузить из файла</span>
          <input type="file" accept=".json,application/json" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
        </label>
      </div>

      {sum && pending && (
        <>
          <h3 className="section-title">Что в файле</h3>
          <div className="group">
            <div className="row"><span className="row-title">Копия от {fmt(pending.exportedAt)}</span></div>
            <div className="row"><span className="row-sub">
              Долгов: {sum.debts} · заметок: {sum.notes} · пар в расписании: {sum.lessons} · преподавателей: {sum.teachers}
            </span></div>
            <button className="row danger" onClick={() => { if (!applyBackup(pending)) setMsg({ text: 'Не удалось записать данные.', error: true }) }}>
              <span className="row-title strong">Заменить текущие данные</span>
            </button>
          </div>
          <p className="footnote">Всё, что есть сейчас, будет заменено данными из файла. Прежние данные сохранятся, и их можно вернуть здесь же.</p>
        </>
      )}

      {prev && !pending && (
        <>
          <h3 className="section-title">Отмена</h3>
          <div className="group">
            <button className="row accent" onClick={() => { if (!restorePrevious()) setMsg({ text: 'Не удалось вернуть данные.', error: true }) }}>
              <span className="row-title">Вернуть данные, что были до загрузки</span>
            </button>
          </div>
          <p className="footnote">Сохранены {fmt(prev.exportedAt)}.</p>
        </>
      )}

      {msg && <p className={`footnote ${msg.error ? 'err-text' : ''}`}>{msg.text}</p>}
      </div>
    </main>
  )
}
