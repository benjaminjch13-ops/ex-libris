import { useId } from 'react'
import type { ExLibris, ExMotif } from '../types'

export const MOTIFS: { id: ExMotif; name: string }[] = [
  { id: 'buho', name: 'Búho' }, { id: 'llave', name: 'Llave' }, { id: 'luna', name: 'Luna' }, { id: 'rama', name: 'Rama' },
  { id: 'gato', name: 'Gato' }, { id: 'pluma', name: 'Pluma' }, { id: 'estrella', name: 'Estrella' }, { id: 'ancla', name: 'Ancla' },
  { id: 'libro', name: 'Libro' }, { id: 'flor', name: 'Flor' },
]

export const INKS = ['#5b1f24', '#1f3a33', '#23304f', '#3d2a44', '#6b4a2b', '#2b2219', '#8c4a2f', '#a8485e']

/** Line drawings in a 60×60 box, drawn with the ink colour. */
export function MotifArt({ id, ink }: { id: ExMotif; ink: string }) {
  const s = { fill: 'none', stroke: ink, strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (id) {
    case 'buho': return <g {...s}><path d="M18 22 L22 12 L27 19 Q30 18 33 19 L38 12 L42 22" /><ellipse cx="30" cy="34" rx="13" ry="16" /><circle cx="24.5" cy="27" r="4.2" /><circle cx="35.5" cy="27" r="4.2" /><circle cx="24.5" cy="27" r="1.2" fill={ink} /><circle cx="35.5" cy="27" r="1.2" fill={ink} /><path d="M28.5 31 L30 34 L31.5 31" /><path d="M23 40 q2 2 4 0 M29 42 q2 2 4 0 M35 40 q2 2 4 0" /><path d="M14 50 H46" /></g>
    case 'llave': return <g {...s}><circle cx="20" cy="22" r="8" /><circle cx="20" cy="22" r="3" /><path d="M26 28 L45 47" /><path d="M38 40 l5 -5 M42 44 l4 -4 M35 37 l3 -3" /></g>
    case 'luna': return <g {...s}><path d="M36 12 A18 18 0 1 0 46 40 A14 14 0 1 1 36 12 Z" /><path d="M44 16 l1.5 3 3 1.5 -3 1.5 -1.5 3 -1.5 -3 -3 -1.5 3 -1.5Z" fill={ink} /><circle cx="50" cy="30" r="1" fill={ink} /></g>
    case 'rama': return <g {...s}><path d="M14 48 C24 38 32 28 46 12" />{[[20, 40, -35], [27, 33, 35], [30, 27, -40], [37, 22, 30], [39, 16, -45]].map(([x, y, r], i) => <ellipse key={i} cx={x} cy={y} rx="6" ry="2.6" transform={`rotate(${r} ${x} ${y})`} />)}</g>
    case 'gato': return <g {...s}><path d="M22 20 L23 12 L28 17 Q31 16 34 17 L39 12 L40 20" /><path d="M22 20 Q20 28 25 30 Q19 36 20 46 Q30 50 40 46 Q41 36 35 30 Q42 28 40 20" /><path d="M40 46 Q50 44 47 34" /><circle cx="27" cy="22" r="1" fill={ink} /><circle cx="35" cy="22" r="1" fill={ink} /><path d="M30 25 l1 1 1 -1" /></g>
    case 'pluma': return <g {...s}><path d="M44 12 C30 16 20 30 17 48" /><path d="M44 12 C46 26 36 38 22 42" /><path d="M44 12 C34 18 26 26 22 34" /><path d="M17 48 L14 52" /></g>
    case 'estrella': return <g {...s}><path d="M30 10 L35.5 24 L50 24.5 L38.5 33.5 L42.5 48 L30 39.5 L17.5 48 L21.5 33.5 L10 24.5 L24.5 24 Z" /><circle cx="30" cy="30" r="3" /></g>
    case 'ancla': return <g {...s}><circle cx="30" cy="14" r="4" /><path d="M30 18 V48" /><path d="M22 24 H38" /><path d="M14 36 Q16 48 30 48 Q44 48 46 36" /><path d="M14 36 l-2 4 M14 36 l4 2 M46 36 l2 4 M46 36 l-4 2" /></g>
    case 'libro': return <g {...s}><path d="M30 18 C24 14 16 13 10 14 V44 C16 43 24 44 30 48 C36 44 44 43 50 44 V14 C44 13 36 14 30 18 Z" /><path d="M30 18 V48" /><path d="M15 21 H25 M15 26 H25 M35 21 H45 M35 26 H45" /></g>
    case 'flor': return <g {...s}><circle cx="30" cy="24" r="4" />{[0, 72, 144, 216, 288].map((a) => <ellipse key={a} cx="30" cy="16" rx="4.5" ry="7" transform={`rotate(${a} 30 24)`} />)}<path d="M30 30 C30 38 28 44 26 50" /><path d="M29 40 C24 37 20 38 18 41 C22 43 26 42 29 40 Z" /></g>
  }
}

/** The bookplate: frame, "EX LIBRIS", the motif and the owner's name. */
export function ExLibrisSeal({ cfg, size = 120, className }: { cfg: ExLibris; size?: number; className?: string }) {
  const uid = useId().replace(/:/g, '')
  const ink = cfg.ink
  const round = cfg.shape === 'ovalo' || cfg.shape === 'circulo'
  const w = cfg.shape === 'circulo' ? 120 : 100
  const h = 120
  const frame = (() => {
    const s = { fill: 'none', stroke: ink }
    if (cfg.shape === 'ovalo') return <><ellipse cx="50" cy="60" rx="47" ry="57" {...s} strokeWidth="1.6" /><ellipse cx="50" cy="60" rx="42.5" ry="52.5" {...s} strokeWidth=".7" /></>
    if (cfg.shape === 'circulo') return <><circle cx="60" cy="60" r="57" {...s} strokeWidth="1.6" /><circle cx="60" cy="60" r="52.5" {...s} strokeWidth=".7" /></>
    if (cfg.shape === 'escudo') return <><path d="M6 6 H94 V62 C94 92 72 108 50 116 C28 108 6 92 6 62 Z" {...s} strokeWidth="1.6" /><path d="M11 11 H89 V62 C89 88 70 102 50 110 C30 102 11 88 11 62 Z" {...s} strokeWidth=".7" /></>
    return <><rect x="4" y="4" width="92" height="112" rx="4" {...s} strokeWidth="1.6" /><rect x="9" y="9" width="82" height="102" rx="2" {...s} strokeWidth=".7" /><path d="M9 20 h6 M85 20 h6 M9 100 h6 M85 100 h6" stroke={ink} strokeWidth=".7" /></>
  })()
  const cx = w / 2
  const name = cfg.name.trim() || 'Tu nombre'
  // text is fitted to the room the frame leaves at each height, so a long name or phrase never crosses the border
  // the shield narrows towards its point, so its text sits higher
  const shield = cfg.shape === 'escudo'
  const nameY = round ? 88 : shield ? 77 : 86
  const lines = wrapPhrase(cfg.phrase.trim())
  const lineY = (i: number) => nameY + (round ? 8.5 : shield ? 7.5 : 9.5) + i * 6
  const fit = (text: string, y: number, fs: number, k: number) => {
    const room = innerWidth(cfg.shape, y) - 6
    const natural = text.length * fs * k
    return natural > room ? { textLength: room, lengthAdjust: 'spacingAndGlyphs' as const } : {}
  }
  const nameFs = name.length > 18 ? 8 : name.length > 13 ? 9 : 10
  const phraseFs = lines.length > 1 ? 4.4 : 4.8
  return (
    <svg className={className} width={size * (w / h)} height={size} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Ex libris de ${name}`}>
      {frame}
      {round ? (
        <>
          <defs><path id={`arc-${uid}`} d={cfg.shape === 'circulo' ? 'M22 60 A38 38 0 0 1 98 60' : 'M14 54 A36 40 0 0 1 86 54'} /></defs>
          <text fontFamily="Bodoni Moda, Didot, Georgia, serif" fontSize="9" letterSpacing="3" fill={ink}><textPath href={`#arc-${uid}`} startOffset="50%" textAnchor="middle">EX LIBRIS</textPath></text>
        </>
      ) : (
        <text x={cx} y={cfg.shape === 'escudo' ? 24 : 25} textAnchor="middle" fontFamily="Bodoni Moda, Didot, Georgia, serif" fontSize="8.5" letterSpacing="3" fill={ink}>EX LIBRIS</text>
      )}
      <g transform={shield ? `translate(${cx - 18} 30) scale(.6)` : `translate(${cx - 20} ${round ? 33 : 29}) scale(.68)`}><MotifArt id={cfg.motif} ink={ink} /></g>
      <text x={cx} y={nameY} textAnchor="middle" fontFamily="Bodoni Moda, Didot, Georgia, serif" fontStyle="italic" fontSize={nameFs} fill={ink} {...fit(name, nameY, nameFs, 0.48)}>{name}</text>
      {lines.map((l, i) => (
        <text key={i} x={cx} y={lineY(i)} textAnchor="middle" fontFamily="Hanken Grotesk, system-ui, sans-serif" fontSize={phraseFs} letterSpacing=".3" fill={ink} opacity=".85" {...fit(l, lineY(i), phraseFs, 0.56)}>{l}</text>
      ))}
    </svg>
  )
}

/** Width inside the inner frame at a given height of the 120-unit-tall seal. */
function innerWidth(shape: ExLibris['shape'], y: number) {
  if (shape === 'circulo') return 2 * Math.sqrt(Math.max(0, 52.5 ** 2 - (y - 60) ** 2))
  if (shape === 'ovalo') return 2 * 42.5 * Math.sqrt(Math.max(0, 1 - ((y - 60) / 52.5) ** 2))
  if (shape === 'escudo') return y <= 62 ? 78 : 78 * Math.max(0, 1 - Math.pow((y - 62) / 48, 1.7))
  return 82
}

/** Up to two balanced lines; anything longer is cut with an ellipsis. */
function wrapPhrase(p: string): string[] {
  if (!p) return []
  if (p.length <= 20) return [p]
  const words = p.split(/\s+/)
  let best: [string, string] = [p, '']
  let bestDiff = Infinity
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ')
    const d = Math.max(a.length, b.length)
    if (d < bestDiff) { bestDiff = d; best = [a, b] }
  }
  const cut = (x: string) => (x.length > 24 ? `${x.slice(0, 23)}…` : x)
  return best[1] ? [cut(best[0]), cut(best[1])] : [cut(p)]
}
