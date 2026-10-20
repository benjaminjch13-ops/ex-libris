import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { Book, WishItem, WishLink } from '../types'
import { useLibrary } from '../state/library'
import { uid } from '../lib/db'
import { emptyBook, paletteForBook } from '../lib/importer'
import { fetchCoverBlob, lookupLink, parseStoreLink, cleanShareTitle, type CatalogHit } from '../lib/lookup'
import { Modal } from './Modal'
import { Finder } from './Finder'
import { ChevronLeft, Close, Edit, Plus, Trash } from './Icons'
import { RecsStrip } from './Recs'

export interface SharedIn { url?: string; text?: string; title?: string }

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Wishlist: books to buy, each with one or more store links. */
export function Wishlist({ onBack, shared, onSharedDone, onBuyDigital, onRecs }: {
  onBack: () => void
  onRecs: () => void
  shared?: SharedIn | null
  onSharedDone: () => void
  onBuyDigital: (preset: Partial<Book>, wishId: string, keepInTbr: boolean) => void
}) {
  const { wishes, books, tbr, addToTbr, removeFromTbr, removeWish, saveWish, notify } = useLibrary()
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<{ item: WishItem; isNew: boolean; query?: string } | null>(null)
  const [buying, setBuying] = useState<WishItem | null>(null)
  const sharedDone = useRef(false)

  /** From a pasted link or shared text: detect the store, look the book up, open the editor to confirm. */
  async function take(raw: string, sharedTitle?: string) {
    const text = raw.trim()
    if (!text) return
    const link = parseStoreLink(text)
    if (!link) {
      // no link: treat it as a title to search
      setEditing({ item: blankWish(), isNew: true, query: text })
      setInput('')
      return
    }
    setBusy(true)
    const hit = await lookupLink(link, sharedTitle ?? (text !== link.url ? text.replace(link.url, '') : undefined)).catch(() => undefined)
    setBusy(false)
    setInput('')
    const newLink: WishLink = { url: link.url, store: link.store }
    // already on the shelf: nothing to buy
    const owned = hit && books.find((b) => (hit.isbn && b.isbn === hit.isbn) || norm(b.title) === norm(hit.title))
    if (owned) {
      notify(`«${owned.title}» ya está en tu biblioteca`, 'error')
      return
    }
    // same book already on the list (by ISBN or title): add the link there
    const dup = hit && wishes.find((w) => (hit.isbn && w.isbn === hit.isbn) || norm(w.title) === norm(hit.title))
    if (dup) {
      if (!dup.links.some((l) => l.url === link.url)) saveWish({ ...dup, links: [...dup.links, newLink] })
      notify(`Ya estaba en tu wishlist; añadí el enlace de ${link.store}`)
      return
    }
    const item = { ...blankWish(), links: [newLink], ...(hit ? fromHit(hit) : {}) }
    setEditing({ item, isNew: true, query: hit ? undefined : cleanShareTitle(sharedTitle) ?? link.query })
  }

  // a link shared from another app (Android share sheet) lands here
  useEffect(() => {
    if (!shared || sharedDone.current) return
    sharedDone.current = true
    const raw = shared.url || shared.text || shared.title || ''
    take([shared.url, shared.text].filter(Boolean).join(' ') || raw, shared.title)
    onSharedDone()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shared])

  const paste = async () => {
    try {
      const t = await navigator.clipboard.readText()
      if (t) { setInput(t); take(t) }
    } catch {
      notify('No pude leer el portapapeles. Mantén pulsado el campo y elige «Pegar».', 'error')
    }
  }

  return (
    <section className="wish-view">
      <div className="view-title">
        <button className="icon-btn" onClick={onBack} aria-label="Volver a la estantería"><ChevronLeft /></button>
        <h1>Wishlist</h1>
      </div>
      <p className="view-sub">Los libros que quieres comprar, con los enlaces de cada tienda. Pega un enlace de Amazon, Kindle, Apple Books, Google Play, Buscalibre o cualquier librería y lo completamos por ti.</p>

      <form className="wish-add" onSubmit={(e) => { e.preventDefault(); take(input) }}>
        <label className="sr-only" htmlFor="wish-in">Enlace o título</label>
        <input id="wish-in" value={input} onChange={(e) => setInput(e.target.value)} onPaste={(e) => { const t = e.clipboardData.getData('text'); if (/https?:\/\//.test(t)) { e.preventDefault(); setInput(t); take(t) } }}
          placeholder="Enlace o título del libro" autoComplete="off" inputMode="url" enterKeyHint="go" />
        {'clipboard' in navigator && 'readText' in (navigator.clipboard ?? {}) && <button type="button" className="btn hide-xs" onClick={paste}>Pegar</button>}
        <button type="submit" className="btn btn-gold" disabled={busy || !input.trim()}>{busy ? <span className="spin" /> : <Plus size={16} />} Añadir</button>
      </form>
      {busy && <p className="hint" role="status">Buscando el libro…</p>}
      <p className="hint share-tip">En Android, con la app instalada, también puedes usar «Compartir → Ex Libris» desde la tienda.</p>

      {wishes.length === 0 ? (
        <div className="empty-state">
          <h3>Tu wishlist está vacía</h3>
          <p>Cuando veas un libro que te llama, guarda aquí el enlace. Al comprarlo, pasa a tu biblioteca con un toque.</p>
        </div>
      ) : null}
      {wishes.length === 0 && <RecsStrip onMore={onRecs} />}
      {wishes.length > 0 && (
        <motion.ul className="wish-list" layout>
          <AnimatePresence initial={false}>
            {wishes.map((w) => {
              const inTbr = tbr.includes(`w:${w.id}`)
              return (
                <motion.li key={w.id} className="wish-item" layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}>
                  <span className="wi-cover">{w.coverRemote ? <img src={w.coverRemote} alt={`Portada de ${w.title}`} referrerPolicy="no-referrer" /> : <i>{w.title.slice(0, 1)}</i>}</span>
                  <div className="wi-main">
                    <h3>{w.title}</h3>
                    <div className="muted">{[w.author, w.year, w.pages ? `${w.pages} págs.` : ''].filter(Boolean).join(' · ')}</div>
                    {w.note && <p className="wi-note">{w.note}</p>}
                    <div className="wi-links">
                      {w.links.map((l) => (
                        <a key={l.url} className="store-chip" href={l.url} target="_blank" rel="noopener noreferrer">
                          {l.store}{l.price ? <b>{l.price}</b> : null} <span aria-hidden>↗</span>
                        </a>
                      ))}
                    </div>
                    <div className="wi-acts">
                      <button className="btn small-btn btn-gold" onClick={() => setBuying(w)}>Ya lo compré</button>
                      <button className="chip" aria-pressed={inTbr} onClick={() => (inTbr ? removeFromTbr(`w:${w.id}`) : (addToTbr(`w:${w.id}`), notify('Añadido a «Por leer»')))}>{inTbr ? '✓ En «Por leer»' : '+ Por leer'}</button>
                      <button className="icon-btn" onClick={() => setEditing({ item: w, isNew: false })} aria-label={`Editar ${w.title}`}><Edit size={15} /></button>
                      <button className="icon-btn" onClick={() => { removeWish(w.id); notify(`«${w.title}» salió de la wishlist`) }} aria-label={`Quitar ${w.title} de la wishlist`}><Trash size={15} /></button>
                    </div>
                  </div>
                </motion.li>
              )
            })}
          </AnimatePresence>
        </motion.ul>
      )}
      {wishes.length > 0 && <RecsStrip onMore={onRecs} compact />}

      <AnimatePresence>
        {editing && <WishEditor key={editing.item.id} item={editing.item} isNew={editing.isNew} query={editing.query} onClose={() => setEditing(null)} />}
      </AnimatePresence>
      <AnimatePresence>
        {buying && <BuyDialog item={buying} onClose={() => setBuying(null)} onDigital={(preset, keep) => { setBuying(null); onBuyDigital(preset, buying.id, keep) }} />}
      </AnimatePresence>
    </section>
  )
}

function blankWish(): WishItem {
  return { id: uid(), title: '', author: '', links: [], addedAt: Date.now() }
}

function fromHit(h: CatalogHit): Partial<WishItem> {
  return { title: h.title, author: h.author, coverRemote: h.cover, isbn: h.isbn, pages: h.pages, year: h.year, description: h.description, genre: h.genre }
}

function WishEditor({ item, isNew, query, onClose }: { item: WishItem; isNew: boolean; query?: string; onClose: () => void }) {
  const { saveWish, addToTbr, tbr, notify } = useLibrary()
  const [w, setW] = useState<WishItem>(item)
  const [linkIn, setLinkIn] = useState('')
  const [toTbr, setToTbr] = useState(false)
  const [search, setSearch] = useState(!item.title)
  const set = (p: Partial<WishItem>) => setW((x) => ({ ...x, ...p }))

  const addLink = () => {
    const l = parseStoreLink(linkIn)
    if (!l) { notify('Ese enlace no parece válido.', 'error'); return }
    if (!w.links.some((x) => x.url === l.url)) set({ links: [...w.links, { url: l.url, store: l.store }] })
    setLinkIn('')
  }

  const save = () => {
    if (!w.title.trim()) return
    saveWish({ ...w, title: w.title.trim(), author: w.author.trim(), note: w.note?.trim() || undefined })
    if (toTbr && !tbr.includes(`w:${w.id}`)) addToTbr(`w:${w.id}`)
    notify(isNew ? `«${w.title.trim()}» está en tu wishlist` : 'Cambios guardados')
    onClose()
  }

  return (
    <Modal
      title={isNew ? 'Añadir a la wishlist' : 'Editar'}
      onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn-gold" onClick={save} disabled={!w.title.trim()}>Guardar</button>
      </>}
    >
      <div className="wish-edit">
        <span className="wi-cover big">{w.coverRemote ? <img src={w.coverRemote} alt="" referrerPolicy="no-referrer" /> : <i>{w.title.slice(0, 1) || '?'}</i>}</span>
        <div className="fields">
          {search || !w.title ? (
            <div className="field">
              <span className="lbl">{w.title ? 'Buscar otra edición' : 'Busca el libro'}</span>
              <Finder autoQuery={query ?? w.title} onPick={(h) => { set(fromHit(h)); setSearch(false) }} />
            </div>
          ) : (
            <button type="button" className="linkish" onClick={() => setSearch(true)}>¿No es este libro? Buscar otro</button>
          )}
          <div className="field">
            <label htmlFor="we-title">Título</label>
            <input id="we-title" value={w.title} onChange={(e) => set({ title: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="we-author">Autor</label>
            <input id="we-author" value={w.author} onChange={(e) => set({ author: e.target.value })} />
          </div>
          <div className="field">
            <span className="lbl">Dónde comprarlo</span>
            {w.links.length === 0 && <span className="hint">Aún sin enlaces.</span>}
            <ul className="we-links">
              {w.links.map((l, i) => (
                <li key={l.url}>
                  <span className="store-chip static">{l.store}</span>
                  <input aria-label={`Precio en ${l.store}`} placeholder="Precio (opcional)" value={l.price ?? ''} onChange={(e) => set({ links: w.links.map((x, j) => (j === i ? { ...x, price: e.target.value || undefined } : x)) })} />
                  <button type="button" className="icon-btn" onClick={() => set({ links: w.links.filter((_, j) => j !== i) })} aria-label={`Quitar enlace de ${l.store}`}><Close size={14} /></button>
                </li>
              ))}
            </ul>
            <div className="we-addlink">
              <input value={linkIn} onChange={(e) => setLinkIn(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLink() } }} placeholder="Pega otro enlace (otra tienda)" inputMode="url" aria-label="Otro enlace" />
              <button type="button" className="btn small-btn" onClick={addLink} disabled={!linkIn.trim()}>Añadir</button>
            </div>
          </div>
          <div className="field">
            <label htmlFor="we-note">Nota <em className="opt">opcional</em></label>
            <input id="we-note" value={w.note ?? ''} onChange={(e) => set({ note: e.target.value })} placeholder="Quién te lo recomendó, edición que buscas…" />
          </div>
          {isNew && <label className="check"><input type="checkbox" checked={toTbr} onChange={(e) => setToTbr(e.target.checked)} /> Añadirlo también a «Por leer»</label>}
        </div>
      </div>
    </Modal>
  )
}

const APP_FROM_STORE: Record<string, string> = { Kindle: 'Kindle', 'Apple Books': 'Apple Books', 'Google Play': 'Google Play Libros', 'Google Books': 'Google Play Libros', Kobo: 'Kobo', Audible: 'Audible' }

/** "Ya lo compré": the wishlist entry becomes a book in the library. */
function BuyDialog({ item, onClose, onDigital }: { item: WishItem; onClose: () => void; onDigital: (preset: Partial<Book>, keepInTbr: boolean) => void }) {
  const { saveBook, addHistory, wishBought, tbr, notify } = useLibrary()
  const appGuess = item.links.map((l) => APP_FROM_STORE[l.store]).find(Boolean)
  const [how, setHow] = useState<'papel' | 'archivo' | 'app'>(appGuess ? 'app' : 'papel')
  const [app, setApp] = useState(appGuess ?? 'Kindle')
  const [keep, setKeep] = useState(true)
  const [busy, setBusy] = useState(false)
  const wasInTbr = tbr.includes(`w:${item.id}`)

  const preset: Partial<Book> = {
    title: item.title, author: item.author, description: item.description ?? '', genre: item.genre,
    isbn: item.isbn, pages: item.pages, year: item.year, coverRemote: item.coverRemote,
    sourceUrl: item.links[0]?.url, category: 'Sin categoría',
  }

  const go = async () => {
    if (how === 'archivo') { onDigital(preset, keep); return }
    setBusy(true)
    const coverBlob = await fetchCoverBlob(item.coverRemote)
    const b: Book = {
      ...emptyBook(uid()), ...preset,
      format: 'fisico', app: how === 'app' ? app.trim() || 'otra app' : undefined,
      coverBlob, coverRemote: coverBlob ? undefined : item.coverRemote,
      palette: await paletteForBook(item.title, coverBlob),
      author: item.author || 'Autor desconocido',
    } as Book
    await saveBook(b)
    addHistory({ bookId: b.id, title: b.title, author: b.author, type: 'agregado', at: Date.now() })
    wishBought(item.id, b.id, keep)
    notify(`«${b.title}» ya está en tu estantería${keep ? ' y en «Por leer»' : ''}`)
    setBusy(false)
    onClose()
  }

  return (
    <Modal
      title="¡Ya es tuyo!"
      onClose={onClose}
      narrow
      footer={<>
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn-gold" onClick={go} disabled={busy}>{busy ? <span className="spin" /> : null}{how === 'archivo' ? 'Subir el archivo' : 'A la estantería'}</button>
      </>}
    >
      <div className="fields">
        <p className="flow-book"><b>{item.title}</b>{item.author ? ` · ${item.author}` : ''}</p>
        <div className="field">
          <span className="lbl" id="buy-how">¿Cómo lo tienes?</span>
          <div className="seg vertical" role="radiogroup" aria-labelledby="buy-how">
            <button type="button" role="radio" aria-checked={how === 'papel'} onClick={() => setHow('papel')}><b>En papel</b><span>Anotarás tu página a mano</span></button>
            <button type="button" role="radio" aria-checked={how === 'archivo'} onClick={() => setHow('archivo')}><b>Archivo EPUB o PDF</b><span>Lo lees aquí, en la app</span></button>
            <button type="button" role="radio" aria-checked={how === 'app'} onClick={() => setHow('app')}><b>En otra app</b><span>Kindle, Apple Books… y llevas el registro aquí</span></button>
          </div>
        </div>
        {how === 'app' && (
          <div className="field">
            <label htmlFor="buy-app">¿En qué app?</label>
            <input id="buy-app" list="buy-apps" value={app} onChange={(e) => setApp(e.target.value)} />
            <datalist id="buy-apps">{['Kindle', 'Apple Books', 'Google Play Libros', 'Kobo', 'Audible', 'Storytel', 'Scribd'].map((a) => <option key={a} value={a} />)}</datalist>
          </div>
        )}
        <label className="check"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> {wasInTbr ? 'Mantenerlo en su lugar de «Por leer»' : 'Añadirlo a «Por leer»'}</label>
      </div>
    </Modal>
  )
}
