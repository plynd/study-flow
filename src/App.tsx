// Путь: src/App.tsx
import { useState } from 'react'
import DebtsScreen from './screens/DebtsScreen'
import ScheduleScreen from './screens/ScheduleScreen'
import './index.css'

export default function App() {
  const [tab, setTab] = useState<'debts' | 'schedule'>('debts')
  return (
    <>
      <nav className="tabs">
        <button className={tab === 'debts' ? 'on' : ''} onClick={() => setTab('debts')}>Долги</button>
        <button className={tab === 'schedule' ? 'on' : ''} onClick={() => setTab('schedule')}>Расписание</button>
      </nav>
      {tab === 'debts' ? <DebtsScreen /> : <ScheduleScreen />}
    </>
  )
}
