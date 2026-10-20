export type ThemeId = 'auto' | 'nocturna' | 'pergamino' | 'gotica' | 'bosque' | 'oceano' | 'rosa'

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
}

export const THEMES: Theme[] = [
  { id: 'nocturna', name: 'Biblioteca nocturna', line: 'Nogal, lámpara cálida y lomos dorados. El clásico.', room: '#13100e', accent: '#cfa864', wood: '#6e4a2e', spines: ['#5b1f24', '#1f3a33', '#23304f', '#8a6d3b'] },
  { id: 'pergamino', name: 'Pergamino', line: 'Papel claro y tinta sepia, para leer de día.', light: true, room: '#efe6d2', accent: '#8c4a2f', wood: '#b58553', spines: ['#8c4a2f', '#4f5b3a', '#2e3d5c', '#c9a45c'] },
  { id: 'gotica', name: 'Gótica', line: 'Medianoche, velas y carmesí. Para Poe y Shelley.', room: '#0f0c10', accent: '#d9667a', wood: '#5a4562', spines: ['#5a1726', '#2b2233', '#3d3046', '#8c2f44'] },
  { id: 'bosque', name: 'Bosque encantado', line: 'Musgo y hojas doradas, como en un mapa de fantasía.', room: '#0d1410', accent: '#c9b45e', wood: '#6b5a36', spines: ['#2e4a2c', '#5a4a24', '#1f3a33', '#7a6a3a'] },
  { id: 'oceano', name: 'Veinte mil leguas', line: 'Azul profundo y latón, a bordo del Nautilus.', room: '#0b111b', accent: '#d6a65a', wood: '#5c4a3b', spines: ['#1b3a5c', '#2a4f5e', '#5c3b26', '#a07a3a'] },
  { id: 'rosa', name: 'Rosa antigua', line: 'Tonos de té y rosas secas, para Austen y Brontë.', light: true, room: '#f5e9e6', accent: '#a8485e', wood: '#c49482', spines: ['#a8485e', '#6d4538', '#8a7a9a', '#c9a07a'] },
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
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', t.room))
}
