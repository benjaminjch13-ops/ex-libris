import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { Book, WishItem } from '../types'
import { useLibrary } from '../state/library'
import { store, uid } from '../lib/db'
import { paletteFor } from '../lib/color'
import { GENRES, genreOf, NO_GENRE } from '../lib/genres'
import { buildProfile, buildShelves, fmtYear, recKey, whereToFind, type Rec, type RecPrefs } from '../lib/recommend'
import { Modal } from './Modal'
import { Cover } from './BookArt'
import { ChevronLeft, Heart } from './Icons'

// ---------- covers: looked up once per title, cached on the device ----------
const COVER_KEY = 'exl-rec-covers'
let coverCache: Record<string, string> = {}
try { coverCache = JSON.parse(localStorage.getItem(COVER_KEY) ?? '{}') } catch { /* private mode */ }
const pending = new Map<string, Promise<string>>()
let active = 0
const queue: (() => void)[] = []
const run = <T,>(fn: () => Promise<T>) => new Promise<T>((res, rej) => {
  const go = () => { active++; fn().then(res, rej).finally(() => { active--; queue.shift()?.() }) }
  if (active < 3) go(); else queue.push(go)
})

function coverFor(r: Rec): Promise<string> {
  if (r.key in coverCache) return Promise.resolve(coverCache[r.key])
  if (pending.has(r.key)) return pending.get(r.key)!
  const surname = r.book.a.split(/,| y /)[0].split(' ').pop() ?? ''
  const title = r.book.t.replace(/\s*\(.*?\)\s*/g, ' ').split(':')[0].trim()
  const p = run(async () => {
    try {
      const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(`intitle:${title} inauthor:${surname}`)}&maxResults=3&printType=books`)
      const d = await res.json() as { items?: { volumeInfo?: { imageLinks?: { thumbnail?: string } } }[] }
      const thumb = d.items?.map((i) => i.volumeInfo?.imageLinks?.thumbnail).find(Boolean)
      return thumb ? thumb.replace(/^http:/, 'https:').replace('&edge=curl', '') : ''
    } catch {
      return '__retry'
    }
  }).then((url) => {
    pending.delete(r.key)
    if (url === '__retry') return ''
    coverCache[r.key] = url
    try { localStorage.setItem(COVER_KEY, JSON.stringify(coverCache)) } catch { /* full or blocked */ }
    return url
  })
  pending.set(r.key, p)
  return p
}

function asBook(r: Rec, cover?: string): Book {
  return {
    id: r.key, title: r.book.t, author: r.book.a, description: r.book.s, category: r.book.g, format: 'catalogo',
    addedAt: 0, status: 'pendiente', favorite: false, palette: paletteFor(r.key), heightRatio: 0.5,
    pages: r.book.p, coverRemote: cover || undefined,
  }
}

function RecCover({ rec, eager }: { rec: Rec; eager?: boolean }) {
  const [url, setUrl] = useState(coverCache[rec.key] ?? '')
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (rec.key in coverCache) { setUrl(coverCache[rec.key]); return }
    const el = ref.current
    if (!el) return
    let alive = true
    const load = () => coverFor(rec).then((u) => alive && setUrl(u))
    if (eager || !('IntersectionObserver' in window)) { load(); return () => { alive = false } }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { load(); io.disconnect() } }, { rootMargin: '200px' })
    io.observe(el)
    return () => { alive = false; io.disconnect() }
  }, [rec, eager])
  return <div ref={ref} className="rc-cover"><Cover book={asBook(rec, url)} /></div>
}

// ---------- the view ----------

export function Recs({ onBack, onWishlist }: { onBack: () => void; onWishlist: () => void }) {
  const { books, wishes, saveWish, addToTbr, tbr, notify } = useLibrary()
  const [prefs, setPrefs] = useState<RecPrefs | null | undefined>(undefined)
  const [dismissed, setDismissed] = useState<string[]>([])
  const [salt, setSalt] = useState(0)
  const [detail, setDetail] = useState<Rec | null>(null)
  const [picking, setPicking] = useState(false)

  useEffect(() => {
    store().then(async (s) => {
      setPrefs((await s.getSetting<RecPrefs>('recPrefs').catch(() => undefined)) ?? null)
      setDismissed((await s.getSetting<string[]>('recDismissed').catch(() => undefined)) ?? [])
    })
  }, [])

  const savePrefs = (p: RecPrefs) => { setPrefs(p); store().then((s) => s.setSetting('recPrefs', p)).catch(() => {}) }
  const dismiss = (key: string, why: 'leido' | 'no') => {
    const next = [...dismissed, key]
    setDismissed(next)
    store().then((s) => s.setSetting('recDismissed', next)).catch(() => {})
    notify(why === 'leido' ? 'Anotado: ya lo leíste. Lo tendremos en cuenta.' : 'No volverá a aparecer')
  }

  const profile = useMemo(() => buildProfile(books, wishes, prefs), [books, wishes, prefs])
  const shelves = useMemo(() => buildShelves(profile, new Set(dismissed), salt), [profile, dismissed, salt])
  const wished = useMemo(() => new Set(wishes.map((w) => recKey({ t: w.title, a: w.author }))), [wishes])

  const toWish = (r: Rec, alsoTbr = false) => {
    const existing = wishes.find((w) => recKey({ t: w.title, a: w.author }) === r.key)
    const w: WishItem = existing ?? {
      id: uid(), title: r.book.t, author: r.book.a, coverRemote: coverCache[r.key] || undefined,
      pages: r.book.p, year: r.book.y > 999 ? r.book.y : undefined, description: r.book.s, genre: r.book.g,
      links: whereToFind(r.book).filter((x) => x.store !== 'Goodreads').map((x) => ({ url: x.url, store: x.store })),
      note: 'Recomendado en «Para ti»', addedAt: Date.now(),
    }
    if (!existing) saveWish(w)
    if (alsoTbr && !tbr.includes(`w:${w.id}`)) addToTbr(`w:${w.id}`)
    notify(alsoTbr ? `«${r.book.t}» está en tu wishlist y en «Por leer»` : `«${r.book.t}» está en tu wishlist`)
  }

  const top = [...profile.genres.entries()].filter(([, v]) => v > 0.15).sort((a, b) => b[1] - a[1]).map(([k]) => k).slice(0, 3)
  const showPicker = prefs === null && books.filter((b) => genreOf(b) !== NO_GENRE).length < 3

  return (
    <section className="recs-view">
      <div className="view-title">
        <button className="icon-btn" onClick={onBack} aria-label="Volver a la estantería"><ChevronLeft /></button>
        <h1>Libros que pueden gustarte</h1>
      </div>
      <p className="view-sub">
        {books.length === 0
          ? 'Todavía no hay libros en tu biblioteca, así que empezamos por los favoritos de casi todos los lectores.'
          : top.length
            ? <>Según tus {books.length} {books.length === 1 ? 'libro' : 'libros'}, lo tuyo es <b>{top.join(', ').replace(/, ([^,]*)$/, ' y $1').toLowerCase()}</b>.</>
            : 'Asigna géneros a tus libros (en «Editar datos») para afinar las sugerencias.'}
      </p>
      <div className="recs-tools">
        <button className="chip" onClick={() => setSalt((s) => s + 1)}>↻ Otras sugerencias</button>
        <button className="chip" onClick={() => setPicking(true)}>Ajustar mis gustos</button>
        {wishes.length > 0 && <button className="chip" onClick={onWishlist}>Ver mi wishlist ({wishes.length})</button>}
      </div>

      {prefs !== undefined && showPicker && !picking && (
        <TastePicker initial={prefs} onDone={savePrefs} inline />
      )}

      {shelves.map((sh) => (
        <div className="rec-shelf" key={sh.id}>
          <div className="rs-head">
            <h2>{sh.title}</h2>
            {sh.sub && <p>{sh.sub}</p>}
          </div>
          <div className="rs-row" role="list">
            {sh.items.map((r) => (
              <article key={r.key} className="rec-card" role="listitem">
                <button className="rc-open" onClick={() => setDetail(r)} aria-label={`${r.book.t}, de ${r.book.a}. Ver sinopsis y dónde encontrarlo`}>
                  <RecCover rec={r} />
                  <span className="rc-reason">{r.reason}</span>
                  <b className="rc-title">{r.book.t}</b>
                  <span className="rc-author">{r.book.a}</span>
                </button>
                <button className={`rc-heart${wished.has(r.key) ? ' on' : ''}`} onClick={() => (wished.has(r.key) ? onWishlist() : toWish(r))} aria-label={wished.has(r.key) ? `${r.book.t} ya está en tu wishlist` : `Guardar ${r.book.t} en la wishlist`} aria-pressed={wished.has(r.key)}>
                  <Heart size={16} filled={wished.has(r.key)} />
                </button>
              </article>
            ))}
          </div>
        </div>
      ))}

      <p className="recs-note">Sugerencias a partir de listas de lectura reconocidas: los más leídos en español, los mejores libros del siglo XXI (The New York Times, críticos hispanohablantes), los premios de lectores de Goodreads, las listas de más vendidos y clásicos de cada género. Cambian cada día y aprenden de lo que lees, calificas y abandonas.</p>

      <AnimatePresence>
        {detail && (
          <RecDetail key={detail.key} rec={detail} inWish={wished.has(detail.key)} inTbr={!!wishes.find((w) => recKey({ t: w.title, a: w.author }) === detail.key && tbr.includes(`w:${w.id}`))}
            onClose={() => setDetail(null)} onWish={(alsoTbr) => toWish(detail, alsoTbr)}
            onDismiss={(why) => { dismiss(detail.key, why); setDetail(null) }} onWishlist={() => { setDetail(null); onWishlist() }} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {picking && (
          <Modal title="¿Qué te gusta leer?" onClose={() => setPicking(false)}>
            <TastePicker initial={prefs ?? null} onDone={(p) => { savePrefs(p); setPicking(false); notify('Sugerencias actualizadas') }} />
          </Modal>
        )}
      </AnimatePresence>
    </section>
  )
}

function RecDetail({ rec, inWish, inTbr, onClose, onWish, onDismiss, onWishlist }: {
  rec: Rec; inWish: boolean; inTbr: boolean
  onClose: () => void; onWish: (alsoTbr: boolean) => void; onDismiss: (why: 'leido' | 'no') => void; onWishlist: () => void
}) {
  const b = rec.book
  const where = whereToFind(b)
  return (
    <Modal
      title={b.t}
      onClose={onClose}
      footer={<>
        <button className="btn" onClick={() => onDismiss('leido')}>Ya lo leí</button>
        <button className="btn" onClick={() => onDismiss('no')}>No me interesa</button>
        {inWish
          ? <button className="btn btn-gold" onClick={onWishlist}><Heart size={15} filled /> En tu wishlist</button>
          : <button className="btn btn-gold" onClick={() => onWish(false)}><Heart size={15} /> Guardar en wishlist</button>}
      </>}
    >
      <div className="rec-detail">
        <RecCover rec={rec} eager />
        <div className="rd-main">
          <span className="eyebrow" style={{ color: 'var(--gold)' }}>{b.g}</span>
          <p className="rd-by">{b.a} · {fmtYear(b.y)} · ≈ {b.p} páginas</p>
          <p className="rd-reason">{rec.reason}</p>
          <p className="rd-syn">{b.s}</p>
          <div className="rd-tags">
            {b.tags.includes('i') && <span>Buen primer libro</span>}
            {b.tags.includes('p') && <span>De los más leídos</span>}
            {b.tags.includes('c') && <span>Clásico</span>}
            {b.tags.includes('r') && <span>Reciente</span>}
            {b.p <= 200 && <span>Corto</span>}
          </div>
        </div>
      </div>
      <div className="rd-where">
        <span className="lbl">Dónde encontrarlo</span>
        <div className="wi-links">
          {where.map((w) => (
            <a key={w.store} className="store-chip" href={w.url} target="_blank" rel="noopener noreferrer">{w.store}{w.note ? <span>· {w.note}</span> : null} <span aria-hidden>↗</span></a>
          ))}
        </div>
        {!inTbr && <button className="linkish" onClick={() => onWish(true)}>Guardarlo en la wishlist y ponerlo en «Por leer»</button>}
      </div>
    </Modal>
  )
}

function TastePicker({ initial, onDone, inline }: { initial: RecPrefs | null; onDone: (p: RecPrefs) => void; inline?: boolean }) {
  const [genres, setGenres] = useState<string[]>(initial?.genres ?? [])
  const [short, setShort] = useState(initial?.short ?? false)
  const toggle = (g: string) => setGenres((l) => (l.includes(g) ? l.filter((x) => x !== g) : [...l, g]))
  return (
    <motion.div className={inline ? 'taste inline' : 'taste'} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      {inline && <h2>¿Qué te gusta leer?</h2>}
      <p className="muted">{inline ? 'Elige los géneros que te llaman y afinamos las sugerencias. Puedes cambiarlo cuando quieras.' : 'Las sugerencias combinan esto con lo que lees y calificas.'}</p>
      <div className="filters" role="group" aria-label="Géneros">
        {GENRES.map((g) => <button key={g} className="chip" aria-pressed={genres.includes(g)} onClick={() => toggle(g)}>{g}</button>)}
      </div>
      <label className="check"><input type="checkbox" checked={short} onChange={(e) => setShort(e.target.checked)} /> Prefiero libros cortos (menos de 250 páginas)</label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-gold" onClick={() => onDone({ genres, short })}>{genres.length ? 'Ver mis sugerencias' : 'Sorpréndeme'}</button>
      </div>
    </motion.div>
  )
}

/** A strip on the shelf page leading to «Para ti». */
export function RecsTeaser({ onOpen }: { onOpen: () => void }) {
  const { books, wishes } = useLibrary()
  const [state, setState] = useState<{ prefs: RecPrefs | null; dismissed: string[] } | null>(null)
  useEffect(() => {
    store().then(async (s) => setState({
      prefs: (await s.getSetting<RecPrefs>('recPrefs').catch(() => undefined)) ?? null,
      dismissed: (await s.getSetting<string[]>('recDismissed').catch(() => undefined)) ?? [],
    }))
  }, [])
  const picks = useMemo(() => {
    if (!state) return []
    const sh = buildShelves(buildProfile(books, wishes, state.prefs), new Set(state.dismissed))
    return sh[0]?.items.slice(0, 5) ?? []
  }, [books, wishes, state])
  if (!picks.length) return null
  return (
    <motion.button className="recs-teaser" onClick={onOpen} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <span className="rt-covers" aria-hidden>{picks.map((r) => <RecCover key={r.key} rec={r} />)}</span>
      <span className="rt-copy">
        <span className="eyebrow">Para ti</span>
        <b>{books.length ? 'Libros que pueden gustarte' : '¿No sabes por dónde empezar?'}</b>
        <span className="muted">{books.length ? `Elegidos según tu biblioteca · «${picks[0].book.t}» y más` : 'Los favoritos de casi todos los lectores, con sinopsis y dónde encontrarlos'}</span>
      </span>
      <span className="rt-go" aria-hidden>→</span>
    </motion.button>
  )
}
