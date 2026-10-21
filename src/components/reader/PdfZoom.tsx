import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PageRef } from './pagination'
import type { PdfCache } from './PageView'
import type { RenderOpts } from '../../lib/pdf'
import { ChevronLeft, ChevronRight, Close } from '../Icons'

const MAX = 5
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

/**
 * A PDF page you can really read: it opens fitted to the width of the screen (scroll down the page),
 * pinch or double-tap to zoom, drag to move, and keep going page after page without leaving the zoom.
 * The page is drawn again, sharper, whenever the zoom settles.
 */
export function PdfZoom({ cache, pages, start, startScale = 1, focus, opts, sharp, onClose, onPage }: {
  cache: PdfCache
  pages: PageRef[]
  start: number
  startScale?: number
  /** point (0..1 of the screen) to zoom into first, e.g. where the double tap happened */
  focus?: { x: number; y: number }
  opts: (ref: Extract<PageRef, { t: 'pdf' }>) => RenderOpts
  sharp: boolean
  onClose: (page: number) => void
  onPage?: (page: number) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const [idx, setIdx] = useState(start)
  const [size, setSize] = useState({ w: 360, h: 640 })
  const [aspect, setAspect] = useState(0.7)
  const [t, setT] = useState({ s: startScale, x: 0, y: 0 })
  const [res, setRes] = useState(Math.min(3, Math.ceil(startScale)))
  const [url, setUrl] = useState<string>()
  const ptrs = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ s: number; x: number; y: number; d?: number; cx?: number; cy?: number; px?: number; py?: number } | null>(null)
  const lastTap = useRef({ t: 0, x: 0, y: 0 })
  const ref = pages[idx]

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  // base layout: the page as wide as the screen (on a computer, a comfortable reading width)
  const baseW = Math.min(size.w, 900), baseH = baseW / aspect
  const fix = useCallback((s: number, x: number, y: number) => {
    const cw = baseW * s, ch = baseH * s
    return {
      s,
      x: cw <= size.w ? (size.w - cw) / 2 : clamp(x, size.w - cw, 0),
      y: ch <= size.h ? (size.h - ch) / 2 : clamp(y, size.h - ch, 0),
    }
  }, [baseW, baseH, size.w, size.h])

  // load the page at the resolution the zoom needs (1×, 2× or 3× the screen width, times the pixel density)
  useEffect(() => {
    if (ref?.t !== 'pdf') return
    let live = true
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = Math.min(3200, Math.round(Math.min(size.w, 900) * res * dpr))
    cache.getPage(ref.i, w, opts(ref)).then((r) => { if (live && r) { setUrl(r.url); setAspect(r.aspect) } })
    return () => { live = false }
  }, [cache, ref, res, size.w, opts])

  // once the zoom settles, ask for a sharper copy
  useEffect(() => {
    const id = setTimeout(() => setRes(clamp(Math.ceil(t.s - 0.15), 1, 3)), 260)
    return () => clearTimeout(id)
  }, [t.s])

  // first view: fitted, or zoomed around the double-tap point
  const placed = useRef(false)
  useEffect(() => {
    if (placed.current || !url) return
    placed.current = true
    if (focus && startScale > 1) {
      const fx = focus.x * size.w, fy = focus.y * size.h
      setT(fix(startScale, fx - fx * startScale, fy - fy * startScale))
    } else setT(fix(startScale, 0, 0))
  }, [url, focus, startScale, size, fix])

  // keep the page in bounds when the screen or the page shape changes
  useEffect(() => { setT((c) => fix(c.s, c.x, c.y)) }, [fix])

  const zoomAt = (s: number, cx = size.w / 2, cy = size.h / 2) => setT((c) => {
    const ns = clamp(s, 1, MAX), k = ns / c.s
    return fix(ns, cx - (cx - c.x) * k, cy - (cy - c.y) * k)
  })
  const goto = (d: 1 | -1) => {
    const n = idx + d
    if (n < 0 || n >= pages.length || pages[n]?.t !== 'pdf') return
    setIdx(n); onPage?.(n)
    setUrl(undefined)
    setT((c) => ({ ...c, y: 0 })) // start the next page at the top
  }

  const local = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const onDown = (e: React.PointerEvent) => {
    box.current?.setPointerCapture(e.pointerId)
    ptrs.current.set(e.pointerId, local(e))
    const ps = [...ptrs.current.values()]
    if (ps.length === 2) {
      const [a, b] = ps
      gesture.current = { s: t.s, x: t.x, y: t.y, d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }
    } else if (ps.length === 1) gesture.current = { s: t.s, x: t.x, y: t.y, px: ps[0].x, py: ps[0].y }
  }
  const onMove = (e: React.PointerEvent) => {
    if (!ptrs.current.has(e.pointerId)) return
    ptrs.current.set(e.pointerId, local(e))
    const g = gesture.current
    if (!g) return
    const ps = [...ptrs.current.values()]
    if (ps.length >= 2 && g.d) {
      const [a, b] = ps
      const d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2
      const ns = clamp(g.s * (d / g.d), 1, MAX), k = ns / g.s
      setT(fix(ns, cx - (g.cx! - g.x) * k, cy - (g.cy! - g.y) * k))
    } else if (ps.length === 1 && g.px != null) {
      setT(fix(g.s, g.x + (ps[0].x - g.px), g.y + (ps[0].y - g.py!)))
    }
  }
  const onUp = (e: React.PointerEvent) => {
    const p = ptrs.current.get(e.pointerId)
    ptrs.current.delete(e.pointerId)
    const g = gesture.current
    if (ptrs.current.size === 1) {
      // one finger left after a pinch: continue as a drag from here
      const [q] = [...ptrs.current.values()]
      gesture.current = { s: t.s, x: t.x, y: t.y, px: q.x, py: q.y }
      return
    }
    gesture.current = null
    if (!p || !g || g.px == null) return
    const moved = Math.hypot(p.x - g.px, p.y - (g.py ?? 0))
    if (moved > 10) return
    // double tap: zoom in there, or back to the fitted page
    const now = Date.now()
    if (now - lastTap.current.t < 320 && Math.hypot(p.x - lastTap.current.x, p.y - lastTap.current.y) < 40) {
      zoomAt(t.s > 1.3 ? 1 : 2.5, p.x, p.y)
      lastTap.current.t = 0
    } else lastTap.current = { t: now, x: p.x, y: p.y }
  }
  const onWheel = (e: React.WheelEvent) => {
    const p = local(e)
    if (e.ctrlKey || e.metaKey) zoomAt(t.s * (e.deltaY < 0 ? 1.12 : 1 / 1.12), p.x, p.y)
    else setT((c) => fix(c.s, c.x - e.deltaX, c.y - e.deltaY))
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(idx) }
      else if (e.key === 'ArrowRight' || e.key === 'PageDown') goto(1)
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') goto(-1)
      else if (e.key === '+' || e.key === '=') zoomAt(t.s * 1.25)
      else if (e.key === '-') zoomAt(t.s / 1.25)
      else if (e.key === 'ArrowDown') setT((c) => fix(c.s, c.x, c.y - size.h * 0.6))
      else if (e.key === 'ArrowUp') setT((c) => fix(c.s, c.x, c.y + size.h * 0.6))
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  const label = ref?.t === 'pdf' ? `Página ${idx + 1} de ${pages.length}` : ''
  return (
    <div className="pdf-zoom" role="dialog" aria-label="Página ampliada">
      <div className="pz-bar">
        <button className="icon-btn" onClick={() => onClose(idx)} aria-label="Cerrar la vista ampliada"><Close size={18} /></button>
        <span className="pz-page">{label}</span>
        <div className="pz-tools">
          <button className="icon-btn" onClick={() => zoomAt(t.s / 1.35)} disabled={t.s <= 1.01} aria-label="Alejar">−</button>
          <span className="pz-scale" aria-live="polite">{Math.round(t.s * 100)}%</span>
          <button className="icon-btn" onClick={() => zoomAt(t.s * 1.35)} disabled={t.s >= MAX - 0.01} aria-label="Acercar">+</button>
          <button className="chip" onClick={() => setT(fix(1, 0, 0))}>Ajustar al ancho</button>
        </div>
      </div>
      <div ref={box} className="pz-view" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={onWheel}>
        {url ? (
          <img
            src={url}
            alt={label}
            draggable={false}
            className={sharp ? 'sharp' : undefined}
            style={{ width: baseW, height: baseH, transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})` }}
          />
        ) : <span className="pdf-loading">Cargando página…</span>}
      </div>
      <button className="pz-nav prev" onClick={() => goto(-1)} disabled={idx <= 0} aria-label="Página anterior"><ChevronLeft size={22} /></button>
      <button className="pz-nav next" onClick={() => goto(1)} disabled={idx >= pages.length - 1} aria-label="Página siguiente"><ChevronRight size={22} /></button>
      <p className="pz-hint">Pellizca o toca dos veces para acercar · arrastra para moverte</p>
    </div>
  )
}
