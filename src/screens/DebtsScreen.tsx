// Путь: src/screens/DebtsScreen.tsx
// Вкладка «Предметы»: долги (первыми и только если есть), ниже предметы семестра, в конце закрытое.
// Долг это или обычный предмет, переключается в карточке: запись та же, работы и заметки остаются.
import { useEffect, useState } from 'react'
import {
  debtProgress, debtStatus, isDebt, kindOf, makeWorks, overview, sections, worksFromTitles,
  type Debt, type DebtKind, type DebtStatus, type Overview,
} from '../domain/debts'
import Picker from './Picker'
import Segmented from '../ui/Segmented'
import Sheet from '../ui/Sheet'
import { addTeacherFromUrl } from '../data/addTeacher'
import { useTeachers } from '../data/teachersStore'
import { surnameKey } from '../domain/insights'
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
  return []
}

const KINDS: { value: DebtKind; label: string }[] = [
  { value: 'subject', label: 'Предмет семестра' },
  { value: 'debt', label: 'Долг' },
]

export default function DebtsScreen() {
  const [debts, setDebts] = useState<Debt[]>(load)
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [teachers] = useTeachers()
  const [finding, setFinding] = useState<{ query: string; key: number } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(debts)) } catch { /* ignore */ }
  }, [debts])

  const parts = sections(debts)
  // пометка «долг» в закрытых нужна, только когда там лежат и долги, и обычные предметы
  const mixedClosed = parts.closed.some(isDebt) && parts.closed.some((d) => !isDebt(d))
  const groups = [
    { key: 'debts', title: 'Долги', list: parts.debts },
    { key: 'subjects', title: 'Предметы семестра', list: parts.subjects },
    { key: 'closed', title: 'Закрыто', list: parts.closed },
  ]
  /** Вторая строка в списке: преподаватель и то, что не видно по значку */
  const subLine = (d: Debt, status: DebtStatus) => [
    d.teacher,
    status === 'clarify' ? (isDebt(d) ? 'уточнить требования' : 'работы не добавлены') : '',
    status === 'closed' && mixedClosed && isDebt(d) ? 'долг' : '',
  ].filter(Boolean).join(' · ')
  const open = debts.find((d) => d.id === openId) ?? null
  const patch = (id: string, p: Partial<Debt>) =>
    setDebts((ds) => ds.map((d) => (d.id === id ? { ...d, ...p } : d)))
  const say = (text: string, undo?: () => void, tone: 'info' | 'error' = 'info') =>
    setNotice(makeNotice(text, tone, undo && { label: 'Отменить', run: undo }))
  const found = (d: Debt) => {
    const k = surnameKey(d.teacher ?? '')
    return k ? teachers.find((t) => surnameKey(t.name) === k) : undefined
  }
  async function pickTeacher(url: string) {
    if (busy) return
    setBusy(true)
    const r = await addTeacherFromUrl(url)
    setBusy(false)
    if (r.ok) { setFinding(null); say(`Расписание добавлено: ${r.name}`) } else say(r.msg, undefined, 'error')
  }
  const closeSheet = () => { setOpenId(null); setConfirmDelete(false) }

  const toggleWork = (d: Debt, workId: string) => {
    const next = { ...d, works: d.works.map((w) => (w.id === workId ? { ...w, done: !w.done } : w)) }
    setDebts((ds) => ds.map((x) => (x.id === d.id ? next : x)))
    // Предмет закрыт последней работой: лист уходит сам, а в уведомлении можно вернуть всё как было
    if (debtStatus(d) !== 'closed' && debtStatus(next) === 'closed') {
      closeSheet()
      say(`«${d.subject}» закрыт`, () => setDebts((ds) => ds.map((x) => (x.id === d.id ? d : x))))
    }
  }

  const addWork = (d: Debt) =>
    patch(d.id, { works: [...d.works, { id: uid(), title: `Работа ${d.works.length + 1}`, done: false }] })
  const renameWork = (d: Debt, workId: string, title: string) =>
    patch(d.id, { works: d.works.map((w) => (w.id === workId ? { ...w, title } : w)) })
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

  return (
    <main>
      <header className="navbar">
        <h1 className="large-title">Предметы</h1>
        <div className="nav-actions">
          <button className="icon-btn press" aria-label="Добавить предмет" onClick={() => setAdding(true)}><IconPlus /></button>
        </div>
      </header>

      <div className="debts-grid">
      <div className="debts-side">
      {debts.length === 0 ? (
        <div className="empty">
          <p className="headline">Предметов пока нет</p>
          <p className="caption">Добавь предмет семестра или долг, и здесь появится прогресс.</p>
          <button className="btn-primary press" onClick={() => setAdding(true)}>Добавить предмет</button>
        </div>
      ) : (
        <Hero o={overview(debts)} />
      )}

      </div>
      <div className="debts-list">
      {groups.map(({ key, title, list }) => {
        if (list.length === 0) return null
        return (
          <section key={key}>
            <h2 className="section-title">{title} · {list.length}</h2>
            <ul className="group">
              {list.map((d) => {
                const p = debtProgress(d)
                const status = debtStatus(d)
                const sub = subLine(d, status)
                return (
                  <li key={d.id}>
                    <button className="row debt-row" onClick={() => setOpenId(d.id)}>
                      <StatusMark status={status} done={p.done} total={p.total} />
                      <span className="row-main">
                        <span className={`row-title strong ${status === 'closed' ? 'done-text' : ''}`}>{d.subject}</span>
                        {sub && <span className="row-sub">{sub}</span>}
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

      {/* Детали предмета */}
      <Sheet open={!!open} onClose={closeSheet} title={open?.subject ?? ''}>
        {open && (
          <>
            {/* Название в шапке листа тянется как жест, поэтому копировать с телефона можно отсюда: зажать и выделить */}
            <p className="headline selectable" style={{ textAlign: 'center', paddingTop: '.75rem' }}>{open.subject}</p>
            {open.teacher && <p className="caption selectable" style={{ textAlign: 'center' }}>{open.teacher}</p>}

            {/* Долг или предмет семестра: меняется на месте, запись остаётся той же */}
            <div className="kind-pick">
              <Segmented label="Долг или предмет семестра" value={kindOf(open)} options={KINDS} onChange={(kind) => patch(open.id, { kind })} />
            </div>
            <p className="footnote">
              {isDebt(open)
                ? 'Долги стоят первыми в списке, и про их преподавателей напоминает бот, если включены уведомления.'
                : 'Обычный предмет этого семестра. Если он стал долгом, переключи здесь: работы и заметки останутся.'}
            </p>

            <h3 className="section-title">Работы{open.works.length > 0 && ` · ${debtProgress(open).done} из ${open.works.length}`}</h3>
            <div className="group">
              {open.works.map((w, i) => (
                <div key={w.id} className="row work-row">
                  <input type="checkbox" className="chk" aria-label={`Сдана: ${w.title}`} checked={w.done} onChange={() => toggleWork(open, w.id)} />
                  <input className={`row-title work-title ${w.done ? 'done-text' : ''}`} aria-label="Название работы" value={w.title}
                    placeholder={`Работа ${i + 1}`} enterKeyHint="done"
                    onChange={(e) => renameWork(open, w.id, e.target.value)}
                    onBlur={(e) => { if (!e.target.value.trim()) renameWork(open, w.id, `Работа ${i + 1}`) }}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
                </div>
              ))}
              {open.works.length === 0 && (
                <div className="row"><span className="row-sub">{isDebt(open) ? 'Требования не уточнены. Добавь работы кнопкой «+», когда узнаешь.' : 'Работ пока нет. Добавь их кнопкой «+».'}</span></div>
              )}
              <div className="work-head">
                <span className="row-sub">Количество работ</span>
                <div className="stepper">
                  <button aria-label="Убрать работу" disabled={open.works.length === 0} onClick={() => removeLastWork(open)}><IconMinus /></button>
                  <button aria-label="Добавить работу" onClick={() => addWork(open)}><IconPlus /></button>
                </div>
              </div>
            </div>

            {open.works.length > 0 && <p className="footnote">Нажми на название работы, чтобы переименовать её.</p>}

            <h3 className="section-title">Преподаватель</h3>
            <div className="group">
              <input className="input" placeholder="Фамилия, например Шукшин" aria-label="Преподаватель" value={open.teacher ?? ''}
                onChange={(e) => patch(open.id, { teacher: e.target.value })} />
            </div>
            {open.teacher?.trim() && !found(open) && (
              <div className="group" style={{ marginTop: '.5rem' }}>
                <button className="row accent" onClick={() => setFinding({ query: open.teacher!.trim().split(/[\s.,(]+/)[0], key: Date.now() })}>
                  <span className="row-title">Найти расписание преподавателя</span>
                </button>
              </div>
            )}
            <p className="footnote">
              {found(open)
                ? `Расписание найдено: ${found(open)!.name}. Когда и где его застать — на вкладке «Расписание».`
                : 'По фамилии в расписании найдётся, когда и где его застать.'}
            </p>

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
                  <span className="row-title">{isDebt(open) ? 'Удалить долг' : 'Удалить предмет'}</span>
                </button>
              )}
            </div>
          </>
        )}
      </Sheet>

      {/* Новый предмет или долг */}
      <Sheet open={adding} onClose={() => setAdding(false)} title="Новый предмет"
        trailing={<button className="btn-plain" onClick={() => setAdding(false)}>Отмена</button>}>
        <AddForm onSave={(d) => { setDebts((ds) => [...ds, d]); setAdding(false); say(`«${d.subject}» добавлен`) }} />
      </Sheet>

      {/* Поиск расписания преподавателя прямо из карточки предмета */}
      <Sheet open={!!finding} onClose={() => setFinding(null)} title="Выбор преподавателя">
        {finding && <Picker key={finding.key} kind="lecturers" initialQuery={finding.query} onPick={(_, url) => pickTeacher(url)} />}
      </Sheet>


      <Toast notice={notice} onClose={() => setNotice(null)} />
    </main>
  )
}

/** Главная цифра: пока есть незакрытые долги — про них, иначе про семестр */
function Hero({ o }: { o: Overview }) {
  const { debts: d, subjects: s } = o
  if (o.focus === 'debts') {
    const allDone = d.debtsTotal > 0 && d.debtsClosed === d.debtsTotal
    return (
      <section className={`hero ${allDone ? 'all-done' : ''}`} aria-label="Общий прогресс">
        <div className="hero-top">
          <span className="hero-num">{d.debtsClosed}</span>
          <span className="hero-of">из {d.debtsTotal}</span>
        </div>
        <p className="hero-cap">{allDone ? 'Все долги закрыты' : 'долгов закрыто'}</p>
        <Bar done={d.debtsClosed} total={d.debtsTotal} />
        <p className="caption">
          {s.debtsTotal > 0 ? 'Работ по долгам сдано' : 'Работ сдано'} {d.worksDone} из {d.worksTotal}
          {d.unclear > 0 && ` · требования не уточнены у ${d.unclear}`}
        </p>
        {s.debtsTotal > 0 && (
          <p className="caption">
            {s.worksTotal > 0 ? `В семестре работ сдано ${s.worksDone} из ${s.worksTotal}` : `Предметов семестра: ${s.debtsTotal}`}
          </p>
        )}
      </section>
    )
  }
  const byWorks = s.worksTotal > 0
  const done = byWorks ? s.worksDone : s.debtsClosed
  const total = byWorks ? s.worksTotal : s.debtsTotal
  const allDone = s.debtsClosed === s.debtsTotal
  return (
    <section className={`hero ${allDone ? 'all-done' : ''}`} aria-label="Общий прогресс">
      <div className="hero-top">
        <span className="hero-num">{done}</span>
        <span className="hero-of">из {total}</span>
      </div>
      <p className="hero-cap">{allDone ? 'Все предметы семестра закрыты' : byWorks ? 'работ сдано в семестре' : 'предметов закрыто'}</p>
      <Bar done={done} total={total} />
      <p className="caption">
        {byWorks
          ? `Предметов закрыто ${s.debtsClosed} из ${s.debtsTotal}${s.unclear > 0 ? ` · без работ: ${s.unclear}` : ''}`
          : 'Добавь работы в предметы, и здесь появится прогресс по ним.'}
      </p>
      {d.debtsTotal > 0 && <p className="caption">Все долги закрыты: {d.debtsTotal}</p>}
    </section>
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
  const [titles, setTitles] = useState('')
  const [kind, setKind] = useState<DebtKind>('subject')
  const n = Math.max(0, Math.min(30, parseInt(count, 10) || 0))
  const named = worksFromTitles(titles, uid())
  return (
    <form onSubmit={(e) => {
      e.preventDefault()
      if (!subject.trim()) return
      onSave({
        id: uid(), subject: subject.trim(), kind, teacher: teacher.trim() || undefined,
        closedManually: false, works: named.length ? named : makeWorks(n, uid()),
      })
    }}>
      <div className="kind-pick">
        <Segmented label="Долг или предмет семестра" value={kind} options={KINDS} onChange={setKind} />
      </div>
      <div className="group" style={{ marginTop: '.75rem' }}>
        <input className="input" placeholder="Предмет" aria-label="Предмет" autoFocus value={subject} onChange={(e) => setSubject(e.target.value)} />
        <input className="input" placeholder="Преподаватель (необязательно)" aria-label="Преподаватель" value={teacher} onChange={(e) => setTeacher(e.target.value)} />
        <textarea className="input" placeholder="Названия работ, по одному в строке" aria-label="Названия работ" value={titles} onChange={(e) => setTitles(e.target.value)} />
        {named.length === 0 && <input className="input" placeholder="Или просто сколько работ" aria-label="Сколько работ" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} />}
      </div>
      <p className="footnote">
        {named.length ? `Будет работ: ${named.length}. Названия можно поменять потом.` : 'Можно оставить пустым, если требования ещё не уточнены, и добавить работы потом.'}
      </p>
      <button type="submit" className="btn-primary press" style={{ marginTop: '1.25rem' }} disabled={!subject.trim()}>{kind === 'debt' ? 'Добавить долг' : 'Добавить предмет'}</button>
    </form>
  )
}
