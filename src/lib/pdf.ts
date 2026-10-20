import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import workerCode from 'pdfjs-dist/build/pdf.worker.min.mjs?raw'
import type { TocEntry } from '../types'
import { BookFileError } from './epub'

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

export async function renderPageCanvas(doc: PDFDocumentProxy, index: number, width: number) {
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
