import { useState } from 'react'
import { cleanIsbn, searchCatalog, searchManga, splitVolume, type CatalogHit } from '../lib/lookup'
import { Search } from './Icons'
import { RowsSkeleton } from './Skeleton'

export interface PickExtra { volume?: number }

/** Title / author / ISBN search against the public catalogues, with a pickable result list. Manga has its own catalogues. */
export function Finder({ onPick, placeholder, autoQuery, onIsbnMiss, allowManga = true }: {
  onPick: (h: CatalogHit, extra?: PickExtra) => void
  placeholder?: string
  autoQuery?: string
  /** an ISBN typed here that no catalogue knows: the parent explains and asks for the title */
  onIsbnMiss?: (isbn: string) => void
  allowManga?: boolean
}) {
  const [q, setQ] = useState(autoQuery ?? '')
  const [manga, setManga] = useState(false)
  const [busy, setBusy] = useState(false)
  const [hits, setHits] = useState<CatalogHit[] | null>(null)
  const [err, setErr] = useState('')
  const [hint, setHint] = useState(false)

  const run = async (asManga = manga) => {
    if (!q.trim()) return
    setBusy(true); setErr(''); setHint(false)
    try {
      const isbn = cleanIsbn(q)
      const r = asManga && !isbn ? await searchManga(q) : await searchCatalog(q)
      setHits(r)
      if (!r.length && isbn && onIsbnMiss) { setQ(''); onIsbnMiss(isbn); return }
      if (!r.length) {
        setErr(asManga ? 'No encontré esa serie. Prueba con el nombre en inglés o en japonés (por ejemplo, «Shingeki no Kyojin»).' : 'No encontré ese libro en los catálogos. Puedes escribir los datos a mano.')
        if (!asManga && allowManga) setHint(true)
      }
    } catch {
      setHits([]); setErr('Sin conexión con los catálogos. Escribe los datos a mano o inténtalo más tarde.')
    } finally {
      setBusy(false)
    }
  }

  const switchTo = (m: boolean) => { setManga(m); setHits(null); setErr(''); setHint(false); if (q.trim()) run(m) }
  const volume = manga ? splitVolume(q).volume : undefined

  return (
    <div className="finder">
      {allowManga && (
        <div className="finder-modes" role="radiogroup" aria-label="Qué buscas">
          <button type="button" role="radio" aria-checked={!manga} className="chip" onClick={() => switchTo(false)}>Libros</button>
          <button type="button" role="radio" aria-checked={manga} className="chip" onClick={() => switchTo(true)}>Manga y cómic</button>
        </div>
      )}
      {/* not a <form>: the finder sits inside the book form, and nested forms would submit it */}
      <div className="finder-bar" role="search">
        <Search size={16} aria-hidden style={{ color: 'var(--muted)', flex: 'none' }} />
        <label className="sr-only" htmlFor="finder-q">{manga ? 'Buscar manga' : 'Buscar libro'}</label>
        <input id="finder-q" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); run() } }} placeholder={placeholder ?? (manga ? 'Serie y tomo: «One Piece 12»' : 'Título, autor o ISBN')} autoComplete="off" enterKeyHint="search" />
        <button className="btn small-btn" type="button" onClick={() => run()} disabled={busy || !q.trim()}>{busy ? <span className="spin" /> : 'Buscar'}</button>
      </div>
      {err && <p className="hint finder-err" role="status">{err}{hint && <> <button type="button" className="link-btn" onClick={() => switchTo(true)}>¿Es un manga o cómic? Búscalo ahí</button></>}</p>}
      {busy && <RowsSkeleton />}
      {!busy && hits && hits.length > 0 && (
        <ul className="finder-hits" aria-label="Resultados">
          {hits.map((h, i) => (
            <li key={`${h.title}-${i}`}>
              <button type="button" onClick={() => { onPick(h, { volume }); setHits(null) }}>
                <span className="fh-cover">{h.cover ? <img src={h.cover} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <i />}</span>
                <span className="fh-text">
                  <b>{h.title}{h.manga && volume ? <span className="fh-vol"> · tomo {volume}</span> : null}</b>
                  <span>{[h.author, h.year, h.manga ? h.publisher : '', h.volumes ? `${h.volumes} tomos` : '', h.pages ? `${h.pages} págs.` : ''].filter(Boolean).join(' · ')}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
