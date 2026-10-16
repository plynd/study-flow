// Путь: src/screens/ScheduleScreen.tsx
import { useEffect, useState } from 'react'
import {
  addDays, building, dayBlocks, dayBounds, defaultWeek, emptyHidden, fmtDate, fmtTime, fmtWeek,
  groupByDate, lessonKey, parallelOf, parseIcs, visibleLessons, weekdayName, weeksOf,
  type Hidden, type Lesson,
} from '../domain/schedule'
import Picker from './Picker'
import Sheet from '../ui/Sheet'
import Segmented from '../ui/Segmented'
import Toast from '../ui/Toast'
import { makeNotice, type Notice } from '../ui/notice'
import { IconChevronLeft, IconChevronRight, IconMore, IconRefresh, IconTune } from '../ui/icons'
import { PAUSE_MS, agoText, canRefresh, isLecturerUrl, minutesLeft, validateIcsUrl } from '../domain/sources'
import { classifyCalendar, icsName, matchesFor, teacherDay, type Tag, type TeacherCal, type TeacherEntry } from '../domain/teachers'

const K_LESSONS = 'schedule-lessons-v1'
const K_HIDDEN = 'schedule-hidden-v1'
const K_TEACHERS = 'schedule-teachers-v1'
const K_SHOW = 'schedule-show-matches-v1'
const K_OWN = 'schedule-own-source-v1'

interface Source { url: string; updatedAt?: number; label?: string }
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
  const [menuLesson, setMenuLesson] = useState<Lesson | null>(null)
  const [settings, setSettings] = useState(false)
  const [hiddenSheet, setHiddenSheet] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [week, setWeek] = useState<string | null>(null)
  const [day, setDay] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('mine')
  const [teachers, setTeachers] = useState<TeacherCal[]>(() => read<TeacherCal[]>(K_TEACHERS, []))
  const [own, setOwn] = useState<Source>(() => read<Source>(K_OWN, { url: '' }))
  const [teacherUrl, setTeacherUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [picker, setPicker] = useState<null | 'group' | 'lecturer'>(null)
  const [now, setNow] = useState(() => Date.now())
  const say = (text: string, tone: 'info' | 'error' = 'info', undo?: () => void) =>
    setNotice(makeNotice(text, tone, undo && { label: 'Отменить', run: undo }))
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
      return { ok: false, msg: `Это расписание группы («${name}»), а не преподавателя. Группу выбирают в «Источниках», в разделе «Моя группа».` }
    }
    if (target === 'own') {
      setLessons(parsed) // новый файл заменяет старое расписание; скрытия сохраняются
      if (o.sourceUrl) setOwn((x) => ({ ...x, url: o.sourceUrl!, updatedAt: Date.now(), label: name ?? x.label }))
      return { ok: true, msg: 'обновлено' }
    }
    saveTeacher(name ?? o.fileName ?? 'Преподаватель', parsed, o.sourceUrl, o.teacherId)
    return { ok: true, msg: 'обновлено' }
  }

  /** Кнопка «Обновить»: источники по очереди, с паузой; кулдаун 30 мин; стоп при 403/429 */
  async function refreshAll() {
    if (own.url && isLecturerUrl(own.url)) {
      say('Ссылка в «Моей группе» ведёт на страницу преподавателя. Выбери там свою группу.', 'error')
      setSettings(true)
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
    if (jobs.length === 0) { say('Пока нечего обновлять. Выбери группу в «Источниках».'); setSettings(true); return }

    setBusy(true); setNotice(null)
    const notes: string[] = []
    let failed = false
    let first = true
    for (const j of jobs) {
      const t0 = Date.now()
      if (!canRefresh(j.src.updatedAt, t0)) { notes.push(`${j.label}: свежее, подожди ещё ${minutesLeft(j.src.updatedAt!, t0)} мин`); continue }
      if (!first) await sleep(PAUSE_MS)
      first = false
      const r = await fetchIcs(j.src.url)
      if ('error' in r) { failed = true; notes.push(`${j.label}: ${r.error}`); if (r.stop) break; continue }
      notes.push(`${j.label}: ${j.apply(r.text).msg}`)
    }
    say(notes.join(' · '), failed ? 'error' : 'info')
    setNow(Date.now())
    setBusy(false)
  }

  async function pickOwn(url: string) {
    setPicker(null); setBusy(true); setNotice(null)
    const r = await fetchIcs(url)
    if ('error' in r) { say(r.error, 'error'); setBusy(false); return }
    const res = acceptCalendar(r.text, 'own', { sourceUrl: url })
    if (res.ok) say(res.msg === 'обновлено' ? 'Расписание группы загружено' : res.msg); else say(res.msg, 'error')
    setNow(Date.now()); setBusy(false)
  }

  async function addTeacherByUrl(picked?: string) {
    const v = validateIcsUrl(picked ?? teacherUrl)
    if (!v.ok) { say(v.reason, 'error'); return }
    setBusy(true); setNotice(null)
    const r = await fetchIcs(v.url)
    if ('error' in r) { say(r.error, 'error'); setBusy(false); return }
    const res = acceptCalendar(r.text, 'teacher', { sourceUrl: v.url })
    if (res.ok) { setTeacherUrl(''); setPicker(null); say('Преподаватель добавлен') } else say(res.msg, 'error')
    setBusy(false)
  }

  async function onTeacherFile(file: File | undefined) {
    if (!file) return
    const res = acceptCalendar(await file.text(), 'teacher', { fileName: file.name.replace(/\.ics$/i, '') })
    if (res.ok) say('Преподаватель добавлен'); else say(res.msg, 'error')
  }

  async function onFile(file: File | undefined) {
    if (!file) return
    const res = acceptCalendar(await file.text(), 'own', { fileName: file.name.replace(/\.ics$/i, '') })
    if (res.ok) say(res.msg === 'обновлено' ? 'Расписание загружено' : res.msg); else say(res.msg, 'error')
  }

  /** Скрыть что-то и дать возможность отменить (ничего не пропадает насовсем) */
  const hide = (field: keyof Hidden, v: string, text: string) => {
    const prev = hidden
    setHidden((h) => ({ ...h, [field]: h[field].includes(v) ? h[field] : [...h[field], v] }))
    setMenuLesson(null)
    say(text, 'info', () => setHidden(prev))
  }
  const remove = (field: keyof Hidden, v: string) =>
    setHidden((h) => ({ ...h, [field]: h[field].filter((x) => x !== v) }))

  /** «Это моя»: скрыть остальные из параллельных (пара повторяется каждую неделю) */
  const pickMine = (l: Lesson) => {
    const prev = hidden
    const keys = parallelOf(l, lessons).map(lessonKey)
    setHidden((h) => ({ ...h, keys: [...new Set([...h.keys, ...keys])] }))
    say(`Выбрано: «${l.subject}». Остальные параллельные пары скрыты.`, 'info', () => setHidden(prev))
  }

  const today = todayStr()
  const visible = visibleLessons(lessons, hidden)
  const hiddenCount = lessons.length - visible.length
  const weeks = weeksOf(lessons)
  const current = week && weeks.includes(week) ? week : weeks.length ? defaultWeek(weeks, today) : null
  const idx = current ? weeks.indexOf(current) : -1
  const weekDays = current ? Array.from({ length: 7 }, (_, i) => addDays(current, i)) : []
  const inWeek = (d: string) => weekDays.includes(d)
  const ownByDate = new Map(groupByDate(visible.filter((l) => inWeek(l.date))))
  const dates = new Set<string>(mode === 'teachers' ? [] : ownByDate.keys())
  if (mode !== 'mine') for (const t of teachers) for (const l of t.lessons) if (inWeek(l.date) && !l.remote) dates.add(l.date)
  // Какой день на экране: выбранный → сегодня → первый с парами → понедельник
  const selected = day && weekDays.includes(day) ? day
    : weekDays.includes(today) ? today
    : weekDays.find((d) => dates.has(d)) ?? weekDays[0] ?? null

  const goWeek = (w: string) => { setWeek(w); setDay(null) }

  const tcard = (e: TeacherEntry, name: string) => (
    <li key={name + e.lesson.uid} className={`lesson teacher ${e.tag}`}>
      <div className="lesson-main" style={{ cursor: 'default' }}>
        <span className="l-time"><b>{fmtTime(e.lesson.start)}</b><i>{fmtTime(e.lesson.end)}</i></span>
        <span className="l-bar" />
        <span className="l-body">
          <span className="l-title">{e.lesson.subject}</span>
          <span className="l-meta">
            {e.lesson.kind} · ауд. {e.lesson.room}{building(e.lesson.room) ? ` (корпус ${building(e.lesson.room)})` : ''}
          </span>
          <span className="l-tag">{tagText(e.tag, e)}</span>
        </span>
        <span />
      </div>
    </li>
  )

  const card = (l: Lesson, par: Lesson[], color: number | null) => (
    <li key={l.uid} className={`lesson ${l.remote ? 'remote' : ''} ${color !== null ? 'p' + color : ''}`}>
      <button className="lesson-main" onClick={() => setMenuLesson(l)} aria-label={`${l.subject}, действия`}>
        <span className="l-time"><b>{fmtTime(l.start)}</b><i>{fmtTime(l.end)}</i></span>
        <span className="l-bar" />
        <span className="l-body">
          <span className="l-title">{l.subject}</span>
          <span className="l-meta">
            {l.kind} · {l.remote ? 'дистанционно, только для информации' : `ауд. ${l.room}${building(l.room) ? ` (корпус ${building(l.room)})` : ''}`}
          </span>
          {l.teacher && <span className="l-meta">{l.teacher}</span>}
        </span>
        <span className="l-more"><IconMore /></span>
      </button>
      {par.length > 0 && (
        <button className="btn-tint pick press" onClick={() => pickMine(l)}>Это моя пара</button>
      )}
    </li>
  )

  // Что показать в выбранный день
  const ls = selected ? ownByDate.get(selected) ?? [] : []
  const b = dayBounds(ls)
  const tdays = !selected || mode === 'mine' ? [] : teachers.map((t) => ({
    t,
    r: teacherDay(mode === 'teachers' ? [] : ls, t.lessons.filter((l) => l.date === selected), matchesFor(t, showMatches)),
  })).filter(({ r }) => r.entries.length > 0 || r.hiddenRemote > 0)
  const hasContent = (mode !== 'teachers' && ls.length > 0) || tdays.length > 0

  const sub = own.url
    ? `${own.label ?? 'Моё расписание'} · ${agoText(own.updatedAt, now)}`
    : lessons.length ? 'Загружено из файла' : 'Группа не выбрана'

  return (
    <main>
      <header className="navbar">
        <h1 className="large-title">Расписание</h1>
        <div className="nav-actions">
          <button className={`icon-btn press ${busy ? 'spin' : ''}`} aria-label="Обновить расписание" disabled={busy} onClick={refreshAll}><IconRefresh /></button>
          <button className="icon-btn press" aria-label="Источники и настройки" onClick={() => setSettings(true)}><IconTune /></button>
        </div>
      </header>
      <p className="caption subtitle">{sub}</p>

      {lessons.length === 0 && teachers.length === 0 ? (
        <div className="empty">
          <p className="headline">Расписания пока нет</p>
          <p className="caption">Выбери свою группу из списка сайта АлтГУ, и здесь появятся пары по дням.</p>
          <button className="btn-primary press" onClick={() => setPicker('group')}>Выбрать группу</button>
          <button className="btn-plain small" onClick={() => setSettings(true)}>Другие способы</button>
        </div>
      ) : (
        <div className="sched-grid">
          <div className="sticky-top">
            <Segmented label="Что показывать" value={mode} onChange={setMode}
              options={[{ value: 'mine', label: 'Моё' }, { value: 'teachers', label: 'Преподаватели' }, { value: 'both', label: 'Вместе' }]} />
            {current && (
              <>
                <div className="weekrow">
                  <span className="left-spacer" />
                  <span className="mid">
                    <button className="nav press" disabled={idx <= 0} onClick={() => goWeek(weeks[idx - 1])} aria-label="Предыдущая неделя"><IconChevronLeft /></button>
                    <span className="title num">{fmtWeek(current)}</span>
                    <button className="nav press" disabled={idx >= weeks.length - 1} onClick={() => goWeek(weeks[idx + 1])} aria-label="Следующая неделя"><IconChevronRight size={22} /></button>
                  </span>
                  <button className={`today ${selected === today ? 'ghost' : ''}`} tabIndex={selected === today ? -1 : 0}
                    onClick={() => { setWeek(null); setDay(null) }}>Сегодня</button>
                </div>
                <div className="strip" role="tablist" aria-label="Дни недели">
                  {weekDays.map((d, i) => (
                    <button key={d} role="tab" aria-selected={d === selected}
                      className={`daychip press ${d === selected ? 'on' : ''} ${d === today ? 'today' : ''}`}
                      onClick={() => setDay(d)} aria-label={`${weekdayName(d)} ${fmtDate(d)}`}>
                      <span className="dow">{DAYS[i]}</span>
                      <span className="dom">{+d.slice(8, 10)}</span>
                      <span className={`dot ${dates.has(d) ? '' : 'none'}`} />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="sched-day">
          {selected && (
            <>
              <div className="day-head">
                <h2 className="day-title">{weekdayName(selected)}, {fmtDate(selected)}</h2>
                {mode !== 'teachers' && (b || ls.length > 0) && (
                  <p className="caption">{b ? `Очные пары с ${fmtTime(b.start)} до ${fmtTime(b.end)}` : 'Без очных пар'}</p>
                )}
              </div>

              {!hasContent && (
                <div className="empty">
                  <p className="headline">Пар нет</p>
                  <p className="caption">{hiddenCount > 0 ? 'В этот день пар нет, либо они скрыты.' : 'В этот день пар нет.'}</p>
                </div>
              )}

              {mode !== 'teachers' && ls.length > 0 && (
                <ul className="stack">
                  {dayBlocks(ls).map((block) =>
                    block.length === 1
                      ? card(block[0], [], null)
                      : (
                        <li key={block[0].uid} className="parallel">
                          <p className="par-label">Параллельно: выбери свою пару</p>
                          <ul className="stack">{block.map((l, i) => card(l, parallelOf(l, block), i % 4))}</ul>
                        </li>
                      ),
                  )}
                </ul>
              )}

              {tdays.map(({ t, r }) => (
                <div key={t.id} className="tblock">
                  <p className="tname">{t.name}</p>
                  <ul className="stack">{r.entries.map((e) => tcard(e, t.name))}</ul>
                  {r.hiddenRemote > 0 && <p className="footnote">Скрыто пар без аудитории: {r.hiddenRemote}</p>}
                </div>
              ))}
            </>
          )}
          </div>
        </div>
      )}

      {/* Действия над парой */}
      <Sheet open={!!menuLesson} onClose={() => setMenuLesson(null)} title={menuLesson?.subject ?? ''}>
        {menuLesson && (
          <>
            {menuLesson.subject.length > 28 && <p className="headline" style={{ textAlign: 'center', paddingTop: '.75rem' }}>{menuLesson.subject}</p>}
            <p className="caption" style={{ textAlign: 'center' }}>
              {weekdayName(menuLesson.date)} {fmtDate(menuLesson.date)}, {fmtTime(menuLesson.start)}–{fmtTime(menuLesson.end)}
            </p>
            <h3 className="section-title">Скрыть</h3>
            <div className="group">
              <button className="row" onClick={() => hide('uids', menuLesson.uid, 'Занятие скрыто')}>
                <span className="row-main">
                  <span className="row-title">Только это занятие</span>
                  <span className="row-sub">{fmtDate(menuLesson.date)}</span>
                </span>
              </button>
              <button className="row" onClick={() => hide('keys', lessonKey(menuLesson), 'Пара скрыта на все недели')}>
                <span className="row-main">
                  <span className="row-title">Эту пару каждую неделю</span>
                  <span className="row-sub">{weekdayName(menuLesson.date)}, {fmtTime(menuLesson.start)}</span>
                </span>
              </button>
              <button className="row" onClick={() => hide('subjects', menuLesson.subject, 'Предмет скрыт')}>
                <span className="row-main">
                  <span className="row-title">Предмет целиком</span>
                  <span className="row-sub">Все пары «{menuLesson.subject}»</span>
                </span>
              </button>
            </div>
            <p className="footnote">Скрытое можно вернуть в «Источниках» → «Скрытое».</p>
          </>
        )}
      </Sheet>

      {/* Источники и настройки */}
      <Sheet open={settings} onClose={() => setSettings(false)} title="Источники">
        <h3 className="section-title">Моя группа</h3>
        <div className="group">
          <div className="row">
            <span className="row-main">
              <span className="row-title strong">{own.label ?? (lessons.length ? 'Расписание из файла' : 'Группа не выбрана')}</span>
              {lessons.length > 0 && <span className="row-sub">Пар: {lessons.length}{own.url ? ` · ${agoText(own.updatedAt, now)}` : ''}</span>}
            </span>
          </div>
          <button className="row accent" disabled={busy} onClick={() => setPicker('group')}>
            <span className="row-title">{own.url ? 'Сменить группу' : 'Выбрать группу из списка'}</span>
          </button>
          <label className="row accent">
            <span className="row-title">Загрузить файл .ics</span>
            <input type="file" accept=".ics,text/calendar" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = '' }} />
          </label>
          <details className="row-details">
            <summary className="row">
              <span className="row-main"><span className="row-title">Вставить ссылку вручную</span></span>
              <span className="chev"><IconChevronRight /></span>
            </summary>
            <div className="details-body">
              <input className="input boxed" placeholder="Ссылка на .ics группы (…/?file=….ics)" aria-label="Ссылка на .ics группы" value={own.url}
                onChange={(e) => {
                  const url = e.target.value
                  if (isLecturerUrl(url)) {
                    say('Это ссылка на расписание преподавателя. Её место ниже, в «Преподавателях».', 'error')
                    return
                  }
                  setNotice(null)
                  setOwn((o) => ({ url, updatedAt: url === o.url ? o.updatedAt : undefined }))
                }} />
              <p className="caption">После вставки нажми ↻ вверху экрана.</p>
            </div>
          </details>
        </div>

        <h3 className="section-title">Преподаватели</h3>
        <div className="group">
          {teachers.map((t) => (
            <details key={t.id} className="row-details">
              <summary className="row">
                <span className="row-main">
                  <span className="row-title strong">{t.name}</span>
                  <span className="row-sub">{agoText(t.updatedAt, now)}</span>
                </span>
                <span className="chev"><IconChevronRight /></span>
              </summary>
              <div className="details-body">
                <input className="input boxed" aria-label="Имя" value={t.name} onChange={(e) => patchTeacher(t.id, { name: e.target.value })} />
                <select className="input boxed" aria-label="Совпадения по времени" value={t.showMatches === undefined ? 'def' : t.showMatches ? 'yes' : 'no'}
                  onChange={(e) => patchTeacher(t.id, { showMatches: e.target.value === 'def' ? undefined : e.target.value === 'yes' })}>
                  <option value="def">Совпадения: как в общих настройках</option>
                  <option value="yes">Совпадения: показывать</option>
                  <option value="no">Совпадения: скрывать</option>
                </select>
                <button className="btn-plain danger small" style={{ justifySelf: 'start' }}
                  onClick={() => { const prev = teachers; setTeachers((ts) => ts.filter((x) => x.id !== t.id)); say(`«${t.name}» убран`, 'info', () => setTeachers(prev)) }}>
                  Убрать преподавателя
                </button>
              </div>
            </details>
          ))}
          {teachers.length === 0 && <div className="row"><span className="row-sub">Пока никого нет.</span></div>}
          <button className="row accent" disabled={busy} onClick={() => setPicker('lecturer')}>
            <span className="row-title">Добавить из списка</span>
          </button>
          <label className="row accent">
            <span className="row-title">Загрузить файл .ics</span>
            <input type="file" accept=".ics,text/calendar" onChange={(e) => { onTeacherFile(e.target.files?.[0]); e.target.value = '' }} />
          </label>
          <details className="row-details">
            <summary className="row">
              <span className="row-main"><span className="row-title">Вставить ссылку вручную</span></span>
              <span className="chev"><IconChevronRight /></span>
            </summary>
            <div className="details-body">
              <input className="input boxed" placeholder="Ссылка на .ics преподавателя" aria-label="Ссылка на .ics преподавателя" value={teacherUrl} onChange={(e) => setTeacherUrl(e.target.value)} />
              <button className="btn-tint press" disabled={busy || !teacherUrl} onClick={() => addTeacherByUrl()}>Добавить</button>
            </div>
          </details>
        </div>

        <h3 className="section-title">Показ</h3>
        <div className="group">
          <label className="row">
            <span className="row-main">
              <span className="row-title">Пары, совпадающие с моими</span>
              <span className="row-sub">Показывать пары преподавателя, идущие в то же время, что и мои</span>
            </span>
            <input type="checkbox" role="switch" className="switch" checked={showMatches} onChange={(e) => setShowMatches(e.target.checked)} />
          </label>
          <button className="row" onClick={() => setHiddenSheet(true)}>
            <span className="row-main"><span className="row-title">Скрытое</span></span>
            <span className="trail">{hiddenCount > 0 ? `${hiddenCount} пар` : 'ничего'}<span className="chev"><IconChevronRight /></span></span>
          </button>
        </div>
        <p className="footnote">Расписание обновляется кнопкой ↻ вверху экрана, не чаще раза в 30 минут для каждого источника: сайт университета не перегружается.</p>
      </Sheet>

      {/* Скрытое */}
      <Sheet open={hiddenSheet} onClose={() => setHiddenSheet(false)} title="Скрытое">
        {hidden.subjects.length + hidden.keys.length + hidden.uids.length === 0 ? (
          <p className="status-line" style={{ textAlign: 'center', paddingTop: '1.5rem' }}>Ничего не скрыто.</p>
        ) : (
          <div className="group" style={{ marginTop: '.75rem' }}>
            {hidden.subjects.map((x) => <Rule key={'s' + x} text={`Предмет: ${x}`} onBack={() => remove('subjects', x)} />)}
            {hidden.keys.map((k) => <Rule key={'k' + k} text={keyText(k)} onBack={() => remove('keys', k)} />)}
            {hidden.uids.map((u) => <Rule key={'u' + u} text={uidText(u, lessons)} onBack={() => remove('uids', u)} />)}
          </div>
        )}
      </Sheet>

      {/* Выбор группы / преподавателя из списка сайта */}
      <Sheet open={picker === 'group'} onClose={() => setPicker(null)} title="Выбор группы">
        <Picker kind="students" onPick={(_, url) => pickOwn(url)} />
      </Sheet>
      <Sheet open={picker === 'lecturer'} onClose={() => setPicker(null)} title="Выбор преподавателя">
        <Picker kind="lecturers" onPick={(_, url) => addTeacherByUrl(url)} />
      </Sheet>

      <Toast notice={notice} onClose={() => setNotice(null)} />
    </main>
  )
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function tagText(tag: Tag, e: TeacherEntry) {
  if (tag === 'before') return 'Последняя пара до твоего дня'
  if (tag === 'after') return 'Первая пара после твоего дня'
  if (tag === 'inside') return e.match ? `Совпадает с твоей парой «${e.match.subject}»` : 'В окне твоего дня'
  return 'Очная пара'
}

function Rule({ text, onBack }: { text: string; onBack: () => void }) {
  return (
    <div className="row">
      <span className="row-main"><span className="row-title">{text}</span></span>
      <button className="btn-plain small" onClick={onBack}>Вернуть</button>
    </div>
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
