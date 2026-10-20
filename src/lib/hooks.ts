import { useEffect, useState } from 'react'

export function useMedia(query: string) {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const m = window.matchMedia(query)
    const on = () => setMatch(m.matches)
    on()
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [query])
  return match
}

export function useViewport() {
  const [s, setS] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
  useEffect(() => {
    let raf = 0
    const on = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => setS({ w: window.innerWidth, h: window.innerHeight }))
    }
    window.addEventListener('resize', on)
    return () => { window.removeEventListener('resize', on); cancelAnimationFrame(raf) }
  }, [])
  return s
}

/** Simplified motion: user asked for less motion, or a small/low-power device. */
export function useLiteMotion() {
  const reduce = useMedia('(prefers-reduced-motion: reduce)')
  const small = useMedia('(max-width: 640px)')
  const lowPower = typeof navigator !== 'undefined' && (navigator.hardwareConcurrency ?? 8) <= 2
  return { reduce, lite: reduce || small || lowPower }
}

export function relTime(t: number) {
  const diff = Date.now() - t
  const m = Math.round(diff / 60000)
  if (m < 1) return 'hace un momento'
  if (m < 60) return `hace ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.round(h / 24)
  if (d === 1) return 'ayer'
  if (d < 30) return `hace ${d} días`
  return new Date(t).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function greeting() {
  const h = new Date().getHours()
  if (h < 6) return 'Buenas noches'
  if (h < 13) return 'Buenos días'
  if (h < 20) return 'Buenas tardes'
  return 'Buenas noches'
}

export function fmtSize(bytes?: number) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
