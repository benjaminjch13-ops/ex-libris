import { GENRES } from './genres'

/**
 * Book metadata from public catalogues, called straight from the browser (no server):
 * Google Books (good Spanish coverage, descriptions, categories) and Open Library
 * (ISBN data and covers that can be stored offline). Apple Books goes through the
 * iTunes lookup API, which only answers cross-origin as JSONP.
 */

export interface CatalogHit {
  title: string
  author: string
  pages?: number
  year?: number
  isbn?: string
  description?: string
  cover?: string
  genre?: string
  source: 'google' | 'openlibrary' | 'apple'
}

const TIMEOUT = 8000

async function getJson<T>(url: string): Promise<T> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), TIMEOUT)
  try {
    const r = await fetch(url, { signal: ctl.signal })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return (await r.json()) as T
  } finally {
    clearTimeout(t)
  }
}

let jsonpN = 0
function jsonp<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const name = `__exl_jsonp_${Date.now()}_${jsonpN++}`
    const s = document.createElement('script')
    const w = window as unknown as Record<string, unknown>
    const done = () => { delete w[name]; s.remove(); clearTimeout(t) }
    const t = setTimeout(() => { done(); reject(new Error('timeout')) }, TIMEOUT)
    w[name] = (data: T) => { done(); resolve(data) }
    s.onerror = () => { done(); reject(new Error('jsonp')) }
    s.src = `${url}${url.includes('?') ? '&' : '?'}callback=${name}`
    document.head.appendChild(s)
  })
}

// ---------- ISBN ----------

export function cleanIsbn(raw: string): string | undefined {
  const s = raw.replace(/[^0-9Xx]/g, '').toUpperCase()
  if (s.length === 13 && /^97[89]\d{10}$/.test(s) && isbn13ok(s)) return s
  if (s.length === 10 && /^\d{9}[\dX]$/.test(s) && isbn10ok(s)) return s
  return undefined
}

function isbn13ok(s: string) {
  const sum = [...s].reduce((n, c, i) => n + Number(c) * (i % 2 ? 3 : 1), 0)
  return sum % 10 === 0
}
function isbn10ok(s: string) {
  const sum = [...s].reduce((n, c, i) => n + (c === 'X' ? 10 : Number(c)) * (10 - i), 0)
  return sum % 11 === 0
}

// ---------- genres ----------

const GENRE_HINTS: [RegExp, string][] = [
  [/science fiction|ciencia ficci|dystop|distop/i, 'Ciencia ficción y distopía'],
  [/fantas/i, 'Fantasía'],
  [/horror|terror|thriller|mystery|misterio|suspense|crime|policiac|detective/i, 'Terror y misterio'],
  [/poetry|poes/i, 'Poesía'],
  [/short stor|relato|cuento/i, 'Relatos'],
  [/biograph|memoir|memorias|autobiograf/i, 'Memorias y biografía'],
  [/self-help|autoayuda|personal growth|desarrollo personal|motivaci/i, 'Desarrollo personal'],
  [/psycholog|psicolog/i, 'Psicología'],
  [/philosoph|filosof|religion|spiritual|espiritual|body, mind/i, 'Filosofía y espiritualidad'],
  [/business|economics|finance|negocio|econom|finanz|management/i, 'Negocios y finanzas'],
  [/history|histori/i, 'Historia'],
  [/science|ciencia|nature|naturaleza|mathemat|medical/i, 'Ciencia y divulgación'],
  [/feminis|women|mujer|gender/i, 'Feminismo'],
  [/art|design|diseño|creativ|photograph|music|música|crafts/i, 'Creatividad'],
  [/essay|ensayo|criticism|crítica|social science|political/i, 'Ensayo'],
  [/fiction|ficci|novel|novela/i, 'Novela'],
]

function genreFromSubjects(subjects: string[] = []): string | undefined {
  const text = subjects.join(' | ')
  if (!text) return undefined
  for (const [re, g] of GENRE_HINTS) if (re.test(text) && GENRES.includes(g)) return g
  return undefined
}

// ---------- Google Books ----------

interface GVolume {
  id: string
  volumeInfo: {
    title?: string; subtitle?: string; authors?: string[]; pageCount?: number; publishedDate?: string
    description?: string; categories?: string[]; imageLinks?: { thumbnail?: string; smallThumbnail?: string }
    industryIdentifiers?: { type: string; identifier: string }[]
  }
}

const strip = (html?: string) => html?.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim()

function fromGoogle(v: GVolume): CatalogHit | undefined {
  const i = v.volumeInfo
  if (!i?.title) return undefined
  const ids = i.industryIdentifiers ?? []
  const isbn = ids.find((x) => x.type === 'ISBN_13')?.identifier ?? ids.find((x) => x.type === 'ISBN_10')?.identifier
  const thumb = i.imageLinks?.thumbnail ?? i.imageLinks?.smallThumbnail
  return {
    title: i.subtitle && i.title.length < 40 ? `${i.title}: ${i.subtitle}` : i.title,
    author: (i.authors ?? []).join(', '),
    pages: i.pageCount || undefined,
    year: i.publishedDate ? Number(i.publishedDate.slice(0, 4)) || undefined : undefined,
    isbn,
    description: strip(i.description),
    cover: thumb?.replace(/^http:/, 'https:').replace('&edge=curl', ''),
    genre: genreFromSubjects(i.categories),
    source: 'google',
  }
}

async function googleSearch(q: string, max = 8): Promise<CatalogHit[]> {
  const d = await getJson<{ items?: GVolume[] }>(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=${max}&printType=books`)
  return (d.items ?? []).map(fromGoogle).filter((x): x is CatalogHit => !!x)
}

async function googleVolume(id: string): Promise<CatalogHit | undefined> {
  return fromGoogle(await getJson<GVolume>(`https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(id)}`))
}

// ---------- Open Library ----------

interface OLBook {
  title?: string; subtitle?: string; authors?: { name: string }[]; number_of_pages?: number; publish_date?: string
  cover?: { large?: string; medium?: string }; subjects?: { name: string }[]
}

async function openLibraryIsbn(isbn: string): Promise<CatalogHit | undefined> {
  const d = await getJson<Record<string, OLBook>>(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`)
  const b = d[`ISBN:${isbn}`]
  if (!b?.title) return undefined
  const year = b.publish_date?.match(/\d{4}/)?.[0]
  return {
    title: b.subtitle && b.title.length < 40 ? `${b.title}: ${b.subtitle}` : b.title,
    author: (b.authors ?? []).map((a) => a.name).join(', '),
    pages: b.number_of_pages,
    year: year ? Number(year) : undefined,
    isbn,
    cover: b.cover?.large ?? b.cover?.medium,
    genre: genreFromSubjects(b.subjects?.map((s) => s.name)),
    source: 'openlibrary',
  }
}

interface OLDoc { title?: string; author_name?: string[]; first_publish_year?: number; number_of_pages_median?: number; isbn?: string[]; cover_i?: number; subject?: string[] }

async function openLibrarySearch(q: string, max = 8): Promise<CatalogHit[]> {
  const d = await getJson<{ docs?: OLDoc[] }>(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=${max}&fields=title,author_name,first_publish_year,number_of_pages_median,isbn,cover_i,subject`)
  return (d.docs ?? []).filter((x) => x.title).map((x) => ({
    title: x.title!,
    author: (x.author_name ?? []).slice(0, 3).join(', '),
    pages: x.number_of_pages_median,
    year: x.first_publish_year,
    isbn: x.isbn?.find((i) => i.length === 13) ?? x.isbn?.[0],
    cover: x.cover_i ? `https://covers.openlibrary.org/b/id/${x.cover_i}-L.jpg` : undefined,
    genre: genreFromSubjects(x.subject?.slice(0, 12)),
    source: 'openlibrary' as const,
  }))
}

// ---------- public API ----------

/** Everything the catalogues know about one ISBN, merged. Google for text, Open Library for the cover. */
export async function lookupIsbn(raw: string): Promise<CatalogHit | undefined> {
  const isbn = cleanIsbn(raw)
  if (!isbn) return undefined
  const [g, o] = await Promise.allSettled([googleSearch(`isbn:${isbn}`, 1).then((l) => l[0]), openLibraryIsbn(isbn)])
  const gh = g.status === 'fulfilled' ? g.value : undefined
  const oh = o.status === 'fulfilled' ? o.value : undefined
  if (!gh && !oh) return undefined
  return {
    ...(oh ?? {}),
    ...(gh ?? {}),
    title: gh?.title || oh!.title,
    author: gh?.author || oh?.author || '',
    pages: gh?.pages ?? oh?.pages,
    year: gh?.year ?? oh?.year,
    cover: oh?.cover ?? gh?.cover,
    genre: gh?.genre ?? oh?.genre,
    isbn,
    source: gh ? 'google' : 'openlibrary',
  }
}

/** Title / author / ISBN search across both catalogues, de-duplicated. */
export async function searchCatalog(q: string): Promise<CatalogHit[]> {
  const query = q.trim()
  if (!query) return []
  const isbn = cleanIsbn(query)
  if (isbn) {
    const hit = await lookupIsbn(isbn)
    return hit ? [hit] : []
  }
  const [g, o] = await Promise.allSettled([googleSearch(query), openLibrarySearch(query, 6)])
  const all = [...(g.status === 'fulfilled' ? g.value : []), ...(o.status === 'fulfilled' ? o.value : [])]
  if (!all.length && g.status === 'rejected' && o.status === 'rejected') throw new Error('offline')
  const key = (h: CatalogHit) => `${norm(h.title).slice(0, 40)}|${norm(h.author.split(',')[0] ?? '')}`
  const seen = new Map<string, CatalogHit>()
  for (const h of all) {
    const k = key(h)
    const prev = seen.get(k)
    if (!prev) seen.set(k, h)
    else seen.set(k, { ...h, ...prev, cover: prev.cover ?? h.cover, pages: prev.pages ?? h.pages, isbn: prev.isbn ?? h.isbn })
  }
  return [...seen.values()].slice(0, 10)
}

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Downloads a catalogue cover so it works offline; undefined when the host doesn't allow it. */
export async function fetchCoverBlob(url?: string): Promise<Blob | undefined> {
  if (!url) return undefined
  try {
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), TIMEOUT)
    // own query string: the offline cache may hold an opaque copy of this image (from an <img>), which a CORS read can't use
    const r = await fetch(`${url}${url.includes('?') ? '&' : '?'}exl=blob`, { signal: ctl.signal, mode: 'cors' })
    clearTimeout(t)
    if (!r.ok) return undefined
    const b = await r.blob()
    return b.type.startsWith('image/') && b.size > 1500 ? b : undefined
  } catch {
    return undefined
  }
}

// ---------- store links ----------

interface StoreLink { url: string; store: string; kind: 'google' | 'apple' | 'amazon' | 'other'; id?: string; isbn?: string; query?: string; country?: string }

const STORES: [RegExp, string][] = [
  [/(^|\.)play\.google\./, 'Google Play'],
  [/(^|\.)books\.google\./, 'Google Books'],
  [/(^|\.)(books|apps|itunes)\.apple\.com$/, 'Apple Books'],
  [/(^|\.)amazon\./, 'Amazon'],
  [/(^|\.)amzn\.(to|eu|asia)$/, 'Amazon'],
  [/(^|\.)a\.co$/, 'Amazon'],
  [/buscalibre/, 'Buscalibre'],
  [/casadellibro/, 'Casa del Libro'],
  [/gandhi/, 'Gandhi'],
  [/sophosenlinea|sophos\./, 'Sophos'],
  [/elsotano/, 'El Sótano'],
  [/fnac\./, 'Fnac'],
  [/kobo\./, 'Kobo'],
  [/audible\./, 'Audible'],
  [/barnesandnoble/, 'Barnes & Noble'],
  [/bookshop\.org/, 'Bookshop'],
  [/mercadolibre|mercadolivre/, 'Mercado Libre'],
  [/goodreads/, 'Goodreads'],
  [/todostuslibros/, 'Todos tus libros'],
  [/elcorteingles/, 'El Corte Inglés'],
  [/penguinlibros|penguinrandomhouse/, 'Penguin'],
  [/planetadelibros/, 'Planeta'],
]

function storeName(host: string): string {
  const h = host.replace(/^www\./, '').toLowerCase()
  for (const [re, name] of STORES) if (re.test(h)) return name
  const core = h.split('.').filter((p) => !['com', 'co', 'net', 'org', 'es', 'mx', 'gt', 'ar', 'cl', 'pe', 'shop', 'store', 'm'].includes(p))[0] ?? h
  return core.charAt(0).toUpperCase() + core.slice(1)
}

function findUrl(text: string): string | undefined {
  return text.match(/https?:\/\/[^\s<>"']+/i)?.[0]?.replace(/[).,;]+$/, '')
}

/** What a store link tells us without opening the page (stores block cross-origin reads). */
export function parseStoreLink(raw: string): StoreLink | undefined {
  const href = findUrl(raw) ?? (/^[\w-]+(\.[\w-]+)+\//.test(raw.trim()) ? `https://${raw.trim()}` : undefined)
  if (!href) return undefined
  let u: URL
  try { u = new URL(href) } catch { return undefined }
  const store = storeName(u.hostname)
  const path = decodeURIComponent(u.pathname)
  const isbnInUrl = (path + ' ' + u.search).match(/97[89][\d-]{10,14}/)?.[0]
  const isbn = isbnInUrl ? cleanIsbn(isbnInUrl) : undefined
  const base: StoreLink = { url: u.toString(), store, kind: 'other', isbn }

  if (store === 'Google Play' || store === 'Google Books') {
    const id = u.searchParams.get('id') ?? path.match(/\/books\/edition\/[^/]*\/([\w-]{8,})/)?.[1]
    return { ...base, kind: 'google', id: id ?? undefined }
  }
  if (store === 'Apple Books') {
    const id = path.match(/id(\d{6,})/)?.[1]
    const country = path.match(/^\/([a-z]{2})\//)?.[1]
    const slug = path.split('/').find((p) => p.includes('-') && !/^id\d/.test(p))
    return { ...base, kind: 'apple', id, country, query: slug?.replace(/-/g, ' ') }
  }
  if (store === 'Amazon') {
    const asin = path.match(/\/(?:dp|gp\/product|gp\/aw\/d|exec\/obidos\/ASIN)\/([A-Z0-9]{10})/i)?.[1]?.toUpperCase()
    const slug = path.split('/').find((p) => p.length > 8 && p.includes('-') && !/^[A-Z0-9]{10}$/i.test(p))
    const store2 = /kindle|ebook/i.test(path + u.search) || asin?.startsWith('B0') ? 'Kindle' : 'Amazon'
    return { ...base, store: store2, kind: 'amazon', id: asin, isbn: isbn ?? (asin && cleanIsbn(asin)) ?? undefined, query: slug?.replace(/-/g, ' ') }
  }
  // generic shop: the longest hyphenated piece of the path is usually the title slug
  const slug = path.split('/').filter((p) => p.includes('-') && p.length > 6).sort((a, b) => b.length - a.length)[0]
  const query = slug?.replace(/\.(html?|php|aspx?)$/, '').replace(/[-_]+/g, ' ').replace(/\b(\d{6,}|p|libro|book|producto?)\b/gi, ' ').replace(/\s+/g, ' ').trim()
  return { ...base, query: query && query.length > 3 ? query : undefined }
}

interface ItunesResult { trackName?: string; artistName?: string; description?: string; artworkUrl100?: string; releaseDate?: string; genres?: string[] }

/** Best guess at the book behind a store link (and the title the share sheet sent, if any). */
export async function lookupLink(link: StoreLink, sharedTitle?: string): Promise<CatalogHit | undefined> {
  try {
    if (link.kind === 'google' && link.id) {
      const h = await googleVolume(link.id).catch(() => undefined)
      if (h) return h
    }
    if (link.kind === 'apple' && link.id) {
      const d = await jsonp<{ results?: ItunesResult[] }>(`https://itunes.apple.com/lookup?id=${link.id}${link.country ? `&country=${link.country}` : ''}`).catch(() => undefined)
      const r = d?.results?.[0]
      if (r?.trackName) {
        return {
          title: r.trackName,
          author: r.artistName ?? '',
          description: strip(r.description),
          cover: r.artworkUrl100?.replace(/100x100bb/, '600x600bb'),
          year: r.releaseDate ? Number(r.releaseDate.slice(0, 4)) : undefined,
          genre: genreFromSubjects(r.genres),
          source: 'apple',
        }
      }
    }
    if (link.isbn) {
      const h = await lookupIsbn(link.isbn)
      if (h) return h
    }
    const q = cleanShareTitle(sharedTitle) || link.query
    if (q) return (await searchCatalog(q))[0]
  } catch {
    /* offline or blocked: the person types the title */
  }
  return undefined
}

/** "Cien años de soledad : García Márquez, Gabriel : Amazon.com.mx: Libros" → "Cien años de soledad García Márquez, Gabriel" */
export function cleanShareTitle(t?: string): string | undefined {
  if (!t) return undefined
  const s = t
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\b(amazon(\.com)?(\.\w+)*|kindle edition|edición kindle|libros?|books?|google play|apple books|en google play|buscalibre)\b/gi, ' ')
    .replace(/[|:–—]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return s.length > 2 ? s.slice(0, 120) : undefined
}
