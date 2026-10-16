import { useEffect, useState } from 'react'
import {
  STATUS_LABEL, debtProgress, debtStatus, makeWorks, totalProgress, type Debt,
} from './domain/debts'
import { sampleDebts } from './data/sample'
import './index.css'

const KEY = 'debts-v1'
const uid = () => Math.random().toString(36).slice(2, 9)

function load(): Debt[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as Debt[]
  } catch { /* без хранилища работаем из памяти */ }
  return sampleDebts
}

export default function App() {
  const [debts, setDebts] = useState<Debt[]>(load)
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(debts)) } catch { /* ignore */ }
  }, [debts])

  const total = totalProgress(debts)
  const patch = (id: string, p: Partial<Debt>) =>
    setDebts((ds) => ds.map((d) => (d.id === id ? { ...d, ...p } : d)))

  const toggleWork = (debtId: string, workId: string) => {
    const d = debts.find((x) => x.id === debtId)
    if (!d) return
    const next = { ...d, works: d.works.map((w) => (w.id === workId ? { ...w, done: !w.done } : w)) }
    if (debtStatus(next) === 'closed') setOpenId(null)
    setDebts((ds) => ds.map((x) => (x.id === debtId ? next : x)))
  }

  const addWork = (d: Debt) =>
    patch(d.id, { works: [...d.works, { id: uid(), title: `Работа ${d.works.length + 1}`, done: false }] })

  const removeLastWork = (d: Debt) => patch(d.id, { works: d.works.slice(0, -1) })

  const sorted = [...debts].sort((a, b) => order(debtStatus(a)) - order(debtStatus(b)))

  return (
    <main className="app">
      <header className="summary">
        <h1>Долги</h1>
        <p className="big">
          Закрыто предметов: <b>{total.debtsClosed}</b> из <b>{total.debtsTotal}</b>
        </p>
        <Bar done={total.debtsClosed} total={total.debtsTotal} />
        <p className="muted">
          Работ сдано: {total.worksDone} из {total.worksTotal}
          {total.unclear > 0 && ` · требования не уточнены у ${total.unclear}`}
        </p>
      </header>

      <ul className="list">
        {sorted.map((d) => {
          const status = debtStatus(d)
          const p = debtProgress(d)
          const open = openId === d.id
          return (
            <li key={d.id} className={`card ${status}`}>
              <button className="head" onClick={() => setOpenId(open ? null : d.id)}>
                <span className="title">{d.subject}</span>
                <span className={`badge ${status}`}>{STATUS_LABEL[status]}</span>
                {d.teacher && <span className="muted">{d.teacher}</span>}
                {p.total > 0 && (
                  <span className="row">
                    <Bar done={p.done} total={p.total} />
                    <span className="muted">{p.done}/{p.total}</span>
                  </span>
                )}
              </button>

              {open && (
                <div className="body">
                  <label>Что нужно сделать
                    <textarea value={d.requirements ?? ''} rows={2}
                      onChange={(e) => patch(d.id, { requirements: e.target.value })} />
                  </label>
                  <label>Заметки
                    <textarea value={d.notes ?? ''} rows={2}
                      onChange={(e) => patch(d.id, { notes: e.target.value })} />
                  </label>

                  <div className="works">
                    {d.works.map((w) => (
                      <label key={w.id} className="work">
                        <input type="checkbox" checked={w.done} onChange={() => toggleWork(d.id, w.id)} />
                        <span className={w.done ? 'done' : ''}>{w.title}</span>
                      </label>
                    ))}
                    {d.works.length === 0 && <p className="muted">Работ пока нет.</p>}
                  </div>

                  <div className="actions">
                    <button onClick={() => addWork(d)}>+ работа</button>
                    <button onClick={() => removeLastWork(d)} disabled={d.works.length === 0}>− работа</button>
                    <button onClick={() => {
                      patch(d.id, { closedManually: !d.closedManually })
                      setOpenId(null)
                    }}>
                      {d.closedManually ? 'Открыть снова' : 'Закрыть без работ'}
                    </button>
                    <button className="danger" onClick={() => {
                      if (confirm(`Удалить «${d.subject}»?`)) setDebts((ds) => ds.filter((x) => x.id !== d.id))
                    }}>Удалить</button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
        {debts.length === 0 && <p className="muted">Долгов нет.</p>}
      </ul>

      {adding
        ? <AddForm onCancel={() => setAdding(false)} onSave={(d) => { setDebts((ds) => [...ds, d]); setAdding(false); setOpenId(d.id) }} />
        : <button className="primary" onClick={() => setAdding(true)}>+ Добавить долг</button>}
    </main>
  )
}

const order = (s: string) => (s === 'in_progress' ? 0 : s === 'clarify' ? 1 : 2)

function Bar({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)
  return <span className="bar"><span style={{ width: `${pct}%` }} /></span>
}

function AddForm({ onSave, onCancel }: { onSave: (d: Debt) => void; onCancel: () => void }) {
  const [subject, setSubject] = useState('')
  const [teacher, setTeacher] = useState('')
  const [count, setCount] = useState('')
  const n = Math.max(0, Math.min(30, parseInt(count, 10) || 0))
  return (
    <form className="add" onSubmit={(e) => {
      e.preventDefault()
      if (!subject.trim()) return
      onSave({
        id: uid(), subject: subject.trim(), teacher: teacher.trim() || undefined,
        closedManually: false, works: makeWorks(n, uid()),
      })
    }}>
      <label>Предмет<input autoFocus value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
      <label>Преподаватель (необязательно)<input value={teacher} onChange={(e) => setTeacher(e.target.value)} /></label>
      <label>Сколько работ (пусто — требования не уточнены)
        <input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} />
      </label>
      <div className="actions">
        <button type="submit" className="primary">Сохранить</button>
        <button type="button" onClick={onCancel}>Отмена</button>
      </div>
    </form>
  )
}
