export type ThemeId = 'auto' | 'nocturna' | 'pergamino' | 'gotica' | 'bosque' | 'oceano' | 'rosa' | 'estrellas' | 'montanas' | 'acogedor' | 'naturaleza' | 'lluvia'

export interface Theme {
  id: Exclude<ThemeId, 'auto'>
  name: string
  line: string
  light?: boolean
  /** colours for the picker swatch and the phone's status bar */
  room: string
  accent: string
  wood: string
  spines: string[]
  /** optional background for the picker swatch (the theme's ambience) */
  sky?: string
}

export const THEMES: Theme[] = [
  { id: 'nocturna', name: 'Biblioteca nocturna', line: 'Nogal, lámpara cálida y lomos dorados. El clásico.', room: '#13100e', accent: '#cfa864', wood: '#6e4a2e', spines: ['#5b1f24', '#1f3a33', '#23304f', '#8a6d3b'] },
  { id: 'pergamino', name: 'Pergamino', line: 'Papel claro y tinta sepia, para leer de día.', light: true, room: '#efe6d2', accent: '#8c4a2f', wood: '#b58553', spines: ['#8c4a2f', '#4f5b3a', '#2e3d5c', '#c9a45c'] },
  { id: 'gotica', name: 'Gótica', line: 'Medianoche, velas y carmesí. Para Poe y Shelley.', room: '#0f0c10', accent: '#d9667a', wood: '#5a4562', spines: ['#5a1726', '#2b2233', '#3d3046', '#8c2f44'] },
  { id: 'bosque', name: 'Bosque encantado', line: 'Musgo y hojas doradas, como en un mapa de fantasía.', room: '#0d1410', accent: '#c9b45e', wood: '#6b5a36', spines: ['#2e4a2c', '#5a4a24', '#1f3a33', '#7a6a3a'] },
  { id: 'oceano', name: 'Veinte mil leguas', line: 'Azul profundo y latón, a bordo del Nautilus.', room: '#0b111b', accent: '#d6a65a', wood: '#5c4a3b', spines: ['#1b3a5c', '#2a4f5e', '#5c3b26', '#a07a3a'] },
  { id: 'rosa', name: 'Rosa antigua', line: 'Tonos de té y rosas secas, para Austen y Brontë.', light: true, room: '#f5e9e6', accent: '#a8485e', wood: '#c49482', spines: ['#a8485e', '#6d4538', '#8a7a9a', '#c9a07a'] },
  { id: 'estrellas', name: 'Cielo estrellado', line: 'Medianoche índigo y luz de estrellas que titila.', room: '#0b0d1f', accent: '#e8c872', wood: '#4b4874', spines: ['#2c2a5c', '#6a5acd', '#1d3b5c', '#b89a4a'],
    sky: 'radial-gradient(1.2px 1.2px at 15px 12px, #fff, transparent), radial-gradient(1px 1px at 60px 30px, #ffe9b0, transparent), radial-gradient(1.2px 1.2px at 100px 14px, #fff, transparent), radial-gradient(1px 1px at 130px 40px, #cfd4ff, transparent), radial-gradient(ellipse at 80% 0, rgba(123,104,238,.35), transparent 70%), #0b0d1f' },
  { id: 'montanas', name: 'Montañas', line: 'Niebla de mañana, pino y cumbres en el horizonte.', light: true, room: '#dfe6ee', accent: '#2f6355', wood: '#b08a62', spines: ['#2f6355', '#3d5a80', '#8a6a48', '#718aa1'],
    sky: "linear-gradient(transparent 55%, #b7c6d6 55%), linear-gradient(160deg, transparent 60%, #94a9bd 60%), #dfe6ee" },
  { id: 'acogedor', name: 'Rincón acogedor', line: 'Lámpara cálida, mantita y luces colgantes.', room: '#1a120d', accent: '#ec9a5c', wood: '#7d4630', spines: ['#8c3a2a', '#c27a3a', '#5a3a5a', '#d4a05a'],
    sky: 'radial-gradient(circle at 20% 15%, #ffd28a 0 2px, transparent 5px), radial-gradient(circle at 45% 22%, #ffb36b 0 2px, transparent 5px), radial-gradient(circle at 70% 15%, #ffd28a 0 2px, transparent 5px), radial-gradient(circle at 92% 22%, #ffb36b 0 2px, transparent 5px), radial-gradient(ellipse at 10% 40%, rgba(255,170,90,.3), transparent 60%), #1a120d' },
  { id: 'naturaleza', name: 'Naturaleza', line: 'Papel salvia, hojas verdes y luz de jardín.', light: true, room: '#eef1e6', accent: '#4f7d3a', wood: '#c49a6a', spines: ['#4f7d3a', '#8a6a3a', '#6b8f5a', '#c9a05a'],
    sky: 'radial-gradient(ellipse 18px 7px at 12% 70%, #96b07e 98%, transparent), radial-gradient(ellipse 16px 6px at 22% 55%, #a9bf92 98%, transparent), radial-gradient(circle at 88% 20%, #a9bf92 0 10px, transparent 11px), #eef1e6' },
  { id: 'lluvia', name: 'Lluvia', line: 'Tarde gris de ventana mojada y té caliente.', room: '#12161b', accent: '#8fb8d8', wood: '#5a5652', spines: ['#3a4a5c', '#5c6a7a', '#2a3a4a', '#8fb8d8'],
    sky: 'repeating-linear-gradient(105deg, transparent 0 9px, rgba(170,200,230,.25) 9px 10px, transparent 10px 23px), #12161b' },
]

export function resolveTheme(id: ThemeId | undefined): Theme {
  if (!id || id === 'auto') {
    const light = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches
    return THEMES.find((t) => t.id === (light ? 'pergamino' : 'nocturna'))!
  }
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}

/** Put the theme on <html> and tint the phone's status bar to match. */
export function applyTheme(id: ThemeId | undefined) {
  const t = resolveTheme(id)
  const el = document.documentElement
  if (t.id === 'nocturna') el.removeAttribute('data-theme')
  else el.setAttribute('data-theme', t.id)
  if (t.light) el.setAttribute('data-light', '')
  else el.removeAttribute('data-light')
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', t.room))
}
