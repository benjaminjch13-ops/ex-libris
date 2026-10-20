import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { Book, Status } from '../types'
import { useLibrary } from '../state/library'
import { Book3D, bookDims } from './BookArt'
import { greeting, relTime, useMedia } from '../lib/hooks'
import { ChevronRight, Heart, Plus } from './Icons'
import type { Filters } from '../lib/filters'

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
}

export function Library({ visible, filters, setFilters, selectedId, onOpen, onAdd, onCollection }: Props) {
  const { books, settings } = useLibrary()
  const small = useMedia('(max-width: 640px)')

  const reading = useMemo(
    () => books
      .filter((b) => b.status === 'leyendo' || (b.progress && b.status !== 'terminado'))
      .sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))
      .slice(0, 4),
    [books],
  )
  const finished = books.filter((b) => b.status === 'terminado').length
  const filtering = filters.q || filters.status !== 'todos' || filters.category || filters.author || filters.fav

  const shelves = useMemo(() => {
    const m = new Map<string, Book[]>()
    for (const b of visible) {
      const k = b.category || 'Sin categoría'
      m.set(k, [...(m.get(k) ?? []), b])
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'))
  }, [visible])

  const name = settings.readerName.trim()
  const lead = reading[0]

  return (
    <>
      <section className="welcome">
        <div>
          <div className="eyebrow">{new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          <h1>{greeting()}{name ? <>, <em>{name}</em></> : null}.</h1>
          <p>
            {books.length === 0
              ? 'Tu biblioteca está vacía. Añade un EPUB o un PDF y aparecerá en la estantería.'
              : lead
                ? <>Tienes <em>{lead.title}</em> abierto por la página {lead.progress?.page ?? 1}. Elige un lomo para hojear otro libro.</>
                : 'Pasa el cursor sobre un lomo para sacarlo del estante; haz clic para abrirlo.'}
          </p>
        </div>
        <div className="stats" aria-label="Resumen de la biblioteca">
          <div className="stat"><b>{books.length}</b><span>libros</span></div>
          <div className="stat"><b>{reading.length}</b><span>en curso</span></div>
          <div className="stat"><b>{finished}</b><span>terminados</span></div>
        </div>
      </section>

      {reading.length > 0 && !filtering && (
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
      )}

      <section aria-labelledby="shelves-h">
        <div className="section-head">
          <h2 id="shelves-h">{filtering ? <>Resultados <i>({visible.length})</i></> : <>La <i>estantería</i></>}</h2>
          <button className="chip" onClick={onCollection}>Ver colección completa <ChevronRight size={14} /></button>
        </div>
        {books.length > 0 && <FilterBar filters={filters} setFilters={setFilters} />}

        <div className="bookcase" style={{ marginTop: 26 }}>
          {books.length === 0 ? (
            <div className="empty-state">
              <h3>Los estantes esperan su primer libro</h3>
              <p>Sube un EPUB o un PDF. Leeremos su título, autor y portada para colocarlo en su sitio.</p>
              <p className="empty-tip">Tus libros se guardan solo en este dispositivo. ¿No tienes un EPUB a mano? Hay clásicos gratuitos y legales en <a href="https://www.gutenberg.org/browse/languages/es" target="_blank" rel="noopener noreferrer">Project Gutenberg</a>.</p>
              <button className="btn btn-gold" onClick={onAdd}><Plus size={16} /> Añadir libro</button>
            </div>
          ) : visible.length === 0 ? (
            <div className="empty-state">
              <h3>Ningún libro coincide</h3>
              <p>Prueba con otra palabra o quita algún filtro.</p>
              <button className="btn" onClick={() => setFilters({ q: '', status: 'todos', category: '', author: '', fav: false })}>Quitar filtros</button>
            </div>
          ) : (
            <Bookcase groups={shelves} small={small} selectedId={selectedId} onOpen={onOpen} />
          )}
        </div>
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
function Bookcase({ groups, small, selectedId, onOpen }: { groups: [string, Book[]][]; small: boolean; selectedId?: string; onOpen: Props['onOpen'] }) {
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
      if (groups.length > 1) out.push({ kind: 'divider', key: `div-${cat}`, cat, width: 34 * scale + 6 })
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
  }, [groups, scale, total])

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
          <Shelf key={i} index={i} row={row} selectedId={selectedId} onOpen={onOpen} decor={rows.length > 1 && i === rows.length - 1 ? 'stack' : i === 0 ? 'plant' : null} scale={scale} />
        ))}
      </AnimatePresence>
    </div>
  )
}

function Shelf({ index, row, selectedId, onOpen, decor, scale }: { index: number; row: Item[]; selectedId?: string; onOpen: Props['onOpen']; decor: 'plant' | 'stack' | null; scale: number }) {
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
                className={`shelf-book ${it.pose === 'face' ? 'face' : ''}${selectedId === it.book.id ? ' is-hidden' : ''}`}
                data-book-id={it.book.id}
                data-pose={it.pose}
                style={{ '--w': `${it.dims.w}px`, '--h': `${it.dims.h}px`, '--d': `${it.dims.d}px` } as React.CSSProperties}
                onMouseEnter={() => setHover(it.book)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(it.book)}
                onBlur={() => setHover(null)}
                onClick={(e) => onOpen(it.book, { rect: e.currentTarget.getBoundingClientRect(), pose: it.pose === 'face' ? 'tilt' : 'spine' })}
                aria-label={`${it.book.title}, de ${it.book.author}. ${statusText(it.book.status)}${it.book.favorite ? ', favorito' : ''}. Abrir vista previa`}
              >
                {it.book.favorite && <Heart className="fav" size={12} filled />}
                <Book3D book={it.book} dims={it.dims} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
        <div className="bookend" aria-hidden />
        {decor && <Decor kind={decor} scale={scale} />}
      </div>
      <div className="plank" />
    </motion.div>
  )
}

function Decor({ kind, scale }: { kind: 'plant' | 'stack'; scale: number }) {
  if (kind === 'stack') {
    const slabs = [['#3b4a3a', 150], ['#6b2b2b', 136], ['#2d3550', 158], ['#8a6d3b', 128]] as const
    return (
      <div className="decor decor-stack" aria-hidden style={{ transform: `scale(${scale})` }}>
        {slabs.map(([c, w], i) => <i key={i} style={{ background: c, width: w, marginLeft: (i % 2) * 8 }} />)}
      </div>
    )
  }
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

function statusText(s: Status) {
  return s === 'leyendo' ? 'Leyendo' : s === 'terminado' ? 'Terminado' : 'Pendiente'
}

export function FilterBar({ filters, setFilters }: { filters: Filters; setFilters: (f: Filters) => void }) {
  const { books } = useLibrary()
  const categories = [...new Set(books.map((b) => b.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'))
  const authors = [...new Set(books.map((b) => b.author).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'))
  const count = (s: Status) => books.filter((b) => b.status === s).length
  const opts: { v: Filters['status']; l: string; n?: number }[] = [
    { v: 'todos', l: 'Todos', n: books.length },
    { v: 'leyendo', l: 'Leyendo', n: count('leyendo') },
    { v: 'pendiente', l: 'Pendientes', n: count('pendiente') },
    { v: 'terminado', l: 'Terminados', n: count('terminado') },
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
    </div>
  )
}
