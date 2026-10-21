import { useMemo, useState } from 'react'
import { AnimatePresence, Reorder, useDragControls } from 'motion/react'
import type { Book, WishItem } from '../types'
import { useLibrary } from '../state/library'
import { genreOf } from '../lib/genres'
import { Cover } from './BookArt'
import { Modal } from './Modal'
import { ChevronLeft, Close, Plus } from './Icons'
import { editionLabel, isManual } from '../lib/books'
import { EmptyArt } from './EmptyArt'

type Entry = { id: string; book?: Book; wish?: WishItem }

/**
 * "Por leer": the reader's queue. Drag to reorder (handle works with touch), arrow buttons
 * for keyboard users, and one-tap orderings for when the list gets long.
 */
export function Tbr({ onBack, onStart, onOpenBook, onWishlist }: {
  onBack: () => void
  onStart: (b: Book) => void
  onOpenBook: (b: Book, el: HTMLElement) => void
  onWishlist: () => void
}) {
  const { tbr, setTbr, books, wishes, removeFromTbr, notify } = useLibrary()
  const [picking, setPicking] = useState(false)

  const entries: Entry[] = useMemo(() => tbr.map((id) => (id.startsWith('w:')
    ? { id, wish: wishes.find((w) => `w:${w.id}` === id) }
    : { id, book: books.find((b) => b.id === id) })), [tbr, books, wishes])

  const pages = entries.reduce((n, e) => n + (e.book?.pages ?? e.wish?.pages ?? 0), 0)
  const reading = books.filter((b) => b.status === 'leyendo')
  const first = entries.find((e) => e.book)

  const move = (id: string, d: -1 | 1) => {
    const i = tbr.indexOf(id)
    const j = i + d
    if (i < 0 || j < 0 || j >= tbr.length) return
    const next = [...tbr]
    ;[next[i], next[j]] = [next[j], next[i]]
    setTbr(next)
  }

  const sortBy = (how: 'generos' | 'cortos' | 'espera' | 'tengo') => {
    const meta = (id: string) => {
      const e = entries.find((x) => x.id === id)!
      return { pages: e.book?.pages ?? e.wish?.pages ?? 9999, added: e.book?.addedAt ?? e.wish?.addedAt ?? 0, genre: e.book ? genreOf(e.book) : e.wish?.genre ?? 'Sin género', owned: !!e.book }
    }
    let next = [...tbr]
    if (how === 'cortos') next.sort((a, b) => meta(a).pages - meta(b).pages)
    if (how === 'espera') next.sort((a, b) => meta(a).added - meta(b).added)
    if (how === 'tengo') next.sort((a, b) => Number(meta(b).owned) - Number(meta(a).owned))
    if (how === 'generos') {
      // round-robin across genres, starting away from what is being read now
      const now = new Set(reading.map(genreOf))
      const groups = new Map<string, string[]>()
      for (const id of next) groups.set(meta(id).genre, [...(groups.get(meta(id).genre) ?? []), id])
      const order = [...groups.keys()].sort((a, b) => Number(now.has(a)) - Number(now.has(b)))
      next = []
      while (next.length < tbr.length) for (const g of order) { const l = groups.get(g)!; if (l.length) next.push(l.shift()!) }
    }
    setTbr(next)
    notify(how === 'generos' ? 'Ordenado alternando géneros' : how === 'cortos' ? 'Los más cortos primero' : how === 'espera' ? 'Los que llevan más tiempo esperando, primero' : 'Primero los que ya tienes')
  }

  return (
    <section className="tbr-view">
      <div className="view-title">
        <button className="icon-btn" onClick={onBack} aria-label="Volver a la estantería"><ChevronLeft /></button>
        <h1>Por leer</h1>
      </div>
      <p className="view-sub">
        {entries.length ? <>{entries.length} {entries.length === 1 ? 'libro' : 'libros'} en fila{pages ? <> · ≈ {pages.toLocaleString('es')} páginas</> : null}. Al terminar uno, te propondremos el siguiente.</> : 'Tu fila de lectura: lo que viene después del libro que tienes entre manos.'}
      </p>

      {reading.length > 0 && entries.length > 0 && (
        <p className="tbr-now">Ahora lees <b>{reading.map((b) => `«${b.title}»`).join(', ')}</b>{first?.book ? <> · después viene <b>«{first.book.title}»</b></> : null}</p>
      )}

      <div className="tbr-tools">
        <button className="btn btn-gold" onClick={() => setPicking(true)}><Plus size={16} /> Añadir libros</button>
        {entries.length > 2 && (
          <div className="filters" role="group" aria-label="Ordenar la fila">
            <span className="eyebrow" style={{ alignSelf: 'center' }}>Ordenar:</span>
            <button className="chip" onClick={() => sortBy('generos')}>Alternar géneros</button>
            <button className="chip" onClick={() => sortBy('cortos')}>Cortos primero</button>
            <button className="chip" onClick={() => sortBy('espera')}>Los que más esperan</button>
            {entries.some((e) => e.wish) && <button className="chip" onClick={() => sortBy('tengo')}>Primero los que tengo</button>}
          </div>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="empty-state">
          <EmptyArt kind="tbr" />
          <h3>Nada en la fila todavía</h3>
          <p>Añade los libros que quieres leer después, en el orden que prefieras. También puedes sumar libros de tu wishlist que aún no compras.</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-gold" onClick={() => setPicking(true)}><Plus size={16} /> Elegir de mi biblioteca</button>
            <button className="btn" onClick={onWishlist}>Ir a la wishlist</button>
          </div>
        </div>
      ) : (
        <Reorder.Group axis="y" values={tbr} onReorder={setTbr} className="tbr-list">
          {entries.map((e, i) => (
            <TbrRow key={e.id} entry={e} index={i} count={entries.length} isNext={e === first}
              onUp={() => move(e.id, -1)} onDown={() => move(e.id, 1)} onRemove={() => removeFromTbr(e.id)}
              onStart={onStart} onOpenBook={onOpenBook} onWishlist={onWishlist} />
          ))}
        </Reorder.Group>
      )}

      <AnimatePresence>{picking && <TbrPicker onClose={() => setPicking(false)} />}</AnimatePresence>
    </section>
  )
}

function TbrRow({ entry, index, count, isNext, onUp, onDown, onRemove, onStart, onOpenBook, onWishlist }: {
  entry: Entry; index: number; count: number; isNext: boolean
  onUp: () => void; onDown: () => void; onRemove: () => void
  onStart: (b: Book) => void; onOpenBook: (b: Book, el: HTMLElement) => void; onWishlist: () => void
}) {
  const controls = useDragControls()
  const { book, wish } = entry
  const title = book?.title ?? wish?.title ?? '—'
  const author = book?.author ?? wish?.author ?? ''
  const pages = book?.pages ?? wish?.pages
  return (
    <Reorder.Item value={entry.id} dragListener={false} dragControls={controls} className={`tbr-row${isNext ? ' next' : ''}`} whileDrag={{ scale: 1.02, boxShadow: '0 18px 40px rgba(0,0,0,.5)' }}>
      <button className="tbr-handle" onPointerDown={(e) => controls.start(e)} aria-label={`Arrastrar para mover «${title}»`} tabIndex={-1}>
        <svg width="14" height="20" viewBox="0 0 14 20" aria-hidden><g fill="currentColor">{[4, 10, 16].map((y) => <g key={y}><circle cx="4" cy={y} r="1.5" /><circle cx="10" cy={y} r="1.5" /></g>)}</g></svg>
      </button>
      <span className="tbr-n">{index + 1}</span>
      {book ? (
        <button className="tbr-cover" data-book-id={book.id} onClick={(e) => onOpenBook(book, e.currentTarget)} aria-label={`Ver ${title}`}><Cover book={book} /></button>
      ) : (
        <span className="tbr-cover wish">{wish?.coverRemote ? <img src={wish.coverRemote} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <i />}</span>
      )}
      <div className="tbr-text">
        {isNext && <span className="eyebrow nx">A continuación</span>}
        <b>{title}</b>
        <span className="muted">{[author, pages ? `${pages} págs.` : ''].filter(Boolean).join(' · ')}</span>
        <span className="tbr-tags">
          {wish && <span className="tag-w">Wishlist · aún no lo tienes</span>}
          {book && isManual(book) && <span>{editionLabel(book)}</span>}
          {book?.status === 'abandonado' && <span>Lo retomas</span>}
          {book && genreOf(book) !== 'Sin género' && <span>{genreOf(book)}</span>}
        </span>
      </div>
      <div className="tbr-acts">
        {book ? <button className="chip" onClick={() => onStart(book)}>Empezar</button> : <button className="chip" onClick={onWishlist}>Ver dónde comprar</button>}
        <span className="tbr-arrows">
          <button className="icon-btn" onClick={onUp} disabled={index === 0} aria-label={`Subir «${title}»`}>↑</button>
          <button className="icon-btn" onClick={onDown} disabled={index === count - 1} aria-label={`Bajar «${title}»`}>↓</button>
        </span>
        <button className="icon-btn" onClick={onRemove} aria-label={`Quitar «${title}» de la lista`}><Close size={15} /></button>
      </div>
    </Reorder.Item>
  )
}

/** Pick books for the queue: pending ones first, then abandoned ones worth a retry, then wishlist. */
function TbrPicker({ onClose }: { onClose: () => void }) {
  const { books, wishes, tbr, setTbr, notify } = useLibrary()
  const [sel, setSel] = useState<string[]>([])
  const [q, setQ] = useState('')
  const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  const match = (t: string) => !q.trim() || norm(t).includes(norm(q.trim()))
  const owned = books.filter((b) => (b.status === 'pendiente' || b.status === 'abandonado') && !tbr.includes(b.id) && match(`${b.title} ${b.author}`))
    .sort((a, b) => Number(a.status === 'abandonado') - Number(b.status === 'abandonado') || a.addedAt - b.addedAt)
  const wish = wishes.filter((w) => !tbr.includes(`w:${w.id}`) && match(`${w.title} ${w.author}`))
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  return (
    <Modal
      title="Añadir a «Por leer»"
      onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn-gold" disabled={!sel.length} onClick={() => { setTbr([...tbr, ...sel]); notify(`${sel.length} ${sel.length === 1 ? 'libro añadido' : 'libros añadidos'} a la fila`); onClose() }}>
          Añadir {sel.length ? `(${sel.length})` : ''}
        </button>
      </>}
    >
      <div className="fields">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrar por título o autor" aria-label="Filtrar" />
        {!owned.length && !wish.length && <p className="muted">No hay más libros pendientes. Añade libros a la biblioteca o a la wishlist.</p>}
        {owned.length > 0 && <span className="lbl">En tu biblioteca</span>}
        <ul className="pick-list">
          {owned.map((b) => (
            <li key={b.id}>
              <label>
                <input type="checkbox" checked={sel.includes(b.id)} onChange={() => toggle(b.id)} />
                <span className="il-cover"><Cover book={b} /></span>
                <span className="il-text"><b>{b.title}</b><span>{b.author}{b.status === 'abandonado' ? ' · abandonado' : ''}{isManual(b) ? ` · ${editionLabel(b)}` : ''}</span></span>
              </label>
            </li>
          ))}
        </ul>
        {wish.length > 0 && <span className="lbl">De tu wishlist</span>}
        <ul className="pick-list">
          {wish.map((w) => (
            <li key={w.id}>
              <label>
                <input type="checkbox" checked={sel.includes(`w:${w.id}`)} onChange={() => toggle(`w:${w.id}`)} />
                <span className="il-cover wish">{w.coverRemote ? <img src={w.coverRemote} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <i />}</span>
                <span className="il-text"><b>{w.title}</b><span>{w.author}</span></span>
              </label>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  )
}
