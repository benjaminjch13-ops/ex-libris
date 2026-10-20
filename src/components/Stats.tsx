import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { Book, Status } from '../types'
import { STATUS_LABEL } from '../types'
import { useLibrary } from '../state/library'
import { genreOf } from '../lib/genres'
import { Stars, fmtRating } from './ReviewDialog'
import { ChevronLeft, ChevronRight } from './Icons'

type Metric = 'libros' | 'paginas'

// Validated (dark surface #1c1714): lightness band, chroma, CVD ΔE 17.3 / normal ΔE 24.6 adjacent.
const SERIES: { key: Status; label: string; color: string }[] = [
  { key: 'terminado', label: 'Terminados', color: '#c98500' },
  { key: 'leyendo', label: 'Leyendo', color: '#9085e9' },
  { key: 'pendiente', label: 'Pendientes', color: '#199e70' },
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
    return [...m.entries()].map(([genre, list]) => {
      const byStatus = { terminado: 0, leyendo: 0, pendiente: 0 } as Record<Status, number>
      list.forEach((b) => byStatus[b.status]++)
      const rated = list.filter((b) => (b.review?.rating ?? 0) > 0)
      return {
        genre,
        books: list,
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
          <span className="tile-sub">{fmt(books.length)} libros en total</span>
        </div>
        {mostRead && mostRead.byStatus.terminado > 0 && (
          <div className="tile">
            <span className="tile-label">El que más lees</span>
            <b className="tile-text">{mostRead.genre}</b>
            <span className="tile-sub">{mostRead.byStatus.terminado} de tus {totalRead} terminados</span>
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
            <span className="tile-sub">{mostPending.byStatus.pendiente} libros por leer</span>
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
                            className="seg"
                            style={{ flexGrow: r.byStatus[s.key], background: s.color }}
                            onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, title: r.genre, lines: SERIES.map((x) => `${x.label}: ${r.byStatus[x.key]}`) })}
                            onMouseLeave={() => setTip(null)}
                          />
                        ))
                        : <span className="seg" style={{ flexGrow: 1, background: SERIES[0].color }} onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, title: r.genre, lines: [`${fmt(r.pagesRead)} páginas leídas`, `${r.byStatus.terminado} libros terminados`] })} onMouseLeave={() => setTip(null)} />}
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
                            <i style={{ background: SERIES.find((s) => s.key === b.status)!.color }} aria-hidden />
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

      {tip && (
        <div className="gtip" style={{ left: Math.min(tip.x + 14, window.innerWidth - 200), top: tip.y + 14 }} role="tooltip">
          <b>{tip.title}</b>
          {tip.lines.map((l) => <span key={l}>{l}</span>)}
        </div>
      )}
    </section>
  )
}

const order = (s: Status) => (s === 'leyendo' ? 0 : s === 'terminado' ? 1 : 2)

function niceTicks(max: number) {
  const raw = max / 4
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = Math.max(1, [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw)
  const out: number[] = []
  for (let v = 0; v <= max + step * 0.999; v += step) out.push(Math.round(v))
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + Math.round(step))
  return out
}
