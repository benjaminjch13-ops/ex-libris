import type { Book, Chapter, TocEntry } from '../types'
import { BookFileError } from './errors'
import type { PDFDocumentProxy } from './pdf'
import { store } from './db'

export type ReaderSource =
  | { kind: 'flow'; chapters: Chapter[]; toc: TocEntry[]; dispose: () => void }
  | { kind: 'pdf'; doc: PDFDocumentProxy; numPages: number; aspect: number; toc: TocEntry[]; dispose: () => void }

const BLOCKS = 'p, h1, h2, h3, h4, h5, h6, blockquote, li, figure, pre, dt, dd, table, img.full'

/** Gives every paragraph-level element a stable index so it can be underlined across pagination. */
function numberBlocks(chapters: Chapter[]): Chapter[] {
  return chapters.map((c) => {
    const t = document.createElement('template')
    t.innerHTML = c.html
    let i = 0
    t.content.querySelectorAll(BLOCKS).forEach((el) => {
      // only innermost paragraphs: a blockquote or list item that holds paragraphs is marked through them
      if (el.querySelector(BLOCKS)) return
      el.setAttribute('data-b', String(i++))
      // the marker is painted on an inline wrapper so it follows the lines of text, not the block box
      const span = document.createElement('span')
      span.className = 'hlx'
      while (el.firstChild) span.appendChild(el.firstChild)
      el.appendChild(span)
    })
    return { ...c, html: t.innerHTML }
  })
}

export async function loadSource(book: Book): Promise<ReaderSource> {
  if (book.format === 'catalogo') {
    throw new BookFileError('Este libro está en tu catálogo pero aún no tiene archivo. Usa «Editar datos» para subir el EPUB o PDF y leerlo aquí.')
  }
  if (book.format === 'demo') {
    throw new BookFileError('Este libro de muestra ya no está disponible. Bórralo y añade tus propios EPUB o PDF.')
  }
  const s = await store()
  const file = await s.getFile(book.id)
  if (!file) throw new BookFileError('No se encontró el archivo de este libro. Edítalo y vuelve a cargar el archivo.')
  if (book.format === 'epub') {
    const { parseEpub } = await import('./epub')
    const parsed = await parseEpub(file)
    return {
      kind: 'flow',
      chapters: numberBlocks(parsed.chapters),
      toc: parsed.toc,
      dispose: () => parsed.urls.forEach((u) => URL.revokeObjectURL(u)),
    }
  }
  const { openPdf, pdfToc } = await import('./pdf')
  const doc = await openPdf(file)
  const first = await doc.getPage(1)
  const vp = first.getViewport({ scale: 1 })
  const toc = await pdfToc(doc)
  return { kind: 'pdf', doc, numPages: doc.numPages, aspect: vp.width / vp.height, toc, dispose: () => { doc.destroy() } }
}
