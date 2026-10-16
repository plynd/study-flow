import { useEffect, useState } from 'react'
import {
  addDays, building, dayBlocks, dayBounds, defaultWeek, emptyHidden, fmtDate, fmtTime, fmtWeek,
  groupByDate, lessonKey, parallelOf, parseIcs, visibleLessons, weekdayName, weeksOf,
  type Hidden, type Lesson,
} from '../domain/schedule'
import { PAUSE_MS, agoText, canRefresh, isLecturerUrl, minutesLeft, validateIcsUrl } from '../domain/sources'
import { classifyCalendar, icsName, matchesFor, teacherDay, type Tag, type TeacherCal, type TeacherEntry } from '../domain/teachers'

const K_LESSONS = 'schedule-lessons-v1'
const K_HIDDEN = 'schedule-hidden-v1'
const K_TEACHERS = 'schedule-teachers-v1'
const K_SHOW = 'schedule-show-matches-v1'
const K_OWN = 'schedule-own-source-v1'

interface Source { url: string; updatedAt?: number }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type Mode = 'mine' | 'teachers' | 'both'

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw) return JSON.parse(raw) as T
  } catch { /* без хранилища работаем из памяти */ }
  return fallback
}

export default function ScheduleScreen() {
  const [lessons, setLessons] = useState<Lesson[]>(() => read<Lesson[]>(K_LESSONS, []))
  const [hidden, setHidden] = useState<Hidden>(() => read<Hidden>(K_HIDDEN, emptyHidden()))
  const [menuUid, setMenuUid] = useState<string | null>(null)
  const [showHidden, setShowHidden] = useState(false)
  const [error, setError] = useState('')
  const [week, setWeek] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('mine')
  const [teachers, setTeachers] = useState<TeacherCal[]>(() => read<TeacherCal[]>(K_TEACHERS, []))
  const [own, setOwn] = useState<Source>(() => read<Source>(K_OWN, { url: '' }))
  const [teacherUrl, setTeacherUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const [showMatches, setShowMatches] = useState<boolean>(() => read<boolean>(K_SHOW, true))

  useEffect(() => {
    try { localStorage.setItem(K_LESSONS, JSON.stringify(lessons)) } catch { /* ignore */ }
  }, [lessons])
  useEffect(() => {
    try { localStorage.setItem(K_HIDDEN, JSON.stringify(hidden)) } catch { /* ignore */ }
  }, [hidden])

  useEffect(() => {
    try { localStorage.setItem(K_TEACHERS, JSON.stringify(teachers)) } catch { /* ignore */ }
  }, [teachers])
  useEffect(() => {
    try { localStorage.setItem(K_SHOW, JSON.stringify(showMatches)) } catch { /* ignore */ }
  }, [showMatches])

  useEffect(() => {
    try { localStorage.setItem(K_OWN, JSON.stringify(own)) } catch { /* ignore */ }
  }, [own])
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  /** Один запрос к нашему серверу; stop=true — сайт просит остановиться */
  async function fetchIcs(url: string): Promise<{ text: string } | { error: string; stop: boolean }> {
    try {
      const r = await fetch('/api/ics?url=' + encodeURIComponent(url))
      if (r.ok) return { text: await r.text() }
      let msg = `Ошибка ${r.status}.`
      try { msg = (await r.json()).error ?? msg } catch { /* не json */ }
      return { error: msg, stop: r.status === 429 }
    } catch {
      return { error: 'Нет связи с сервером приложения (на телефоне — проверь интернет).', stop: true }
    }
  }

  const patchTeacher = (id: string, p: Partial<TeacherCal>) =>
    setTeachers((ts) => ts.map((t) => (t.id === id ? { ...t, ...p } : t)))

  /** Добавить или обновить преподавателя: ищем по id, потом по ссылке, потом по названию */
  function saveTeacher(name: string, lessons: Lesson[], sourceUrl?: string, id?: string) {
    setTeachers((ts) => {
      const old = ts.find((t) => (id && t.id === id) || (sourceUrl && t.sourceUrl === sourceUrl) || t.name === name)
      const extra = sourceUrl ? { sourceUrl, updatedAt: Date.now() } : {}
      return old
        ? ts.map((t) => (t === old ? { ...t, lessons, ...extra } : t))
        : [...ts, { id: Math.random().toString(36).slice(2, 9), name, lessons, ...extra }]
    })
  }

  /**
   * Единая точка входа для любого расписания (файл или ссылка).
   * Проверяет, чьё оно, чтобы расписание преподавателя не попало в «Моё» и наоборот.
   */
  function acceptCalendar(
    text: string, target: 'own' | 'teacher', o: { sourceUrl?: string; fileName?: string; teacherId?: string } = {},
  ): { ok: boolean; msg: string } {
    const parsed = parseIcs(text)
    if (parsed.length === 0) return { ok: false, msg: 'В файле не нашлось ни одной пары. Это точно .ics с сайта расписания?' }
    const name = icsName(text)
    const kind = classifyCalendar(name, parsed)

    if (target === 'own' && kind === 'teacher') {
      // расписание преподавателя в поле «Моё» — отправляем туда, где ему место
      saveTeacher(name ?? o.fileName ?? 'Преподаватель', parsed, o.sourceUrl)
      if (o.sourceUrl && o.sourceUrl === own.url) setOwn({ url: '' })
      return { ok: true, msg: `Это расписание преподавателя${name ? ` («${name}»)` : ''}, поэтому я добавил его в «Преподаватели», а твоё расписание не тронул.` }
    }
    if (target === 'teacher' && kind === 'group') {
      return { ok: false, msg: `Это расписание группы («${name}»), а не преподавателя. Его место — вверху, в поле «Моё расписание».` }
    }
    if (target === 'own') {
      setLessons(parsed) // новый файл заменяет старое расписание; скрытия сохраняются
      if (o.sourceUrl) setOwn((x) => ({ ...x, url: o.sourceUrl!, updatedAt: Date.now() }))
      return { ok: true, msg: 'обновлено' }
    }
    saveTeacher(name ?? o.fileName ?? 'Преподаватель', parsed, o.sourceUrl, o.teacherId)
    return { ok: true, msg: 'обновлено' }
  }

  /** Кнопка «Обновить»: источники по очереди, с паузой; кулдаун 30 мин; стоп при 403/429 */
  async function refreshAll() {
    if (own.url && isLecturerUrl(own.url)) {
      setError('Ссылка в поле «Моё расписание» ведёт на страницу преподавателя. Вставь туда ссылку на свою группу.')
      return
    }
    const jobs: { label: string; src: Source; apply: (text: string) => { ok: boolean; msg: string } }[] = []
    if (own.url) jobs.push({ label: 'Моё расписание', src: own, apply: (text) => acceptCalendar(text, 'own', { sourceUrl: own.url }) })
    for (const t of teachers) {
      if (t.sourceUrl) jobs.push({
        label: t.name, src: { url: t.sourceUrl, updatedAt: t.updatedAt },
        apply: (text) => acceptCalendar(text, 'teacher', { sourceUrl: t.sourceUrl, teacherId: t.id }),
      })
    }
    if (jobs.length === 0) { setInfo('Нет ссылок для обновления. Вставь ссылку на .ics.'); return }

    setBusy(true); setInfo(''); setError('')
    const notes: string[] = []
    let first = true
    for (const j of jobs) {
      const t0 = Date.now()
      if (!canRefresh(j.src.updatedAt, t0)) { notes.push(`${j.label}: свежее, подожди ещё ${minutesLeft(j.src.updatedAt!, t0)} мин`); continue }
      if (!first) await sleep(PAUSE_MS)
      first = false
      const r = await fetchIcs(j.src.url)
      if ('error' in r) { notes.push(`${j.label}: ${r.error}`); if (r.stop) break; continue }
      notes.push(`${j.label}: ${j.apply(r.text).msg}`)
    }
    setInfo(notes.join(' · '))
    setNow(Date.now())
    setBusy(false)
  }

  async function addTeacherByUrl() {
    const v = validateIcsUrl(teacherUrl)
    if (!v.ok) { setError(v.reason); return }
    setBusy(true); setError('')
    const r = await fetchIcs(v.url)
    if ('error' in r) { setError(r.error); setBusy(false); return }
    const res = acceptCalendar(r.text, 'teacher', { sourceUrl: v.url })
    if (res.ok) setTeacherUrl(''); else setError(res.msg)
    setBusy(false)
  }

  async function onTeacherFile(file: File | undefined) {
    if (!file) return
    const res = acceptCalendar(await file.text(), 'teacher', { fileName: file.name.replace(/\.ics$/i, '') })
    setError(res.ok ? '' : res.msg)
  }

  async function onFile(file: File | undefined) {
    if (!file) return
    const res = acceptCalendar(await file.text(), 'own', { fileName: file.name.replace(/\.ics$/i, '') })
    if (res.ok) { setError(''); setInfo(res.msg === 'обновлено' ? '' : res.msg) } else setError(res.msg)
  }

  const add = (field: keyof Hidden, v: string) => {
    setHidden((h) => ({ ...h, [field]: h[field].includes(v) ? h[field] : [...h[field], v] }))
    setMenuUid(null)
  }
  const remove = (field: keyof Hidden, v: string) =>
    setHidden((h) => ({ ...h, [field]: h[field].filter((x) => x !== v) }))

  /** «Это моя»: скрыть остальные из параллельных (пара повторяется каждую неделю) */
  const pickMine = (l: Lesson) => {
    const keys = parallelOf(l, lessons).map(lessonKey)
    setHidden((h) => ({ ...h, keys: [...new Set([...h.keys, ...keys])] }))
    setMenuUid(null)
  }

  const visible = visibleLessons(lessons, hidden)
  const hiddenCount = lessons.length - visible.length
  const weeks = weeksOf(lessons)
  const current = week && weeks.includes(week) ? week : weeks.length ? defaultWeek(weeks, todayStr()) : null
  const idx = current ? weeks.indexOf(current) : -1
  const inWeek = (d: string) => !!current && d >= current && d <= addDays(current, 6)
  const ownByDate = new Map(groupByDate(visible.filter((l) => inWeek(l.date))))
  const dates = new Set<string>(mode === 'teachers' ? [] : ownByDate.keys())
  if (mode !== 'mine') for (const t of teachers) for (const l of t.lessons) if (inWeek(l.date) && !l.remote) dates.add(l.date)
  const days = [...dates].sort()

  const tcard = (e: TeacherEntry, name: string) => (
    <li key={name + e.lesson.uid} className={`card tlesson ${e.tag}`}>
      <div className="head">
        <span className="time">{fmtTime(e.lesson.start)}–{fmtTime(e.lesson.end)} · {e.lesson.kind}</span>
        <span className="title">{e.lesson.subject}</span>
        <span className="muted">
          ауд. {e.lesson.room}{building(e.lesson.room) ? ` (корпус ${building(e.lesson.room)})` : ''} · {name}
        </span>
        <span className="badge">{tagText(e.tag, e)}</span>
      </div>
    </li>
  )

  const card = (l: Lesson, par: Lesson[], color: number | null) => (
    <li key={l.uid} className={`card lesson ${l.remote ? 'remote' : ''} ${color !== null ? 'p' + color : ''}`}>
      <button className="head" onClick={() => setMenuUid(menuUid === l.uid ? null : l.uid)}>
        <span className="time">{fmtTime(l.start)}–{fmtTime(l.end)} · {l.kind}</span>
        <span className="title">{l.subject}</span>
        <span className="muted">
          {l.remote ? 'дистанционно · только для информации' : `ауд. ${l.room}${building(l.room) ? ` (корпус ${building(l.room)})` : ''}`}
          {l.teacher && ` · ${l.teacher}`}
        </span>
      </button>
      {par.length > 0 && (
        <div className="actions menu"><button className="primary" onClick={() => pickMine(l)}>Это моя пара</button></div>
      )}
      {menuUid === l.uid && (
        <div className="actions menu">
          <button onClick={() => add('keys', lessonKey(l))}>Скрыть пару (каждую неделю)</button>
          <button onClick={() => add('uids', l.uid)}>Скрыть только это занятие</button>
          <button onClick={() => add('subjects', l.subject)}>Скрыть предмет</button>
        </div>
      )}
    </li>
  )

  return (
    <main className="app">
      <header className="summary">
        <h1>Расписание</h1>
        <div className="srcrow">
          <input placeholder="Ссылка на .ics группы (…/?file=….ics)" value={own.url}
            onChange={(e) => {
              const url = e.target.value
              if (isLecturerUrl(url)) {
                setError('Это ссылка на расписание преподавателя. Её нужно вставлять ниже, в «Преподаватели» (режим «Вместе»).')
                return
              }
              setError('')
              setOwn((o) => ({ url, updatedAt: url === o.url ? o.updatedAt : undefined }))
            }} />
          <button className="primary" disabled={busy} onClick={refreshAll}>{busy ? 'Обновляю…' : 'Обновить'}</button>
        </div>
        {own.url && <p className="muted">{agoText(own.updatedAt, now)}</p>}
        {info && <p className="muted">{info}</p>}
        <label className="file">
          {lessons.length ? 'Загрузить другой .ics' : 'Загрузить .ics'}
          <input type="file" accept=".ics,text/calendar" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        {error && <p className="muted err">{error}</p>}
        {lessons.length > 0 && (
          <p className="muted">
            Пар в файле: {lessons.length}
            {hiddenCount > 0 && <> · скрыто {hiddenCount} · <a href="#h" onClick={(e) => { e.preventDefault(); setShowHidden(true) }}>управлять</a></>}
          </p>
        )}
      </header>

      <div className="modes">
        {([['mine', 'Моё'], ['teachers', 'Преподаватели'], ['both', 'Вместе']] as const).map(([m, label]) => (
          <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>{label}</button>
        ))}
      </div>

      {mode !== 'mine' && (
        <section className="summary tmanage">
          <label className="file small">
            Добавить преподавателя (.ics)
            <input type="file" accept=".ics,text/calendar" onChange={(e) => { onTeacherFile(e.target.files?.[0]); e.target.value = '' }} />
          </label>
          <div className="srcrow">
            <input placeholder="Ссылка на .ics преподавателя" value={teacherUrl} onChange={(e) => setTeacherUrl(e.target.value)} />
            <button disabled={busy || !teacherUrl} onClick={addTeacherByUrl}>Добавить</button>
          </div>
          <label className="check">
            <input type="checkbox" checked={showMatches} onChange={(e) => setShowMatches(e.target.checked)} />
            Показывать пары, совпадающие по времени с моими
          </label>
          {teachers.map((t) => (
            <div key={t.id} className="trow">
              <input value={t.name} onChange={(e) => patchTeacher(t.id, { name: e.target.value })} />
              <select value={t.showMatches === undefined ? 'def' : t.showMatches ? 'yes' : 'no'}
                onChange={(e) => patchTeacher(t.id, { showMatches: e.target.value === 'def' ? undefined : e.target.value === 'yes' })}>
                <option value="def">совпадения: как везде</option>
                <option value="yes">совпадения: показывать</option>
                <option value="no">совпадения: скрывать</option>
              </select>
              <span className="muted">{agoText(t.updatedAt, now)}</span>
              <button className="danger" onClick={() => setTeachers((ts) => ts.filter((x) => x.id !== t.id))}>Убрать</button>
            </div>
          ))}
          {teachers.length === 0 && <p className="muted">Преподавателей пока нет. Загрузи .ics преподавателя с сайта расписания.</p>}
        </section>
      )}

      {lessons.length === 0 && <p className="muted">Загрузи файл расписания группы (.ics), и здесь появятся пары по дням.</p>}

      {current && (
        <div className="weeknav">
          <button disabled={idx <= 0} onClick={() => setWeek(weeks[idx - 1])} aria-label="Предыдущая неделя">←</button>
          <span>{fmtWeek(current)}</span>
          <button disabled={idx >= weeks.length - 1} onClick={() => setWeek(weeks[idx + 1])} aria-label="Следующая неделя">→</button>
        </div>
      )}
      {current && days.length === 0 && <p className="muted">На этой неделе пар нет (или всё скрыто).</p>}

      {days.map((date) => {
        const ls = ownByDate.get(date) ?? []
        const b = dayBounds(ls)
        const tdays = mode === 'mine' ? [] : teachers.map((t) => ({
          t,
          r: teacherDay(mode === 'teachers' ? [] : ls, t.lessons.filter((l) => l.date === date), matchesFor(t, showMatches)),
        }))
        return (
          <section key={date} className="day">
            <h2>
              {weekdayName(date)} {fmtDate(date)}
              {mode !== 'teachers' && <span className="muted">{b ? ` · день ${fmtTime(b.start)}–${fmtTime(b.end)}` : ' · без очных пар'}</span>}
            </h2>
            {mode !== 'teachers' && (
              <ul className="list">
                {dayBlocks(ls).map((block) =>
                  block.length === 1
                    ? card(block[0], [], null)
                    : (
                      <li key={block[0].uid} className="parallel">
                        <p className="parlabel">Параллельно — выбери свою пару</p>
                        <ul className="list">{block.map((l, i) => card(l, parallelOf(l, block), i % 4))}</ul>
                      </li>
                    ),
                )}
              </ul>
            )}
            {tdays.map(({ t, r }) => (r.entries.length > 0 || r.hiddenRemote > 0) && (
              <div key={t.id} className="tblock">
                <p className="parlabel tl">{t.name}</p>
                <ul className="list">{r.entries.map((e) => tcard(e, t.name))}</ul>
                {r.hiddenRemote > 0 && <p className="muted">скрыто {r.hiddenRemote} пар без аудитории</p>}
              </div>
            ))}
          </section>
        )
      })}

      {(showHidden || hiddenCount > 0) && (
        <section className="day">
          <button onClick={() => setShowHidden(!showHidden)}>{showHidden ? 'Свернуть «Скрытые»' : 'Скрытые'}</button>
          {showHidden && (
            <ul className="list hiddenList">
              {hidden.subjects.map((s) => <Rule key={'s' + s} text={`Предмет: ${s}`} onBack={() => remove('subjects', s)} />)}
              {hidden.keys.map((k) => <Rule key={'k' + k} text={keyText(k)} onBack={() => remove('keys', k)} />)}
              {hidden.uids.map((u) => <Rule key={'u' + u} text={uidText(u, lessons)} onBack={() => remove('uids', u)} />)}
              {hidden.subjects.length + hidden.keys.length + hidden.uids.length === 0 && <p className="muted">Ничего не скрыто.</p>}
            </ul>
          )}
        </section>
      )}
    </main>
  )
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function tagText(tag: Tag, e: TeacherEntry) {
  if (tag === 'before') return 'последняя пара до твоего дня'
  if (tag === 'after') return 'первая пара после твоего дня'
  if (tag === 'inside') return e.match ? `совпадает с твоей парой «${e.match.subject}»` : 'в окне твоего дня'
  return 'очная пара'
}

function Rule({ text, onBack }: { text: string; onBack: () => void }) {
  return (
    <li className="card rule">
      <span>{text}</span>
      <button onClick={onBack}>Вернуть</button>
    </li>
  )
}

const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
function keyText(key: string) {
  const [subject, teacher, wd, start] = key.split('|')
  return `Пара: ${subject}, ${teacher || 'без преподавателя'}, ${DAYS[+wd]} ${fmtTime(+start)}`
}
function uidText(uid: string, ls: Lesson[]) {
  const l = ls.find((x) => x.uid === uid)
  return l ? `Занятие: ${l.subject}, ${weekdayName(l.date)} ${fmtDate(l.date)} ${fmtTime(l.start)}` : `Занятие ${uid}`
}
