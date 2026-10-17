// Путь: src/screens/ScheduleAside.tsx
// Боковая панель расписания (на ноутбуке и мониторе): ближайшая пара, «Сдать долги», загрузка недели.
// Только показывает: вся арифметика — в domain/insights.ts.
import { readDebts } from '../data/readDebts'
import { useMemo } from 'react'
import { debtMeetings, fmtDuration, nextLesson, weekLoad } from '../domain/insights'
import { building, fmtDate, fmtTime, weekdayName, type Lesson } from '../domain/schedule'
import type { TeacherCal } from '../domain/teachers'

interface Props {
  /** все видимые (не скрытые) пары группы */
  visible: Lesson[]
  /** преподаватели с загруженными расписаниями */
  teachers: TeacherCal[]
  /** вкладка «Расписание» открыта сейчас (долги могли измениться на соседней вкладке) */
  active: boolean
  selected: string | null
  weekDays: string[]
  now: number
  today: string
  onPickDay: (date: string) => void
}

const SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

export default function ScheduleAside({ visible, teachers, active, selected, weekDays, now, today, onPickDay }: Props) {
  const d = new Date(now)
  const minNow = d.getHours() * 60 + d.getMinutes()
  const next = nextLesson(visible, today, minNow)
  // Долги лежат в браузере и меняются на другой вкладке: перечитываем, когда эту открыли и раз в полминуты
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debts = useMemo(() => readDebts(), [active, now])
  const meetings = debtMeetings(debts, teachers, today, minNow)
  const load = weekLoad(visible, weekDays)
  const maxMin = Math.max(1, ...load.map((x) => x.minutes))
  const weekMin = load.reduce((s, x) => s + x.minutes, 0)

  return (
    <aside className="aside" aria-label="Сводка">
      <section className="side-card">
        <h3 className="side-title">{next?.ongoing ? 'Идёт сейчас' : 'Ближайшая пара'}</h3>
        {next ? (
          <button className="next-btn press" onClick={() => onPickDay(next.lesson.date)}>
            <span className="next-when num">
              {next.ongoing ? `ещё ${fmtDuration(next.minutes)}` : `через ${fmtDuration(next.minutes)}`}
            </span>
            <span className="next-name">{next.lesson.subject}</span>
            <span className="caption">
              {next.lesson.date === today ? 'Сегодня' : `${weekdayName(next.lesson.date)} ${fmtDate(next.lesson.date)}`}, {fmtTime(next.lesson.start)}–{fmtTime(next.lesson.end)}
              {' · '}ауд. {next.lesson.room}{building(next.lesson.room) ? ` (корпус ${building(next.lesson.room)})` : ''}
            </span>
          </button>
        ) : (
          <p className="caption">Дальше очных пар в расписании нет.</p>
        )}
      </section>

      {(
        <section className="side-card">
          <h3 className="side-title">Сдать долги</h3>
          {meetings.length === 0 && (
            <p className="caption">Здесь появится, когда и где застать преподавателя. Для этого у незакрытого долга укажи преподавателя и добавь его расписание в «Источниках».</p>
          )}
          <ul className="meets">
            {meetings.map(({ debt, hasCalendar, next: n }) => (
              <li key={debt.id}>
                {n ? (
                  <button className="meet press" onClick={() => onPickDay(n.lesson.date)}>
                    <span className="meet-top">
                      <span className="meet-subj">{debt.subject}</span>
                      <span className="meet-when num">{n.ongoing ? 'идёт сейчас' : `через ${fmtDuration(n.minutes)}`}</span>
                    </span>
                    <span className="caption">
                      {debt.teacher} · {n.lesson.date === today ? 'сегодня' : `${weekdayName(n.lesson.date)} ${fmtDate(n.lesson.date)}`}, {fmtTime(n.lesson.start)}
                      {' · '}ауд. {n.lesson.room}{building(n.lesson.room) ? ` (${building(n.lesson.room)})` : ''}
                    </span>
                  </button>
                ) : (
                  <div className="meet">
                    <span className="meet-subj">{debt.subject}</span>
                    <span className="caption">
                      {debt.teacher} · {hasCalendar ? 'очных пар больше нет' : 'расписание не добавлено'}
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {meetings.some((m) => !m.hasCalendar) && (
            <p className="caption">Добавь преподавателя в «Источниках», и здесь появится, когда и где его застать.</p>
          )}
        </section>
      )}

      <section className="side-card">
        <h3 className="side-title">Загрузка недели <span className="caption num">· {fmtDuration(weekMin)}</span></h3>
        <div className="load" role="list">
          {load.map((x, i) => (
            <button key={x.date} role="listitem" className={`load-col press ${x.date === selected ? 'on' : ''}`}
              onClick={() => onPickDay(x.date)} aria-label={`${weekdayName(x.date)}: пар ${x.pairs}`}>
              <span className="load-bar-wrap"><span className="load-bar" style={{ height: `${Math.max(x.minutes ? 8 : 3, (x.minutes / maxMin) * 100)}%` }} /></span>
              <span className="load-n num">{x.pairs || ''}</span>
              <span className="load-d">{SHORT[i]}</span>
            </button>
          ))}
        </div>
      </section>
    </aside>
  )
}
