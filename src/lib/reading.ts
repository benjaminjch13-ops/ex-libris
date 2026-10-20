import type { ReadingPrefs } from '../types'

export const READ_FONTS: { id: ReadingPrefs['font']; name: string; family: string; note: string }[] = [
  { id: 'literata', name: 'Literata', family: '"Literata", "Iowan Old Style", Georgia, serif', note: 'Hecha para leer en pantalla' },
  { id: 'garamond', name: 'Garamond', family: '"EB Garamond", "Garamond", Georgia, serif', note: 'La de los libros clásicos' },
  { id: 'moderna', name: 'Sin serifa', family: '"Hanken Grotesk", system-ui, sans-serif', note: 'Limpia y moderna' },
  { id: 'legible', name: 'Atkinson', family: '"Atkinson Hyperlegible", system-ui, sans-serif', note: 'Máxima legibilidad, ayuda con baja visión' },
  { id: 'lexend', name: 'Lexend', family: '"Lexend", system-ui, sans-serif', note: 'Pensada para leer con más fluidez (dislexia)' },
]

export const PAPERS: { id: ReadingPrefs['paper']; name: string; paper?: string; paper2?: string; ink?: string; inkSoft?: string }[] = [
  { id: 'tema', name: 'Del tema' },
  { id: 'crema', name: 'Crema', paper: '#f5edda', paper2: '#ece2ca', ink: '#2b2219', inkSoft: '#6d5d48' },
  { id: 'blanco', name: 'Blanco', paper: '#fbfaf6', paper2: '#f0eee8', ink: '#1f1d1a', inkSoft: '#5f5a52' },
  { id: 'sepia', name: 'Sepia', paper: '#ecdcbc', paper2: '#e0cda8', ink: '#3b2a17', inkSoft: '#6e5636' },
  { id: 'gris', name: 'Gris piedra', paper: '#e4e3df', paper2: '#d8d7d2', ink: '#25262a', inkSoft: '#5c5e64' },
]

const LH = { compacto: 1.45, normal: 1.62, amplio: 1.85 }
export const MARGIN_K = { estrecho: 0.6, normal: 1, amplio: 1.5 }

/**
 * Reading look lives in CSS variables on <html>, so the visible pages and the hidden element that
 * measures pagination always agree. Called synchronously when the setting changes, before re-pagination.
 */
export function applyReading(r?: ReadingPrefs) {
  const st = document.documentElement.style
  const f = READ_FONTS.find((x) => x.id === r?.font) ?? READ_FONTS[0]
  st.setProperty('--read-font', f.family)
  st.setProperty('--read-lh', String(LH[r?.spacing ?? 'normal']))
  st.setProperty('--read-align', r?.align === 'izquierda' ? 'left' : 'justify')
  st.setProperty('--read-hyph', r?.align === 'izquierda' ? 'manual' : 'auto')
  const p = PAPERS.find((x) => x.id === r?.paper)
  for (const [k, v] of [['--paper', p?.paper], ['--paper-2', p?.paper2], ['--ink', p?.ink], ['--ink-soft', p?.inkSoft]] as const) {
    if (v) st.setProperty(k, v); else st.removeProperty(k)
  }
}

export const readingKey = (r?: ReadingPrefs) => `${r?.font}|${r?.spacing}|${r?.margins}|${r?.align}`
