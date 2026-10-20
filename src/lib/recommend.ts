import type { Book, WishItem } from '../types'
import { CATALOG, type RecBook } from './recs-data'
import { genreOf, NO_GENRE } from './genres'
import { hash } from './color'

export type { RecBook }

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
const surname = (a: string) => norm(a.split(/,| y /)[0]).split(' ').pop() ?? ''
export const recKey = (r: { t: string; a: string }) => `${norm(r.t)}|${surname(r.a)}`

export interface RecPrefs { genres: string[]; short: boolean }

interface Profile {
  /** 0..1 affinity per genre */
  genres: Map<string, number>
  likedAuthors: Set<string>
  avoidAuthors: Set<string>
  vibes: Map<string, number>
  avgPages: number | null
  /** the reader leaves long or slow books */
  prefersShort: boolean
  owned: Set<string>
  /** best rated finished books, for "si te gustó…" */
  favorites: Book[]
  size: number
  /** genres that actually appear in the library (the rest come from the taste picker) */
  libGenres: Set<string>
}

/** What the library says about the reader. */
export function buildProfile(books: Book[], wishes: WishItem[], prefs?: RecPrefs | null): Profile {
  const g = new Map<string, number>()
  const vibes = new Map<string, number>()
  const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v)
  const likedAuthors = new Set<string>()
  const avoidAuthors = new Set<string>()
  const owned = new Set<string>()
  const byKey = new Map(CATALOG.map((r) => [norm(r.t), r]))
  const libGenres = new Set<string>()
  let pagesSum = 0, pagesN = 0, slowDrops = 0

  for (const b of books) {
    owned.add(recKey({ t: b.title, a: b.author }))
    const rating = b.review?.rating ?? 0
    let w = b.status === 'terminado' ? 3 : b.status === 'leyendo' ? 2 : b.status === 'pendiente' ? 1 : -1.5
    if (b.status === 'terminado' && rating) w *= rating >= 4 ? 1.6 : rating <= 2 ? 0.2 : 1
    if (b.favorite) w += 1.5
    if (b.status === 'abandonado' && (b.dropped?.reason === 'estilo' || b.dropped?.reason === 'contenido')) w -= 1
    const genre = genreOf(b)
    if (genre !== NO_GENRE) { add(g, genre, w); if (w > 0) libGenres.add(genre) }
    const s = surname(b.author)
    if (s && ((b.status === 'terminado' && rating >= 4) || b.favorite)) likedAuthors.add(s)
    if (s && b.status === 'abandonado' && b.dropped?.reason === 'estilo') avoidAuthors.add(s)
    // a book we also have in the catalogue lends its "vibes" to the profile
    const known = byKey.get(norm(b.title))
    if (known) for (const v of known.v) add(vibes, v, w)
    if (b.status === 'terminado' && b.pages) { pagesSum += b.pages; pagesN++ }
    if (b.status === 'abandonado' && b.dropped?.reason === 'lento') slowDrops++
  }
  for (const w of wishes) {
    owned.add(recKey({ t: w.title, a: w.author }))
    if (w.genre) add(g, w.genre, 1.2)
    const known = byKey.get(norm(w.title))
    if (known) for (const v of known.v) add(vibes, v, 1)
  }
  // what the reader told us in the first-run picker counts most when the library is small
  if (prefs) for (const x of prefs.genres) add(g, x, books.length < 5 ? 4 : 1.5)

  const max = Math.max(1, ...[...g.values()])
  for (const [k, v] of g) g.set(k, Math.max(-1, v / max))
  const vmax = Math.max(1, ...[...vibes.values()])
  for (const [k, v] of vibes) vibes.set(k, v / vmax)

  const favorites = books
    .filter((b) => b.status === 'terminado' && ((b.review?.rating ?? 0) >= 4 || b.favorite))
    .sort((a, b) => (b.review?.rating ?? 0) - (a.review?.rating ?? 0) || (b.finishedAt ?? 0) - (a.finishedAt ?? 0))

  return {
    genres: g, likedAuthors, avoidAuthors, vibes, owned, favorites,
    avgPages: pagesN ? pagesSum / pagesN : null,
    prefersShort: !!prefs?.short || slowDrops >= 2,
    size: books.length,
    libGenres,
  }
}

export interface Rec { book: RecBook; score: number; reason: string; key: string }

/** Same picks all day, a fresh shuffle tomorrow. */
const daySeed = () => Math.floor(Date.now() / 86400000)
const jitter = (k: string, salt = 0) => ((hash(`${k}:${daySeed() + salt}`) % 1000) / 1000)

function scoreAll(p: Profile, dismissed: Set<string>, salt = 0): Rec[] {
  const out: Rec[] = []
  for (const b of CATALOG) {
    const key = recKey(b)
    if (p.owned.has(key) || dismissed.has(key)) continue
    const s = surname(b.a)
    if (p.avoidAuthors.has(s)) continue
    const gAff = p.genres.get(b.g) ?? 0
    const sameAuthor = p.likedAuthors.has(s)
    let vibe = 0, vibeName = ''
    for (const v of b.v) { const x = p.vibes.get(v) ?? 0; if (x > vibe) { vibe = x; vibeName = v } }
    const beginner = p.size < 3
    let score = gAff * 3 + vibe * 2 + (sameAuthor ? 3 : 0)
    if (b.tags.includes('p')) score += 0.6
    if (b.tags.includes('c')) score += 0.3
    if (b.tags.includes('r')) score += 0.25
    if (beginner && b.tags.includes('i')) score += 1.5
    if (p.prefersShort) score += b.p <= 250 ? 0.8 : b.p >= 600 ? -1 : 0
    else if (p.avgPages) score -= Math.min(1, Math.abs(b.p - p.avgPages) / 900)
    // «Otras sugerencias» (salt > 0) shakes the order harder so new titles surface, still within taste
    score += jitter(key, salt) * (salt ? 2.6 : 0.9)
    out.push({ book: b, score, key, reason: reasonFor(b, { gAff, sameAuthor, vibe, vibeName, beginner, p }) })
  }
  return out.sort((a, b) => b.score - a.score)
}

function reasonFor(b: RecBook, x: { gAff: number; sameAuthor: boolean; vibe: number; vibeName: string; beginner: boolean; p: Profile }) {
  if (x.sameAuthor) return `Porque te gustó ${b.a}`
  if (x.vibe > 0.5) {
    const fav = x.p.favorites.find((f) => CATALOG.find((c) => norm(c.t) === norm(f.title))?.v.includes(x.vibeName))
    if (fav) return `Si te gustó «${fav.title}»`
  }
  const fromLib = x.p.libGenres.has(b.g)
  if (x.gAff > 0.6) return fromLib ? `Lees mucho ${b.g.toLowerCase()}` : `Porque te gusta ${b.g.toLowerCase()}`
  if (x.gAff > 0.2) return `Porque te interesa ${b.g.toLowerCase()}`
  if (x.beginner && b.tags.includes('i')) return b.p <= 200 ? 'Corto y fácil de empezar' : 'Fácil de empezar, difícil de soltar'
  if (b.tags.includes('p')) return 'De los más leídos'
  if (b.tags.includes('c')) return 'Un clásico que vale la pena'
  return 'Para descubrir algo distinto'
}

interface Shelf { id: string; title: string; sub?: string; items: Rec[] }

const ADJACENT: Record<string, string[]> = {
  'Novela': ['Relatos', 'Memorias y biografía', 'Poesía'],
  'Relatos': ['Novela', 'Poesía', 'Terror y misterio'],
  'Poesía': ['Relatos', 'Creatividad', 'Filosofía y espiritualidad'],
  'Ciencia ficción y distopía': ['Fantasía', 'Ciencia y divulgación', 'Filosofía y espiritualidad'],
  'Fantasía': ['Ciencia ficción y distopía', 'Novela', 'Terror y misterio'],
  'Terror y misterio': ['Relatos', 'Novela', 'Historia'],
  'Ensayo': ['Historia', 'Filosofía y espiritualidad', 'Feminismo'],
  'Feminismo': ['Ensayo', 'Memorias y biografía', 'Historia'],
  'Memorias y biografía': ['Novela', 'Historia', 'Feminismo'],
  'Desarrollo personal': ['Psicología', 'Filosofía y espiritualidad', 'Negocios y finanzas'],
  'Creatividad': ['Desarrollo personal', 'Memorias y biografía', 'Poesía'],
  'Psicología': ['Desarrollo personal', 'Ciencia y divulgación', 'Filosofía y espiritualidad'],
  'Filosofía y espiritualidad': ['Psicología', 'Ensayo', 'Poesía'],
  'Negocios y finanzas': ['Desarrollo personal', 'Psicología', 'Historia'],
  'Historia': ['Ensayo', 'Memorias y biografía', 'Ciencia y divulgación'],
  'Ciencia y divulgación': ['Historia', 'Psicología', 'Ciencia ficción y distopía'],
}

/** The page: a personal top, one row per favourite genre, "si te gustó…", a step outside, and the classics. */
export function buildShelves(p: Profile, dismissed: Set<string>, salt = 0): Shelf[] {
  const all = scoreAll(p, dismissed, salt)
  const used = new Set<string>()
  const take = (list: Rec[], n: number) => {
    const r = list.filter((x) => !used.has(x.key)).slice(0, n)
    r.forEach((x) => used.add(x.key))
    return r
  }
  const shelves: Shelf[] = []
  const topGenres = [...p.genres.entries()].filter(([, v]) => v > 0.15).sort((a, b) => b[1] - a[1]).map(([k]) => k)
  const empty = p.size === 0 && topGenres.length === 0

  if (empty) {
    shelves.push({ id: 'start', title: 'Para empezar con buen pie', sub: 'Historias que enganchan desde la primera página, sin necesidad de ser gran lector.', items: take(all.filter((r) => r.book.tags.includes('i')).map((r) => ({ ...r, reason: r.book.p <= 200 ? 'Corto y fácil de empezar' : 'Fácil de empezar, difícil de soltar' })), 10) })
    shelves.push({ id: 'most', title: 'Los más leídos', sub: 'Los que más aparecen en las listas de lectores en español.', items: take(all.filter((r) => r.book.tags.includes('p')).map((r) => ({ ...r, reason: 'De los más leídos' })), 10) })
    shelves.push({ id: 'short', title: 'Clásicos que se leen en un fin de semana', sub: 'Menos de 200 páginas.', items: take(all.filter((r) => r.book.tags.includes('c') && r.book.p <= 200).map((r) => ({ ...r, reason: `${r.book.p} páginas` })), 10) })
    shelves.push({ id: 'now', title: 'De los que todo el mundo habla', sub: 'Publicados en los últimos años.', items: take(all.filter((r) => r.book.tags.includes('r')), 10) })
    shelves.push({ id: 'latam', title: 'Voces en español', sub: 'Autoras y autores de América Latina y España.', items: take(all.filter((r) => r.book.tags.includes('l')), 10) })
    return shelves.filter((s) => s.items.length)
  }

  shelves.push({ id: 'top', title: 'Elegidos para ti', sub: p.size ? 'Según los géneros, autores y calificaciones de tu biblioteca.' : 'Según los géneros que elegiste.', items: take(all, 8) })

  const fav = p.favorites.find((f) => all.some((r) => !used.has(r.key) && (r.book.g === genreOf(f) || r.reason.includes(f.title))))
  if (fav) {
    const known = CATALOG.find((c) => norm(c.t) === norm(fav.title))
    const like = all.filter((r) => known ? r.book.v.some((v) => known.v.includes(v)) : r.book.g === genreOf(fav))
    shelves.push({ id: 'like', title: `Si te gustó «${fav.title}»`, items: take(like.map((r) => ({ ...r, reason: r.book.g === genreOf(fav) ? r.book.g : 'Mismo espíritu, otro género' })), 8) })
  }

  for (const g of topGenres.slice(0, 3)) {
    const items = take(all.filter((r) => r.book.g === g).map((r) => ({ ...r, reason: r.book.tags.includes('p') ? 'De los más leídos del género' : r.book.tags.includes('r') ? 'Reciente' : r.book.tags.includes('c') ? 'Clásico del género' : r.reason })), 8)
    if (items.length >= 2) shelves.push({ id: `g-${g}`, title: `Más ${g.toLowerCase()}`, sub: p.libGenres.has(g) ? 'Porque es de lo que más hay en tu biblioteca.' : 'Porque nos dijiste que te gusta.', items })
  }

  const outside = [...new Set(topGenres.slice(0, 3).flatMap((g) => ADJACENT[g] ?? []))].filter((g) => !topGenres.slice(0, 3).includes(g))
  const stepSub = p.size ? 'Géneros vecinos de los que más lees.' : 'Géneros vecinos de los que elegiste.'
  const step = take(all.filter((r) => outside.includes(r.book.g) && (r.book.tags.includes('p') || r.book.tags.includes('i'))).sort((a, b) => b.score - a.score).map((r) => ({ ...r, reason: `Para probar ${r.book.g.toLowerCase()}` })), 8)
  if (step.length) shelves.push({ id: 'step', title: 'Para salir de tu zona', sub: stepSub, items: step })

  const most = take(all.filter((r) => r.book.tags.includes('p')).map((r) => ({ ...r, reason: 'De los más leídos' })), 10)
  if (most.length) shelves.push({ id: 'most', title: 'Los más leídos que aún no tienes', items: most })

  if (p.size < 5) {
    const start = take(all.filter((r) => r.book.tags.includes('i')), 8)
    if (start.length) shelves.push({ id: 'start', title: 'Fáciles de empezar', items: start })
  }
  return shelves.filter((s) => s.items.length)
}

// ---------- where to find it ----------

interface Where { store: string; url: string; note?: string }

export function whereToFind(b: { t: string; a: string; tags?: string }): Where[] {
  const q = encodeURIComponent(`${b.t.replace(/\s*\(.*?\)\s*/g, ' ').trim()} ${b.a.split(/,| y /)[0]}`)
  const out: Where[] = [
    { store: 'Amazon', url: `https://www.amazon.com/s?k=${q}&i=stripbooks` },
    { store: 'Google Play', url: `https://play.google.com/store/search?q=${q}&c=books` },
    { store: 'Buscalibre', url: `https://www.buscalibre.com/libros/search?q=${q}` },
    { store: 'Goodreads', url: `https://www.goodreads.com/search?q=${q}`, note: 'reseñas' },
  ]
  if (b.tags?.includes('f')) out.push({ store: 'Gratis y legal', url: `https://www.gutenberg.org/ebooks/search/?query=${encodeURIComponent(b.a.split(/,| y /)[0])}`, note: 'dominio público' })
  return out
}

export const fmtYear = (y: number) => (y < 1000 ? `s. ${y < 100 ? 'I' : 'II'}` : String(y))
