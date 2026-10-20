import { useCallback, useEffect, useState } from 'react'
import { motion } from 'motion/react'
import type { Book } from '../types'
import { Check, Close, Pause, Play } from './Icons'

/** A reading session timed by hand, for paper books (and books read in other apps). */
export interface TimerState {
  bookId: string
  /** when the current running stretch began; null while paused */
  since: number | null
  /** milliseconds already counted before `since` */
  acc: number
}

const KEY = 'exl-timer'
const load = (): TimerState | null => {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? 'null'); return v && typeof v.bookId === 'string' ? v : null } catch { return null }
}
const save = (t: TimerState | null) => {
  try { if (t) localStorage.setItem(KEY, JSON.stringify(t)); else localStorage.removeItem(KEY) } catch { /* storage blocked: the timer still works for this visit */ }
}

export const elapsed = (t: TimerState, now = Date.now()) => t.acc + (t.since ? now - t.since : 0)

export function useReadingTimer() {
  const [timer, setTimerRaw] = useState<TimerState | null>(load)
  const set = useCallback((t: TimerState | null) => { setTimerRaw(t); save(t) }, [])
  return {
    timer,
    start: (bookId: string) => set({ bookId, since: Date.now(), acc: 0 }),
    toggle: () => timer && set(timer.since ? { ...timer, since: null, acc: elapsed(timer) } : { ...timer, since: Date.now() }),
    /** stops and returns the seconds read */
    stop: () => { const s = timer ? Math.round(elapsed(timer) / 1000) : 0; set(null); return s },
  }
}

export const clock = (ms: number) => {
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60
  const mm = String(m).padStart(h ? 2 : 1, '0'), ss = String(r).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/** Floating bubble while a session runs: tap the title to see the book, ✓ to note the page. */
export function TimerPill({ timer, book, onToggle, onFinish, onDiscard, onOpen }: {
  timer: TimerState
  book: Book
  onToggle: () => void
  onFinish: () => void
  onDiscard: () => void
  onOpen: () => void
}) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!timer.since) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [timer.since])
  const running = !!timer.since
  return (
    <motion.div
      className={`timer-pill${running ? ' running' : ''}`}
      role="status"
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.96 }}
      transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <button className="tp-book" onClick={onOpen} aria-label={`Ver ${book.title}`}>
        <i style={{ background: book.palette.bg }} aria-hidden />
        <span className="tp-text">
          <span className="tp-time" aria-label={`Tiempo leído ${clock(elapsed(timer, now))}`}>{clock(elapsed(timer, now))}</span>
          <span className="tp-title">{running ? book.title : `En pausa · ${book.title}`}</span>
        </span>
      </button>
      <button className="icon-btn" onClick={onToggle} aria-label={running ? 'Pausar cronómetro' : 'Seguir cronometrando'} title={running ? 'Pausar' : 'Seguir'}>
        {running ? <Pause size={16} /> : <Play size={15} />}
      </button>
      <button className="icon-btn tp-done" onClick={onFinish} aria-label="Terminar sesión y anotar página" title="Terminar y anotar página"><Check size={17} /></button>
      <button className="icon-btn tp-x" onClick={onDiscard} aria-label="Descartar cronómetro" title="Descartar"><Close size={14} /></button>
    </motion.div>
  )
}
