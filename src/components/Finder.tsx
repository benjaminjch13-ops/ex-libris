import { useState } from 'react'
import { searchCatalog, type CatalogHit } from '../lib/lookup'
import { Search } from './Icons'

/** Title / author / ISBN search against the public catalogues, with a pickable result list. */
export function Finder({ onPick, placeholder = 'Título, autor o ISBN', autoQuery }: {
  onPick: (h: CatalogHit) => void
  placeholder?: string
  autoQuery?: string
}) {
  const [q, setQ] = useState(autoQuery ?? '')
  const [busy, setBusy] = useState(false)
  const [hits, setHits] = useState<CatalogHit[] | null>(null)
  const [err, setErr] = useState('')

  const run = async () => {
    if (!q.trim()) return
    setBusy(true); setErr('')
    try {
      const r = await searchCatalog(q)
      setHits(r)
      if (!r.length) setErr('No encontré ese libro en los catálogos. Puedes escribir los datos a mano.')
    } catch {
      setHits([]); setErr('Sin conexión con los catálogos. Escribe los datos a mano o inténtalo más tarde.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="finder">
      {/* not a <form>: the finder sits inside the book form, and nested forms would submit it */}
      <div className="finder-bar" role="search">
        <Search size={16} aria-hidden style={{ color: 'var(--muted)', flex: 'none' }} />
        <label className="sr-only" htmlFor="finder-q">Buscar libro</label>
        <input id="finder-q" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); run() } }} placeholder={placeholder} autoComplete="off" enterKeyHint="search" />
        <button className="btn small-btn" type="button" onClick={run} disabled={busy || !q.trim()}>{busy ? <span className="spin" /> : 'Buscar'}</button>
      </div>
      {err && <p className="hint finder-err" role="status">{err}</p>}
      {hits && hits.length > 0 && (
        <ul className="finder-hits" aria-label="Resultados">
          {hits.map((h, i) => (
            <li key={`${h.title}-${i}`}>
              <button type="button" onClick={() => { onPick(h); setHits(null) }}>
                <span className="fh-cover">{h.cover ? <img src={h.cover} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <i />}</span>
                <span className="fh-text">
                  <b>{h.title}</b>
                  <span>{[h.author, h.year, h.pages ? `${h.pages} págs.` : ''].filter(Boolean).join(' · ')}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
