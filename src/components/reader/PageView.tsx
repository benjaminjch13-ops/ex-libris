import { memo, useEffect, useState } from 'react'
import type { Book, Chapter } from '../../types'
import type { PageRef, TextBox } from './pagination'
import type { PDFDocumentProxy } from '../../lib/pdf'
import { TitlePage } from '../Stage'

type Side = 'l' | 'r' | 's'

interface Props {
  page: PageRef
  side: Side
  book: Book
  chapters?: Chapter[]
  box: TextBox
  number?: number
  pdf?: { doc: PDFDocumentProxy; cache: PdfCache }
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
        {pdf && <PdfImage doc={pdf.doc} cache={pdf.cache} index={page.i} width={box.pageW} />}
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
  private map = new Map<string, Promise<string | undefined>>()
  private doc: PDFDocumentProxy
  private limit: number
  constructor(doc: PDFDocumentProxy, limit = 24) {
    this.doc = doc
    this.limit = limit
  }
  get(index: number, width: number) {
    const w = Math.round(width * Math.min(2, window.devicePixelRatio || 1))
    const key = `${index}@${w}`
    let p = this.map.get(key)
    if (p) {
      this.map.delete(key)
      this.map.set(key, p)
      return p
    }
    p = import('../../lib/pdf').then(({ renderPageBlob }) => renderPageBlob(this.doc, index, w)).then((b) => (b ? URL.createObjectURL(b) : undefined)).catch(() => undefined)
    this.map.set(key, p)
    if (this.map.size > this.limit) {
      const [oldKey, old] = this.map.entries().next().value!
      this.map.delete(oldKey)
      old.then((u) => u && setTimeout(() => URL.revokeObjectURL(u), 4000))
    }
    return p
  }
  dispose() {
    for (const p of this.map.values()) p.then((u) => u && URL.revokeObjectURL(u))
    this.map.clear()
  }
}

function PdfImage({ cache, index, width }: { doc: PDFDocumentProxy; cache: PdfCache; index: number; width: number }) {
  const [url, setUrl] = useState<string>()
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    setFailed(false)
    cache.get(index, width).then((u) => {
      if (!live) return
      if (u) setUrl(u)
      else setFailed(true)
    })
    return () => { live = false }
  }, [cache, index, width])
  return (
    <div className="pdf-page">
      {url ? <img src={url} alt={`Página ${index + 1}`} draggable={false} /> : <span className="pdf-loading">{failed ? 'No se pudo dibujar esta página' : 'Cargando página…'}</span>}
    </div>
  )
}
