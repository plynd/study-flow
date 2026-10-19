// Путь: src/main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initTelegram } from './platform/telegram'
import { initSync, markMounted } from './data/syncEngine'

initTelegram()

// Сначала пробуем забрать данные с сервера (не дольше 2,5 с), чтобы экраны сразу открылись с актуальными.
// Если связь медленная, показываем то, что есть на устройстве, а свежее применится, когда придёт.
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
await Promise.race([initSync().catch(() => undefined), wait(2500)])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
markMounted()
