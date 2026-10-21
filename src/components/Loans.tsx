import { useMemo, useState } from 'react'
import type { Book, Loan } from '../types'
import { useLibrary } from '../state/library'
import { Modal } from './Modal'
import { Book3D, bookDims } from './BookArt'
import { Check } from './Icons'
import type { OpenOrigin } from './Library'
import { haptic } from '../lib/haptics'

const DAY = 86400000
const dayStart = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }
const fmtDate = (t: number) => new Date(t).toLocaleDateString('es', { day: 'numeric', month: 'short' })
const toInput = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const fromInput = (v: string) => (v ? new Date(`${v}T12:00:00`).getTime() : undefined)

/** Only paper books can be lent (a file or a Kindle copy can't). */
export const lendable = (b: Book) => b.format === 'fisico' && !b.app

export interface LoanState { days: number; overdue: boolean; dueIn?: number; text: string }

/** "Desde hace 12 días · vuelve en 3 días" / "Atrasado 4 días" */
export function loanState(loan: Loan, now = Date.now()): LoanState {
  const days = Math.max(0, Math.round((dayStart(now) - dayStart(loan.at)) / DAY))
  const since = days === 0 ? 'desde hoy' : days === 1 ? 'desde ayer' : `hace ${days} días`
  if (!loan.due) return { days, overdue: false, text: since }
  const dueIn = Math.round((dayStart(loan.due) - dayStart(now)) / DAY)
  if (dueIn < 0) return { days, overdue: true, dueIn, text: `atrasado ${-dueIn} ${dueIn === -1 ? 'día' : 'días'}` }
  return { days, overdue: false, dueIn, text: dueIn === 0 ? 'vuelve hoy' : dueIn === 1 ? 'vuelve mañana' : `vuelve en ${dueIn} días` }
}

/** A friendly nudge to the borrower, through the phone's share sheet (WhatsApp, Messages…). */
export async function remind(b: Book) {
  if (!b.loan) return
  const name = b.loan.to.split(' ')[0]
  const text = `¡Hola ${name}! ¿Qué tal vas con «${b.title}»? Cuando lo termines me lo devuelves, sin prisa 📚`
  try {
    if (navigator.share) { await navigator.share({ text }); return }
  } catch { return /* cancelled */ }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
}

const DUE: { l: string; days?: number }[] = [{ l: 'Sin fecha' }, { l: '2 semanas', days: 14 }, { l: '1 mes', days: 30 }, { l: '2 meses', days: 60 }]

export function LoanDialog({ book, onClose }: { book: Book; onClose: () => void }) {
  const { books, lendBook, notify } = useLibrary()
  const cur = book.loan
  const [to, setTo] = useState(cur?.to ?? '')
  const [at, setAt] = useState(toInput(cur?.at ?? Date.now()))
  const [due, setDue] = useState(cur?.due ? toInput(cur.due) : '')
  const [note, setNote] = useState(cur?.note ?? '')
  const [err, setErr] = useState('')
  // people you have lent to before, most recent first
  const people = useMemo(() => {
    const all = books.flatMap((b) => [...(b.loanLog ?? []), ...(b.loan ? [b.loan] : [])]).sort((a, b) => b.at - a.at).map((l) => l.to)
    return [...new Set(all)].slice(0, 6)
  }, [books])
  const pickDue = (days?: number) => setDue(days ? toInput((fromInput(at) ?? Date.now()) + days * DAY) : '')
  const activeDue = DUE.find((d) => (d.days ? due === toInput((fromInput(at) ?? Date.now()) + d.days * DAY) : !due))

  const save = async () => {
    if (!to.trim()) { setErr('¿A quién se lo prestas?'); return }
    await lendBook(book.id, { to, at: fromInput(at) ?? Date.now(), due: fromInput(due), note })
    haptic('success')
    notify(cur ? 'Préstamo actualizado' : `«${book.title}» prestado a ${to.trim().split(' ')[0]}`)
    onClose()
  }

  return (
    <Modal title={cur ? 'Editar préstamo' : 'Prestar libro'} narrow onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancelar</button>
      <button className="btn btn-gold" onClick={save}>{cur ? 'Guardar' : 'Prestar'}</button>
    </>}>
      <div className="fields">
        <p className="flow-book"><b>{book.title}</b> · {book.author}</p>
        <div className="field">
          <label htmlFor="ln-to">¿A quién?</label>
          <input id="ln-to" value={to} onChange={(e) => { setTo(e.target.value); setErr('') }} placeholder="Nombre" autoComplete="off" onKeyDown={(e) => e.key === 'Enter' && save()} aria-invalid={!!err} />
          {err && <span className="err">{err}</span>}
          {people.length > 0 && !cur && (
            <div className="filters" aria-label="Personas a las que has prestado">
              {people.map((p) => <button key={p} type="button" className="chip" aria-pressed={to === p} onClick={() => setTo(p)}>{p}</button>)}
            </div>
          )}
        </div>
        <div className="row2">
          <div className="field">
            <label htmlFor="ln-at">Se lo prestaste el</label>
            <input id="ln-at" type="date" value={at} max={toInput(Date.now())} onChange={(e) => setAt(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="ln-due">Te lo devuelve <em className="opt">opcional</em></label>
            <input id="ln-due" type="date" value={due} min={at} onChange={(e) => setDue(e.target.value)} />
          </div>
        </div>
        <div className="filters" role="radiogroup" aria-label="Plazo">
          {DUE.map((d) => <button key={d.l} type="button" role="radio" aria-checked={activeDue === d} className="chip" onClick={() => pickDue(d.days)}>{d.l}</button>)}
        </div>
        <div className="field">
          <label htmlFor="ln-note">Nota <em className="opt">opcional</em></label>
          <input id="ln-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Por ejemplo: se lo llevó al viaje" />
        </div>
      </div>
    </Modal>
  )
}

/** Inline card on the book page: who has it, since when, and the actions. */
export function LoanCard({ book, onEdit }: { book: Book; onEdit: () => void }) {
  const { returnBook, notify } = useLibrary()
  if (!book.loan) return null
  const st = loanState(book.loan)
  return (
    <div className={`loan-card${st.overdue ? ' overdue' : ''}`} role="status">
      <span className="loan-slip" aria-hidden />
      <div className="loan-text">
        <b>Prestado a {book.loan.to}</b>
        <span>{fmtDate(book.loan.at)} · {st.text}{book.loan.note ? ` · ${book.loan.note}` : ''}</span>
      </div>
      <div className="loan-acts">
        <button className="btn btn-gold small-btn" onClick={async () => { await returnBook(book.id); haptic('success'); notify(`«${book.title}» volvió a tu estante`) }}><Check size={14} /> Me lo devolvió</button>
        <button className="chip" onClick={() => remind(book)}>Recordarle</button>
        <button className="chip" onClick={onEdit}>Editar</button>
      </div>
    </div>
  )
}

/** Home section: books that are out, overdue first. */
export function LoansSection({ onOpen, small }: { onOpen: (b: Book, o: OpenOrigin) => void; small?: boolean }) {
  const { books, returnBook, notify } = useLibrary()
  const out = useMemo(() => books.filter((b) => b.loan).sort((a, b) => {
    const sa = loanState(a.loan!), sb = loanState(b.loan!)
    return Number(sb.overdue) - Number(sa.overdue) || (sa.dueIn ?? 999) - (sb.dueIn ?? 999) || a.loan!.at - b.loan!.at
  }), [books])
  if (!out.length) return null
  return (
    <section aria-labelledby="loans-h" className="loans">
      <div className="section-head">
        <h2 id="loans-h">Libros <i>prestados</i></h2>
        <span className="eyebrow">{out.length === 1 ? '1 fuera de casa' : `${out.length} fuera de casa`}</span>
      </div>
      <div className="loans-row">
        {out.map((b) => {
          const st = loanState(b.loan!)
          const dims = bookDims(b, small ? 96 : 112)
          return (
            <article key={b.id} className={`loan-item fade-up${st.overdue ? ' overdue' : ''}`}>
              <button className="loan-book" onClick={(e) => onOpen(b, { rect: (e.currentTarget.querySelector('.book3d') as HTMLElement).getBoundingClientRect(), pose: 'tilt' })} aria-label={`Ver ${b.title}`}>
                <div style={{ width: dims.w, height: dims.h, perspective: 600 }}><Book3D book={b} dims={dims} style={{ transform: 'rotateY(-18deg)' }} /></div>
              </button>
              <div className="loan-meta">
                <h3>{b.title}</h3>
                <p className="loan-who">{b.loan!.to}</p>
                <p className={`loan-when${st.overdue ? ' late' : ''}`}>{st.text}</p>
                <div className="loan-acts">
                  <button className="chip" onClick={async () => { await returnBook(b.id); haptic('success'); notify(`«${b.title}» volvió a tu estante`) }}><Check size={13} /> Devuelto</button>
                  <button className="chip" onClick={() => remind(b)}>Recordarle</button>
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
