import { useEffect, useRef, useState } from 'react'
import { cleanIsbn } from '../lib/lookup'
import { Close } from './Icons'

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> }

/**
 * Camera barcode reader for the ISBN printed on the back cover (EAN-13, starts with 978/979).
 * Uses the browser's BarcodeDetector where it exists (Chrome on Android) and loads ZXing only
 * on browsers without it (Safari on iPhone).
 */
export function Scanner({ onCode, onClose, continuous, children }: {
  onCode: (isbn: string) => void
  onClose: () => void
  continuous?: boolean
  children?: React.ReactNode
}) {
  const video = useRef<HTMLVideoElement>(null)
  const [state, setState] = useState<'starting' | 'live' | 'denied' | 'nocam' | 'error'>('starting')
  const [hint, setHint] = useState('')
  const [manual, setManual] = useState('')
  const [flash, setFlash] = useState(false)
  const last = useRef<{ code: string; at: number }>({ code: '', at: 0 })
  const onCodeRef = useRef(onCode)
  onCodeRef.current = onCode
  const stopped = useRef(false)

  useEffect(() => {
    stopped.current = false
    let stream: MediaStream | undefined
    let raf = 0
    let zxingStop: (() => void) | undefined

    const handle = (raw: string) => {
      const isbn = cleanIsbn(raw)
      const now = Date.now()
      if (!isbn) {
        if (raw !== last.current.code) setHint('Ese código no es un ISBN. Busca el que empieza con 978 o 979, normalmente en la contraportada.')
        last.current = { code: raw, at: now }
        return
      }
      if (isbn === last.current.code && now - last.current.at < 4000) return
      last.current = { code: isbn, at: now }
      setHint('')
      setFlash(true)
      setTimeout(() => setFlash(false), 350)
      navigator.vibrate?.(60)
      onCodeRef.current(isbn)
      if (!continuous) stopped.current = true
    }

    ;(async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setState('nocam'); return }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      } catch (e) {
        const n = (e as DOMException).name
        setState(n === 'NotAllowedError' || n === 'SecurityError' ? 'denied' : 'nocam')
        return
      }
      if (stopped.current) { stream.getTracks().forEach((t) => t.stop()); return }
      const v = video.current!
      v.srcObject = stream
      await v.play().catch(() => {})
      setState('live')

      const BD = (window as unknown as { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector
      const formats = BD?.getSupportedFormats ? await BD.getSupportedFormats().catch(() => []) : []
      if (BD && formats.includes('ean_13')) {
        const det = new BD({ formats: ['ean_13', 'ean_8', 'upc_a'] })
        let busy = false
        const tick = async () => {
          if (stopped.current) return
          if (!busy && v.readyState >= 2) {
            busy = true
            try {
              const found = await det.detect(v)
              if (found[0]) handle(found[0].rawValue)
            } catch { /* frame not ready */ }
            busy = false
          }
          raf = requestAnimationFrame(tick)
        }
        tick()
      } else {
        const [{ BrowserMultiFormatReader }, lib] = await Promise.all([import('@zxing/browser'), import('@zxing/library')])
        const hints = new Map()
        hints.set(lib.DecodeHintType.POSSIBLE_FORMATS, [lib.BarcodeFormat.EAN_13, lib.BarcodeFormat.EAN_8, lib.BarcodeFormat.UPC_A])
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 150 })
        const ctl = await reader.decodeFromVideoElement(v, (res) => {
          if (res && !stopped.current) handle(res.getText())
        })
        zxingStop = () => ctl.stop()
      }
    })().catch(() => setState('error'))

    return () => {
      stopped.current = true
      cancelAnimationFrame(raf)
      zxingStop?.()
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [continuous])

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault()
    const isbn = cleanIsbn(manual)
    if (!isbn) { setHint('Revisa el número: un ISBN tiene 10 o 13 cifras.'); return }
    setManual('')
    onCodeRef.current(isbn)
  }

  return (
    <div className="scanner" role="dialog" aria-label="Escanear código de barras">
      <div className={`scan-view${flash ? ' hit' : ''}`}>
        <video ref={video} playsInline muted aria-hidden />
        {state === 'live' && <div className="scan-frame" aria-hidden><i /></div>}
        {state !== 'live' && (
          <div className="scan-msg" role="status">
            {state === 'starting' && <><span className="spin" /> Abriendo la cámara…</>}
            {state === 'denied' && <>No tengo permiso para usar la cámara. Actívalo en los ajustes del navegador para este sitio, o escribe el ISBN abajo.</>}
            {state === 'nocam' && <>No encontré una cámara disponible. Escribe el ISBN abajo.</>}
            {state === 'error' && <>No pude iniciar el lector. Escribe el ISBN abajo.</>}
          </div>
        )}
        <button type="button" className="icon-btn scan-x" onClick={onClose} aria-label="Cerrar escáner"><Close /></button>
      </div>
      <p className="scan-hint" aria-live="polite">{hint || (continuous ? 'Pasa los libros uno tras otro; cada código se añade solo.' : 'Apunta al código de barras de la contraportada.')}</p>
      <form className="scan-manual" onSubmit={submitManual}>
        <label className="sr-only" htmlFor="scan-isbn">ISBN</label>
        <input id="scan-isbn" inputMode="numeric" placeholder="O escribe el ISBN" value={manual} onChange={(e) => setManual(e.target.value)} autoComplete="off" />
        <button className="btn" type="submit">Buscar</button>
      </form>
      {children}
    </div>
  )
}
