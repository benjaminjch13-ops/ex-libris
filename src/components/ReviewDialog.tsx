import { useMemo, useState } from 'react'
import type { Book } from '../types'
import { useLibrary } from '../state/library'
import { Modal } from './Modal'
import { Cover } from './BookArt'
import { Edit } from './Icons'

const DAY = 86400000

export function readingStats(book: Book, history: ReturnType<typeof useLibrary>['history']) {
  const sessions = history.filter((h) => h.bookId === book.id && h.type === 'sesion')
  const seconds = sessions.reduce((n, h) => n + (h.seconds ?? (h.minutes ?? 0) * 60), 0)
  const minutes = Math.round(seconds / 60)
  const firstSession = sessions.reduce((m, h) => Math.min(m, h.at), Infinity)
  const started = book.startedAt ?? (Number.isFinite(firstSession) ? firstSession : undefined)
  const finished = book.finishedAt
  const span = started && finished ? Math.max(0, finished - started) : undefined
  const days = span != null ? Math.round(span / DAY) : undefined
  return { sessions: sessions.length, seconds, minutes, started, finished, days, span }
}

export function fmtDuration(min: number) {
  if (min < 1) return '< 1 min'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

const fmtDate = (t?: number) => (t ? new Date(t).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' }) : '—')

/** Five stars in half-star steps. Read-only when there is no onChange. */
export function Stars({ value, onChange, size = 26, label }: { value: number; onChange?: (v: number) => void; size?: number; label?: string }) {
  const [hover, setHover] = useState(0)
  const shown = hover || value
  const fill = (i: number) => Math.max(0, Math.min(1, shown - (i - 1)))
  const star = (i: number) => (
    <span className="star" aria-hidden>
      <span className="star-bg">★</span>
      <span className="star-fg" style={{ width: `${fill(i) * 100}%` }}>★</span>
    </span>
  )
  if (!onChange) {
    return (
      <span className="stars" role="img" aria-label={value ? `${fmtRating(value)} de 5 estrellas` : 'Sin calificar'} style={{ fontSize: size }}>
        {[1, 2, 3, 4, 5].map((i) => <span key={i}>{star(i)}</span>)}
      </span>
    )
  }
  const pick = (e: React.MouseEvent<HTMLButtonElement>, i: number) => {
    const r = e.currentTarget.getBoundingClientRect()
    return e.clientX - r.left < r.width / 2 ? i - 0.5 : i
  }
  return (
    <span
      className="stars editable"
      role="slider"
      tabIndex={0}
      aria-label={label ?? 'Calificación'}
      aria-valuemin={0}
      aria-valuemax={5}
      aria-valuenow={value}
      aria-valuetext={value ? `${fmtRating(value)} de 5 estrellas` : 'Sin calificar'}
      style={{ fontSize: size }}
      onMouseLeave={() => setHover(0)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); onChange(Math.min(5, value + 0.5)) }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); onChange(Math.max(0, value - 0.5)) }
      }}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          tabIndex={-1}
          aria-hidden
          onMouseMove={(e) => setHover(pick(e, i))}
          onClick={(e) => { const v = pick(e, i); onChange(value === v ? 0 : v) }}
        >{star(i)}</button>
      ))}
    </span>
  )
}

export const fmtRating = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ','))

const RATING_WORDS = ['', 'No era para mí', 'Tuvo lo suyo', 'Me gustó', 'Me encantó', 'Imprescindible']
const ratingWord = (v: number) => (v ? `${fmtRating(v)} · ${RATING_WORDS[Math.ceil(v)]}` : '')

export function ReviewDialog({ book, justFinished, onClose }: { book: Book; justFinished?: boolean; onClose: () => void }) {
  const { history, patchBook, notify } = useLibrary()
  const stats = useMemo(() => readingStats(book, history), [book, history])
  const hasReview = !!book.review && (book.review.rating > 0 || book.review.text.trim().length > 0 || !!book.review.url)
  const [editing, setEditing] = useState(!hasReview)
  const [rating, setRating] = useState(book.review?.rating ?? 0)
  const [text, setText] = useState(book.review?.text ?? '')
  const [url, setUrl] = useState(book.review?.url ?? '')
  const urlOk = !url.trim() || /^https?:\/\/\S+$/i.test(url.trim())

  const save = async () => {
    await patchBook(book.id, { review: { rating, text: text.trim(), url: url.trim() || undefined, updatedAt: Date.now() } })
    notify('Reseña guardada')
    setEditing(false)
  }

  const title = justFinished ? '¡Terminaste el libro!' : 'Mi reseña'

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={editing ? (
        <>
          <button className="btn" onClick={() => (hasReview ? setEditing(false) : onClose())}>{hasReview ? 'Cancelar' : 'Ahora no'}</button>
          <button className="btn btn-gold" onClick={save} disabled={(!rating && !text.trim() && !url.trim()) || !urlOk}>Guardar reseña</button>
        </>
      ) : (
        <>
          <button className="btn" onClick={() => setEditing(true)}><Edit size={15} /> Editar reseña</button>
          <button className="btn btn-gold" onClick={onClose}>Cerrar</button>
        </>
      )}
    >
      <div className="review">
        <div className="review-cover"><Cover book={book} /></div>
        <div className="review-main">
          <div className="eyebrow" style={{ color: 'var(--gold)' }}>{book.category}</div>
          <h3 className="review-title">{book.title}</h3>
          <div className="review-by">{book.author}</div>

          <dl className="review-stats">
            {!stats.sessions && !stats.started ? (
              <>
                <div><dt>Terminado</dt><dd>{stats.finished ? new Date(stats.finished).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</dd></div>
                <div><dt>Páginas</dt><dd>{book.pages || '—'}</dd></div>
                <div><dt>Notas</dt><dd>{book.notes?.length ?? 0}</dd></div>
              </>
            ) : (<>
            <div><dt>Lo terminaste en</dt><dd>{stats.span == null ? '—' : stats.days! < 1 ? 'El mismo día' : `${stats.days} ${stats.days === 1 ? 'día' : 'días'}`}</dd></div>
            <div><dt>Tiempo leído</dt><dd>{stats.seconds ? fmtDuration(stats.minutes) : '—'}</dd></div>
            <div><dt>Sesiones</dt><dd>{stats.sessions || '—'}</dd></div>
            <div><dt>Notas</dt><dd>{book.notes?.length ?? 0}</dd></div>
            </>)}
          </dl>
          <p className="review-dates">{stats.started ? <>Empezado el {fmtDate(stats.started)} · </> : null}Terminado el {fmtDate(stats.finished)}{book.pages ? ` · ${book.pages} páginas` : ''}</p>
        </div>
      </div>

      {editing ? (
        <div className="review-edit">
          <div className="field">
            <span className="lbl">Tu calificación</span>
            <div className="rating-row">
              <Stars value={rating} onChange={setRating} size={32} />
              <span className="rating-word">{ratingWord(rating) || 'Toca una estrella (la mitad izquierda da media)'}</span>
            </div>
          </div>
          <div className="field">
            <label htmlFor="rv-text">Tu reseña</label>
            <textarea id="rv-text" value={text} onChange={(e) => setText(e.target.value)} placeholder="¿Qué te dejó este libro? ¿A quién se lo recomendarías?" maxLength={5000} style={{ minHeight: 150 }} />
            <span className="hint">{text.length} / 5000</span>
          </div>
          <div className="field">
            <label htmlFor="rv-url">Enlace a tu reseña publicada (opcional)</label>
            <input id="rv-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://tu-substack.substack.com/p/…" aria-invalid={!urlOk} />
            {!urlOk && <span className="err">Escribe un enlace completo que empiece con https://</span>}
          </div>
        </div>
      ) : (
        <div className="review-view">
          <div className="rating-row">
            <Stars value={book.review?.rating ?? 0} size={30} />
            <span className="rating-word">{ratingWord(book.review?.rating ?? 0)}</span>
          </div>
          {book.review?.text
            ? <blockquote className="review-text">{book.review.text}</blockquote>
            : !book.review?.url && <p className="review-empty">Sin reseña escrita todavía.</p>}
          {book.review?.url && (
            <a className="review-link" href={book.review.url} target="_blank" rel="noopener noreferrer">
              <span>Leer mi reseña completa</span>
              <small>{(() => { try { return new URL(book.review.url).hostname.replace(/^www\./, '') } catch { return book.review.url } })()} ↗</small>
            </a>
          )}
          {book.review?.updatedAt && book.review.text && <p className="review-dates">Escrita el {fmtDate(book.review.updatedAt)}</p>}
        </div>
      )}
    </Modal>
  )
}
