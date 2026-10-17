// Путь: src/screens/DataSheet.tsx
// Лист «Резервная копия»: сохранить данные в файл и загрузить обратно.
import { useState } from 'react'
import Sheet from '../ui/Sheet'
import { applyBackup, currentBackup, previousBackup, restorePrevious } from '../data/backupIO'
import { backupFileName, parseBackup, summarize, type Backup } from '../domain/backup'

const fmt = (at: number) => (at ? new Date(at).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : 'неизвестно когда')

export default function DataSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [pending, setPending] = useState<Backup | null>(null)
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null)
  const prev = open ? previousBackup() : null

  const close = () => { setPending(null); setMsg(null); onClose() }

  function save() {
    const b = currentBackup()
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

  const sum = pending ? summarize(pending) : null

  return (
    <Sheet open={open} onClose={close} title="Резервная копия">
      <p className="footnote" style={{ paddingTop: '.75rem' }}>
        Долги, заметки и расписание хранятся только в этом браузере. Файл копии — способ их не потерять и перенести.
      </p>

      <h3 className="section-title">Сохранить</h3>
      <div className="group">
        <button className="row accent" onClick={save}><span className="row-title">Сохранить в файл</span></button>
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
    </Sheet>
  )
}
