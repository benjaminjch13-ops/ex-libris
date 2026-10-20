import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { Book, Status } from '../types'
import { STATUS_LABEL } from '../types'
import { useLibrary } from '../state/library'
import { Cover } from './BookArt'
import { FilterBar } from './Library'
import type { Filters } from '../lib/filters'
import { relTime } from '../lib/hooks'
import { BookOpen, ChevronLeft, Edit, Heart, Plus, Queue, Trash } from './Icons'
import { editionLabel, isManual } from './Flows'
import { DROP_REASONS } from '../types'
import { Stars } from './ReviewDialog'

type Sort = 'reciente' | 'titulo' | 'autor' | 'leido'

export function Collection({ visible, filters, setFilters, onBack, onAdd, onEdit, onDelete, onPreview, onReview, onDrop, onPage }: {
  visible: Book[]
  filters: Filters
  setFilters: (f: Filters) => void
  onBack: () => void
  onAdd: () => void
  onEdit: (b: Book) => void
  onDelete: (b: Book) => void
  onPreview: (b: Book, el: HTMLElement) => void
  onReview: (b: Book) => void
  onDrop: (b: Book) => void
  onPage: (b: Book) => void
}) {
  const { books, toggleFavorite, setStatus, tbr, addToTbr, removeFromTbr } = useLibrary()
  const [sort, setSort] = useState<Sort>('reciente')
  const sorted = useMemo(() => {
    const l = [...visible]
    if (sort === 'titulo') l.sort((a, b) => a.title.localeCompare(b.title, 'es'))
    else if (sort === 'autor') l.sort((a, b) => a.author.localeCompare(b.author, 'es'))
    else if (sort === 'leido') l.sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))
    else l.sort((a, b) => b.addedAt - a.addedAt)
    return l
  }, [visible, sort])

  return (
    <section>
      <div className="view-title">
        <button className="icon-btn" onClick={onBack} aria-label="Volver a la estantería"><ChevronLeft /></button>
        <h1>Colección completa</h1>
      </div>
      <div className="coll-tools">
        <FilterBar filters={filters} setFilters={setFilters} withDropped />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <label className="sr-only" htmlFor="c-sort">Ordenar</label>
          <select id="c-sort" className="select" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="reciente">Añadidos recientemente</option>
            <option value="leido">Leídos recientemente</option>
            <option value="titulo">Título A–Z</option>
            <option value="autor">Autor A–Z</option>
          </select>
          <button className="btn btn-gold" onClick={onAdd}><Plus size={16} /> Añadir</button>
        </div>
      </div>
      <p className="eyebrow" style={{ margin: '14px 0 12px' }}>{sorted.length} de {books.length} libros</p>
      {sorted.length === 0 ? (
        <div className="empty-state">
          <h3>{books.length ? 'Ningún libro coincide' : 'Aún no hay libros'}</h3>
          <p>{books.length ? 'Cambia la búsqueda o los filtros para ver más títulos.' : 'Sube tu primer EPUB o PDF, o escanea un libro de papel, para empezar la colección.'}</p>
        </div>
      ) : (
        <motion.div className="coll" layout>
          <AnimatePresence initial={false}>
            {sorted.map((b) => (
              <motion.article
                key={b.id}
                className="coll-item"
                layout
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.25 }}
              >
                <button className="coll-cover" data-book-id={b.id} onClick={(e) => onPreview(b, e.currentTarget)} aria-label={`Abrir vista previa de ${b.title}`}>
                  <Cover book={b} />
                </button>
                <div className="min0">
                  <h3>{b.title}</h3>
                  <div className="by">{b.author} · {b.category}</div>
                  <div className="meta">
                    <span className={`status-pill st-${b.status}`}>{STATUS_LABEL[b.status]}</span>
                    <span className="fmt">{isManual(b) ? editionLabel(b).toLowerCase() : b.format === 'demo' ? 'muestra' : b.format === 'catalogo' ? 'sin archivo' : b.format}</span>
                    {tbr.includes(b.id) && <span className="fmt">por leer · {tbr.indexOf(b.id) + 1}º</span>}
                    {b.progress && b.status !== 'terminado' ? <span>{Math.round(b.progress.percent * 100)}%</span> : null}
                    <span>{b.lastOpenedAt ? `Leído ${relTime(b.lastOpenedAt)}` : `Añadido ${relTime(b.addedAt)}`}</span>
                  </div>
                  {b.status === 'abandonado' && b.dropped && (
                    <p className="coll-drop">{DROP_REASONS.find((r) => r.key === b.dropped!.reason)?.label}{b.dropped.percent ? ` · en el ${Math.round(b.dropped.percent * 100)}%` : ''}{b.dropped.note ? ` · “${b.dropped.note}”` : ''}</p>
                  )}
                  {b.status === 'terminado' && (
                    <button className="coll-review" onClick={() => onReview(b)} aria-label={`Ver mi reseña de ${b.title}`}>
                      {b.review?.rating ? <Stars value={b.review.rating} size={14} /> : <span className="muted">Sin calificar</span>}
                      <span>{b.review?.text || b.review?.rating || b.review?.url ? 'Ver reseña' : 'Escribir reseña'}</span>
                    </button>
                  )}
                  <div className="acts">
                    <button className="icon-btn" onClick={(e) => (b.format === 'catalogo' ? onEdit(b) : isManual(b) && b.status === 'leyendo' ? onPage(b) : onPreview(b, e.currentTarget.closest('.coll-item')!.querySelector('.coll-cover') as HTMLElement))} aria-label={b.format === 'catalogo' ? `Añadir archivo a ${b.title}` : isManual(b) && b.status === 'leyendo' ? `Anotar página de ${b.title}` : `Leer ${b.title}`} title={b.format === 'catalogo' ? 'Añadir archivo' : isManual(b) && b.status === 'leyendo' ? 'Anotar página' : 'Leer'}><BookOpen size={16} /></button>
                    {(b.status === 'pendiente' || b.status === 'abandonado') && (
                      <button className="icon-btn" aria-pressed={tbr.includes(b.id)} onClick={() => (tbr.includes(b.id) ? removeFromTbr(b.id) : addToTbr(b.id))} aria-label={tbr.includes(b.id) ? `Quitar ${b.title} de Por leer` : `Añadir ${b.title} a Por leer`} title="Por leer"><Queue size={16} /></button>
                    )}
                    <button className="icon-btn" aria-pressed={b.favorite} onClick={() => toggleFavorite(b.id)} aria-label={b.favorite ? 'Quitar de favoritos' : 'Marcar como favorito'} title="Favorito"><Heart size={16} filled={b.favorite} /></button>
                    <button className="icon-btn" onClick={() => onEdit(b)} aria-label={`Editar ${b.title}`} title="Editar"><Edit size={16} /></button>
                    <button className="icon-btn" onClick={() => onDelete(b)} aria-label={`Eliminar ${b.title}`} title="Eliminar"><Trash size={16} /></button>
                    <label className="sr-only" htmlFor={`st-${b.id}`}>Estado de {b.title}</label>
                    <select id={`st-${b.id}`} className="select" style={{ marginLeft: 'auto', fontSize: 12, padding: '4px 28px 4px 10px' }} value={b.status} onChange={(e) => (e.target.value === 'abandonado' ? onDrop(b) : setStatus(b.id, e.target.value as Status))}>
                      <option value="pendiente">Pendiente</option>
                      <option value="leyendo">Leyendo</option>
                      <option value="terminado">Terminado</option>
                      <option value="abandonado">Abandonado</option>
                    </select>
                  </div>
                </div>
              </motion.article>
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </section>
  )
}
