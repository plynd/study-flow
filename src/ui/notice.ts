// Путь: src/ui/notice.ts
export interface Notice {
  id: number
  text: string
  tone: 'info' | 'error'
  action?: { label: string; run: () => void }
}

let counter = 0
export const makeNotice = (text: string, tone: Notice['tone'] = 'info', action?: Notice['action']): Notice =>
  ({ id: ++counter, text, tone, action })
