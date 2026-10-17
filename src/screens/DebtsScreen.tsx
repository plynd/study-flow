// Путь: src/screens/DebtsScreen.tsx
import { useEffect, useState } from 'react'
import {
  debtProgress, debtStatus, makeWorks, totalProgress, type Debt, type DebtStatus,
} from '../domain/debts'
import { sampleDebts } from '../data/sample'
import Sheet from '../ui/Sheet'
import Toast from '../ui/Toast'
import { makeNotice, type Notice } from '../ui/notice'
import { IconCheck, IconChevronRight, IconMinus, IconPlus } from '../ui/icons'

const KEY = 'debts-v1'
const uid = () => Math.random().toString(36).slice(2, 9)

function load(): Debt[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as Debt[]
  } catch { /* без хранилища работаем из памяти */ }
  return sampleDebts
}

// Названия разделов — по смыслу, а не «Прочее»
const SECTIONS: { status: DebtStatus; title: string }[] = [
  { status: 'in_progress', title: 'В работе' },
  { status: 'clarify', title: 'Уточнить требования' },
  { status: 'closed', title: 'Закрыто' },
]

export default function DebtsScreen() {
  const [debts, setDebts] = useState<Debt[]>(load)
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(debts)) } catch { /* ignore */ }
  }, [debts])

  const total = totalProgress(debts)
  const open = debts.find((d) => d.id === openId) ?? null
  const patch = (id: string, p: Partial<Debt>) =>
    setDebts((ds) => ds.map((d) => (d.id === id ? { ...d, ...p } : d)))
  const say = (text: string, undo?: () => void) =>
    setNotice(makeNotice(text, 'info', undo && { label: 'Отменить', run: undo }))
  const closeSheet = () => { setOpenId(null); setConfirmDelete(false) }

  const toggleWork = (d: Debt, workId: string) => {
    const next = { ...d, works: d.works.map((w) => (w.id === workId ? { ...w, done: !w.done } : w)) }
    setDebts((ds) => ds.map((x) => (x.id === d.id ? next : x)))
    // Долг закрыт последней работой: лист уходит сам, а в уведомлении можно вернуть всё как было
    if (debtStatus(d) !== 'closed' && debtStatus(next) === 'closed') {
      closeSheet()
      say(`«${d.subject}» закрыт`, () => setDebts((ds) => ds.map((x) => (x.id === d.id ? d : x))))
    }
  }

  const addWork = (d: Debt) =>
    patch(d.id, { works: [...d.works, { id: uid(), title: `Работа ${d.works.length + 1}`, done: false }] })
  const removeLastWork = (d: Debt) => patch(d.id, { works: d.works.slice(0, -1) })

  const toggleClosed = (d: Debt) => {
    patch(d.id, { closedManually: !d.closedManually })
    closeSheet()
    say(d.closedManually ? `«${d.subject}» снова открыт` : `«${d.subject}» закрыт без работ`, () => patch(d.id, { closedManually: d.closedManually }))
  }

  const removeDebt = (d: Debt) => {
    const at = debts.findIndex((x) => x.id === d.id)
    setDebts((ds) => ds.filter((x) => x.id !== d.id))
    closeSheet()
    say(`«${d.subject}» удалён`, () => setDebts((ds) => { const c = [...ds]; c.splice(Math.min(at, c.length), 0, d); return c }))
  }

  const allDone = total.debtsTotal > 0 && total.debtsClosed === total.debtsTotal

  return (
    <main>
      <header className="navbar">
        <h1 className="large-title">Долги</h1>
        <div className="nav-actions">
          <button className="icon-btn press" aria-label="Добавить долг" onClick={() => setAdding(true)}><IconPlus /></button>
        </div>
      </header>

      <div className="debts-grid">
      <div className="debts-side">
      {debts.length === 0 ? (
        <div className="empty">
          <p className="headline">Долгов нет</p>
          <p className="caption">Добавь предмет, и здесь появится прогресс.</p>
          <button className="btn-primary press" onClick={() => setAdding(true)}>Добавить долг</button>
        </div>
      ) : (
        <section className={`hero ${allDone ? 'all-done' : ''}`} aria-label="Общий прогресс">
          <div className="hero-top">
            <span className="hero-num">{total.debtsClosed}</span>
            <span className="hero-of">из {total.debtsTotal}</span>
          </div>
          <p className="hero-cap">{allDone ? 'Все долги закрыты' : 'предметов закрыто'}</p>
          <Bar done={total.debtsClosed} total={total.debtsTotal} />
          <p className="caption">
            Работ сдано {total.worksDone} из {total.worksTotal}
            {total.unclear > 0 && ` · требования не уточнены у ${total.unclear}`}
          </p>
        </section>
      )}

      </div>
      <div className="debts-list">
      {SECTIONS.map(({ status, title }) => {
        const list = debts.filter((d) => debtStatus(d) === status)
        if (list.length === 0) return null
        return (
          <section key={status}>
            <h2 className="section-title">{title} · {list.length}</h2>
            <ul className="group">
              {list.map((d) => {
                const p = debtProgress(d)
                return (
                  <li key={d.id}>
                    <button className="row debt-row" onClick={() => setOpenId(d.id)}>
                      <StatusMark status={status} done={p.done} total={p.total} />
                      <span className="row-main">
                        <span className={`row-title strong ${status === 'closed' ? 'done-text' : ''}`}>{d.subject}</span>
                        {d.teacher && <span className="row-sub">{d.teacher}</span>}
                      </span>
                      <span className="trail">
                        {p.total > 0 && <span>{p.done}/{p.total}</span>}
                        <span className="chev"><IconChevronRight /></span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
      </div>
      </div>

      {/* Детали долга */}
      <Sheet open={!!open} onClose={closeSheet} title={open?.subject ?? ''}>
        {open && (
          <>
            {open.subject.length > 28 && <p className="headline" style={{ textAlign: 'center', paddingTop: '.75rem' }}>{open.subject}</p>}
            {open.teacher && <p className="caption" style={{ textAlign: 'center' }}>{open.teacher}</p>}

            <h3 className="section-title">Работы{open.works.length > 0 && ` · ${debtProgress(open).done} из ${open.works.length}`}</h3>
            <div className="group">
              {open.works.map((w) => (
                <label key={w.id} className="row work-row">
                  <input type="checkbox" className="chk" checked={w.done} onChange={() => toggleWork(open, w.id)} />
                  <span className={`row-title ${w.done ? 'done-text' : ''}`}>{w.title}</span>
                </label>
              ))}
              {open.works.length === 0 && (
                <div className="row"><span className="row-sub">Требования не уточнены. Добавь работы кнопкой «+», когда узнаешь.</span></div>
              )}
              <div className="work-head">
                <span className="row-sub">Количество работ</span>
                <div className="stepper">
                  <button aria-label="Убрать работу" disabled={open.works.length === 0} onClick={() => removeLastWork(open)}><IconMinus /></button>
                  <button aria-label="Добавить работу" onClick={() => addWork(open)}><IconPlus /></button>
                </div>
              </div>
            </div>

            <h3 className="section-title">Преподаватель</h3>
            <div className="group">
              <input className="input" placeholder="Фамилия, например Шукшин" aria-label="Преподаватель" value={open.teacher ?? ''}
                onChange={(e) => patch(open.id, { teacher: e.target.value })} />
            </div>
            <p className="footnote">По фамилии в расписании найдётся, когда и где его застать.</p>

            <h3 className="section-title">Что нужно сделать</h3>
            <div className="group">
              <textarea className="input" placeholder="Требования преподавателя" value={open.requirements ?? ''}
                onChange={(e) => patch(open.id, { requirements: e.target.value })} />
            </div>

            <h3 className="section-title">Заметки</h3>
            <div className="group">
              <textarea className="input" placeholder="Для себя" value={open.notes ?? ''}
                onChange={(e) => patch(open.id, { notes: e.target.value })} />
            </div>

            <h3 className="section-title">Ещё</h3>
            <div className="group">
              <button className="row accent" onClick={() => toggleClosed(open)}>
                <span className="row-title">{open.closedManually ? 'Открыть снова' : 'Закрыть без работ'}</span>
              </button>
              {confirmDelete ? (
                <button className="row danger" onClick={() => removeDebt(open)}>
                  <span className="row-title strong">Да, удалить «{open.subject}»</span>
                </button>
              ) : (
                <button className="row danger" onClick={() => setConfirmDelete(true)}>
                  <span className="row-title">Удалить долг</span>
                </button>
              )}
            </div>
          </>
        )}
      </Sheet>

      {/* Новый долг */}
      <Sheet open={adding} onClose={() => setAdding(false)} title="Новый долг"
        trailing={<button className="btn-plain" onClick={() => setAdding(false)}>Отмена</button>}>
        <AddForm onSave={(d) => { setDebts((ds) => [...ds, d]); setAdding(false); say(`«${d.subject}» добавлен`) }} />
      </Sheet>

      <Toast notice={notice} onClose={() => setNotice(null)} />
    </main>
  )
}

function Bar({ done, total, thin }: { done: number; total: number; thin?: boolean }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)
  return <span className={`bar ${thin ? 'thin' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}><span style={{ width: `${pct}%` }} /></span>
}

/** Значок статуса: кольцо с прогрессом / пунктир «уточнить» / зелёная галочка */
function StatusMark({ status, done, total }: { status: DebtStatus; done: number; total: number }) {
  if (status === 'closed') return <span className="ring-wrap closed"><span className="glyph"><IconCheck size={15} /></span></span>
  if (status === 'clarify') return <span className="ring-wrap"><span className="ring clarify" /><span className="glyph">?</span></span>
  const pct = total === 0 ? 0 : Math.max(6, Math.round((done / total) * 100))
  return <span className="ring-wrap"><span className="ring" style={{ ['--p' as string]: pct }} /></span>
}

function AddForm({ onSave }: { onSave: (d: Debt) => void }) {
  const [subject, setSubject] = useState('')
  const [teacher, setTeacher] = useState('')
  const [count, setCount] = useState('')
  const n = Math.max(0, Math.min(30, parseInt(count, 10) || 0))
  return (
    <form onSubmit={(e) => {
      e.preventDefault()
      if (!subject.trim()) return
      onSave({
        id: uid(), subject: subject.trim(), teacher: teacher.trim() || undefined,
        closedManually: false, works: makeWorks(n, uid()),
      })
    }}>
      <div className="group" style={{ marginTop: '.75rem' }}>
        <input className="input" placeholder="Предмет" aria-label="Предмет" autoFocus value={subject} onChange={(e) => setSubject(e.target.value)} />
        <input className="input" placeholder="Преподаватель (необязательно)" aria-label="Преподаватель" value={teacher} onChange={(e) => setTeacher(e.target.value)} />
        <input className="input" placeholder="Сколько работ" aria-label="Сколько работ" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} />
      </div>
      <p className="footnote">Число работ можно оставить пустым, если требования ещё не уточнены, и добавить потом.</p>
      <button type="submit" className="btn-primary press" style={{ marginTop: '1.25rem' }} disabled={!subject.trim()}>Добавить долг</button>
    </form>
  )
}
