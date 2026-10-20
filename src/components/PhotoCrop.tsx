import { useEffect, useRef, useState } from 'react'
import { Rotate } from './Icons'

export type PhotoKind = 'portada' | 'lomo'

interface Rect { x: number; y: number; w: number; h: number }
type Drag = { mode: 'move' | 'nw' | 'ne' | 'sw' | 'se'; start: Rect; px: number; py: number } | null

const MAX_WORK = 2200 // px of the longest side kept while cropping
const MIN = 0.04

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

function startRect(kind: PhotoKind, portrait: boolean): Rect {
  if (kind === 'portada') return { x: 0.12, y: 0.08, w: 0.76, h: 0.84 }
  // a spine photographed upright is tall and thin; lying down, wide and short
  return portrait ? { x: 0.4, y: 0.05, w: 0.2, h: 0.9 } : { x: 0.05, y: 0.4, w: 0.9, h: 0.2 }
}

async function loadCanvas(file: Blob): Promise<HTMLCanvasElement> {
  // phones store the camera's rotation as EXIF; ask the decoder to apply it
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions)
  const k = Math.min(1, MAX_WORK / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close?.()
  return c
}

function rotated(src: HTMLCanvasElement, cw: boolean): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = src.height; c.height = src.width
  const g = c.getContext('2d')!
  g.translate(c.width / 2, c.height / 2)
  g.rotate((cw ? 1 : -1) * Math.PI / 2)
  g.drawImage(src, -src.width / 2, -src.height / 2)
  return c
}

const toBlob = (c: HTMLCanvasElement, q = 0.88) => new Promise<Blob>((ok, ko) => c.toBlob((b) => (b ? ok(b) : ko(new Error('toBlob'))), 'image/jpeg', q))

/**
 * Crop a photo of the real book: its cover or its spine. Corners drag, the frame moves,
 * "Girar" turns the photo. A spine cropped lying down is stood upright (title reading
 * bottom to top, as Spanish editions print it).
 */
export function PhotoCrop({ file, kind, onDone, onCancel, onRetake }: {
  file: File
  kind: PhotoKind
  onDone: (blob: Blob, ratio: number) => void
  onCancel: () => void
  onRetake: () => void
}) {
  const work = useRef<HTMLCanvasElement | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const [url, setUrl] = useState<string>()
  const [rect, setRect] = useState<Rect>(startRect(kind, true))
  const [drag, setDrag] = useState<Drag>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')

  const show = async (c: HTMLCanvasElement) => {
    work.current = c
    const b = await toBlob(c, 0.82)
    setUrl((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(b) })
  }

  useEffect(() => {
    let alive = true
    setBusy(true); setError('')
    loadCanvas(file)
      .then(async (c) => { if (!alive) return; setRect(startRect(kind, c.height >= c.width)); await show(c) })
      .catch(() => alive && setError('No pude abrir esa foto. Prueba con otra (JPG, PNG o HEIC convertido).'))
      .finally(() => alive && setBusy(false))
    return () => { alive = false }
  }, [file, kind])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])

  const rotate = async () => {
    if (!work.current) return
    setBusy(true)
    // the frame turns with the photo (clockwise)
    setRect((r) => ({ x: 1 - r.y - r.h, y: r.x, w: r.h, h: r.w }))
    await show(rotated(work.current, true))
    setBusy(false)
  }

  const down = (mode: NonNullable<Drag>['mode']) => (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setDrag({ mode, start: rect, px: e.clientX, py: e.clientY })
  }
  const move = (e: React.PointerEvent) => {
    if (!drag || !box.current) return
    const b = box.current.getBoundingClientRect()
    const dx = (e.clientX - drag.px) / b.width, dy = (e.clientY - drag.py) / b.height
    const s = drag.start
    let { x, y, w, h } = s
    if (drag.mode === 'move') { x = clamp(s.x + dx, 0, 1 - s.w); y = clamp(s.y + dy, 0, 1 - s.h) }
    else {
      if (drag.mode.includes('w')) { x = clamp(s.x + dx, 0, s.x + s.w - MIN); w = s.x + s.w - x }
      if (drag.mode.includes('e')) w = clamp(s.w + dx, MIN, 1 - s.x)
      if (drag.mode.includes('n')) { y = clamp(s.y + dy, 0, s.y + s.h - MIN); h = s.y + s.h - y }
      if (drag.mode.includes('s')) h = clamp(s.h + dy, MIN, 1 - s.y)
    }
    setRect({ x, y, w, h })
  }

  const use = async () => {
    const src = work.current
    if (!src) return
    setBusy(true)
    try {
      const sx = Math.round(rect.x * src.width), sy = Math.round(rect.y * src.height)
      const sw = Math.max(4, Math.round(rect.w * src.width)), sh = Math.max(4, Math.round(rect.h * src.height))
      let c = document.createElement('canvas')
      c.width = sw; c.height = sh
      c.getContext('2d')!.drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh)
      if (kind === 'lomo' && sw > sh * 1.3) c = rotated(c, false)
      // keep it light: covers up to 1100 px tall, spines up to 1200
      const maxH = kind === 'portada' ? 1100 : 1200, maxW = kind === 'portada' ? 800 : 320
      const k = Math.min(1, maxH / c.height, maxW / c.width)
      if (k < 1) {
        const o = document.createElement('canvas')
        o.width = Math.round(c.width * k); o.height = Math.round(c.height * k)
        const g = o.getContext('2d')!
        g.imageSmoothingQuality = 'high'
        g.drawImage(c, 0, 0, o.width, o.height)
        c = o
      }
      onDone(await toBlob(c), c.width / c.height)
    } catch {
      setError('No se pudo recortar la foto.')
      setBusy(false)
    }
  }

  const pct = (v: number) => `${v * 100}%`
  return (
    <div className="crop">
      <div className="crop-head">
        <b>{kind === 'portada' ? 'Recorta la portada' : 'Recorta el lomo'}</b>
        <span>{kind === 'portada' ? 'Lleva las esquinas a los bordes de la portada.' : 'Ajusta el marco al lomo, de arriba abajo. Si salió acostado, no importa: lo enderezo.'}</span>
      </div>
      {error ? <p className="err" role="alert">{error}</p> : (
        <div className="crop-stage">
          <div ref={box} className={`crop-box${drag ? ' dragging' : ''}`} onPointerMove={move} onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)}>
            {url && <img src={url} alt="Foto para recortar" draggable={false} />}
            {url && (
              <div className="crop-rect" style={{ left: pct(rect.x), top: pct(rect.y), width: pct(rect.w), height: pct(rect.h) }} onPointerDown={down('move')} role="presentation">
                <i className="crop-grid" />
                {(['nw', 'ne', 'sw', 'se'] as const).map((m) => <span key={m} className={`crop-h ${m}`} onPointerDown={down(m)} />)}
              </div>
            )}
            {busy && <span className="crop-busy"><span className="spin" /></span>}
          </div>
        </div>
      )}
      <div className="crop-actions">
        <div className="crop-tools">
          <button type="button" className="btn" onClick={rotate} disabled={busy || !!error}><Rotate size={15} /> Girar</button>
          <button type="button" className="btn" onClick={onRetake}>Otra foto</button>
        </div>
        <div className="crop-tools">
          <button type="button" className="btn" onClick={onCancel}>Cancelar</button>
          <button type="button" className="btn btn-gold" onClick={use} disabled={busy || !!error}>Usar foto</button>
        </div>
      </div>
    </div>
  )
}
