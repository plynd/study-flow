// Путь: src/ui/icons.tsx
// Простые линейные иконки одной толщины; цвет берут из текста (currentColor).
import type { ReactNode } from 'react'

function Svg({ children, size = 22 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  )
}

export const IconDebts = () => <Svg><rect x="4" y="3.5" width="16" height="17" rx="4.5" /><path d="m8.5 12.2 2.5 2.5 4.5-5" /></Svg>
export const IconCalendar = () => <Svg><rect x="3.5" y="5" width="17" height="15.5" rx="4" /><path d="M3.5 10h17M8 3v4M16 3v4" /></Svg>
export const IconRefresh = () => <Svg><path d="M20 11a8 8 0 1 0-2.4 5.7" /><path d="M20 4.5V11h-6.5" /></Svg>
export const IconTune = () => <Svg><path d="M4 7h9M19 7h1M4 17h1M11 17h9" /><circle cx="16" cy="7" r="2.2" /><circle cx="8" cy="17" r="2.2" /></Svg>
export const IconPlus = () => <Svg><path d="M12 5v14M5 12h14" /></Svg>
export const IconMinus = () => <Svg><path d="M5 12h14" /></Svg>
export const IconChevronRight = ({ size = 16 }: { size?: number }) => <Svg size={size}><path d="m9 6 6 6-6 6" /></Svg>
export const IconChevronLeft = () => <Svg><path d="m15 6-6 6 6 6" /></Svg>
export const IconCheck = ({ size = 16 }: { size?: number }) => <Svg size={size}><path d="m5 12.5 4.5 4.5L19 7.5" /></Svg>
export const IconMore = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
    <circle cx="5.5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="18.5" cy="12" r="1.6" />
  </svg>
)
