import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { Book, Status } from '../types'
import { STATUS_LABEL, DROP_REASONS } from '../types'
import { useLibrary } from '../state/library'
import { genreOf } from '../lib/genres'
import { Stars, fmtRating } from './ReviewDialog'
import { ChevronLeft, ChevronRight } from './Icons'

type Metric = 'libros' | 'paginas'

// Validated (dark surface #1c1714): lightness band, chroma, CVD ΔE 17.3 / normal ΔE 24.6 adjacent.
const SERIES: { key: Status; label: string; color: string }[] = [
  { key: 'terminado', label: 'Terminados', color: '#c99a4b' },
  { key: 'leyendo', label: 'Leyendo', color: '#9b8ac4' },
  { key: 'pendiente', label: 'Pendientes', color: '#5f9c80' },
]

interface Row {
  genre: string
  books: Book[]
  byStatus: Record<Status, number>
  pagesRead: number
  avg: number | null
  rated: number
}

export function Stats({ onBack, onOpenBook }: { onBack: () => void; onOpenBook: (b: Book, el: HTMLElement) => void }) {
  const { books } = useLibrary()
  const [metric, setMetric] = useState<Metric>('libros')
  const [open, setOpen] = useState<string | null>(null)
  const [tip, setTip] = useState<{ x: number; y: number; title: string; lines: string[] } | null>(null)

  const rows: Row[] = useMemo(() => {
    const m = new Map<string, Book[]>()
    for (const b of books) m.set(genreOf(b), [...(m.get(genreOf(b)) ?? []), b])
    return [...m.entries()].filter(([, list]) => list.some((b) => b.status !== 'abandonado')).map(([genre, list]) => {
      const byStatus = { terminado: 0, leyendo: 0, pendiente: 0, abandonado: 0 } as Record<Status, number>
      list.forEach((b) => byStatus[b.status]++)
      const rated = list.filter((b) => (b.review?.rating ?? 0) > 0)
      return {
        genre,
        // abandoned books are counted apart (see «Los que dejaste»), not in the genre bars
        books: list.filter((b) => b.status !== 'abandonado'),
        byStatus,
        pagesRead: list.filter((b) => b.status === 'terminado').reduce((n, b) => n + (b.pages ?? 0), 0),
        avg: rated.length ? rated.reduce((n, b) => n + b.review!.rating, 0) / rated.length : null,
        rated: rated.length,
      }
    })
  }, [books])

  const sorted = useMemo(() => {
    const val = (r: Row) => (metric === 'libros' ? r.books.length : r.pagesRead)
    return [...rows].sort((a, b) => val(b) - val(a) || a.genre.localeCompare(b.genre, 'es')).filter((r) => metric === 'libros' || r.pagesRead > 0)
  }, [rows, metric])

  const max = Math.max(1, ...sorted.map((r) => (metric === 'libros' ? r.books.length : r.pagesRead)))
  const ticks = niceTicks(max)
  const scaleMax = ticks[ticks.length - 1]

  const totalRead = books.filter((b) => b.status === 'terminado').length
  const totalPages = rows.reduce((n, r) => n + r.pagesRead, 0)
  const mostRead = [...rows].sort((a, b) => b.byStatus.terminado - a.byStatus.terminado)[0]
  const bestRated = [...rows].filter((r) => r.rated >= 2).sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0))[0]
  const mostPending = [...rows].sort((a, b) => b.byStatus.pendiente - a.byStatus.pendiente)[0]

  const fmt = (n: number) => n.toLocaleString('es')
  const dropped = books.filter((b) => b.status === 'abandonado')
  const reasons = DROP_REASONS.map((r) => ({ ...r, n: dropped.filter((b) => b.dropped?.reason === r.key).length })).filter((r) => r.n > 0).sort((a, b) => b.n - a.n)
  const settled = totalRead + dropped.length
  const avgDropPct = dropped.filter((b) => b.dropped?.percent).length ? Math.round(dropped.reduce((n, b) => n + (b.dropped?.percent ?? 0), 0) / dropped.filter((b) => b.dropped?.percent).length * 100) : null

  return (
    <section className="stats-view">
      <div className="view-title">
        <button className="icon-btn" onClick={onBack} aria-label="Volver a la estantería"><ChevronLeft /></button>
        <h1>Estadísticas por género</h1>
      </div>

      <div className="stat-tiles">
        <div className="tile">
          <span className="tile-label">Géneros en tu biblioteca</span>
          <b>{rows.filter((r) => r.genre !== 'Sin género').length}</b>
          <span className="tile-sub">{fmt(books.length - dropped.length)} {books.length - dropped.length === 1 ? 'libro' : 'libros'} en la estantería</span>
        </div>
        {mostRead && mostRead.byStatus.terminado > 0 && (
          <div className="tile">
            <span className="tile-label">El que más lees</span>
            <b className="tile-text">{mostRead.genre}</b>
            <span className="tile-sub">{totalRead === 1 ? 'Tu único libro terminado' : `${mostRead.byStatus.terminado} de tus ${totalRead} terminados`}</span>
          </div>
        )}
        {bestRated && (
          <div className="tile">
            <span className="tile-label">Mejor calificado</span>
            <b className="tile-text">{bestRated.genre}</b>
            <span className="tile-sub"><Stars value={Math.round(bestRated.avg! * 2) / 2} size={13} /> {fmtRating(Math.round(bestRated.avg! * 10) / 10)} de media · {bestRated.rated} libros</span>
          </div>
        )}
        {mostPending && mostPending.byStatus.pendiente > 0 && (
          <div className="tile">
            <span className="tile-label">Tu pila pendiente</span>
            <b className="tile-text">{mostPending.genre}</b>
            <span className="tile-sub">{mostPending.byStatus.pendiente} {mostPending.byStatus.pendiente === 1 ? 'libro' : 'libros'} por leer</span>
          </div>
        )}
      </div>

      <div className="chart-card">
        <div className="chart-head">
          <div>
            <h2>{metric === 'libros' ? 'Libros por género' : 'Páginas leídas por género'}</h2>
            <p>{metric === 'libros' ? 'Cada barra suma todos los libros del género, dividida por estado de lectura.' : `${fmt(totalPages)} páginas en libros terminados.`}</p>
          </div>
          <div className="filters" role="group" aria-label="Medida">
            <button className="chip" aria-pressed={metric === 'libros'} onClick={() => setMetric('libros')}>Libros</button>
            <button className="chip" aria-pressed={metric === 'paginas'} onClick={() => setMetric('paginas')}>Páginas leídas</button>
          </div>
        </div>

        {metric === 'libros' && (
          <div className="legend" aria-hidden>
            {SERIES.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>)}
          </div>
        )}

        <div className="gchart" role="table" aria-label={metric === 'libros' ? 'Libros por género y estado' : 'Páginas leídas por género'} onMouseLeave={() => setTip(null)}>
          <div className="grow ghead" role="row">
            <span role="columnheader">Género</span>
            <span role="columnheader" className="axis">
              {ticks.map((t) => <i key={t} style={{ left: `${(t / scaleMax) * 100}%` }}>{fmt(t)}</i>)}
            </span>
            <span role="columnheader" className="num">{metric === 'libros' ? 'Libros' : 'Páginas'}</span>
            <span role="columnheader" className="num">Leídos</span>
            <span role="columnheader" className="num">Media</span>
          </div>
          {sorted.map((r) => {
            const total = metric === 'libros' ? r.books.length : r.pagesRead
            const isOpen = open === r.genre
            return (
              <div key={r.genre} className={`grow-wrap${isOpen ? ' open' : ''}`}>
                <button className="grow" role="row" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : r.genre)}>
                  <span role="cell" className="gname"><ChevronRight size={14} className="chev" />{r.genre}</span>
                  <span role="cell" className="track">
                    {ticks.map((t) => <i key={t} className="grid" style={{ left: `${(t / scaleMax) * 100}%` }} />)}
                    <span className="bar" style={{ width: `${(total / scaleMax) * 100}%` }}>
                      {metric === 'libros'
                        ? SERIES.filter((s) => r.byStatus[s.key] > 0).map((s) => (
                          <span
                            key={s.key}
                            className="bseg"
                            style={{ flexGrow: r.byStatus[s.key], background: s.color }}
                            onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, title: r.genre, lines: SERIES.map((x) => `${x.label}: ${r.byStatus[x.key]}`) })}
                            onMouseLeave={() => setTip(null)}
                          />
                        ))
                        : <span className="bseg" style={{ flexGrow: 1, background: SERIES[0].color }} onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, title: r.genre, lines: [`${fmt(r.pagesRead)} páginas leídas`, `${r.byStatus.terminado} libros terminados`] })} onMouseLeave={() => setTip(null)} />}
                    </span>
                  </span>
                  <span role="cell" className="num strong">{fmt(total)}</span>
                  <span role="cell" className="num">{r.books.length ? `${Math.round((r.byStatus.terminado / r.books.length) * 100)}%` : '—'}</span>
                  <span role="cell" className="num">{r.avg != null ? `★ ${fmtRating(Math.round(r.avg * 10) / 10)}` : '—'}</span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.ul className="gbooks" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }}>
                      {[...r.books].sort((a, b) => order(a.status) - order(b.status) || (b.review?.rating ?? 0) - (a.review?.rating ?? 0)).map((b) => (
                        <li key={b.id}>
                          <button onClick={(e) => onOpenBook(b, e.currentTarget)} data-book-id={b.id}>
                            <i style={{ background: SERIES.find((s) => s.key === b.status)?.color ?? 'var(--muted)' }} aria-hidden />
                            <span className="gb-title">{b.title}</span>
                            <span className="gb-author">{b.author}</span>
                            <span className="gb-meta">{b.review?.rating ? <Stars value={b.review.rating} size={12} /> : STATUS_LABEL[b.status]}</span>
                          </button>
                        </li>
                      ))}
                    </motion.ul>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </div>
        <p className="chart-note">Toca un género para ver sus libros. El género se puede cambiar en «Editar datos» de cada libro.</p>
      </div>

      {dropped.length > 0 && (
        <div className="chart-card">
          <div className="chart-head">
            <div>
              <h2>Los que dejaste</h2>
              <p>
                {dropped.length} {dropped.length === 1 ? 'libro abandonado' : 'libros abandonados'}
                {settled ? ` · ${Math.round((dropped.length / settled) * 100)}% de los que cerraste (terminados o dejados)` : ''}
                {avgDropPct != null ? ` · en promedio los dejas al ${avgDropPct}%` : ''}.
              </p>
            </div>
          </div>
          <ul className="reason-bars">
            {reasons.map((r) => (
              <li key={r.key}>
                <span className="rb-label">{r.label}</span>
                <span className="rb-track"><i style={{ width: `${(r.n / reasons[0].n) * 100}%` }} /></span>
                <span className="rb-n">{r.n}</span>
              </li>
            ))}
          </ul>
          <ul className="gbooks static">
            {dropped.sort((a, b) => (b.dropped?.at ?? 0) - (a.dropped?.at ?? 0)).slice(0, 8).map((b) => (
              <li key={b.id}>
                <button onClick={(e) => onOpenBook(b, e.currentTarget)} data-book-id={b.id}>
                  <i style={{ background: 'var(--muted)' }} aria-hidden />
                  <span className="gb-title">{b.title}</span>
                  <span className="gb-author">{b.author}</span>
                  <span className="gb-meta">{b.dropped?.percent ? `${Math.round(b.dropped.percent * 100)}%` : ''}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tip && (
        <div className="gtip" style={{ left: Math.min(tip.x + 14, window.innerWidth - 200), top: tip.y + 14 }} role="tooltip">
          <b>{tip.title}</b>
          {tip.lines.map((l) => <span key={l}>{l}</span>)}
        </div>
      )}
    </section>
  )
}

const order = (s: Status) => (s === 'leyendo' ? 0 : s === 'terminado' ? 1 : s === 'pendiente' ? 2 : 3)

function niceTicks(max: number) {
  const raw = max / 4
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = Math.max(1, [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw)
  const out: number[] = []
  for (let v = 0; v <= max + step * 0.999; v += step) out.push(Math.round(v))
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + Math.round(step))
  return out
}
