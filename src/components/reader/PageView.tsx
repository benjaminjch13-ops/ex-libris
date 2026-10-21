import { memo, useEffect, useState } from 'react'
import type { Book, Chapter } from '../../types'
import type { PageRef, TextBox } from './pagination'
import type { PDFDocumentProxy, RenderOpts } from '../../lib/pdf'
import { TitlePage } from '../Stage'

type Side = 'l' | 'r' | 's'

interface Props {
  page: PageRef
  side: Side
  book: Book
  chapters?: Chapter[]
  box: TextBox
  number?: number
  pdf?: { doc: PDFDocumentProxy; cache: PdfCache; opts: (ref: Extract<PageRef, { t: 'pdf' }>) => RenderOpts; sharp: boolean }
}

export const PageView = memo(function PageView({ page, side, book, chapters, box, number, pdf }: Props) {
  const cls = `page ${side === 's' ? 'single-page' : side}`
  if (page.t === 'blank') return <div className={`${cls} page-blank`} />
  if (page.t === 'title') {
    return (
      <div className={cls}>
        <TitlePage book={book} />
      </div>
    )
  }
  if (page.t === 'pdf') {
    return (
      <div className={cls}>
        {pdf && <PdfImage cache={pdf.cache} index={page.i} width={box.pageW} opts={pdf.opts(page)} sharp={pdf.sharp} />}
      </div>
    )
  }
  const ch = chapters![page.c]
  const runText = side === 'l' ? book.title : ch.title
  return (
    <div className={cls}>
      {page.k > 0 && <div className="page-run" style={{ top: Math.round(box.top * 0.42) }}>{runText}</div>}
      <div className="page-viewport" style={{ left: box.mx, top: box.top, width: box.W, height: box.H }}>
        <div
          className="flow"
          data-c={page.c}
          style={{
            width: box.W, height: box.H, columnWidth: box.W, columnGap: box.G, fontSize: box.fontSize,
            transform: `translateX(${-page.k * (box.W + box.G)}px)`,
            ['--page-h' as string]: `${box.H}px`,
          }}
          dangerouslySetInnerHTML={{ __html: ch.html }}
        />
      </div>
      {number != null && <div className="folio" style={{ bottom: Math.round(box.bottom * 0.38) }}>{number}</div>}
    </div>
  )
})

/** Small LRU of rendered PDF pages (object URLs) so flipping back and forth never re-renders. */
export class PdfCache {
  private map = new Map<string, Promise<{ url: string; aspect: number } | undefined>>()
  private doc: PDFDocumentProxy
  private limit: number
  constructor(doc: PDFDocumentProxy, limit = 24) {
    this.doc = doc
    this.limit = limit
  }
  /** `width` in device pixels */
  getPage(index: number, width: number, opts: RenderOpts = {}) {
    const key = `${index}@${width}${opts.trim ? 't' : ''}${opts.half ?? ''}`
    let p = this.map.get(key)
    if (p) {
      this.map.delete(key)
      this.map.set(key, p)
      return p
    }
    p = import('../../lib/pdf')
      .then(({ renderPdfPage }) => renderPdfPage(this.doc, index, width, opts))
      .then((r) => (r.blob ? { url: URL.createObjectURL(r.blob), aspect: r.aspect } : undefined))
      .catch(() => undefined)
    this.map.set(key, p)
    if (this.map.size > this.limit) {
      const [oldKey, old] = this.map.entries().next().value!
      this.map.delete(oldKey)
      old.then((r) => r && setTimeout(() => URL.revokeObjectURL(r.url), 4000))
    }
    return p
  }
  /** a page sized for the reader's page box (CSS pixels) */
  get(index: number, width: number, opts: RenderOpts = {}) {
    return this.getPage(index, Math.round(width * Math.min(2, window.devicePixelRatio || 1)), opts)
  }
  dispose() {
    for (const p of this.map.values()) p.then((r) => r && URL.revokeObjectURL(r.url))
    this.map.clear()
  }
}

function PdfImage({ cache, index, width, opts, sharp }: { cache: PdfCache; index: number; width: number; opts: RenderOpts; sharp: boolean }) {
  const [url, setUrl] = useState<string>()
  const [failed, setFailed] = useState(false)
  const trim = !!opts.trim, half = opts.half
  useEffect(() => {
    let live = true
    setFailed(false)
    cache.get(index, width, { trim, half }).then((r) => {
      if (!live) return
      if (r) setUrl(r.url)
      else setFailed(true)
    })
    return () => { live = false }
  }, [cache, index, width, trim, half])
  return (
    <div className={`pdf-page${trim || half != null ? ' fitted' : ''}`}>
      {url ? <img src={url} alt={`Página ${index + 1}`} draggable={false} className={sharp ? 'sharp' : undefined} /> : <span className="pdf-loading">{failed ? 'No se pudo dibujar esta página' : 'Cargando página…'}</span>}
    </div>
  )
}
