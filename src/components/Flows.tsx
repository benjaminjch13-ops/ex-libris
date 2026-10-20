import { useMemo, useState } from 'react'
import type { Book, DropReason } from '../types'
import { DROP_REASONS } from '../types'
import { useLibrary } from '../state/library'
import { Modal } from './Modal'
import { Cover } from './BookArt'

const pctOf = (b: Book) => Math.round((b.progress?.percent ?? 0) * 100)
export const isManual = (b: Book) => b.format === 'fisico'
export const editionLabel = (b: Book) => (b.app ? `En ${b.app}` : 'Papel')

/** Paper books (and books read in another app): progress is entered by hand. */
export function PageDialog({ book, onClose, onFinished }: { book: Book; onClose: () => void; onFinished: (id: string) => void }) {
  const { patchBook, addHistory, setStatus, notify } = useLibrary()
  const prev = book.progress?.page ?? 0
  const [total, setTotal] = useState(book.pages ? String(book.pages) : '')
  const [page, setPage] = useState(prev ? String(prev) : '')
  const [minutes, setMinutes] = useState<number | null>(null)
  const totalN = Number(total) || 0
  const pageN = Math.min(Number(page) || 0, totalN || Infinity)
  const pct = totalN ? Math.round((pageN / totalN) * 100) : 0

  const finish = async () => {
    const t = totalN || book.pages || pageN || 1
    await patchBook(book.id, { pages: t, progress: { chapter: 0, ratio: 1, page: t, total: t, percent: 1, updatedAt: Date.now() }, lastOpenedAt: Date.now() })
    if (t > prev) await addHistory({ bookId: book.id, title: book.title, author: book.author, type: 'sesion', at: Date.now(), fromPage: prev || 1, toPage: t, total: t, minutes: minutes ?? undefined, seconds: minutes ? minutes * 60 : undefined })
    setStatus(book.id, 'terminado')
    await addHistory({ bookId: book.id, title: book.title, author: book.author, type: 'terminado', at: Date.now() })
    onClose()
    onFinished(book.id)
  }

  const save = async () => {
    if (!pageN) return
    if (totalN && pageN >= totalN) return finish()
    const p = totalN ? pageN / totalN : 0
    await patchBook(book.id, {
      pages: totalN || book.pages,
      progress: { chapter: 0, ratio: p, page: pageN, total: totalN, percent: p, updatedAt: Date.now() },
      lastOpenedAt: Date.now(),
      nudgeAfter: undefined,
    })
    if (book.status !== 'leyendo') setStatus(book.id, 'leyendo')
    await addHistory({ bookId: book.id, title: book.title, author: book.author, type: 'sesion', at: Date.now(), fromPage: prev || 1, toPage: pageN, total: totalN || undefined, minutes: minutes ?? undefined, seconds: minutes ? minutes * 60 : undefined })
    notify(totalN ? `Página ${pageN} · ${pct}%` : `Página ${pageN} anotada`)
    onClose()
  }

  return (
    <Modal
      title="¿En qué página vas?"
      onClose={onClose}
      narrow
      footer={<>
        <button className="btn" onClick={finish}>Lo terminé</button>
        <button className="btn btn-gold" onClick={save} disabled={!pageN}>Guardar</button>
      </>}
    >
      <div className="fields">
        <p className="flow-book"><b>{book.title}</b> · {book.author}{prev ? ` · ibas en la página ${prev}` : ''}</p>
        <div className="row2">
          <div className="field">
            <label htmlFor="pg-page">Página actual</label>
            <input id="pg-page" className="big-num" inputMode="numeric" value={page} onChange={(e) => setPage(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && save()} />
          </div>
          <div className="field">
            <label htmlFor="pg-total">De</label>
            <input id="pg-total" className="big-num" inputMode="numeric" value={total} placeholder="total" onChange={(e) => setTotal(e.target.value.replace(/\D/g, ''))} />
          </div>
        </div>
        {totalN > 0 && <div className="meter big" aria-hidden><i style={{ width: `${pct}%` }} /></div>}
        <div className="field">
          <span className="lbl">¿Cuánto leíste hoy? <em className="opt">opcional</em></span>
          <div className="filters" role="radiogroup" aria-label="Minutos de lectura">
            {[15, 30, 45, 60, 90].map((m) => (
              <button key={m} type="button" className="chip" role="radio" aria-checked={minutes === m} onClick={() => setMinutes(minutes === m ? null : m)}>{m < 60 ? `${m} min` : m === 60 ? '1 h' : '1 h 30'}</button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}

/** "Drop it": leave a book, saying why. Where it was left is recorded automatically. */
export function DropDialog({ book, onClose, onDropped }: { book: Book; onClose: () => void; onDropped: (id: string) => void }) {
  const { dropBook, notify } = useLibrary()
  const [reason, setReason] = useState<DropReason | null>(null)
  const [note, setNote] = useState('')
  const [retry, setRetry] = useState(false)
  const pct = pctOf(book)

  const go = async () => {
    if (!reason) return
    await dropBook(book.id, reason, note, retry)
    notify(retry ? 'Lo dejaste por ahora; quedó al final de «Por leer»' : 'Libro abandonado. Sin culpa.')
    onClose()
    onDropped(book.id)
  }

  return (
    <Modal
      title="Dejar este libro"
      onClose={onClose}
      narrow
      footer={<>
        <button className="btn" onClick={onClose}>Seguir leyéndolo</button>
        <button className="btn btn-gold" onClick={go} disabled={!reason}>Dejar el libro</button>
      </>}
    >
      <div className="fields">
        <p className="flow-book"><b>{book.title}</b> · {book.author}
          {book.progress?.page ? <><br /><span className="muted">Lo dejas en la página {book.progress.page}{pct ? ` (${pct}%)` : ''}.</span></> : null}
        </p>
        <div className="field">
          <span className="lbl" id="drop-why">¿Por qué lo dejas?</span>
          <div className="reasons" role="radiogroup" aria-labelledby="drop-why">
            {DROP_REASONS.map((r) => (
              <button key={r.key} type="button" className="chip" role="radio" aria-checked={reason === r.key} onClick={() => setReason(r.key)}>{r.label}</button>
            ))}
          </div>
        </div>
        <div className="field">
          <label htmlFor="drop-note">Nota para ti <em className="opt">opcional</em></label>
          <textarea id="drop-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Lo que te gustaría recordar si algún día lo retomas" maxLength={600} />
        </div>
        <label className="check"><input type="checkbox" checked={retry} onChange={(e) => setRetry(e.target.checked)} /> Quizá lo retome: déjalo al final de mi lista «Por leer»</label>
      </div>
    </Modal>
  )
}

/** After finishing or leaving a book: propose the next one in the queue, started with one tap. */
export function NextUpDialog({ afterId, onClose, onStart, onGoTbr }: {
  afterId: string
  onClose: () => void
  onStart: (b: Book) => void
  onGoTbr: () => void
}) {
  const { tbr, books, addToTbr } = useLibrary()
  const queue = useMemo(() => tbr.filter((id) => id !== afterId && !id.startsWith('w:')).map((id) => books.find((b) => b.id === id)!).filter(Boolean), [tbr, books, afterId])
  const wishOnly = tbr.some((id) => id.startsWith('w:'))
  const next = queue[0]
  const ideas = useMemo(() => (next ? [] : books.filter((b) => b.status === 'pendiente' && b.id !== afterId).sort((a, b) => a.addedAt - b.addedAt).slice(0, 3)), [books, next, afterId])

  return (
    <Modal
      title={next ? '¿Sigues con este?' : '¿Qué lees ahora?'}
      onClose={onClose}
      narrow
      footer={next ? (<>
        <button className="btn" onClick={() => { onClose(); onGoTbr() }}>Elegir otro</button>
        <button className="btn btn-gold" onClick={() => { onClose(); onStart(next) }}>Empezar ahora</button>
      </>) : (<>
        <button className="btn" onClick={onClose}>Ahora no</button>
        <button className="btn btn-gold" onClick={() => { onClose(); onGoTbr() }}>Armar mi lista</button>
      </>)}
    >
      {next ? (
        <div className="nextup">
          <div className="nu-cover"><Cover book={next} /></div>
          <div>
            <span className="eyebrow" style={{ color: 'var(--gold)' }}>El siguiente en tu lista</span>
            <h3>{next.title}</h3>
            <p className="muted">{next.author}{next.pages ? ` · ${next.pages} páginas` : ''}{isManual(next) ? ` · ${editionLabel(next)}` : ''}</p>
            {queue.length > 1 && <p className="muted small">Después: {queue.slice(1, 3).map((b) => `«${b.title}»`).join(', ')}{queue.length > 3 ? ` y ${queue.length - 3} más` : ''}</p>}
          </div>
        </div>
      ) : (
        <div className="fields">
          <p className="muted">{wishOnly ? 'En tu lista «Por leer» solo quedan libros de la wishlist que aún no tienes.' : 'Tu lista «Por leer» está vacía.'}{ideas.length ? ' Estos llevan tiempo esperando:' : ''}</p>
          {ideas.length > 0 && (
            <ul className="idea-list">
              {ideas.map((b) => (
                <li key={b.id}>
                  <span className="il-cover"><Cover book={b} /></span>
                  <span className="il-text"><b>{b.title}</b><span>{b.author}</span></span>
                  <button className="chip" onClick={() => addToTbr(b.id)}>+ Por leer</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  )
}

const DAY = 86400000
export const NUDGE_DAYS = 21

/** A book "being read" that hasn't been touched for weeks. */
export function staleBook(books: Book[]): Book | undefined {
  const now = Date.now()
  return books
    .filter((b) => b.status === 'leyendo' && (b.nudgeAfter ?? 0) < now)
    .map((b) => ({ b, last: Math.max(b.lastOpenedAt ?? 0, b.progress?.updatedAt ?? 0, b.startedAt ?? 0, b.addedAt) }))
    .filter((x) => now - x.last > NUDGE_DAYS * DAY)
    .sort((a, b) => a.last - b.last)[0]?.b
}

export function weeksSince(b: Book) {
  const last = Math.max(b.lastOpenedAt ?? 0, b.progress?.updatedAt ?? 0, b.startedAt ?? 0, b.addedAt)
  return Math.max(3, Math.round((Date.now() - last) / (7 * DAY)))
}
