import { useEffect, useRef, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { Close } from './Icons'

export function Modal({ title, onClose, children, footer, narrow, labelId }: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  narrow?: boolean
  labelId?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const id = labelId ?? `m-${title.replace(/\W+/g, '-').toLowerCase()}`
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    const first = ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not(.modal-x)')
    // on touch screens focusing a field pops the keyboard over half the dialog; focus the dialog itself instead
    const touch = window.matchMedia?.('(pointer: coarse)').matches
    setTimeout(() => ((touch ? null : first) ?? ref.current)?.focus({ preventScroll: true }), 60)
    const onKey = (e: KeyboardEvent) => {
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

  return (
    <div className="modal-root">
      <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.div
        ref={ref}
        className={`modal${narrow ? ' narrow' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        tabIndex={-1}
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <div className="modal-head">
          <h2 id={id}>{title}</h2>
          <button className="icon-btn modal-x" onClick={onClose} aria-label="Cerrar"><Close /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </motion.div>
    </div>
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
