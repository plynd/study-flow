// Путь: src/App.tsx
import { useRef, useState, type CSSProperties, type ReactNode } from 'react'
import DebtsScreen from './screens/DebtsScreen'
import ScheduleScreen from './screens/ScheduleScreen'
import NotesScreen from './screens/NotesScreen'
import DataScreen from './screens/DataScreen'
import { useSyncState } from './data/syncEngine'
import { IconCalendar, IconData, IconDebts, IconNotes } from './ui/icons'
import './index.css'

type Tab = 'debts' | 'schedule' | 'notes' | 'data'
const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'debts', label: 'Долги', icon: <IconDebts /> },
  { id: 'schedule', label: 'Расписание', icon: <IconCalendar /> },
  { id: 'notes', label: 'Заметки', icon: <IconNotes /> },
  { id: 'data', label: 'Данные', icon: <IconData /> },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('debts')
  const { status } = useSyncState()
  const syncAlert = status === 'error' || status === 'offline'
  const scrolls = useRef<Record<Tab, number>>({ debts: 0, schedule: 0, notes: 0, data: 0 })

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
      <div hidden={tab !== 'data'} className="screen"><DataScreen active={tab === 'data'} /></div>
      <nav className="tabbar" aria-label="Разделы">
        <span className="side-brand">Долги и расписание</span>
        {/* «бегунок» переезжает к выбранной вкладке, как в переключателе расписания */}
        <div className="tabs" style={{ '--n': TABS.length, '--i': Math.max(0, TABS.findIndex((t) => t.id === tab)) } as CSSProperties}>
          <span className="tab-thumb" aria-hidden="true" />
          {TABS.map((t) => (
            <button key={t.id} className="tab press" aria-current={tab === t.id ? 'page' : undefined} onClick={() => go(t.id)}>
              <span className="tab-icon">
                {t.icon}
                {t.id === 'data' && syncAlert && <span className="alert-dot" aria-label="Есть проблема с синхронизацией" />}
              </span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </>
  )
}
