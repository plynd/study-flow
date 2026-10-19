// Путь: src/screens/NotesScreen.tsx
import { useEffect, useMemo, useState } from 'react'
import { filterNotes, fmtNoteDate, isEmptyNote, noteTitle, notePreview, sortNotes, type Note } from '../domain/notes'
import { readDebts } from '../data/readDebts'
import Sheet from '../ui/Sheet'
import Toast from '../ui/Toast'
import DataButton from '../ui/DataButton'
import { makeNotice, type Notice } from '../ui/notice'
import { IconPin, IconPlus } from '../ui/icons'

const KEY = 'notes-v1'
const uid = () => Math.random().toString(36).slice(2, 9)

function load(): Note[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as Note[]
  } catch { /* без хранилища работаем из памяти */ }
  return []
}

export default function NotesScreen({ active = true }: { active?: boolean }) {
  const [notes, setNotes] = useState<Note[]>(load)
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(notes)) } catch { /* ignore */ }
  }, [notes])
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  // долги нужны, чтобы привязать заметку; перечитываем, когда вкладку открыли
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debts = useMemo(() => readDebts(), [active, openId])
  const debtName = (id?: string) => debts.find((d) => d.id === id)?.subject

  const open = notes.find((n) => n.id === openId) ?? null
  const shown = sortNotes(filterNotes(notes, q))
  const say = (text: string, undo?: () => void) =>
    setNotice(makeNotice(text, 'info', undo && { label: 'Отменить', run: undo }))

  const patch = (id: string, p: Partial<Note>) => {
    const t = Date.now()
    setNow(t)
    setNotes((ns) => ns.map((n) => (n.id === id ? { ...n, ...p, updatedAt: t } : n)))
  }
  const create = () => {
    const n: Note = { id: uid(), title: '', body: '', pinned: false, updatedAt: Date.now() }
    setNotes((ns) => [...ns, n])
    setOpenId(n.id)
  }
  // пустую заметку не храним: нажал «+» и передумал — ничего не остаётся
  const close = () => {
    if (open && isEmptyNote(open)) setNotes((ns) => ns.filter((n) => n.id !== open.id))
    setOpenId(null)
  }
  const remove = (n: Note) => {
    const at = notes.findIndex((x) => x.id === n.id)
    setNotes((ns) => ns.filter((x) => x.id !== n.id))
    setOpenId(null)
    say(`Заметка «${noteTitle(n)}» удалена`, () => setNotes((ns) => { const c = [...ns]; c.splice(Math.min(at, c.length), 0, n); return c }))
  }

  return (
    <main>
      <header className="navbar">
        <h1 className="large-title">Заметки</h1>
        <div className="nav-actions">
          <DataButton />
          <button className="icon-btn press" aria-label="Новая заметка" onClick={create}><IconPlus /></button>
        </div>
      </header>

      <div className="notes-wrap">
        {notes.length > 0 && (
          <div className="search-field">
            <input className="input" type="search" autoComplete="off" enterKeyHint="search" aria-label="Поиск по заметкам"
              placeholder="Поиск" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        )}

        {notes.length === 0 ? (
          <div className="empty">
            <p className="headline">Заметок пока нет</p>
            <p className="caption">Вопросы к зачёту, что сказал преподаватель, список литературы.</p>
            <button className="btn-primary press" onClick={create}>Новая заметка</button>
          </div>
        ) : shown.length === 0 ? (
          <p className="status-line">Ничего не найдено.</p>
        ) : (
          <ul className="group notes-list">
            {shown.map((n) => {
              const meta = [debtName(n.debtId), fmtNoteDate(n.updatedAt, now)].filter(Boolean).join(' · ')
              return (
                <li key={n.id}>
                  <button className="row" onClick={() => setOpenId(n.id)}>
                    <span className="row-main">
                      <span className="row-title note-title">
                        {n.pinned && <span className="pin" aria-label="Закреплена"><IconPin /></span>}
                        {noteTitle(n)}
                      </span>
                      {notePreview(n) && <span className="row-sub note-preview">{notePreview(n)}</span>}
                      <span className="row-sub note-meta">{meta}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <Sheet open={!!open} onClose={close} title="Заметка">
        {open && (
          <>
            <div className="group" style={{ marginTop: '.75rem' }}>
              <input className="input note-name" placeholder="Заголовок" aria-label="Заголовок" value={open.title}
                onChange={(e) => patch(open.id, { title: e.target.value })} />
              <textarea className="input note-body" placeholder="Текст заметки" aria-label="Текст заметки" value={open.body}
                onChange={(e) => patch(open.id, { body: e.target.value })} />
            </div>

            <h3 className="section-title">Долг</h3>
            <div className="group">
              <select className="input" aria-label="Привязать к долгу" value={open.debtId ?? ''}
                onChange={(e) => patch(open.id, { debtId: e.target.value || undefined })}>
                <option value="">Не привязана</option>
                {debts.map((d) => <option key={d.id} value={d.id}>{d.subject}</option>)}
              </select>
            </div>

            <h3 className="section-title">Ещё</h3>
            <div className="group">
              <button className="row accent" onClick={() => patch(open.id, { pinned: !open.pinned })}>
                <span className="row-title">{open.pinned ? 'Открепить' : 'Закрепить сверху'}</span>
              </button>
              <button className="row danger" onClick={() => remove(open)}>
                <span className="row-title">Удалить заметку</span>
              </button>
            </div>
            <p className="footnote">Изменено: {fmtNoteDate(open.updatedAt, now)}. Сохраняется само.</p>
          </>
        )}
      </Sheet>

      <Toast notice={notice} onClose={() => setNotice(null)} />
    </main>
  )
}
