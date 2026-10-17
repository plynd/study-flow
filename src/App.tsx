// Путь: src/App.tsx
import { useRef, useState, type ReactNode } from 'react'
import DebtsScreen from './screens/DebtsScreen'
import ScheduleScreen from './screens/ScheduleScreen'
import NotesScreen from './screens/NotesScreen'
import { IconCalendar, IconDebts, IconNotes } from './ui/icons'
import './index.css'

type Tab = 'debts' | 'schedule' | 'notes'
const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'debts', label: 'Долги', icon: <IconDebts /> },
  { id: 'schedule', label: 'Расписание', icon: <IconCalendar /> },
  { id: 'notes', label: 'Заметки', icon: <IconNotes /> },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('debts')
  const scrolls = useRef<Record<Tab, number>>({ debts: 0, schedule: 0, notes: 0 })

  // Экраны остаются в памяти (скрытые), чтобы не терять неделю, день и открытые настройки
  const go = (next: Tab) => {
    if (next === tab) { window.scrollTo({ top: 0, behavior: 'smooth' }); return }
    scrolls.current[tab] = window.scrollY
    setTab(next)
    requestAnimationFrame(() => window.scrollTo(0, scrolls.current[next]))
  }

  return (
    <>
      <div hidden={tab !== 'debts'} className="screen"><DebtsScreen /></div>
      <div hidden={tab !== 'schedule'} className="screen"><ScheduleScreen active={tab === 'schedule'} /></div>
      <div hidden={tab !== 'notes'} className="screen"><NotesScreen active={tab === 'notes'} /></div>
      <nav className="tabbar" aria-label="Разделы">
        <span className="side-brand">Долги и расписание</span>
        {TABS.map((t) => (
          <button key={t.id} className="tab press" aria-current={tab === t.id ? 'page' : undefined} onClick={() => go(t.id)}>
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </>
  )
}
