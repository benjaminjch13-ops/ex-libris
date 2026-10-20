import type { CSSProperties } from 'react'
import type { Book } from '../types'
import { hash } from '../lib/color'
import { useLibrary } from '../state/library'

const MOTIFS = ['arcos', 'ondas', 'estrellas', 'rombos', 'lineas', 'circulos', 'hojas', 'marco'] as const

function motifFor(b: Book) {
  return MOTIFS[hash(b.id) % MOTIFS.length]
}

function Motif({ kind, color }: { kind: string; color: string }) {
  const s = { stroke: color, fill: 'none', strokeWidth: 1.2 }
  switch (kind) {
    case 'arcos':
      return <svg viewBox="0 0 100 60" className="cover-motif">{[0, 1, 2, 3].map((i) => <path key={i} {...s} d={`M${10 + i * 8} 58 V${34 - i * 2} a${40 - i * 8} ${40 - i * 8} 0 0 1 ${80 - i * 16} 0 V58`} />)}</svg>
    case 'ondas':
      return <svg viewBox="0 0 100 60" className="cover-motif">{[0, 1, 2, 3, 4].map((i) => <path key={i} {...s} d={`M0 ${14 + i * 9} q12.5 -7 25 0 t25 0 t25 0 t25 0`} />)}</svg>
    case 'estrellas':
      return (
        <svg viewBox="0 0 100 60" className="cover-motif">
          {[[20, 14, 2.2], [48, 8, 1.4], [76, 18, 2.6], [33, 36, 1.2], [62, 40, 1.8], [86, 48, 1.1], [12, 50, 1.6], [52, 24, 0.9]].map(([x, y, r], i) => (
            <g key={i} transform={`translate(${x} ${y})`}><path {...s} d={`M0 ${-r * 3} L${r * 0.6} ${-r * 0.6} L${r * 3} 0 L${r * 0.6} ${r * 0.6} L0 ${r * 3} L${-r * 0.6} ${r * 0.6} L${-r * 3} 0 L${-r * 0.6} ${-r * 0.6}Z`} /></g>
          ))}
          <path {...s} strokeDasharray="1 3" d="M20 14 L48 8 L76 18 L62 40 L33 36Z" />
        </svg>
      )
    case 'rombos':
      return <svg viewBox="0 0 100 60" className="cover-motif">{[0, 1, 2, 3, 4].map((i) => <path key={i} {...s} d={`M${10 + i * 20} 30 l10 -16 l10 16 l-10 16Z`} />)}<path {...s} d="M0 30 H100" /></svg>
    case 'lineas':
      return <svg viewBox="0 0 100 60" className="cover-motif">{Array.from({ length: 9 }, (_, i) => <path key={i} {...s} d={`M${8 + i * 3} 56 V${50 - Math.sin(i) * 18 - i * 3}`} />)}<path {...s} d="M4 56 H96" /><circle {...s} cx="72" cy="22" r="10" /></svg>
    case 'circulos':
      return <svg viewBox="0 0 100 60" className="cover-motif">{[[30, 28, 16], [56, 34, 11], [72, 20, 7], [44, 12, 5], [80, 44, 4]].map(([x, y, r], i) => <circle key={i} {...s} cx={x} cy={y} r={r} />)}</svg>
    case 'hojas':
      return (
        <svg viewBox="0 0 100 60" className="cover-motif">
          <path {...s} d="M50 58 C50 40 50 22 50 4" />
          {[0, 1, 2, 3, 4].map((i) => (
            <g key={i}>
              <path {...s} d={`M50 ${50 - i * 10} c-14 -2 -22 -10 -24 -18 c10 0 20 6 24 18Z`} />
              <path {...s} d={`M50 ${46 - i * 10} c14 -2 22 -10 24 -18 c-10 0 -20 6 -24 18Z`} />
            </g>
          ))}
        </svg>
      )
    default:
      return <svg viewBox="0 0 100 60" className="cover-motif"><rect {...s} x="18" y="6" width="64" height="48" rx="2" /><rect {...s} x="24" y="12" width="52" height="36" /><path {...s} d="M18 6 L24 12 M82 6 L76 12 M18 54 L24 48 M82 54 L76 48" /></svg>
  }
}

export function Cover({ book, className = '', style }: { book: Book; className?: string; style?: CSSProperties }) {
  const { coverUrl } = useLibrary()
  const url = coverUrl(book)
  const p = book.palette
  if (url) {
    return (
      <div className={`cover cover-image ${className}`} style={style}>
        <img src={url} alt={`Portada de ${book.title}`} draggable={false} />
        <span className="cover-sheen" />
      </div>
    )
  }
  return (
    <div
      className={`cover cover-generated ${className}`}
      style={{ ...style, '--c-bg': p.bg, '--c-fg': p.fg, '--c-ac': p.accent } as CSSProperties}
      role="img"
      aria-label={`Portada de ${book.title}`}
    >
      <div className="cover-frame">
        <span className="cover-author">{book.author || 'Autor desconocido'}</span>
        <Motif kind={motifFor(book)} color={p.accent} />
        <span className="cover-title">{book.title || 'Sin título'}</span>
        <span className="cover-rule" />
        <span className="cover-cat">{book.category}</span>
      </div>
      <span className="cover-sheen" />
    </div>
  )
}

function Spine({ book }: { book: Book }) {
  const { spineUrl } = useLibrary()
  const photo = spineUrl(book)
  if (photo) {
    return (
      <div className="spine spine-photo">
        <img src={photo} alt="" draggable={false} />
      </div>
    )
  }
  const p = book.palette
  const variant = hash(book.id + 'spine') % 3
  const surname = (book.author || '').split(/[,\s]+/).filter(Boolean).pop() ?? ''
  return (
    <div
      className={`spine spine-v${variant}`}
      style={{ '--c-bg': p.bg, '--c-fg': p.fg, '--c-ac': p.accent } as CSSProperties}
    >
      <span className="spine-band top" />
      <span className="spine-title">{book.title.split(/[:(]| \/ /)[0].trim() || book.title}</span>
      <span className="spine-author">{surname}</span>
      <span className="spine-band bottom" />
    </div>
  )
}

interface BookDims { w: number; h: number; d: number }

/** Book as a 3D object: cover, back, spine, page edges. Orientation is set by the parent. */
export function Book3D({ book, dims, className = '', style, innerPage }: {
  book: Book
  dims: BookDims
  className?: string
  style?: CSSProperties
  innerPage?: React.ReactNode
}) {
  return (
    <div
      className={`book3d ${className}`}
      style={{ ...style, '--w': `${dims.w}px`, '--h': `${dims.h}px`, '--d': `${dims.d}px` } as CSSProperties}
    >
      <div className="b-face b-back" style={{ background: book.palette.bg }} />
      <div className="b-face b-pages-r" />
      <div className="b-face b-pages-t" />
      <div className="b-face b-pages-b" />
      {innerPage && <div className="b-face b-first">{innerPage}</div>}
      <div className="b-face b-spine"><Spine book={book} /></div>
      <div className="b-face b-front">
        <div className="b-front-out"><Cover book={book} /></div>
        <div className="b-front-in" style={{ background: book.palette.bg }}><div className="endpaper" /></div>
      </div>
    </div>
  )
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

/** Size of the 3D book. With photos of the real book, its cover proportions and spine thickness are kept. */
export function bookDims(book: Book, height: number): BookDims {
  const k = height / 190
  const w = Math.round(height * clamp(book.coverRatio ?? 0.67, 0.52, 0.85))
  if (book.spineRatio) return { h: height, w, d: Math.round(clamp(height * book.spineRatio, 9 * k, 84 * k)) }
  const pages = book.pages ?? 120
  return { h: height, w, d: Math.round(Math.min(Math.max(pages / 7 + 24, 28), 58) * k) }
}
