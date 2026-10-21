import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'motion/react'
import type { Book, Progress } from '../../types'
import { useLibrary } from '../../state/library'
import { loadSource, type ReaderSource } from '../../lib/source'
import { useMedia, useViewport } from '../../lib/hooks'
import { buildFlowPages, buildSlots, pageOfSlot, paginate, slotOfPage, textBox, type PageRef, type Pagination } from './pagination'
import { PageView, PdfCache } from './PageView'
import { PdfZoom } from './PdfZoom'
import type { RenderOpts } from '../../lib/pdf'
import { Check, ChevronLeft, ChevronRight, Close, Expand, Highlighter, List, Moon, OnePage, Search, Shrink, StickyNote, Sun, Trash, TwoPages } from '../Icons'
import type { Highlight, Note, NoteColor } from '../../types'
import { NotesLayer, NotePopup, anchorFor, notePosition } from './Notes'
import { uid } from '../../lib/db'
import { MARGIN_K, readingKey } from '../../lib/reading'
import { ReadingPanel } from '../Preferences'
import { haptic } from '../../lib/haptics'

interface Props {
  book: Book
  fromStart: boolean
  onClose: (finishedNow?: boolean) => void
}

type Load = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; src: ReaderSource }

const FONT_STEPS = [0.85, 0.92, 1, 1.1, 1.2, 1.32, 1.46]

export function Reader({ book, fromStart, onClose }: Props) {
  const { settings, updateSettings, saveProgress, patchBook, addHistory, notify } = useLibrary()
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const vp = useViewport()
  const reduce = useMedia('(prefers-reduced-motion: reduce)')

  useEffect(() => {
    let live = true
    let src: ReaderSource | undefined
    loadSource(book)
      .then((s) => { src = s; if (live) setLoad({ state: 'ready', src: s }); else s.dispose() })
      .catch((e) => live && setLoad({ state: 'error', message: e?.message || 'No se pudo abrir el libro.' }))
    return () => { live = false; src?.dispose() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id])

  // Keep the screen awake while reading, where the browser allows it.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | undefined
    ;(navigator as Navigator & { wakeLock?: { request: (t: string) => Promise<typeof lock> } }).wakeLock?.request('screen').then((l) => { lock = l }).catch(() => {})
    return () => { lock?.release().catch(() => {}) }
  }, [])

  return (
    <motion.div
      className={`reader${settings.night ? ' night' : ''}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduce ? 0.01 : 0.45 }}
      role="dialog"
      aria-modal="true"
      aria-label={`Leyendo ${book.title}`}
    >
      {load.state === 'ready' ? (
        <ReaderBody
          key={book.id}
          book={book}
          src={load.src}
          vp={vp}
          reduce={reduce}
          fromStart={fromStart}
          onClose={onClose}
          settings={settings}
          updateSettings={updateSettings}
          saveProgress={saveProgress}
          patchBook={patchBook}
          addHistory={addHistory}
          notify={notify}
        />
      ) : (
        <>
          <div className="reader-bar">
            <button className="icon-btn" onClick={() => onClose()} aria-label="Volver a la biblioteca"><ChevronLeft /></button>
            <div className="ttl"><b>{book.title}</b><span>{book.author}</span></div>
            <span style={{ width: 38 }} />
          </div>
          <div className="reader-stage">
            {load.state === 'loading' ? (
              <div className="loading-book" role="status">
                <div className="ribbon"><i /><i /><i /></div>
                <span>Preparando las páginas…</span>
              </div>
            ) : (
              <div className="error-card" role="alert">
                <h3>No pudimos abrir este libro</h3>
                <p>{load.message}</p>
                <button className="btn" onClick={() => onClose()}><ChevronLeft size={16} /> Volver a la biblioteca</button>
              </div>
            )}
          </div>
        </>
      )}
    </motion.div>
  )
}

type Lib = ReturnType<typeof useLibrary>

function ReaderBody({ book, src, vp, reduce, fromStart, onClose, settings, updateSettings, saveProgress, patchBook, addHistory, notify }: {
  book: Book
  src: ReaderSource
  vp: { w: number; h: number }
  reduce: boolean
  fromStart: boolean
  onClose: (finishedNow?: boolean) => void
  settings: Lib['settings']
  updateSettings: Lib['updateSettings']
  saveProgress: Lib['saveProgress']
  patchBook: Lib['patchBook']
  addHistory: Lib['addHistory']
  notify: Lib['notify']
}) {
  const { setStatus } = useLibrary()
  const [readPop, setReadPop] = useState(false)
  const isPdf = src.kind === 'pdf'
  // PDF: scanned books get their margins trimmed, two-page scans split and a little more contrast, unless the reader says otherwise
  const scanned = src.kind === 'pdf' && src.scanned
  const pv = { trim: book.pdfView?.trim ?? scanned, split: book.pdfView?.split ?? scanned, sharp: book.pdfView?.sharp ?? scanned }
  const setPv = (patch: Partial<typeof pv>) => patchBook(book.id, { pdfView: { ...pv, ...patch } })
  const hasSpreads = src.kind === 'pdf' && src.aspects.some((a) => a > 1.15)
  const pdfFitted = isPdf && (pv.trim || (pv.split && hasSpreads))
  const closeWith = () => onClose(session.current.finished)
  // Two facing pages need room; on narrow screens the reader always shows one page.
  const canSpread = vp.w >= 760 && vp.h >= 520 && vp.w / vp.h > 0.9
  const pageMode = settings.pageMode ?? 'auto'
  const spread = pageMode === 'una' ? false : pageMode === 'dos' ? canSpread : vp.w >= 900 && vp.w / vp.h > 1.05
  const togglePageMode = () => {
    if (flipping.current) return
    if (!canSpread) { notify('La vista de dos páginas necesita una pantalla más ancha.', 'error'); return }
    updateSettings({ pageMode: spread ? 'una' : 'dos' })
  }

  // ---- page geometry ----
  const geom = useMemo(() => {
    const availW = vp.w - (spread ? 120 : 24)
    const narrow = vp.w < 600
    // on phones the title sits on its own row under the tools, so the bar is taller
    const short = vp.h < 500 // phone held sideways: the bars are slimmer
    const availH = vp.h - (narrow ? 150 : short ? 92 : 128)
    if (isPdf && pdfFitted) {
      // trimmed or split pages change shape page to page: give them all the room and fit each one inside
      const pageH = Math.max(200, availH)
      const pageW = spread ? Math.min(availW / 2, pageH * 0.85) : Math.min(availW, 1100)
      return { pageW: Math.floor(pageW), pageH: Math.floor(pageH) }
    }
    if (isPdf && src.kind === 'pdf') {
      const a = src.aspect
      let pageH = Math.min(availH, (spread ? availW / 2 : availW) / a)
      pageH = Math.max(200, pageH)
      return { pageW: Math.floor(pageH * a), pageH: Math.floor(pageH) }
    }
    if (spread) {
      const a = 0.68
      const pageH = Math.min(availH, availW / 2 / a, 920)
      return { pageW: Math.floor(pageH * a), pageH: Math.floor(pageH) }
    }
    const pageW = Math.min(availW, 560)
    // phones are tall and narrow: let the page use that height instead of leaving empty bands
    const pageH = Math.min(availH, pageW / (narrow ? 0.48 : 0.56))
    return { pageW: Math.floor(pageW), pageH: Math.floor(pageH) }
  }, [vp.w, vp.h, spread, isPdf, src, pdfFitted])

  // a new reading look (font, spacing, margins, alignment) is a new text box, so the book is paginated again
  const rKey = readingKey(settings.reading)
  const box = useMemo(() => textBox(geom.pageW, geom.pageH, isPdf ? 1 : settings.fontScale, MARGIN_K[settings.reading?.margins ?? 'normal']),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [geom, settings.fontScale, isPdf, rKey])

  // ---- pagination ----
  // Pagination belongs to one text box: when the layout changes, stale page lists are ignored
  // until the new ones arrive, so the reading position is never computed against the wrong pages.
  const [paginated, setPaginated] = useState<{ box: typeof box; p: Pagination } | null>(null)
  const pagination = paginated && paginated.box === box ? paginated.p : null
  const counts = pagination?.counts ?? null
  useEffect(() => {
    if (src.kind !== 'flow') return
    const sig = { cancelled: false }
    paginate(src.chapters, box, sig).then((c) => c && setPaginated({ box, p: c }))
    return () => { sig.cancelled = true }
  }, [src, box])

  const pages: PageRef[] = useMemo(() => {
    if (src.kind === 'pdf') return src.aspects.flatMap((a, i): PageRef[] => (pv.split && a > 1.15 ? [{ t: 'pdf', i, h: 0 }, { t: 'pdf', i, h: 1 }] : [{ t: 'pdf', i }]))
    return counts ? buildFlowPages(counts) : []
  }, [src, counts, pv.split])
  const slots = useMemo(() => buildSlots(pages, spread), [pages, spread])
  // Flowing books: once paginated, record the real page count for the preview card.
  useEffect(() => {
    if (src.kind === 'flow' && pages.length && settings.fontScale === 1 && book.pages !== pages.length) patchBook(book.id, { pages: pages.length })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages.length])
  const total = pages.length
  const step = spread ? 2 : 1

  const pdfCache = useMemo(() => (src.kind === 'pdf' ? new PdfCache(src.doc) : null), [src])
  useEffect(() => () => pdfCache?.dispose(), [pdfCache])

  // ---- position (kept as chapter + ratio so it survives re-pagination) ----
  const loc = useRef<{ chapter: number; ratio: number; page: number } | null>(null)
  if (loc.current === null) {
    const p = book.progress
    loc.current = fromStart || !p ? { chapter: 0, ratio: 0, page: 0 } : { chapter: p.chapter, ratio: p.ratio, page: Math.max(0, p.page - 1) }
    if (fromStart || !p) loc.current.chapter = -1 // title page
  }
  const [slot, setSlot] = useState(0)
  const [ready, setReady] = useState(false)

  const pageFromLoc = useCallback(() => {
    const l = loc.current!
    if (src.kind === 'pdf') {
      // PDF position = page of the file (+ which half of a spread), so it survives splitting on and off
      const at = pages.findIndex((p) => p.t === 'pdf' && p.i === l.page && (p.h ?? 0) === (l.ratio >= 0.5 ? 1 : 0))
      const any = pages.findIndex((p) => p.t === 'pdf' && p.i >= l.page)
      return Math.min(Math.max(0, at >= 0 ? at : any >= 0 ? any : l.page), total - 1)
    }
    if (l.chapter < 0) return 0
    const start = pages.findIndex((p) => p.t === 'flow' && p.c === l.chapter)
    if (start < 0) return 0
    const n = (pages[start] as Extract<PageRef, { t: 'flow' }>).n
    return Math.min(start + Math.round(l.ratio * n), start + n - 1)
  }, [pages, src.kind, total])

  // place the reader whenever pagination or layout changes
  useEffect(() => {
    if (!total) return
    setSlot(slotOfPage(pageFromLoc(), spread))
    setReady(true)
  }, [total, spread, pageFromLoc])

  const currentPage = useMemo(() => {
    const p = pageOfSlot(slot, spread)
    return Math.min(Math.max(0, p < 0 ? 0 : p), Math.max(0, total - 1))
  }, [slot, spread, total])

  // update loc from the page actually shown
  useEffect(() => {
    if (!ready) return
    const ref = pages[currentPage]
    if (!ref) return
    if (ref.t === 'flow') loc.current = { chapter: ref.c, ratio: ref.k / ref.n, page: currentPage }
    else if (ref.t === 'pdf') loc.current = { chapter: 0, ratio: ref.h ? 0.5 : 0, page: ref.i }
    else loc.current = { chapter: -1, ratio: 0, page: 0 }
  }, [currentPage, pages, ready])

  // ---- saving progress ----
  const [savedAt, setSavedAt] = useState(0)
  const session = useRef({ start: Date.now(), from: -1, to: 0, finished: false })
  const atEnd = ready && slot + step >= slots.length
  useEffect(() => {
    if (!ready || !total) return
    const shown = pages[currentPage]?.t === 'pdf' ? (pages[currentPage] as Extract<PageRef, { t: 'pdf' }>).i + 1 : currentPage + 1
    if (session.current.from < 0) session.current.from = shown
    session.current.to = Math.max(session.current.to, shown)
    const t = setTimeout(async () => {
      const l = loc.current!
      const shownLast = spread ? Math.min(total, currentPage + 2) : currentPage + 1
      const percent = atEnd ? 1 : shownLast / total
      const p: Progress = {
        chapter: Math.max(0, l.chapter), ratio: l.chapter < 0 ? 0 : l.ratio,
        page: src.kind === 'pdf' ? l.page + 1 : currentPage + 1,
        total: src.kind === 'pdf' ? src.numPages : total, percent, updatedAt: Date.now(),
      }
      await saveProgress(book.id, p)
      setSavedAt(Date.now())
      if (atEnd && !session.current.finished && book.status !== 'terminado') {
        session.current.finished = true
        setStatus(book.id, 'terminado')
        haptic('success')
        await addHistory({ bookId: book.id, title: book.title, author: book.author, type: 'terminado', at: Date.now(), total })
        notify(`Terminaste «${book.title}»`)
      }
    }, 650)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, ready, total])

  useEffect(() => {
    const updates: Partial<Book> = { lastOpenedAt: Date.now() }
    if (!book.startedAt) updates.startedAt = Date.now()
    if (src.kind === 'pdf' && book.pages !== src.numPages) updates.pages = src.numPages
    patchBook(book.id, updates)
    // opening a pending (or previously abandoned) book starts it; it also leaves the reading queue
    if (book.status === 'pendiente' || book.status === 'abandonado') setStatus(book.id, 'leyendo')
    return () => {
      const s = session.current
      const seconds = Math.round((Date.now() - s.start) / 1000)
      const minutes = Math.round(seconds / 60)
      if (s.from > 0 && (s.to > s.from || seconds >= 30)) {
        addHistory({ bookId: book.id, title: book.title, author: book.author, type: 'sesion', at: Date.now(), fromPage: s.from, toPage: s.to, total: src.kind === 'pdf' ? src.numPages : total, minutes, seconds })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- flipping ----
  const angle = useMotionValue(0)
  const [flip, setFlip] = useState<{ dir: 1 | -1 } | null>(null)
  const flipping = useRef(false)
  const [fade, setFade] = useState(0)

  const canNext = slot + step < slots.length
  const canPrev = slot - step >= 0

  const go = useCallback((dir: 1 | -1) => {
    if (flipping.current) return
    if (dir > 0 ? !canNext : !canPrev) return
    if (reduce) {
      setSlot((s) => s + dir * step)
      setFade((f) => f + 1)
      return
    }
    flipping.current = true
    setFlip({ dir })
    angle.set(dir > 0 ? 0 : -180)
    animate(angle, dir > 0 ? -180 : 0, { duration: spread ? 0.78 : 0.6, ease: [0.36, 0.08, 0.22, 1] }).then(() => {
      setSlot((s) => s + dir * step)
      setFlip(null)
      angle.set(0)
      flipping.current = false
    })
  }, [canNext, canPrev, reduce, step, angle, spread])

  const jumpToPage = useCallback((p: number) => {
    const s = slotOfPage(Math.min(Math.max(0, p), total - 1), spread)
    setSlot(s)
    setFade((f) => f + 1)
  }, [total, spread])

  // keyboard
  const [tocOpen, setTocOpen] = useState(false)
  const [zoom, setZoom] = useState<{ page: number; scale: number; focus?: { x: number; y: number } } | null>(null)
  const [panelTab, setPanelTab] = useState<'indice' | 'notas' | 'subrayados'>('indice')

  // ---- post-it notes ----
  const notes = book.notes ?? []

  // ---- paragraph highlights ----
  const highlights = book.highlights ?? []
  const [marking, setMarking] = useState(false)
  const [markColor, setMarkColor] = useState<NoteColor>('amarillo')
  const [hoverBlock, setHoverBlock] = useState<{ c: number; b: number } | null>(null)
  // The spread ignores pointer events (so edge clicks reach the page-turn zones), so paragraphs are
  // found geometrically: a block counts only where its fragment is visible inside its page window.
  const blockAt = (x: number, y: number) => {
    for (const vp of Array.from(document.querySelectorAll<HTMLElement>('.reader .slot .page-viewport'))) {
      const v = vp.getBoundingClientRect()
      if (x < v.left || x > v.right || y < v.top || y > v.bottom) continue
      const flow = vp.querySelector<HTMLElement>('.flow')
      if (!flow || flow.dataset.c == null) continue
      let best: HTMLElement | null = null
      for (const el of Array.from(flow.querySelectorAll<HTMLElement>('[data-b]'))) {
        for (const r of Array.from(el.getClientRects())) {
          if (x >= r.left - 6 && x <= r.right + 6 && y >= r.top - 2 && y <= r.bottom + 2) best = el
        }
      }
      if (best) return { c: Number(flow.dataset.c), b: Number(best.dataset.b), el: best }
    }
    return null
  }
  const toggleHighlight = (x: number, y: number) => {
    const hit = blockAt(x, y)
    if (!hit) { notify('Toca sobre un párrafo del texto para subrayarlo.', 'error'); return }
    const list = book.highlights ?? []
    const existing = list.find((h) => h.chapter === hit.c && h.block === hit.b)
    if (existing && existing.color === markColor) {
      patchBook(book.id, { highlights: list.filter((h) => h.id !== existing.id) })
      notify('Subrayado quitado')
      return
    }
    const text = (hit.el.textContent ?? '').replace(/\s+/g, ' ').trim()
    const h: Highlight = existing
      ? { ...existing, color: markColor }
      : { id: uid(), chapter: hit.c, block: hit.b, color: markColor, text: text.slice(0, 600), createdAt: Date.now() }
    patchBook(book.id, { highlights: [...list.filter((x) => x.id !== h.id), h] })
    if (!existing) notify('Párrafo subrayado')
  }
  const removeHighlight = (h: Highlight) => {
    patchBook(book.id, { highlights: (book.highlights ?? []).filter((x) => x.id !== h.id) })
  }
  const pageOfHighlight = (h: Highlight) => {
    const start = pages.findIndex((p) => p.t === 'flow' && p.c === h.chapter)
    if (start < 0) return 0
    return start + (pagination?.blockPage[h.chapter]?.[h.block] ?? 0)
  }
  // Highlights are painted with one generated stylesheet, so the chapter HTML never re-renders.
  const highlightCss = useMemo(() => {
    const rules = highlights.map((h) => `.flow[data-c="${h.chapter}"] [data-b="${h.block}"]{--hl:var(--hl-${h.color})}`)
    if (marking && hoverBlock) rules.push(`.flow[data-c="${hoverBlock.c}"] [data-b="${hoverBlock.b}"]{outline:2px dashed var(--hl-${markColor}-line);outline-offset:3px;border-radius:2px}`)
    return rules.join('\n')
  }, [highlights, marking, hoverBlock, markColor])
  const [placing, setPlacing] = useState(false)
  const [openNote, setOpenNote] = useState<{ note: Note; isNew: boolean } | null>(null)
  const saveNote = (n: Note) => {
    const rest = (book.notes ?? []).filter((x) => x.id !== n.id)
    patchBook(book.id, { notes: [...rest, n] })
  }
  const deleteNote = (n: Note, silent = false) => {
    const had = (book.notes ?? []).some((x) => x.id === n.id)
    patchBook(book.id, { notes: (book.notes ?? []).filter((x) => x.id !== n.id) })
    setOpenNote(null)
    if (had && !silent) notify('Nota borrada')
  }
  const placeNote = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - r.left
    const py = e.clientY - r.top
    const onRight = spread && px > r.width / 2
    const slotIndex = spread ? slot + (onRight ? 1 : 0) : slot
    const ref = slots[slotIndex]
    const pageX = spread ? (onRight ? px - r.width / 2 : px) : px
    const x = Math.min(0.94, Math.max(0.06, pageX / (spread ? r.width / 2 : r.width)))
    const y = Math.min(0.95, Math.max(0.05, py / r.height))
    const a = ref && anchorFor(ref, x, y)
    setPlacing(false)
    if (!a) { notify('Esa página está en blanco. Pega la nota sobre una página con contenido.', 'error'); return }
    const now = Date.now()
    const n: Note = { id: uid(), ...a, text: '', color: 'amarillo', createdAt: now, updatedAt: now }
    saveNote(n)
    setOpenNote({ note: n, isNew: true })
  }
  const moveNote = (n: Note, ref: PageRef, x: number, y: number) => {
    const a = anchorFor(ref, x, y)
    if (!a) return
    saveNote({ ...n, ...a, updatedAt: Date.now() })
  }
  const pageOfNote = (n: Note) => {
    const idx = pages.findIndex((p) => !!notePosition(n, p))
    return idx < 0 ? 0 : idx
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (openNote || zoom || tag === 'TEXTAREA') return
      if (tag === 'INPUT' && (e.target as HTMLInputElement).type !== 'range') return
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || (e.key === ' ' && tag !== 'BUTTON')) { e.preventDefault(); go(1) }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(-1) }
      else if (e.key === 'Home') jumpToPage(0)
      else if (e.key === 'End') jumpToPage(total - 1)
      else if ((e.key === 'n' || e.key === 'N') && !e.metaKey && !e.ctrlKey && !openNote) { e.preventDefault(); setMarking(false); setPlacing((v) => !v) }
      else if ((e.key === 'v' || e.key === 'V') && !e.metaKey && !e.ctrlKey && !openNote) { e.preventDefault(); togglePageMode() }
      else if ((e.key === 'z' || e.key === 'Z') && isPdf && !e.metaKey && !e.ctrlKey) { e.preventDefault(); openZoom(1) }
      else if ((e.key === 's' || e.key === 'S') && !e.metaKey && !e.ctrlKey && !openNote && !isPdf) { e.preventDefault(); setPlacing(false); setMarking((v) => !v) }
      else if (e.key === 'Escape') { if (marking) setMarking(false); else if (placing) setPlacing(false); else if (tocOpen) setTocOpen(false); else if (!document.fullscreenElement) closeWith() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, jumpToPage, total, tocOpen, closeWith, placing, openNote, marking, isPdf, togglePageMode, zoom])

  // PDF zoom: a pannable, pinchable view of one page
  const openZoom = (scale = 1, at?: { clientX: number; clientY: number }) => {
    if (!isPdf || !total) return
    setTocOpen(false); setPlacing(false)
    // in a spread, zoom into the page that was tapped
    let page = currentPage
    if (spread && at && at.clientX > vp.w / 2 && currentPage + 1 < total) page = currentPage + 1
    setZoom({ page, scale, focus: at ? { x: at.clientX / vp.w, y: at.clientY / vp.h } : undefined })
  }

  // swipe (and, on PDFs, double tap or pinch to zoom)
  const touch = useRef<{ x: number; y: number; t: number } | null>(null)
  const pointers = useRef(new Set<number>())
  const lastTap = useRef(0)
  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.add(e.pointerId)
    if (isPdf && pointers.current.size === 2) { touch.current = null; pointers.current.clear(); openZoom(1); return }
    if (e.pointerType === 'mouse') return
    touch.current = { x: e.clientX, y: e.clientY, t: Date.now() }
  }
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    const t = touch.current
    touch.current = null
    if (!t) return
    const dx = e.clientX - t.x, dy = e.clientY - t.y
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.3 && Date.now() - t.t < 800) { go(dx < 0 ? 1 : -1); return }
    if (isPdf && Math.hypot(dx, dy) < 10) {
      const now = Date.now()
      if (now - lastTap.current < 320) { lastTap.current = 0; openZoom(2.5, e) }
      else lastTap.current = now
    }
  }

  // idle chrome
  const [idle, setIdle] = useState(false)
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    const wake = () => { setIdle(false); clearTimeout(t); t = setTimeout(() => setIdle(true), 3800) }
    wake()
    window.addEventListener('mousemove', wake)
    window.addEventListener('keydown', wake)
    window.addEventListener('pointerdown', wake)
    return () => { clearTimeout(t); window.removeEventListener('mousemove', wake); window.removeEventListener('keydown', wake); window.removeEventListener('pointerdown', wake) }
  }, [])

  // fullscreen
  const [fs, setFs] = useState(!!document.fullscreenElement)
  useEffect(() => {
    const on = () => setFs(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])
  const toggleFs = () => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    else document.documentElement.requestFullscreen?.().catch(() => notify('Este navegador no permite pantalla completa aquí', 'error'))
  }
  useEffect(() => () => { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}) }, [])

  // ---- render helpers ----
  const chapters = src.kind === 'flow' ? src.chapters : undefined
  const pdfOpts = useCallback((ref: Extract<PageRef, { t: 'pdf' }>): RenderOpts => ({ trim: pv.trim, half: ref.h }), [pv.trim])
  const pdf = src.kind === 'pdf' && pdfCache ? { doc: src.doc, cache: pdfCache, opts: pdfOpts, sharp: pv.sharp } : undefined
  const numberOf = (slotIndex: number) => {
    const p = pageOfSlot(slotIndex, spread)
    const ref = slots[slotIndex]
    if (!ref || ref.t === 'blank' || ref.t === 'title') return undefined
    return p + 1
  }
  const renderSlot = (i: number, side: 'l' | 'r' | 's') => {
    const ref: PageRef = slots[i] ?? { t: 'blank' }
    const key = ref.t === 'flow' ? `f${ref.c}-${ref.k}` : ref.t === 'pdf' ? `p${ref.i}` : `${ref.t}${i}`
    return (
      <div key={key} className="page-wrap">
        <PageView page={ref} side={side} book={book} chapters={chapters} box={box} number={numberOf(i)} pdf={pdf} />
        {notes.length > 0 && <NotesLayer notes={notes} page={ref} onOpen={(n) => setOpenNote({ note: n, isNew: false })} onMove={(n, x, y) => moveNote(n, ref, x, y)} />}
      </div>
    )
  }

  // pre-render neighbouring PDF pages
  useEffect(() => {
    if (!pdfCache) return
    for (let d = -2; d <= 4; d++) {
      const p = currentPage + d
      const ref = pages[p]
      if (ref?.t === 'pdf') pdfCache.get(ref.i, box.pageW, pdfOpts(ref))
    }
  }, [currentPage, pdfCache, total, box.pageW, pages, pdfOpts])

  const shadeFront = useTransform(angle, (a) => Math.sin((Math.abs(a) * Math.PI) / 180) * 0.32)
  const shadeBack = useTransform(angle, (a) => Math.sin((Math.abs(a) * Math.PI) / 180) * 0.22)
  const castShadow = useTransform(angle, (a) => Math.sin((Math.abs(a) * Math.PI) / 180) * 0.5)

  // Which pages sit under the turning leaf
  let underL: number, underR: number, leafFront = -1, leafBack = -1
  if (spread) {
    if (flip?.dir === 1) { underL = slot; underR = slot + 3; leafFront = slot + 1; leafBack = slot + 2 }
    else if (flip?.dir === -1) { underL = slot - 2; underR = slot + 1; leafFront = slot - 1; leafBack = slot }
    else { underL = slot; underR = slot + 1 }
  } else {
    if (flip?.dir === 1) { underL = -1; underR = slot + 1; leafFront = slot }
    else if (flip?.dir === -1) { underL = -1; underR = slot; leafFront = slot - 1 }
    else { underL = -1; underR = slot }
  }

  const curRef = pages[currentPage]
  const curChapter = curRef?.t === 'flow' ? curRef.c : -1
  const chapterTitle = chapters && curChapter >= 0 ? chapters[curChapter].title : isPdf ? `PDF · ${total} páginas` : 'Portada'
  const spreadW = spread ? geom.pageW * 2 : geom.pageW
  const shownLast = spread ? Math.min(total, currentPage + (slots[slot]?.t === 'blank' ? 1 : 2)) : currentPage + 1
  const pageLabel = spread && shownLast > currentPage + 1 ? `Páginas ${currentPage + 1}–${shownLast} de ${total}` : `Página ${currentPage + 1} de ${total}`
  const percent = total ? Math.round((atEnd ? 1 : shownLast / total) * 100) : 0
  const fontIdx = FONT_STEPS.findIndex((f) => Math.abs(f - settings.fontScale) < 0.001)

  const tocItems = useMemo(() => {
    if (src.kind === 'pdf') return src.toc.map((t) => ({ ...t, page: t.target }))
    if (!pages.length) return []
    return src.toc.map((t) => ({ ...t, page: Math.max(0, pages.findIndex((p) => p.t === 'flow' && p.c === t.target)) }))
  }, [src, pages])
  const activeToc = useMemo(() => {
    let best = -1
    tocItems.forEach((t, i) => { if (t.page <= currentPage) best = i })
    return best
  }, [tocItems, currentPage])

  const [savedVisible, setSavedVisible] = useState(false)
  useEffect(() => {
    if (!savedAt) return
    setSavedVisible(true)
    const t = setTimeout(() => setSavedVisible(false), 1800)
    return () => clearTimeout(t)
  }, [savedAt])

  return (
    <>
      <div className={`reader-bar${idle && !tocOpen && !flip ? ' is-idle' : ''}`} style={{ opacity: idle && !tocOpen ? 0 : 1 }}>
        <button className="icon-btn hide-sm" onClick={closeWith} aria-label="Volver a la biblioteca" title="Volver a la biblioteca (Esc)"><ChevronLeft /></button>
        <button className="icon-btn" onClick={() => setTocOpen((v) => !v)} aria-pressed={tocOpen} aria-label="Índice y notas" title="Índice y notas"><List /></button>
        <button className="icon-btn" onClick={() => { if (isPdf) { notify('El subrayado de párrafos funciona en EPUB y libros de texto; en PDF usa las notas.', 'error'); return } setPlacing(false); setMarking((v) => !v) }} aria-pressed={marking} aria-label={marking ? 'Terminar de subrayar' : 'Subrayar párrafos'} title="Subrayar párrafos (S)"><Highlighter /></button>
        <button className="icon-btn" onClick={() => { setMarking(false); setPlacing((v) => !v) }} aria-pressed={placing} aria-label={placing ? 'Cancelar nota' : 'Pegar un post-it'} title="Pegar un post-it (N)"><StickyNote /></button>
        <div className="ttl"><b>{book.title}</b><span>{chapterTitle}</span></div>
        <div className="reader-tools">
          {isPdf ? (
            <button className="icon-btn" onClick={() => openZoom(1)} aria-label="Ampliar la página" title="Ampliar la página (Z) · también doble toque o pellizco"><Search /></button>
          ) : (
          <div className="font-ctl" role="group" aria-label="Tamaño de letra" title="Tamaño de letra">
            <button disabled={fontIdx <= 0} onClick={() => updateSettings({ fontScale: FONT_STEPS[Math.max(0, fontIdx - 1)] })} aria-label="Reducir letra" style={{ fontSize: 12 }}>A</button>
            <button disabled={fontIdx >= FONT_STEPS.length - 1} onClick={() => updateSettings({ fontScale: FONT_STEPS[Math.min(FONT_STEPS.length - 1, (fontIdx < 0 ? 2 : fontIdx) + 1)] })} aria-label="Aumentar letra" style={{ fontSize: 17 }}>A</button>
          </div>
          )}
          <button className="icon-btn aa-btn" onClick={() => setReadPop((v) => !v)} aria-pressed={readPop} aria-label="Ajustes de lectura" title={isPdf ? 'Cómo se ve el PDF' : 'Letra, interlineado, márgenes y color de página'}>Aa</button>
          <button className="icon-btn" onClick={() => updateSettings({ night: !settings.night })} aria-pressed={settings.night} aria-label={settings.night ? 'Modo día' : 'Modo nocturno'} title="Modo nocturno">
            {settings.night ? <Sun /> : <Moon />}
          </button>
          {canSpread && (
            <button className="icon-btn" onClick={togglePageMode} aria-label={spread ? 'Ver una página' : 'Ver dos páginas'} title={spread ? 'Ver una página (V)' : 'Ver dos páginas (V)'}>
              {spread ? <OnePage /> : <TwoPages />}
            </button>
          )}
          <button className="icon-btn hide-sm" onClick={toggleFs} aria-label={fs ? 'Salir de pantalla completa' : 'Pantalla completa'} title="Pantalla completa">{fs ? <Shrink /> : <Expand />}</button>
          <button className="icon-btn" onClick={closeWith} aria-label="Cerrar libro"><Close /></button>
        </div>
      </div>

      <AnimatePresence>
        {readPop && (
          <>
            <motion.div className="read-pop-back" onClick={() => setReadPop(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            <motion.div className="read-pop" role="dialog" aria-label="Ajustes de lectura" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <div className="rp-head"><b>{isPdf ? 'Cómo se ve el PDF' : 'Ajustes de lectura'}</b><button className="icon-btn" onClick={() => setReadPop(false)} aria-label="Cerrar ajustes de lectura"><Close size={16} /></button></div>
              {isPdf ? (
                <div className="pdf-opts">
                  {scanned && <p className="hint">Es un libro escaneado: sus páginas son fotos. Estas opciones ayudan a leerlo en pantalla.</p>}
                  <label className="check"><input type="checkbox" checked={pv.trim} onChange={(e) => setPv({ trim: e.target.checked })} /> <span><b>Recortar márgenes</b><em>Quita el blanco y los bordes oscuros del escaneo para que el texto se vea más grande.</em></span></label>
                  {hasSpreads && <label className="check"><input type="checkbox" checked={pv.split} onChange={(e) => setPv({ split: e.target.checked })} /> <span><b>Separar hojas dobles</b><em>Las fotos con dos páginas se leen como dos páginas.</em></span></label>}
                  <label className="check"><input type="checkbox" checked={pv.sharp} onChange={(e) => setPv({ sharp: e.target.checked })} /> <span><b>Escaneo más nítido</b><em>Más contraste: fondo más claro y letra más oscura.</em></span></label>
                  <button className="btn small-btn" onClick={() => { setReadPop(false); openZoom(1) }}><Search size={14} /> Ampliar la página</button>
                </div>
              ) : <ReadingPanel compact />}
            </motion.div>
          </>
        )}
      </AnimatePresence>
      {zoom && pdfCache && (
        <PdfZoom
          cache={pdfCache}
          pages={pages}
          start={zoom.page}
          startScale={zoom.scale}
          focus={zoom.focus}
          opts={pdfOpts}
          sharp={pv.sharp}
          onClose={(p) => { setZoom(null); if (p !== currentPage) jumpToPage(p) }}
        />
      )}
      <style>{highlightCss}</style>
      <div className="reader-stage" onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={(e) => pointers.current.delete(e.pointerId)} onDoubleClick={(e) => isPdf && openZoom(2.5, e)}>
        {!ready || !total ? (
          <div className="loading-book" role="status"><div className="ribbon"><i /><i /><i /></div><span>Componiendo páginas…</span></div>
        ) : (
          <motion.div
            key={fade}
            className={`spread${spread ? '' : ' single'}${flip ? ' flipping' : ''}`}
            style={{ width: spreadW, height: geom.pageH }}
            initial={fade ? { opacity: 0.35 } : false}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25 }}
          >
            <div className="book-shadow" />
            {spread && <div className="slot l" style={{ width: geom.pageW }}>{renderSlot(underL, 'l')}</div>}
            <div className="slot r" style={{ width: geom.pageW, ...(spread ? {} : { left: 0, borderRadius: 4 }) }}>
              {renderSlot(underR, spread ? 'r' : 's')}
              {flip && <motion.div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: castShadow, background: flip.dir > 0 ? 'linear-gradient(90deg, rgba(0,0,0,.35), transparent 40%)' : 'linear-gradient(90deg, rgba(0,0,0,.25), transparent 30%)' }} />}
            </div>
            {flip && (
              <motion.div
                className="leaf"
                style={{ left: spread ? geom.pageW : 0, width: geom.pageW, rotateY: angle, transformOrigin: 'left center' }}
              >
                <div className="leaf-face front">
                  {renderSlot(leafFront, spread ? 'r' : 's')}
                  <motion.div className="leaf-shade" style={{ opacity: shadeFront, background: 'linear-gradient(90deg, rgba(0,0,0,.05), rgba(0,0,0,.5))' }} />
                </div>
                <div className="leaf-face back">
                  {spread ? renderSlot(leafBack, 'l') : <div className="page page-blank single-page" />}
                  <motion.div className="leaf-shade" style={{ opacity: shadeBack, background: 'linear-gradient(270deg, rgba(0,0,0,.05), rgba(0,0,0,.4))' }} />
                </div>
              </motion.div>
            )}
            {marking && !flip && (
              <div
                className="place-layer mark-layer"
                onClick={(e) => toggleHighlight(e.clientX, e.clientY)}
                onMouseMove={(e) => { const h = blockAt(e.clientX, e.clientY); setHoverBlock((cur) => (h ? (cur?.c === h.c && cur?.b === h.b ? cur : { c: h.c, b: h.b }) : null)) }}
                onMouseLeave={() => setHoverBlock(null)}
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
                role="button"
                aria-label="Toca un párrafo para subrayarlo"
              />
            )}
            {placing && !flip && (
              <div className="place-layer" onClick={placeNote} onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()} role="button" aria-label="Elige dónde pegar la nota" />
            )}
          </motion.div>
        )}

        <AnimatePresence>
          {marking && (
            <motion.div className="place-hint" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} role="status">
              <Highlighter size={16} /> <span>Toca un párrafo<span className="hide-sm"> para subrayarlo</span></span>
              <span className="mark-colors" role="radiogroup" aria-label="Color del subrayado">
                {(['amarillo', 'rosa', 'verde', 'azul'] as NoteColor[]).map((c) => (
                  <button key={c} role="radio" aria-checked={markColor === c} aria-label={c} className={`note-swatch note-${c}`} onClick={() => setMarkColor(c)} />
                ))}
              </span>
              <button onClick={() => setMarking(false)}>Listo</button>
            </motion.div>
          )}
          {placing && (
            <motion.div className="place-hint" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} role="status">
              <StickyNote size={16} /> <span>Toca<span className="hide-sm"> el lugar de la página</span> donde quieres pegar la nota</span>
              <button onClick={() => setPlacing(false)}>Cancelar</button>
            </motion.div>
          )}
        </AnimatePresence>

        <button className="nav-zone prev" onClick={() => go(-1)} disabled={!canPrev} aria-label="Página anterior"><ChevronLeft size={28} /></button>
        <button className="nav-zone next" onClick={() => go(1)} disabled={!canNext} aria-label="Página siguiente"><ChevronRight size={28} /></button>

        <AnimatePresence>
          {tocOpen && (
            <motion.aside
              className="panel"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'tween', duration: reduce ? 0.01 : 0.32, ease: [0.2, 0.8, 0.2, 1] }}
              aria-label="Tabla de contenidos"
            >
              <header>
                <div className="panel-tabs" role="tablist">
                  <button role="tab" aria-selected={panelTab === 'indice'} onClick={() => setPanelTab('indice')}>Índice</button>
                  <button role="tab" aria-selected={panelTab === 'notas'} onClick={() => setPanelTab('notas')}>Notas <span className="n">{notes.length}</span></button>
                  <button role="tab" aria-selected={panelTab === 'subrayados'} onClick={() => setPanelTab('subrayados')}>Subrayados <span className="n">{highlights.length}</span></button>
                </div>
                <button className="icon-btn" onClick={() => setTocOpen(false)} aria-label="Cerrar índice"><Close /></button>
              </header>
              {panelTab === 'subrayados' ? (
                highlights.length === 0 ? (
                  <p className="empty">{isPdf ? 'El subrayado de párrafos está disponible en EPUB y libros de texto. En PDF puedes usar las notas.' : 'Aún no hay subrayados. Usa el marcador de la barra (o la tecla S) y toca cualquier párrafo.'}</p>
                ) : (
                  <ol className="note-list hl-list">
                    {[...highlights].map((h) => ({ h, p: pageOfHighlight(h) })).sort((a, b) => a.h.chapter - b.h.chapter || a.h.block - b.h.block).map(({ h, p }) => (
                      <li key={h.id} className="hl-item">
                        <button onClick={() => { jumpToPage(p); if (!spread) setTocOpen(false) }}>
                          <span className={`hl-bar note-${h.color}`} aria-hidden />
                          <span className="hl-text">{h.text}</span>
                          <span className="pg">{p + 1}</span>
                        </button>
                        <button className="hl-del" onClick={() => removeHighlight(h)} aria-label="Quitar subrayado" title="Quitar subrayado"><Trash size={14} /></button>
                      </li>
                    ))}
                  </ol>
                )
              ) : panelTab === 'notas' ? (
                notes.length === 0 ? (
                  <p className="empty">Aún no hay notas en este libro. Usa el botón del post-it (o la tecla N) y toca cualquier parte de una página.</p>
                ) : (
                  <ol className="note-list">
                    {[...notes].map((n) => ({ n, p: pageOfNote(n) })).sort((a, b) => a.p - b.p || a.n.y - b.n.y).map(({ n, p }) => (
                      <li key={n.id}>
                        <button onClick={() => { jumpToPage(p); setOpenNote({ note: n, isNew: false }); if (!spread) setTocOpen(false) }}>
                          <span className={`note-dot note-${n.color}`} aria-hidden />
                          <span className="note-snippet">{n.text}</span>
                          <span className="pg">{p + 1}</span>
                        </button>
                      </li>
                    ))}
                  </ol>
                )
              ) : tocItems.length === 0 ? (
                <p className="empty">Este documento no incluye un índice. Usa la barra inferior para saltar a cualquier página.</p>
              ) : (
                <ol>
                  {tocItems.map((t, i) => (
                    <li key={i}>
                      <button
                        aria-current={i === activeToc}
                        style={{ paddingLeft: 12 + t.level * 16 }}
                        onClick={() => { jumpToPage(t.page); if (!spread) setTocOpen(false) }}
                      >
                        <span>{t.title}</span><span className="pg">{t.page + 1}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </motion.aside>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {openNote && (
            <NotePopup
              key={openNote.note.id}
              note={openNote.note}
              isNew={openNote.isNew}
              pageLabel={`Página ${pageOfNote(openNote.note) + 1} · ${book.title}`}
              onSave={(n) => { saveNote(n); notify(openNote.isNew ? 'Nota pegada' : 'Nota guardada') }}
              onDelete={(n) => deleteNote(n, openNote.isNew)}
              onClose={() => setOpenNote(null)}
            />
          )}
        </AnimatePresence>
      </div>

      <div className="reader-foot" style={{ opacity: idle && !tocOpen ? 0 : 1 }}>
        <span style={{ minWidth: 130 }}>{ready ? pageLabel : ' '}</span>
        <label className="sr-only" htmlFor="rd-progress">Ir a la página</label>
        <input
          id="rd-progress"
          type="range"
          min={1}
          max={Math.max(1, total)}
          value={currentPage + 1}
          onChange={(e) => jumpToPage(Number(e.target.value) - 1)}
          aria-valuetext={pageLabel}
          disabled={!ready}
        />
        <span style={{ minWidth: 36, textAlign: 'right' }}>{percent}%</span>
        <span className="saved hide-sm" style={{ opacity: savedVisible ? 1 : 0 }} aria-live="polite">
          {savedVisible ? <><Check size={14} /> Guardado</> : ''}
        </span>
      </div>
    </>
  )
}
