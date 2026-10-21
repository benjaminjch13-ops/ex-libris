import { useEffect, useRef, type ReactNode } from 'react'
import { motion, useDragControls, useIsPresent } from 'motion/react'
import { createPortal } from 'react-dom'
import { Close } from './Icons'
import { haptic } from '../lib/haptics'

/** a touch screen without a mouse (some phones don't report a «coarse» pointer) */
const coarse = () => typeof window !== 'undefined' && (!!window.matchMedia?.('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && !window.matchMedia?.('(hover: hover)').matches))

export function Modal({ title, onClose, children, footer, narrow, tall, labelId }: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  narrow?: boolean
  /** keeps one height while its content changes (tabbed dialogs) */
  tall?: boolean
  labelId?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  // while the closing animation plays, keys belong to whatever is underneath
  const present = useIsPresent()
  const presentRef = useRef(present)
  presentRef.current = present
  // phones: drag the dialog down by its top edge to close it, like a native sheet
  const drag = useDragControls()
  const touch = coarse()
  const startDrag = (e: React.PointerEvent) => { if (touch && !(e.target as HTMLElement).closest('button, a, input, select, textarea')) drag.start(e) }
  const id = labelId ?? `m-${title.replace(/\W+/g, '-').toLowerCase()}`
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    const first = ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not(.modal-x)')
    // on touch screens focusing a field pops the keyboard over half the dialog; focus the dialog itself instead
    const touch = window.matchMedia?.('(pointer: coarse)').matches
    setTimeout(() => ((touch ? null : first) ?? ref.current)?.focus({ preventScroll: true }), 60)
    const onKey = (e: KeyboardEvent) => {
      if (!presentRef.current) return
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
      if (e.key === 'Tab' && ref.current) {
        const f = Array.from(ref.current.querySelectorAll<HTMLElement>('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter((el) => !el.hasAttribute('disabled'))
        if (!f.length) return
        const a = f[0], z = f[f.length - 1]
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus() }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus() }
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => { window.removeEventListener('keydown', onKey, true); prev?.focus?.({ preventScroll: true }) }
  }, [onClose])

  // portal: a dialog opened from inside a view must sit above the phone tab bar, not inside the page's stacking context
  return createPortal(
    <div className="modal-root">
      <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.div
        ref={ref}
        className={`modal${narrow ? ' narrow' : ''}${tall ? ' tall' : ''}${touch ? ' touch' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        tabIndex={-1}
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
        drag={touch ? 'y' : false}
        dragControls={drag}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.7 }}
        dragSnapToOrigin
        onDragEnd={(_, info) => { if (info.offset.y > 110 || info.velocity.y > 650) { haptic('tap'); onClose() } }}
      >
        {touch && <span className="modal-grab" onPointerDown={startDrag} aria-hidden />}
        <div className="modal-head" onPointerDown={startDrag}>
          <h2 id={id}>{title}</h2>
          <button className="icon-btn modal-x" onClick={onClose} aria-label="Cerrar"><Close /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </motion.div>
    </div>,
    document.body,
  )
}

export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel }: {
  title: string
  message: ReactNode
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      narrow
      footer={<>
        <button className="btn" onClick={onCancel}>Cancelar</button>
        <button className="btn btn-danger" onClick={onConfirm}>{confirmLabel}</button>
      </>}
    >
      <p style={{ color: 'var(--ivory-dim)', lineHeight: 1.6 }}>{message}</p>
    </Modal>
  )
}
