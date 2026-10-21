import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { Book, Status } from '../types'
import { useLibrary } from '../state/library'
import { Book3D, bookDims } from './BookArt'
import { greeting, relTime, useMedia } from '../lib/hooks'
import { ChevronRight, Heart, Plus } from './Icons'
import type { Filters } from '../lib/filters'
import { staleBook, weeksSince } from '../lib/books'
import { TbrNext } from './TbrNext'
import { StreakWidget } from './Streak'
import { genreOf } from '../lib/genres'
import type { DecorId, HomeSection, ShelfPrefs } from '../types'
import { LoansSection } from './Loans'
import { TeaserSkeleton } from './Skeleton'
import { WhenVisible } from './WhenVisible'
import { EmptyArt } from './EmptyArt'

// the suggestions catalogue is loaded after the shelf is on screen
const RecsTeaser = lazy(() => import('./Recs').then((m) => ({ default: m.RecsTeaser })))

export interface OpenOrigin {
  rect: DOMRect
  pose: 'spine' | 'tilt' | 'flat'
}

interface Props {
  visible: Book[]
  filters: Filters
  setFilters: (f: Filters) => void
  selectedId?: string
  onOpen: (b: Book, origin: OpenOrigin) => void
  onAdd: () => void
  onCollection: () => void
  onStart: (b: Book) => void
  onTbr: () => void
  onDrop: (b: Book) => void
  onRecs: () => void
  onYear: () => void
  onGoals: () => void
}

export function Library({ visible: all, filters, setFilters, selectedId, onOpen, onAdd, onCollection, onStart, onTbr, onDrop, onRecs, onYear, onGoals }: Props) {
  const { books: allBooks, settings, patchBook, setStatus, addToTbr, notify } = useLibrary()
  // abandoned books live in the collection, not on the shelf
  const books = useMemo(() => allBooks.filter((b) => b.status !== 'abandonado'), [allBooks])
  const visible = useMemo(() => all.filter((b) => b.status !== 'abandonado'), [all])
  const stale = useMemo(() => staleBook(books), [books])
  const small = useMedia('(max-width: 640px)')

  const reading = useMemo(
    () => books
      .filter((b) => b.status === 'leyendo' || (b.progress && b.status === 'pendiente' && b.format !== 'fisico'))
      .sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))
      .slice(0, 4),
    [books],
  )
  const finished = books.filter((b) => b.status === 'terminado').length
  const filtering = filters.q || filters.status !== 'todos' || filters.category || filters.author || filters.fav || filters.shelf || filters.loaned

  // paper books get their own bookcase; books read in another app (Kindle…) stay with the digital ones
  const isPaper = (b: Book) => b.format === 'fisico' && !b.app
  const shelfPrefs = settings.shelf ?? { group: 'categoria', sort: 'reciente', decor: ['planta', 'pila'] }
  const custom = settings.customShelves ?? []
  const group = (list: Book[]) => groupBooks(list, shelfPrefs, custom)
  const digitalShelves = useMemo(() => group(visible.filter((b) => !isPaper(b))), [visible, shelfPrefs, custom]) // eslint-disable-line react-hooks/exhaustive-deps
  const paperShelves = useMemo(() => group(visible.filter(isPaper)), [visible, shelfPrefs, custom]) // eslint-disable-line react-hooks/exhaustive-deps
  const paperCount = books.filter(isPaper).length
  const digitalCount = books.length - paperCount
  const both = paperCount > 0 && digitalCount > 0
  const nDigital = digitalShelves.reduce((n, [, l]) => n + l.length, 0)
  const nPaper = paperShelves.reduce((n, [, l]) => n + l.length, 0)

  const name = settings.readerName.trim()
  const lead = reading[0]
  const order: HomeSection[] = settings.home?.order ?? ['racha', 'mesa', 'prestados', 'siguiente', 'parati', 'resumen']
  const hidden = new Set(settings.home?.hidden ?? [])

  return (
    <>
      <section className="welcome">
        <div>
          <div className="eyebrow">{new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          <h1>{greeting()}{name ? <>, <em>{name}</em></> : null}.</h1>
          <p>
            {books.length === 0
              ? 'Tu biblioteca está vacía. Añade un EPUB o un PDF, o escanea un libro de papel, y aparecerá en la estantería.'
              : lead
                ? <>Tienes <em>{lead.title}</em> {lead.progress?.page ? <>abierto por la página {lead.progress.page}</> : 'entre manos'}. Elige un lomo para hojear otro libro.</>
                : window.matchMedia?.('(hover: none)').matches
                  ? 'Toca un lomo para sacarlo del estante y ver el libro.'
                  : 'Pasa el cursor sobre un lomo para sacarlo del estante; haz clic para abrirlo.'}
          </p>
        </div>
        {!hidden.has('resumen') && <div className="stats" aria-label="Resumen de la biblioteca">
          <div className="stat"><b>{books.length}</b><span>libros</span></div>
          <div className="stat"><b>{reading.length}</b><span>en curso</span></div>
          <div className="stat"><b>{finished}</b><span>terminados</span></div>
        </div>}
      </section>

      {stale && !filtering && (
        <div className="nudge fade-up" role="status">
          <p>Hace {weeksSince(stale)} semanas que no abres <em>{stale.title}</em>. ¿Cómo va?</p>
          <div className="nudge-acts">
            <button className="chip" onClick={() => { patchBook(stale.id, { nudgeAfter: Date.now() + 21 * 86400000 }); notify('Perfecto, sigue en tu mesa') }}>Lo sigo leyendo</button>
            <button className="chip" onClick={() => { setStatus(stale.id, 'pendiente'); addToTbr(stale.id, 'start'); notify('En pausa: quedó primero en «Por leer»') }}>Pausarlo</button>
            <button className="chip" onClick={() => onDrop(stale)}>Dejarlo</button>
          </div>
        </div>
      )}

      {!filtering && order.filter((sec) => !hidden.has(sec)).map((sec) => {
        if (sec === 'racha') return books.length > 0 ? <StreakWidget key="racha" onYear={onYear} onGoals={onGoals} /> : null
        if (sec === 'siguiente') return books.length > 0 ? <section key="siguiente" aria-label="Siguiente lectura"><TbrNext onStart={onStart} onOpen={onTbr} /></section> : null
        if (sec === 'parati') return <WhenVisible key="parati" placeholder={<TeaserSkeleton />}><Suspense fallback={<TeaserSkeleton />}><RecsTeaser onOpen={onRecs} /></Suspense></WhenVisible>
        if (sec === 'prestados') return <LoansSection key="prestados" onOpen={onOpen} small={small} />
        if (sec === 'mesa' && reading.length > 0) return (
          <div key="mesa">
          <section aria-labelledby="desk-h">
                    <div className="section-head">
                      <h2 id="desk-h">Sobre la <i>mesa</i></h2>
                      <span className="eyebrow">Lectura actual</span>
                    </div>
                    <div className="desk">
                      {reading.map((b) => {
                        const dims = bookDims(b, small ? 130 : 160)
                        const pct = Math.round((b.progress?.percent ?? 0) * 100)
                        return (
                          <button
                            key={b.id}
                            className="desk-item"
                            data-book-id={b.id}
                            onClick={(e) => onOpen(b, { rect: (e.currentTarget.querySelector('.desk-book') as HTMLElement).getBoundingClientRect(), pose: 'tilt' })}
                            aria-label={`Continuar leyendo ${b.title}, ${pct}% leído`}
                          >
                            <div className="desk-book" style={{ width: dims.w, height: dims.h, visibility: selectedId === b.id ? 'hidden' : undefined }}>
                              <Book3D book={b} dims={dims} />
                            </div>
                            <div className="desk-meta">
                              <h3>{b.title}</h3>
                              <div className="by">{b.author}</div>
                              <div className="meter" aria-hidden><i style={{ width: `${pct}%` }} /></div>
                              <div className="pct"><span>{pct}%</span><span>{b.lastOpenedAt ? relTime(b.lastOpenedAt) : ''}</span></div>
                              <span className="go">Continuar <ChevronRight size={14} /></span>
                            </div>
                          </button>
                        )
                      })}
                      <div className="desk-ledge" />
                    </div>
                  </section>
          </div>
        )
        return null
      })}

      <section aria-labelledby="shelves-h">
        <div className="section-head">
          <h2 id="shelves-h">
            {filtering ? <>Resultados <i>({visible.length})</i></> : both ? <>Libros <i>digitales</i></> : paperCount && !digitalCount ? <>Libros <i>físicos</i></> : <>La <i>estantería</i></>}
          </h2>
          <button className="chip" onClick={onCollection}>Ver colección completa <ChevronRight size={14} /></button>
        </div>
        {books.length > 0 && <FilterBar filters={filters} setFilters={setFilters} />}

        {books.length === 0 ? (
          <div className="bookcase" style={{ marginTop: 26 }}>
            <div className="empty-state">
              <EmptyArt kind="shelf" />
              <h3>Los estantes esperan su primer libro</h3>
              <p>Sube un EPUB o un PDF, o escanea el código de barras de un libro de papel. Leeremos su título, autor y portada para colocarlo en su sitio.</p>
              <p className="empty-tip">Tus libros se guardan solo en este dispositivo. ¿No tienes un EPUB a mano? Hay clásicos gratuitos y legales en <a href="https://www.gutenberg.org/browse/languages/es" target="_blank" rel="noopener noreferrer">Project Gutenberg</a>.</p>
              <button className="btn btn-gold" onClick={onAdd}><Plus size={16} /> Añadir libro</button>
            </div>
          </div>
        ) : visible.length === 0 ? (
          <div className="bookcase" style={{ marginTop: 26 }}>
            <div className="empty-state">
              <EmptyArt kind="search" />
              <h3>Ningún libro coincide</h3>
              <p>Prueba con otra palabra o quita algún filtro.</p>
              <button className="btn" onClick={() => setFilters({ q: '', status: 'todos', category: '', author: '', fav: false, shelf: undefined })}>Quitar filtros</button>
            </div>
          </div>
        ) : (
          <>
            {nDigital > 0 && (
              <div className="bookcase" style={{ marginTop: 26 }} aria-label="Libros digitales">
                <Bookcase groups={digitalShelves} small={small} selectedId={selectedId} onOpen={onOpen} decor={shelfPrefs.decor} dividers={shelfPrefs.group !== 'ninguno'} />
              </div>
            )}
            {nPaper > 0 && (
              <>
                {nDigital > 0 && (
                  <div className="section-head paper-head">
                    <h2>Libros <i>físicos</i></h2>
                    <span className="eyebrow">{paperCount} {paperCount === 1 ? 'libro de papel' : 'libros de papel'}</span>
                  </div>
                )}
                <div className="bookcase oak" style={{ marginTop: nDigital > 0 ? 18 : 26 }} aria-label="Libros físicos">
                  <Bookcase groups={paperShelves} small={small} selectedId={selectedId} onOpen={onOpen} decor={[...shelfPrefs.decor].reverse()} dividers={shelfPrefs.group !== 'ninguno'} />
                </div>
              </>
            )}
          </>
        )}
      </section>
    </>
  )
}


type Item =
  | { kind: 'divider'; key: string; cat: string; width: number }
  | { kind: 'book'; key: string; book: Book; pose: 'spine' | 'face'; dims: { w: number; h: number; d: number }; width: number }

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']

/**
 * Lays every visible book out across as many shelves as the case is wide enough for.
 * Categories run in sequence, separated by standing divider cards; a few books per shelf
 * (favourites and books in progress) face out so covers are visible from the room.
 */
function Bookcase({ groups, small, selectedId, onOpen, decor, dividers }: { groups: [string, Book[]][]; small: boolean; selectedId?: string; onOpen: Props['onOpen']; decor: DecorId[]; dividers: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const scale = small ? 0.74 : 1
  const total = groups.reduce((n, [, l]) => n + l.length, 0)

  const items: Item[] = useMemo(() => {
    const out: Item[] = []
    let faceBudget = Math.max(2, Math.round(total / 3))
    for (const [cat, list] of groups) {
      if (groups.length > 1 && dividers) out.push({ kind: 'divider', key: `div-${cat}`, cat, width: 34 * scale + 6 })
      // featured: favourites first, then books in progress
      const ranked = [...list].sort((a, b) => Number(b.favorite) - Number(a.favorite) || Number(b.status === 'leyendo') - Number(a.status === 'leyendo'))
      const featured = new Set<string>()
      for (const b of ranked) {
        if (faceBudget <= 0) break
        if (b.favorite || b.status === 'leyendo') { featured.add(b.id); faceBudget--; break }
      }
      for (const b of list) {
        const face = featured.has(b.id)
        const h = Math.round((face ? 210 : 180 + b.heightRatio * 66) * scale)
        const dims = bookDims(b, h)
        out.push({ kind: 'book', key: b.id, book: b, pose: face ? 'face' : 'spine', dims, width: face ? Math.round(dims.w * 0.96) + 18 : dims.d + 3 })
      }
    }
    return out
  }, [groups, scale, total, dividers])

  const rows = useMemo(() => {
    const avail = Math.max(240, width - 36 - 40) // row padding + bookend
    const sum = (r: Item[]) => r.reduce((n, i) => n + i.width, 0)
    let rows: Item[][] = [[]]
    for (const it of items) {
      const cur = rows[rows.length - 1]
      if (cur.length && sum(cur) + it.width > avail) rows.push([it])
      else cur.push(it)
    }
    // A larger library should read as a case with several levels, not one long plank.
    if (rows.length === 1 && items.length >= 6 && !small) {
      const half = sum(items) / 2
      let acc = 0
      let cut = items.findIndex((i) => (acc += i.width) >= half)
      if (cut < 1) cut = 1
      rows = [items.slice(0, cut), items.slice(cut)]
    }
    // never end a shelf on a lone divider
    for (let r = 0; r < rows.length - 1; r++) {
      const last = rows[r][rows[r].length - 1]
      if (last?.kind === 'divider') rows[r + 1].unshift(rows[r].pop()!)
    }
    return rows.filter((r) => r.length)
  }, [items, width, small])

  return (
    <div ref={ref}>
      <AnimatePresence initial={false}>
        {rows.map((row, i) => (
          <Shelf key={i} index={i} row={row} selectedId={selectedId} onOpen={onOpen} decor={decor.filter((_, j) => j % rows.length === i).slice(0, small ? 1 : 2)} scale={scale} />
        ))}
      </AnimatePresence>
    </div>
  )
}

function Shelf({ index, row, selectedId, onOpen, decor, scale }: { index: number; row: Item[]; selectedId?: string; onOpen: Props['onOpen']; decor: DecorId[]; scale: number }) {
  const [hover, setHover] = useState<Book | null>(null)
  const cats = [...new Set(row.filter((i): i is Extract<Item, { kind: 'book' }> => i.kind === 'book').map((i) => i.book.category || 'Sin categoría'))]
  const tallest = Math.max(160 * scale, ...row.map((i) => (i.kind === 'book' ? i.dims.h : 150 * scale)))
  return (
    <motion.div className="shelf" layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
      <div className="shelf-label">
        <span className="plate">{ROMAN[index] ?? index + 1}</span>
        <span className="shelf-caption" aria-live="polite">
          {hover ? <><b>{hover.title}</b> · {hover.author}</> : cats.join(' · ')}
        </span>
      </div>
      <div className="shelf-light" />
      <div className="shelf-row" role="list" style={{ minHeight: tallest + 46 }}>
        <AnimatePresence initial={false} mode="popLayout">
          {row.map((it) => it.kind === 'divider' ? (
            <motion.div key={it.key} layout className="divider-card" style={{ height: Math.round(128 * scale) }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} aria-hidden>
              <span>{it.cat}</span>
            </motion.div>
          ) : (
            <motion.div
              key={it.key}
              role="listitem"
              layout
              initial={{ opacity: 0, y: -30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30 }}
              transition={{ type: 'spring', stiffness: 260, damping: 26 }}
              className="book-slot"
              style={{ width: it.width - 3 }}
            >
              <button
                className={`shelf-book ${it.pose === 'face' ? 'face' : ''}${selectedId === it.book.id ? ' is-hidden' : ''}${it.book.loan ? ' loaned' : ''}`}
                data-book-id={it.book.id}
                data-pose={it.pose}
                style={{ '--w': `${it.dims.w}px`, '--h': `${it.dims.h}px`, '--d': `${it.dims.d}px` } as React.CSSProperties}
                onMouseEnter={() => setHover(it.book)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(it.book)}
                onBlur={() => setHover(null)}
                onClick={(e) => onOpen(it.book, { rect: e.currentTarget.getBoundingClientRect(), pose: it.pose === 'face' ? 'tilt' : 'spine' })}
                aria-label={`${it.book.title}, de ${it.book.author}. ${statusText(it.book.status)}${it.book.favorite ? ', favorito' : ''}${it.book.loan ? `, prestado a ${it.book.loan.to}` : ''}. Abrir vista previa`}
              >
                {it.book.favorite && <Heart className="fav" size={12} filled />}
                <Book3D book={it.book} dims={it.dims} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
        <div className="bookend" aria-hidden />
        {decor.length > 0 && <span className="decor-group">{decor.map((d) => <Decor key={d} kind={d} scale={scale} />)}</span>}
      </div>
      <div className="plank" />
    </motion.div>
  )
}

function Decor({ kind, scale }: { kind: DecorId; scale: number }) {
  if (kind === 'pila') {
    const slabs = [['#3b4a3a', 150], ['#6b2b2b', 136], ['#2d3550', 158], ['#8a6d3b', 128]] as const
    return (
      <div className="decor decor-stack" aria-hidden style={{ transform: `scale(${scale})` }}>
        {slabs.map(([c, w], i) => <i key={i} style={{ background: c, width: w, marginLeft: (i % 2) * 8 }} />)}
      </div>
    )
  }
  if (kind === 'gato') return (
    <svg className="decor decor-art" viewBox="0 0 130 70" aria-hidden style={{ height: 70 * scale }}>
      <path d="M12 66 C8 40 30 28 58 30 C76 31 92 38 100 48 L104 34 L110 44 C118 46 122 54 120 66 Z" fill="#2a211c" />
      <path d="M12 66 C4 66 2 56 10 54 C16 53 20 58 26 60" fill="none" stroke="#2a211c" strokeWidth="7" strokeLinecap="round" />
      <path d="M106 54 q3 2 6 0" stroke="#7a6a5a" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <path d="M40 46 q8 -4 16 0 M50 54 q8 -4 16 0" stroke="#3a2f28" strokeWidth="2" fill="none" />
    </svg>
  )
  if (kind === 'vela') return (
    <svg className="decor decor-art decor-candle" viewBox="0 0 60 120" aria-hidden style={{ height: 120 * scale }}>
      <ellipse cx="30" cy="30" rx="26" ry="30" fill="rgba(255,190,100,.18)" />
      <path d="M30 14 C35 22 36 28 30 34 C24 28 25 22 30 14 Z" fill="#ffcf7a" /><path d="M30 22 C32 26 32 29 30 32 C28 29 28 26 30 22 Z" fill="#fff3d0" />
      <path d="M30 34 V40" stroke="#3a2a1a" strokeWidth="1.5" />
      <rect x="20" y="40" width="20" height="62" rx="3" fill="#efe2c4" /><path d="M20 46 q4 6 0 12" fill="#e3d2ad" />
      <rect x="12" y="102" width="36" height="8" rx="4" fill="#9a7a4a" /><rect x="16" y="110" width="28" height="6" rx="2" fill="#7a5a32" />
    </svg>
  )
  if (kind === 'globo') return (
    <svg className="decor decor-art" viewBox="0 0 100 140" aria-hidden style={{ height: 140 * scale }}>
      <circle cx="50" cy="56" r="36" fill="#3e6b78" />
      <path d="M30 40 C38 34 44 40 40 48 C36 56 44 60 40 68 C34 66 28 54 30 40 Z M56 30 C66 30 74 38 70 46 C64 44 60 50 64 58 C58 62 52 54 54 46 Z M58 70 C66 66 74 72 68 82 C62 84 56 78 58 70 Z" fill="#c9b27a" />
      <path d="M50 18 A38 38 0 0 1 50 94" fill="none" stroke="#b08a4a" strokeWidth="3" /><path d="M50 94 V118 M34 132 H66 M50 118 L38 132 M50 118 L62 132" stroke="#8a6a3a" strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
  if (kind === 'reloj') return (
    <svg className="decor decor-art" viewBox="0 0 60 110" aria-hidden style={{ height: 110 * scale }}>
      <rect x="8" y="4" width="44" height="8" rx="2" fill="#7a5a32" /><rect x="8" y="98" width="44" height="8" rx="2" fill="#7a5a32" />
      <path d="M12 12 V20 C12 38 26 46 28 55 C26 64 12 72 12 90 V98 H48 V90 C48 72 34 64 32 55 C34 46 48 38 48 20 V12 Z" fill="rgba(220,230,240,.25)" stroke="#c9b68b" strokeWidth="1.5" />
      <path d="M18 26 C20 38 28 44 30 50 C32 44 40 38 42 26 Z" fill="#d9b56c" /><path d="M16 96 C18 84 26 80 30 78 C34 80 42 84 44 96 Z" fill="#d9b56c" /><path d="M30 52 V78" stroke="#d9b56c" strokeWidth="1.2" />
      <path d="M10 12 V98 M50 12 V98" stroke="#8a6a3a" strokeWidth="3" />
    </svg>
  )
  return (
    <svg className="decor decor-plant" viewBox="0 0 120 150" aria-hidden style={{ height: 150 * scale }}>
      <g fill="none" stroke="#6f8a5a" strokeWidth="2.2" strokeLinecap="round">
        <path d="M60 104 C58 80 44 62 24 52" /><path d="M60 104 C62 76 78 56 100 50" /><path d="M60 104 C60 74 60 50 58 22" />
        <path d="M60 104 C52 88 36 86 18 90" /><path d="M60 104 C70 90 86 86 104 92" />
      </g>
      <g fill="#58744a">
        <ellipse cx="24" cy="52" rx="13" ry="6" transform="rotate(-25 24 52)" /><ellipse cx="100" cy="50" rx="13" ry="6" transform="rotate(20 100 50)" />
        <ellipse cx="58" cy="22" rx="6" ry="13" /><ellipse cx="18" cy="90" rx="12" ry="5" transform="rotate(10 18 90)" /><ellipse cx="104" cy="92" rx="12" ry="5" transform="rotate(-10 104 92)" />
        <ellipse cx="40" cy="70" rx="10" ry="5" transform="rotate(-30 40 70)" fill="#6f8a5a" /><ellipse cx="82" cy="70" rx="10" ry="5" transform="rotate(30 82 70)" fill="#6f8a5a" />
      </g>
      <path d="M36 104 H84 L78 148 H42 Z" fill="#8c5a3c" /><path d="M33 100 H87 V110 H33 Z" fill="#a46c48" />
    </svg>
  )
}

const hueOf = (hex: string) => {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  if (!d) return 400 + max // greys after the colours, light to dark
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return (h * 60 + 360) % 360
}

/** Shelves grouped and ordered the way the reader chose (Preferencias → Estantería). */
function groupBooks(list: Book[], prefs: ShelfPrefs, custom: string[]): [string, Book[]][] {
  const keyOf = (b: Book): string => {
    switch (prefs.group) {
      case 'genero': return genreOf(b)
      case 'autor': return (b.author || 'Autor desconocido').split(/,| y /)[0].trim()
      case 'estante': return b.shelves?.find((x) => custom.includes(x)) ?? 'Sin estante'
      case 'ninguno': return ''
      default: return b.category || 'Sin categoría'
    }
  }
  const sorters: Record<ShelfPrefs['sort'], (a: Book, b: Book) => number> = {
    titulo: (a, b) => a.title.localeCompare(b.title, 'es'),
    autor: (a, b) => a.author.localeCompare(b.author, 'es') || a.title.localeCompare(b.title, 'es'),
    reciente: (a, b) => b.addedAt - a.addedAt,
    color: (a, b) => hueOf(a.palette.bg) - hueOf(b.palette.bg),
    altura: (a, b) => b.heightRatio - a.heightRatio,
  }
  const m = new Map<string, Book[]>()
  for (const b of list) { const k = keyOf(b); m.set(k, [...(m.get(k) ?? []), b]) }
  const groups = [...m.entries()].map(([k, l]) => [k, l.sort(sorters[prefs.sort])] as [string, Book[]])
  if (prefs.group === 'estante') return groups.sort((a, b) => (custom.indexOf(a[0]) + 1 || 999) - (custom.indexOf(b[0]) + 1 || 999))
  return groups.sort((a, b) => a[0].localeCompare(b[0], 'es'))
}

function statusText(s: Status) {
  return s === 'leyendo' ? 'Leyendo' : s === 'terminado' ? 'Terminado' : s === 'abandonado' ? 'Abandonado' : 'Pendiente'
}

export function FilterBar({ filters, setFilters, withDropped }: { filters: Filters; setFilters: (f: Filters) => void; withDropped?: boolean }) {
  const { books: every, settings } = useLibrary()
  const custom = settings.customShelves ?? []
  const books = withDropped ? every : every.filter((b) => b.status !== 'abandonado')
  const categories = [...new Set(books.map((b) => b.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'))
  const authors = [...new Set(books.map((b) => b.author).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'))
  const count = (s: Status) => books.filter((b) => b.status === s).length
  const loaned = every.filter((b) => b.loan).length
  const opts: { v: Filters['status']; l: string; n?: number }[] = [
    { v: 'todos', l: 'Todos', n: books.length },
    { v: 'leyendo', l: 'Leyendo', n: count('leyendo') },
    { v: 'pendiente', l: 'Pendientes', n: count('pendiente') },
    { v: 'terminado', l: 'Terminados', n: count('terminado') },
    ...(withDropped && count('abandonado') ? [{ v: 'abandonado' as const, l: 'Abandonados', n: count('abandonado') }] : []),
  ]
  return (
    <div className="filters" role="group" aria-label="Filtros">
      {opts.map((o) => (
        <button key={o.v} className="chip" aria-pressed={filters.status === o.v} onClick={() => setFilters({ ...filters, status: o.v })}>
          {o.l} <span className="n">{o.n}</span>
        </button>
      ))}
      <button className="chip" aria-pressed={filters.fav} onClick={() => setFilters({ ...filters, fav: !filters.fav })}>
        <Heart size={13} filled={filters.fav} /> Favoritos
      </button>
      {(loaned > 0 || filters.loaned) && (
        <button className="chip" aria-pressed={!!filters.loaned} onClick={() => setFilters({ ...filters, loaned: !filters.loaned })}>
          Prestados <span className="n">{loaned}</span>
        </button>
      )}
      <span className="sep hide-sm" />
      <label className="sr-only" htmlFor="f-cat">Género o categoría</label>
      <select id="f-cat" className="select" value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}>
        <option value="">Todos los géneros</option>
        {categories.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <label className="sr-only" htmlFor="f-author">Autor</label>
      <select id="f-author" className="select" value={filters.author} onChange={(e) => setFilters({ ...filters, author: e.target.value })}>
        <option value="">Todos los autores</option>
        {authors.map((a) => <option key={a} value={a}>{a}</option>)}
      </select>
      {custom.length > 0 && (
        <>
          <label className="sr-only" htmlFor="f-shelf">Mis estantes</label>
          <select id="f-shelf" className="select" value={filters.shelf ?? ''} onChange={(e) => setFilters({ ...filters, shelf: e.target.value || undefined })}>
            <option value="">Todos mis estantes</option>
            {custom.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </>
      )}
    </div>
  )
}
