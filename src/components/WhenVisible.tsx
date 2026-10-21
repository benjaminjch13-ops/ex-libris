import { useEffect, useRef, useState, type ReactNode } from 'react'

/** Renders `children` only once the spot is near the screen (or the browser is idle), so heavy chunks load on demand. */
export function WhenVisible({ children, placeholder, margin = '240px' }: { children: ReactNode; placeholder: ReactNode; margin?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [show, setShow] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || show) return
    if (typeof IntersectionObserver !== 'function') { setShow(true); return }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setShow(true); io.disconnect() } }, { rootMargin: margin })
    io.observe(el)
    return () => io.disconnect()
  }, [show, margin])
  return show ? <>{children}</> : <div ref={ref}>{placeholder}</div>
}
