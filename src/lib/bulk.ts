import type { Status } from '../types'

/**
 * Bulk import: a .zip (books inside, or a Notion export), several EPUB/PDF files at once,
 * or a reading list as CSV (Notion database export, Goodreads, a spreadsheet).
 * Everything here only reads; the import panel decides what to save.
 */

export interface ListRow {
  title: string
  author: string
  status: Status
  rating?: number
  review?: string
  pages?: number
  year?: number
  isbn?: string
  genre?: string
  /** "Kindle", "Apple Books"… when the list says the book was read in an app */
  app?: string
  /** the list says it's an e-book (no app named) */
  ebook?: boolean
  finishedAt?: number
  startedAt?: number
  cover?: string
}

export interface Scan {
  files: File[]
  rows: ListRow[]
  /** names of lists found (CSV files) */
  lists: string[]
  skipped: string[]
}

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
export const bookKey = (title: string, author = '') => `${norm(title).slice(0, 48)}|${norm(author.split(/[,;&]| y | and /)[0] ?? '').split(' ').slice(-1)[0] ?? ''}`

// ---------- CSV ----------

/** RFC 4180 with quoted fields; detects "," or ";" (spreadsheets in Spanish often use ";"). */
export function parseCsv(text: string): string[][] {
  text = text.replace(/^﻿/, '')
  const first = text.slice(0, text.indexOf('\n') >>> 0 || text.length)
  const delim = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ';' : first.includes('\t') && !first.includes(',') ? '\t' : ','
  const rows: string[][] = []
  let row: string[] = [], cell = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++ } else q = false }
      else cell += c
    } else if (c === '"') q = true
    else if (c === delim) { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some((x) => x.trim())) rows.push(row)
      row = []
    } else cell += c
  }
  row.push(cell)
  if (row.some((x) => x.trim())) rows.push(row)
  return rows
}

type Field = keyof ListRow | 'shelf' | 'read' | 'binding' | 'dates'
const COLUMNS: [Field, string[]][] = [
  ['title', ['title', 'titulo', 'name', 'nombre', 'libro', 'book', 'book title']],
  ['author', ['author', 'authors', 'autor', 'autora', 'autores', 'author l f', 'escritor', 'escritora']],
  ['shelf', ['exclusive shelf']],
  ['status', ['status', 'estado', 'estatus', 'progreso', 'reading status', 'read status']],
  ['read', ['leido', 'read', 'terminado', 'lo termine']],
  ['rating', ['my rating', 'rating', 'calificacion', 'puntuacion', 'puntaje', 'estrellas', 'valoracion', 'nota', 'stars', 'score']],
  ['review', ['my review', 'review', 'resena', 'resenas', 'opinion', 'comentario', 'comentarios', 'notas', 'notes', 'reflexion']],
  ['pages', ['number of pages', 'pages', 'paginas', 'num pages', 'numero de paginas', 'n paginas', 'page count']],
  ['year', ['original publication year', 'year published', 'year', 'ano', 'ano de publicacion', 'publicado', 'publicacion']],
  ['isbn', ['isbn13', 'isbn 13', 'isbn', 'isbn10']],
  ['genre', ['genre', 'genres', 'genero', 'generos', 'categoria', 'categorias', 'category', 'tags', 'etiquetas', 'tema']],
  ['binding', ['binding', 'formato', 'format', 'tipo', 'edicion', 'medio', 'soporte']],
  ['finishedAt', ['date read', 'fecha de lectura', 'fecha leido', 'fecha terminado', 'fecha de fin', 'fecha fin', 'terminado el', 'finished', 'finish date', 'end date', 'fecha de termino', 'fecha final', 'leido el']],
  ['startedAt', ['date started', 'fecha de inicio', 'inicio', 'empezado', 'start date', 'started', 'comenzado']],
  ['dates', ['fechas', 'dates', 'fecha', 'date', 'periodo']],
  ['cover', ['cover', 'portada', 'imagen', 'image']],
]

function mapHeader(header: string[]): Map<Field, number> {
  const m = new Map<Field, number>()
  const h = header.map((x) => norm(x.replace(/[^\p{L}\p{N} ]/gu, ' ')))
  const taken = (j: number) => [...m.values()].includes(j)
  // exact names for every field first, then "starts/ends with" (Notion adds emoji or suffixes)
  for (const [field, names] of COLUMNS) {
    const i = h.findIndex((x, j) => names.includes(x) && !taken(j))
    if (i >= 0) m.set(field, i)
  }
  for (const [field, names] of COLUMNS) {
    if (m.has(field)) continue
    const i = h.findIndex((x, j) => x && !taken(j) && names.some((n) => x.startsWith(n + ' ') || x.endsWith(' ' + n)))
    if (i >= 0) m.set(field, i)
  }
  return m
}

export function statusFrom(raw: string): Status | undefined {
  const s = norm(raw)
  if (!s) return undefined
  if (/^(no|false)$|no leid|sin leer|unread|not read/.test(s)) return 'pendiente'
  if (/(abandon|dnf|dejad|did not finish|no lo termine|drop)/.test(s)) return 'abandonado'
  if (/(leyendo|currently|reading|en curso|en progreso|in progress|empezad|actual)/.test(s)) return 'leyendo'
  if (/(por leer|to read|want|quiero|pendiente|wishlist|no empezado|not started|sin empezar|tbr|lista)/.test(s)) return 'pendiente'
  if (/(leido|read|terminad|done|complet|finaliz|finished|^si$|^yes$|^true$|^x$)/.test(s)) return 'terminado'
  return undefined
}

const MONTHS: Record<string, number> = { enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5, julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11, ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, sep: 8, sept: 8, oct: 9, nov: 10, dic: 11 }

/** "2024/10/03", "October 3, 2024", "3 de octubre de 2024", "03/10/2024" (day first), Notion ranges "A → B". */
export function dateFrom(raw: string, end = true): number | undefined {
  if (!raw?.trim()) return undefined
  const parts = raw.split(/→|->|–| - /).map((x) => x.trim()).filter(Boolean)
  let s = (end ? parts[parts.length - 1] : parts[0]) ?? ''
  s = s.replace(/\(.*?\)/g, '').replace(/\b(\d{1,2}):(\d{2}).*$/, '').trim()
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], 12).getTime()
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/)
  if (m) { const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; const a = +m[1], b = +m[2]; const [d, mo] = b > 12 ? [b, a] : [a, b]; return new Date(y, mo - 1, d, 12).getTime() }
  m = norm(s).match(/^(\d{1,2}) (?:de )?([a-z]+)(?: de)? (\d{4})/)
  if (m && MONTHS[m[2]] != null) return new Date(+m[3], MONTHS[m[2]], +m[1], 12).getTime()
  m = norm(s).match(/^([a-z]+) (?:de )?(\d{4})$/)
  if (m && MONTHS[m[1]] != null) return new Date(+m[2], MONTHS[m[1]], 15, 12).getTime()
  const t = Date.parse(s)
  if (!Number.isNaN(t)) { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime() }
  m = s.match(/^(\d{4})$/)
  return m ? new Date(+m[1], 6, 1, 12).getTime() : undefined
}

export function ratingFrom(raw: string): number | undefined {
  if (!raw?.trim()) return undefined
  const stars = (raw.match(/[⭐★🌟]/gu) ?? []).length
  if (stars) return Math.min(5, stars + (/½/.test(raw) ? 0.5 : 0))
  const n = Number(raw.replace(',', '.').match(/\d+(\.\d+)?/)?.[0])
  if (!n) return undefined
  const v = n > 5 && n <= 10 ? n / 2 : n > 10 && n <= 100 ? n / 20 : n
  return Math.min(5, Math.round(v * 2) / 2)
}

const APPS: [RegExp, string][] = [[/kindle/, 'Kindle'], [/apple|ibooks/, 'Apple Books'], [/google play/, 'Google Play Libros'], [/kobo/, 'Kobo'], [/audible|audio/, 'Audiolibro'], [/scribd|everand/, 'Scribd'], [/bookmate/, 'Bookmate'], [/biblioteca|library|prestado|libby/, 'Préstamo']]

export function rowsFromCsv(text: string): ListRow[] {
  const rows = parseCsv(text)
  if (rows.length < 2) return []
  const col = mapHeader(rows[0])
  if (!col.has('title')) return []
  const get = (r: string[], f: Field) => (col.has(f) ? (r[col.get(f)!] ?? '').trim() : '')
  const out: ListRow[] = []
  for (const r of rows.slice(1)) {
    // Notion links related pages as "Title (path/to/page.md)"
    const title = get(r, 'title').replace(/\s*\([^)]*\.md\)\s*$/i, '').replace(/^["'«]|["'»]$/g, '').trim()
    if (!title) continue
    const author = get(r, 'author').replace(/\s*\([^)]*\.md\)/gi, '').replace(/\s+/g, ' ').trim()
    const shelf = get(r, 'shelf'), rawStatus = get(r, 'status'), read = get(r, 'read')
    const dates = get(r, 'dates')
    const range = /→|->|–| - /.test(dates)
    const rating = ratingFrom(get(r, 'rating'))
    let status = statusFrom(shelf) ?? statusFrom(rawStatus) ?? (read ? statusFrom(read) : undefined)
    // a single date in a generic "Fecha" column means "finished" for a read book, "started" otherwise
    const finishedAt = dateFrom(get(r, 'finishedAt')) ?? (range || (dates && status === 'terminado') ? dateFrom(dates, true) : undefined)
    const startedAt = dateFrom(get(r, 'startedAt'), false) ?? (range || (dates && status !== 'terminado') ? dateFrom(dates, false) : undefined)
    if (!status) status = finishedAt || rating ? 'terminado' : startedAt ? 'leyendo' : 'pendiente'
    const binding = norm(get(r, 'binding'))
    const app = APPS.find(([re]) => re.test(binding))?.[1]
    const isbn = get(r, 'isbn').replace(/[^0-9Xx]/g, '').toUpperCase()
    const pages = parseInt(get(r, 'pages').replace(/\D/g, ''), 10)
    const year = parseInt(get(r, 'year').match(/\d{4}/)?.[0] ?? '', 10)
    const genre = get(r, 'genre').split(/[,;|]/)[0]?.replace(/[^\p{L}\p{N} ]/gu, '').trim()
    const cover = get(r, 'cover').match(/https?:\/\/\S+/)?.[0]
    out.push({
      title, author, status, rating,
      review: get(r, 'review').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim() || undefined,
      pages: pages > 0 && pages < 20000 ? pages : undefined,
      year: year > 0 ? year : undefined,
      isbn: isbn.length === 10 || isbn.length === 13 ? isbn : undefined,
      genre: genre || undefined,
      app, ebook: !app && /(ebook|e book|digital|epub|pdf|electronic)/.test(binding),
      finishedAt: status === 'terminado' ? finishedAt : undefined,
      startedAt, cover,
    })
  }
  return out
}

// ---------- files & zips ----------

const isBookName = (n: string) => /\.(epub|pdf)$/i.test(n)
const junk = (n: string) => /(^|\/)(__MACOSX|\.)/.test(n)

/** Reads whatever was dropped: books, CSV lists and zips (also zips inside zips, as Notion exports them). */
export async function scanInputs(inputs: File[]): Promise<Scan> {
  const out: Scan = { files: [], rows: [], lists: [], skipped: [] }
  const csvs: { name: string; text: string }[] = []
  const walk = async (f: File, depth: number) => {
    const n = f.name.toLowerCase()
    if (isBookName(n)) out.files.push(f)
    else if (n.endsWith('.csv') || n.endsWith('.tsv')) csvs.push({ name: f.name, text: await f.text() })
    else if (n.endsWith('.zip') && depth < 3) {
      const { default: JSZip } = await import('jszip')
      let zip
      try { zip = await JSZip.loadAsync(f) } catch { out.skipped.push(f.name); return }
      for (const e of Object.values(zip.files)) {
        if (e.dir || junk(e.name)) continue
        const base = e.name.split('/').pop()!
        const low = base.toLowerCase()
        if (isBookName(low) || low.endsWith('.csv') || low.endsWith('.tsv') || low.endsWith('.zip')) {
          const blob = await e.async('blob')
          const type = low.endsWith('.pdf') ? 'application/pdf' : low.endsWith('.epub') ? 'application/epub+zip' : ''
          await walk(new File([blob], base, { type }), depth + 1)
        }
      }
    } else if (!/\.(md|html?|png|jpe?g|gif|webp|svg|txt|json)$/i.test(n)) out.skipped.push(f.name)
  }
  for (const f of inputs) await walk(f, 0)
  // Notion exports each database twice ("Lecturas abc.csv" and "Lecturas abc_all.csv"): prefer _all
  const names = new Set(csvs.map((c) => c.name))
  const chosen = csvs.filter((c) => !(/\.csv$/i.test(c.name) && !c.name.includes('_all') && names.has(c.name.replace(/\.csv$/i, '_all.csv'))))
  const seen = new Set<string>()
  for (const c of chosen) {
    const rows = rowsFromCsv(c.text)
    if (!rows.length) { out.skipped.push(c.name); continue }
    out.lists.push(c.name.replace(/\s+[0-9a-f]{32}/i, '').replace(/_all(?=\.csv$)/i, ''))
    for (const r of rows) {
      const k = bookKey(r.title, r.author)
      if (seen.has(k)) continue
      seen.add(k); out.rows.push(r)
    }
  }
  return out
}
