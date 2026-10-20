import type { Palette } from '../types'

export function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Cloth-binding colours: deep, slightly dusty tones that sit well on walnut. */
export const CLOTHS: Palette[] = [
  { bg: '#5b1f24', fg: '#f3e3c4', accent: '#d7b46a' }, // oxblood
  { bg: '#1f3a33', fg: '#ecdfc0', accent: '#c9a45c' }, // bottle green
  { bg: '#23304f', fg: '#e9e1cc', accent: '#d2b06f' }, // navy
  { bg: '#6b4a2b', fg: '#f5e8cf', accent: '#e2c27e' }, // tan leather
  { bg: '#3d2a44', fg: '#efe2d0', accent: '#cfa96a' }, // plum
  { bg: '#8a6d3b', fg: '#231a10', accent: '#2c2014' }, // ochre
  { bg: '#2e2a26', fg: '#e8dcc3', accent: '#c19b56' }, // charcoal
  { bg: '#4f5b3a', fg: '#f1e7cf', accent: '#d9bf7a' }, // moss
  { bg: '#9c4a2f', fg: '#fbeedb', accent: '#f0d08f' }, // rust
  { bg: '#d8ccb3', fg: '#2b2219', accent: '#7a2e25' }, // linen
]

export function paletteFor(seed: string): Palette {
  return CLOTHS[hash(seed) % CLOTHS.length]
}

function toHex(r: number, g: number, b: number) {
  return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
}

function luminance(r: number, g: number, b: number) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

/** Picks a spine colour from the cover: the most common saturated-ish tone, lightly darkened. */
export async function paletteFromImage(blob: Blob, fallbackSeed: string): Promise<Palette> {
  try {
    const bmp = await createImageBitmap(blob)
    const c = document.createElement('canvas')
    c.width = 40
    c.height = 60
    const ctx = c.getContext('2d')!
    ctx.drawImage(bmp, 0, 0, 40, 60)
    const { data } = ctx.getImageData(0, 0, 40, 60)
    const buckets = new Map<number, { n: number; r: number; g: number; b: number }>()
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2]
      const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5)
      const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
      const max = Math.max(r, g, b), min = Math.min(r, g, b)
      const weight = 1 + (max - min) / 64 // favour colourful tones over greys
      e.n += weight; e.r += r * weight; e.g += g * weight; e.b += b * weight
      buckets.set(key, e)
    }
    const top = [...buckets.values()].sort((a, b) => b.n - a.n)[0]
    let r = top.r / top.n, g = top.g / top.n, b = top.b / top.n
    // keep the spine readable on the shelf: avoid near-white spines
    if (luminance(r, g, b) > 0.82) { r *= 0.86; g *= 0.84; b *= 0.8 }
    const dark = luminance(r, g, b) < 0.55
    return { bg: toHex(r, g, b), fg: dark ? '#f4e9d2' : '#221a12', accent: dark ? '#d8b86f' : '#6d2a20' }
  } catch {
    return paletteFor(fallbackSeed)
  }
}
