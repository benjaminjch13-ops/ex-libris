import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import workerCode from 'pdfjs-dist/build/pdf.worker.min.mjs?raw'
import type { TocEntry } from '../types'
import { BookFileError } from './errors'

// The worker ships inside the page and starts from a blob URL, so the app works as one self-contained file.
let workerReady = false
function ensureWorker() {
  if (workerReady) return
  pdfjs.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([workerCode], { type: 'text/javascript' }))
  workerReady = true
}

export type { PDFDocumentProxy }

export async function openPdf(blob: Blob): Promise<PDFDocumentProxy> {
  ensureWorker()
  try {
    const data = new Uint8Array(await blob.arrayBuffer())
    return await pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: true }).promise
  } catch (e) {
    const msg = (e as Error)?.name === 'PasswordException'
      ? 'Este PDF está protegido con contraseña. Quita la protección y vuelve a subirlo.'
      : 'El archivo no es un PDF válido o está dañado.'
    throw new BookFileError(msg)
  }
}

export async function pdfMeta(blob: Blob) {
  const doc = await openPdf(blob)
  try {
    const { info } = (await doc.getMetadata().catch(() => ({ info: {} }))) as { info: Record<string, string> }
    const cover = await renderPageBlob(doc, 0, 600)
    const page = await doc.getPage(1)
    const vp = page.getViewport({ scale: 1 })
    return {
      title: info?.Title?.trim() || undefined,
      author: info?.Author?.trim() || undefined,
      description: info?.Subject?.trim() || undefined,
      pages: doc.numPages,
      coverBlob: cover,
      aspect: vp.width / vp.height,
    }
  } finally {
    doc.destroy()
  }
}

export async function renderPageBlob(doc: PDFDocumentProxy, index: number, width: number): Promise<Blob | undefined> {
  const canvas = await renderPageCanvas(doc, index, width)
  return new Promise((res) => canvas.toBlob((b) => res(b ?? undefined), 'image/jpeg', 0.86))
}

async function renderPageCanvas(doc: PDFDocumentProxy, index: number, width: number) {
  const page = await doc.getPage(index + 1)
  const base = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({ scale: width / base.width })
  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, viewport }).promise
  return canvas
}

/** Width ÷ height of every page (scanned books mix portrait covers with landscape two-page spreads). */
export async function pdfAspects(doc: PDFDocumentProxy): Promise<number[]> {
  const out: number[] = new Array(doc.numPages)
  for (let start = 0; start < doc.numPages; start += 24) {
    await Promise.all(Array.from({ length: Math.min(24, doc.numPages - start) }, async (_, k) => {
      const i = start + k
      try { const vp = (await doc.getPage(i + 1)).getViewport({ scale: 1 }); out[i] = vp.width / vp.height } catch { out[i] = out[0] ?? 0.7 }
    }))
  }
  return out
}

/** A scanned book has pages that are pictures: almost no selectable text on the pages we sample. */
export async function pdfLooksScanned(doc: PDFDocumentProxy): Promise<boolean> {
  const n = doc.numPages
  const sample = [...new Set([Math.min(2, n - 1), Math.floor(n / 2), Math.max(0, n - 3)])]
  let chars = 0
  for (const i of sample) {
    try { const tc = await (await doc.getPage(i + 1)).getTextContent(); chars += tc.items.reduce((m, it) => m + ('str' in it ? it.str.trim().length : 0), 0) } catch { /* ignore */ }
  }
  return chars < 40 * sample.length
}

export interface RenderOpts {
  /** crop the white (or scanner-dark) margins around the text */
  trim?: boolean
  /** a two-page spread: 0 = left page, 1 = right page */
  half?: 0 | 1
}

/**
 * Where the content of a page is. Works on a small copy: paper is the light tone most of the page has;
 * "ink" is clearly darker. Solid dark bands at the edges (the scanner lid, the book's gutter) are skipped.
 */
function contentBox(src: HTMLCanvasElement): { x: number; y: number; w: number; h: number } | null {
  const k = Math.min(1, 220 / src.width)
  const w = Math.max(8, Math.round(src.width * k)), h = Math.max(8, Math.round(src.height * k))
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const g = c.getContext('2d', { willReadFrequently: true })!
  g.drawImage(src, 0, 0, w, h)
  const d = g.getImageData(0, 0, w, h).data
  const lum = new Uint8Array(w * h)
  const hist = new Uint32Array(256)
  for (let i = 0; i < w * h; i++) { const v = (d[i * 4] * 299 + d[i * 4 + 1] * 587 + d[i * 4 + 2] * 114) / 1000 | 0; lum[i] = v; hist[v]++ }
  // paper tone: the 80th percentile of brightness
  let acc = 0, paper = 255
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= w * h * 0.8) { paper = v; break } }
  if (paper < 90) return null // a dark page (photo, night scan): leave it as it is
  const ink = Math.max(30, paper - 55)
  const rowInk = new Float32Array(h), colInk = new Float32Array(w)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (lum[y * w + x] < ink) { rowInk[y]++; colInk[x]++ }
  for (let y = 0; y < h; y++) rowInk[y] /= w
  for (let x = 0; x < w; x++) colInk[x] /= h
  const edge = (arr: Float32Array, from: number, to: number, step: number) => {
    let i = from
    while (i !== to && arr[i] > 0.55) i += step // skip dark scanner bands
    while (i !== to && arr[i] < 0.004) i += step // skip blank margin
    return i
  }
  const top = edge(rowInk, 0, h - 1, 1), bottom = edge(rowInk, h - 1, 0, -1)
  const left = edge(colInk, 0, w - 1, 1), right = edge(colInk, w - 1, 0, -1)
  if (bottom - top < h * 0.25 || right - left < w * 0.25) return null // nearly blank page: don't zoom into a speck
  const pad = Math.round(Math.max(w, h) * 0.02)
  const x0 = Math.max(0, left - pad), y0 = Math.max(0, top - pad), x1 = Math.min(w, right + pad + 1), y1 = Math.min(h, bottom + pad + 1)
  return { x: x0 / k, y: y0 / k, w: (x1 - x0) / k, h: (y1 - y0) / k }
}

/** A page as an image, optionally one half of a spread and with its margins trimmed. */
export async function renderPdfPage(doc: PDFDocumentProxy, index: number, width: number, opts: RenderOpts = {}): Promise<{ blob?: Blob; aspect: number }> {
  // render wide enough that the half (and the trimmed area) still has `width` pixels
  const full = await renderPageCanvas(doc, index, opts.half != null ? width * 2 : width)
  let sx = 0, sy = 0, sw = full.width, sh = full.height
  if (opts.half != null) { sw = Math.floor(full.width / 2); sx = opts.half === 1 ? full.width - sw : 0 }
  let part = full
  if (sx || sw !== full.width) {
    part = document.createElement('canvas'); part.width = sw; part.height = sh
    part.getContext('2d')!.drawImage(full, sx, sy, sw, sh, 0, 0, sw, sh)
  }
  if (opts.trim) {
    const b = contentBox(part)
    if (b) {
      const out = document.createElement('canvas'); out.width = Math.round(b.w); out.height = Math.round(b.h)
      out.getContext('2d')!.drawImage(part, b.x, b.y, b.w, b.h, 0, 0, out.width, out.height)
      part = out
    }
  }
  const blob = await new Promise<Blob | undefined>((res) => part.toBlob((x) => res(x ?? undefined), 'image/jpeg', 0.88))
  return { blob, aspect: part.width / part.height }
}

export async function pdfToc(doc: PDFDocumentProxy): Promise<TocEntry[]> {
  const outline = await doc.getOutline().catch(() => null)
  if (!outline) return []
  const out: TocEntry[] = []
  const walk = async (items: typeof outline, level: number) => {
    for (const it of items) {
      try {
        let dest = it.dest
        if (typeof dest === 'string') dest = await doc.getDestination(dest)
        if (Array.isArray(dest) && dest[0]) {
          const idx = typeof dest[0] === 'number' ? dest[0] : await doc.getPageIndex(dest[0])
          out.push({ title: it.title || 'Sin título', level, target: idx })
        }
      } catch { /* skip broken outline entries */ }
      if (it.items?.length) await walk(it.items, level + 1)
    }
  }
  await walk(outline, 0)
  return out
}
