// Путь: src/ui/Segmented.tsx
import type { CSSProperties } from 'react'

interface Props<T extends string> {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  label: string
}

/** Переключатель режимов: «бегунок» плавно переезжает на выбранный пункт */
export default function Segmented<T extends string>({ value, options, onChange, label }: Props<T>) {
  const i = Math.max(0, options.findIndex((o) => o.value === value))
  return (
    <div className="seg" role="tablist" aria-label={label}
      style={{ '--n': options.length, '--i': i } as CSSProperties}>
      <span className="seg-thumb" aria-hidden="true" />
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value}
          className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
