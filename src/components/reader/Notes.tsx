import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import type { Note, NoteColor } from '../../types'
import type { PageRef } from './pagination'
import { Close, Trash } from '../Icons'

export const NOTE_COLORS: { id: NoteColor; label: string }[] = [
  { id: 'amarillo', label: 'Amarillo' },
  { id: 'rosa', label: 'Rosa' },
  { id: 'verde', label: 'Verde' },
  { id: 'azul', label: 'Azul' },
]

/** Where a note sits on a given page, or null if it belongs elsewhere. */
export function notePosition(note: Note, ref: PageRef): { x: number; y: number } | null {
  if (ref.t === 'pdf') return note.page === ref.i ? { x: note.x, y: note.y } : null
  if (ref.t === 'title') return note.chapter === -1 ? { x: note.x, y: note.y } : null
  if (ref.t !== 'flow' || note.chapter !== ref.c) return null
  const at = note.ratio * ref.n
  const k = Math.min(ref.n - 1, Math.floor(at))
  if (k !== ref.k) return null
  return { x: note.x, y: Math.min(0.96, Math.max(0.04, at - k)) }
}

/** Anchors a click on a page so the note survives re-pagination (font size, screen size). */
export function anchorFor(ref: PageRef, x: number, y: number): Pick<Note, 'chapter' | 'ratio' | 'page' | 'x' | 'y'> | null {
  if (ref.t === 'pdf') return { chapter: 0, ratio: 0, page: ref.i, x, y }
  if (ref.t === 'title') return { chapter: -1, ratio: 0, x, y }
  if (ref.t === 'flow') return { chapter: ref.c, ratio: (ref.k + y) / ref.n, x, y }
  return null
}

export function NotesLayer({ notes, page, onOpen, onMove }: {
  notes: Note[]
  page: PageRef
  onOpen: (n: Note) => void
  onMove: (n: Note, x: number, y: number) => void
}) {
  const here = notes.map((n) => ({ n, pos: notePosition(n, page) })).filter((v) => v.pos)
  if (!here.length) return null
  return (
    <div className="notes-layer">
      {here.map(({ n, pos }) => (
        <NotePin key={n.id} note={n} x={pos!.x} y={pos!.y} onOpen={onOpen} onMove={onMove} />
      ))}
    </div>
  )
}

const clamp = (v: number) => Math.min(0.96, Math.max(0.04, v))

/**
 * A folded post-it on the page. Click opens it; dragging (mouse or finger) moves it
 * anywhere on the same page; arrow keys nudge it when it has keyboard focus.
 */
function NotePin({ note, x, y, onOpen, onMove }: {
  note: Note
  x: number
  y: number
  onOpen: (n: Note) => void
  onMove: (n: Note, x: number, y: number) => void
}) {
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null)
  const start = useRef<{ px: number; py: number; moved: boolean; rect: DOMRect } | null>(null)
  const justDragged = useRef(false)

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    if (e.button !== 0) return
    const layer = e.currentTarget.parentElement
    if (!layer) return
    start.current = { px: e.clientX, py: e.clientY, moved: false, rect: layer.getBoundingClientRect() }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const s = start.current
    if (!s) return
    if (!s.moved && Math.hypot(e.clientX - s.px, e.clientY - s.py) < 5) return
    s.moved = true
    setDrag({ x: clamp((e.clientX - s.rect.left) / s.rect.width), y: clamp((e.clientY - s.rect.top) / s.rect.height) })
  }
  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    const s = start.current
    start.current = null
    if (!s) return
    if (s.moved && drag) {
      justDragged.current = true
      onMove(note, drag.x, drag.y)
      // keep the dragged position on screen until the saved note arrives
      setTimeout(() => setDrag(null), 0)
    }
  }
  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const step = e.shiftKey ? 0.08 : 0.02
    const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
    const v = d[e.key]
    if (!v) return
    e.preventDefault()
    e.stopPropagation()
    onMove(note, clamp(x + v[0]), clamp(y + v[1]))
  }

  const px = drag?.x ?? x
  const py = drag?.y ?? y
  return (
    <button
      className={`note-pin note-${note.color}${drag ? ' is-dragging' : ''}`}
      style={{ left: `${px * 100}%`, top: `${py * 100}%`, rotate: `${((note.id.charCodeAt(0) % 9) - 4) * 1.5}deg` }}
      onClick={(e) => {
        e.stopPropagation()
        if (justDragged.current) { justDragged.current = false; return }
        onOpen(note)
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { start.current = null; setDrag(null) }}
      onKeyDown={onKeyDown}
      aria-label={`Nota: ${note.text.slice(0, 60) || 'nota vacía'}. Enter para abrir, flechas para moverla`}
      title={`${note.text.slice(0, 80)}${note.text.length > 80 ? '…' : ''}\n(Arrastra para moverla)`}
    >
      <span className="note-pin-lines" aria-hidden />
    </button>
  )
}

export function NotePopup({ note, isNew, pageLabel, onSave, onDelete, onClose }: {
  note: Note
  isNew: boolean
  pageLabel: string
  onSave: (n: Note) => void
  onDelete: (n: Note) => void
  onClose: () => void
}) {
  const [text, setText] = useState(note.text)
  const [color, setColor] = useState<NoteColor>(note.color)
  const [confirm, setConfirm] = useState(false)
  const ta = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const t = setTimeout(() => {
      ta.current?.focus()
      const l = ta.current?.value.length ?? 0
      ta.current?.setSelectionRange(l, l)
    }, 80)
    return () => clearTimeout(t)
  }, [])

  const dirty = text !== note.text || color !== note.color
  const close = () => {
    // Closing keeps what was written: a post-it never loses text by accident.
    if (isNew && !text.trim()) { onDelete(note); return }
    if (dirty && text.trim()) onSave({ ...note, text, color, updatedAt: Date.now() })
    onClose()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close() }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); close() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  const date = new Date(note.updatedAt || note.createdAt).toLocaleDateString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="note-root" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
      <motion.div className="note-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close} />
      <motion.div
        className={`note-window note-${color}`}
        role="dialog"
        aria-modal="true"
        aria-label={isNew ? 'Nueva nota' : 'Nota'}
        initial={{ opacity: 0, scale: 0.6, rotate: -6, y: 20 }}
        animate={{ opacity: 1, scale: 1, rotate: -1.2, y: 0 }}
        exit={{ opacity: 0, scale: 0.7, rotate: 4, y: 16 }}
        transition={{ type: 'spring', stiffness: 320, damping: 24 }}
      >
        <span className="note-tape" aria-hidden />
        <header className="note-head">
          <span>{pageLabel}</span>
          <button className="note-x" onClick={close} aria-label="Cerrar nota"><Close size={16} /></button>
        </header>
        <label className="sr-only" htmlFor="note-text">Texto de la nota</label>
        <textarea
          id="note-text"
          ref={ta}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Escribe aquí lo que te dejó esta página…"
          maxLength={2000}
        />
        <footer className="note-foot">
          <div className="note-colors" role="radiogroup" aria-label="Color de la nota">
            {NOTE_COLORS.map((c) => (
              <button
                key={c.id}
                role="radio"
                aria-checked={color === c.id}
                aria-label={c.label}
                className={`note-swatch note-${c.id}`}
                onClick={() => setColor(c.id)}
              />
            ))}
          </div>
          {confirm ? (
            <span className="note-confirm">
              ¿Borrar?
              <button onClick={() => onDelete(note)}>Sí, borrar</button>
              <button onClick={() => setConfirm(false)}>No</button>
            </span>
          ) : (
            <span className="note-actions">
              {!isNew && <button onClick={() => setConfirm(true)} aria-label="Borrar nota" title="Borrar nota"><Trash size={15} /></button>}
              <button className="note-save" onClick={close} disabled={!text.trim()}>{isNew ? 'Pegar nota' : 'Listo'}</button>
            </span>
          )}
        </footer>
        {!isNew && <div className="note-date">Editada {date}</div>}
      </motion.div>
    </div>
  )
}
