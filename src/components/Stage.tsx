import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { animate, motion, useMotionValue, useTransform, type MotionValue } from 'motion/react'
import type { Book, Status } from '../types'
import { STATUS_LABEL } from '../types'
import { Book3D, bookDims } from './BookArt'
import type { OpenOrigin } from './Library'
import { useLibrary } from '../state/library'
import { useLiteMotion, useViewport, relTime, fmtSize } from '../lib/hooks'
import { BookOpen, ChevronLeft, Close, Edit, Heart } from './Icons'
import { Stars } from './ReviewDialog'

export type StagePhase = 'enter' | 'preview' | 'opening' | 'return' | 'leaving'

interface Props {
  book: Book
  origin: OpenOrigin
  initial: 'enter' | 'return'
  onRead: (fromStart: boolean) => void
  onClosed: () => void
  onEdit: () => void
  onReview: () => void
}

export function TitlePage({ book }: { book: Book }) {
  return (
    <div className="title-page">
      <span className="o">❦</span>
      <span className="t">{book.title}</span>
      <span className="a">{book.author}</span>
    </div>
  )
}

function useGeometry() {
  const { w, h } = useViewport()
  return useMemo(() => {
    const wide = w >= 860
    if (wide) {
      const H = Math.min(h * 0.64, 520)
      const W = H * 0.67
      const cx = Math.max(w * 0.3, W / 2 + 60)
      return { wide, W, H, cx, cy: h / 2, vw: w, vh: h }
    }
    const H = Math.min(h * 0.34, 300)
    const W = H * 0.67
    return { wide, W, H, cx: w / 2, cy: 36 + H / 2 + 20, vw: w, vh: h }
  }, [w, h])
}

export function Stage({ book, origin, initial, onRead, onClosed, onEdit, onReview }: Props) {
  const { toggleFavorite, setStatus } = useLibrary()
  const { lite } = useLiteMotion()
  const g = useGeometry()
  const [phase, setPhase] = useState<StagePhase>(initial === 'enter' ? 'enter' : 'return')
  const fromStartRef = useRef(false)
  const [descOpen, setDescOpen] = useState(false)
  const primary = useRef<HTMLButtonElement>(null)

  const dims = useMemo(() => ({ ...bookDims(book, g.H), w: g.W, h: g.H }), [book, g.H, g.W])

  // Animated values
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const scale = useMotionValue(1)
  const rotY = useMotionValue(0)
  const rotX = useMotionValue(0)
  const open = useMotionValue(0)
  const backdrop = useMotionValue(0)
  const openVar = useTransform(open, (v) => `${v}deg`)

  const fromOrigin = (rect: DOMRect, pose: OpenOrigin['pose']) => ({
    x: rect.left + rect.width / 2 - g.cx,
    y: rect.top + rect.height / 2 - g.cy,
    scale: rect.height / g.H,
    rotY: pose === 'spine' ? 90 : pose === 'tilt' ? -18 : 0,
  })

  const openTarget = () => {
    const s = Math.min(1.3, (g.vh * 0.82) / g.H, (g.vw * 0.92) / (g.W * 2))
    // Put the spine (left edge of the scaled book) on the vertical centre line so the open spread is centred.
    return { x: g.vw / 2 - g.cx + (s * g.W) / 2, y: g.vh / 2 - g.cy, s }
  }

  useLayoutEffect(() => {
    const ctl: { stop: () => void }[] = []
    const run = (mv: MotionValue<number>, to: number | number[], o: Parameters<typeof animate>[2] = {}) => {
      const a = animate(mv, to as never, { duration: 0.8, ease: [0.22, 0.8, 0.24, 1], ...o })
      ctl.push(a)
      return a
    }
    if (initial === 'enter') {
      const o = fromOrigin(origin.rect, origin.pose)
      if (lite) {
        scale.set(0.92); backdrop.set(0)
        run(scale, 1, { duration: 0.35 }); run(backdrop, 1, { duration: 0.3 })
        setTimeout(() => setPhase('preview'), 120)
      } else {
        x.set(o.x); y.set(o.y); scale.set(o.scale); rotY.set(o.rotY)
        run(backdrop, 1, { duration: 0.45 })
        run(x, 0, { duration: 0.85 })
        run(y, 0, { duration: 0.85 })
        run(scale, 1, { duration: 0.85 })
        run(rotY, [o.rotY, o.rotY > 0 ? 28 : -10, 0], { duration: 1.0, times: [0, 0.55, 1] })
        run(rotX, [0, 6, 0], { duration: 1.0 })
        setTimeout(() => setPhase('preview'), 520)
      }
    } else {
      // Coming back from the reader: book is open at centre, close it and fly it home.
      const t = openTarget()
      backdrop.set(1)
      if (lite) {
        setPhase('leaving')
        run(backdrop, 0, { duration: 0.3 }).then(onClosed)
      } else {
        x.set(t.x); y.set(t.y); scale.set(t.s); open.set(-178)
        ;(async () => {
          await run(open, 0, { duration: 0.7, ease: [0.4, 0, 0.2, 1] })
          await Promise.all([run(x, 0, { duration: 0.45 }), run(y, 0, { duration: 0.45 })])
          flyHome()
        })()
      }
    }
    return () => ctl.forEach((c) => c.stop())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (phase === 'preview') setTimeout(() => primary.current?.focus({ preventScroll: true }), 350)
  }, [phase])

  function flyHome() {
    setPhase('leaving')
    // The same book can appear on the desk and on a shelf; fly to whichever copy is on screen.
    const candidates = Array.from(document.querySelectorAll<HTMLElement>(`[data-book-id="${CSS.escape(book.id)}"]`)).map((el) => {
      const target = el.classList.contains('desk-item') ? el.querySelector<HTMLElement>('.desk-book') : el
      return { el, rect: target?.getBoundingClientRect() }
    })
    const hit = candidates.find((c) => c.rect && c.rect.width > 0 && c.rect.bottom > 0 && c.rect.top < g.vh)
    const el = hit?.el
    const rect = hit?.rect
    const onScreen = !!hit
    if (lite || !onScreen) {
      animate(backdrop, 0, { duration: 0.3 })
      animate(scale, 0.9, { duration: 0.3 })
      setTimeout(onClosed, 300)
      return
    }
    const o = fromOrigin(rect!, el?.classList.contains('desk-item') || el?.dataset.pose === 'face' ? 'tilt' : el?.classList.contains('coll-cover') ? 'flat' : 'spine')
    const opts = { duration: 0.75, ease: [0.5, 0, 0.2, 1] as [number, number, number, number] }
    animate(backdrop, 0, { duration: 0.6 })
    animate(x, o.x, opts)
    animate(y, o.y, opts)
    animate(scale, o.scale, opts)
    animate(rotY, o.rotY, opts).then(onClosed)
  }

  async function read(fromStart: boolean) {
    fromStartRef.current = fromStart
    setPhase('opening')
    if (lite) {
      await animate(scale, 1.05, { duration: 0.25 })
      onRead(fromStart)
      return
    }
    const t = openTarget()
    const ease = [0.45, 0, 0.2, 1] as [number, number, number, number]
    await Promise.all([
      animate(x, t.x, { duration: 0.6, ease }),
      animate(y, t.y, { duration: 0.6, ease }),
      animate(scale, t.s, { duration: 0.6, ease }),
      animate(rotX, 0, { duration: 0.3 }),
    ])
    await animate(open, -178, { duration: 0.95, ease: [0.55, 0.05, 0.25, 1] })
    onRead(fromStart)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && phase === 'preview') flyHome()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const hasReview = !!book.review && (book.review.rating > 0 || !!book.review.text || !!book.review.url)
  const hasProgress = !!book.progress && (book.progress.page ?? 0) > 1 && book.status !== 'terminado'
  const showPreview = phase === 'preview'
  const pct = Math.round((book.progress?.percent ?? 0) * 100)
  const previewStyle: React.CSSProperties = g.wide
    ? { left: g.cx + g.W / 2 + 64, top: '50%', translate: '0 -50%', width: Math.min(480, g.vw - (g.cx + g.W / 2 + 64) - 40) }
    : { left: 0, right: 0, top: g.cy + g.H / 2 + 34, paddingBottom: 'calc(40px + env(safe-area-inset-bottom, 0px))', margin: '0 auto' }

  return (
    <div className="stage" role="dialog" aria-modal="true" aria-label={`Vista previa de ${book.title}`} style={{ overflowY: g.wide ? 'hidden' : 'auto' }}>
      <motion.div className="stage-backdrop" style={{ opacity: backdrop, minHeight: g.wide ? undefined : '100%' }} onClick={() => phase === 'preview' && flyHome()} />

      <div className="stage-book" style={{ left: g.cx - g.W / 2, top: g.cy - g.H / 2, width: g.W, height: g.H }}>
        <motion.div style={{ x, y, scale, rotateY: rotY, rotateX: rotX, transformStyle: 'preserve-3d', width: g.W, height: g.H, transformOrigin: '50% 50%' }}>
          <motion.div style={{ '--open': openVar, transformStyle: 'preserve-3d' } as never}>
            <Book3D book={book} dims={dims} innerPage={<TitlePage book={book} />} />
          </motion.div>
          <div className="stage-shadow" />
        </motion.div>
      </div>

      {(phase === 'preview' || phase === 'enter') && (
        <motion.div
          className="preview"
          style={previewStyle}
          initial={{ opacity: 0, x: g.wide ? 24 : 0, y: g.wide ? 0 : 16 }}
          animate={showPreview ? { opacity: 1, x: 0, y: 0 } : { opacity: 0 }}
          transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <div className="eyebrow cat">{book.category || 'Sin categoría'}</div>
          <h2>{book.title}</h2>
          <div className="by">de <em>{book.author || 'Autor desconocido'}</em></div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className={`status-pill st-${book.status}`}>{STATUS_LABEL[book.status]}</span>
            <button className="chip" aria-pressed={book.favorite} onClick={() => toggleFavorite(book.id)}>
              <Heart size={13} filled={book.favorite} /> {book.favorite ? 'Favorito' : 'Marcar favorito'}
            </button>
          </div>
          {book.description && <p className={`desc${!g.wide && !descOpen && book.description.length > 280 ? ' clamped' : ''}`}>{book.description}</p>}
          {book.description && !g.wide && book.description.length > 280 && (
            <button className="desc-more" onClick={() => setDescOpen((v) => !v)} aria-expanded={descOpen}>{descOpen ? 'Ver menos' : 'Leer descripción completa'}</button>
          )}
          <dl className="facts">
            {book.pages ? <div><dt>Páginas</dt><dd>{book.format === 'pdf' || book.format === 'catalogo' ? book.pages : `≈ ${book.pages}`}</dd></div> : null}
            {book.year ? <div><dt>Publicado</dt><dd>{book.year < 0 ? `${-book.year} a. C.` : book.year}</dd></div> : null}
            <div><dt>Formato</dt><dd>{book.format === 'demo' ? 'Edición de muestra' : book.format === 'catalogo' ? 'Sin archivo' : book.format.toUpperCase()}{book.fileSize ? ` · ${fmtSize(book.fileSize)}` : ''}</dd></div>
            <div><dt>Añadido</dt><dd>{relTime(book.addedAt)}</dd></div>
            {book.progress ? <div><dt>Progreso</dt><dd>{pct}% · pág. {book.progress.page}</dd></div> : null}
          </dl>
          {book.status === 'terminado' && (
            <button className="review-teaser" onClick={onReview}>
              <span className="rt-label">{hasReview ? 'Mi reseña' : 'Lo terminaste · ¿qué te pareció?'}</span>
              {book.review?.rating ? <Stars value={book.review.rating} size={18} /> : null}
              {book.review?.text ? <span className="rt-text">“{book.review.text}”</span> : null}
              {book.review?.url && !book.review.text ? <span className="rt-text">Reseña publicada en línea</span> : null}
              <span className="rt-cta">{hasReview ? 'Ver reseña, calificación y tiempo de lectura' : 'Calificar y escribir reseña'} →</span>
            </button>
          )}
          <div className="preview-actions">
            {book.format === 'catalogo' ? (
              <button ref={primary} className="btn btn-gold" onClick={onEdit}><BookOpen size={16} /> Añadir archivo para leer</button>
            ) : hasProgress ? (
              <>
                <button ref={primary} className="btn btn-gold" onClick={() => read(false)}><BookOpen size={16} /> Continuar leyendo</button>
                <button className="btn" onClick={() => read(true)}>Leer desde el inicio</button>
              </>
            ) : (
              <button ref={primary} className="btn btn-gold" onClick={() => read(true)}><BookOpen size={16} /> Leer libro</button>
            )}
            <button className="btn" onClick={flyHome}><ChevronLeft size={16} /> Volver a la biblioteca</button>
          </div>
          <div className="preview-actions" style={{ marginTop: 0 }}>
            <label className="sr-only" htmlFor="pv-status">Estado de lectura</label>
            <select id="pv-status" className="select" value={book.status} onChange={(e) => setStatus(book.id, e.target.value as Status)}>
              <option value="pendiente">Pendiente</option>
              <option value="leyendo">Leyendo</option>
              <option value="terminado">Terminado</option>
            </select>
            <button className="chip" onClick={onEdit}><Edit size={13} /> Editar datos</button>
            {book.sourceUrl && <a className="chip" href={book.sourceUrl} target="_blank" rel="noopener noreferrer">Ver origen ↗</a>}
          </div>
          {book.format === 'catalogo' && <p className="catalog-note">Este libro todavía no tiene archivo. Sube el EPUB o PDF para poder leerlo aquí.</p>}
        </motion.div>
      )}

      {phase === 'preview' && (
        <button className="icon-btn stage-close" onClick={flyHome} aria-label="Cerrar vista previa"><Close /></button>
      )}
    </div>
  )
}
