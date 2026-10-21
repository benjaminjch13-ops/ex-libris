import { useState } from 'react'

/** Five stars in half-star steps. Read-only when there is no onChange. */
export function Stars({ value, onChange, size = 26, label }: { value: number; onChange?: (v: number) => void; size?: number; label?: string }) {
  const [hover, setHover] = useState(0)
  const shown = hover || value
  const fill = (i: number) => Math.max(0, Math.min(1, shown - (i - 1)))
  const star = (i: number) => (
    <span className="star" aria-hidden>
      <span className="star-bg">★</span>
      <span className="star-fg" style={{ width: `${fill(i) * 100}%` }}>★</span>
    </span>
  )
  if (!onChange) {
    return (
      <span className="stars" role="img" aria-label={value ? `${fmtRating(value)} de 5 estrellas` : 'Sin calificar'} style={{ fontSize: size }}>
        {[1, 2, 3, 4, 5].map((i) => <span key={i}>{star(i)}</span>)}
      </span>
    )
  }
  const pick = (e: React.MouseEvent<HTMLButtonElement>, i: number) => {
    const r = e.currentTarget.getBoundingClientRect()
    return e.clientX - r.left < r.width / 2 ? i - 0.5 : i
  }
  return (
    <span
      className="stars editable"
      role="slider"
      tabIndex={0}
      aria-label={label ?? 'Calificación'}
      aria-valuemin={0}
      aria-valuemax={5}
      aria-valuenow={value}
      aria-valuetext={value ? `${fmtRating(value)} de 5 estrellas` : 'Sin calificar'}
      style={{ fontSize: size }}
      onMouseLeave={() => setHover(0)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); onChange(Math.min(5, value + 0.5)) }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); onChange(Math.max(0, value - 0.5)) }
      }}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          tabIndex={-1}
          aria-hidden
          onMouseMove={(e) => setHover(pick(e, i))}
          onClick={(e) => { const v = pick(e, i); onChange(value === v ? 0 : v) }}
        >{star(i)}</button>
      ))}
    </span>
  )
}

export const fmtRating = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ','))
