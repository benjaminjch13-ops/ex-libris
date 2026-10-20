import type { Book } from '../types'
import { BookFileError, parseEpub } from './epub'
import { pdfMeta } from './pdf'
import { paletteFor, paletteFromImage } from './color'

export const MAX_FILE_MB = 150

export interface FileInfo {
  format: 'epub' | 'pdf'
  title?: string
  author?: string
  description?: string
  pages?: number
  coverBlob?: Blob
}

async function sniff(file: File): Promise<'epub' | 'pdf' | null> {
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer())
  const sig = String.fromCharCode(...head)
  if (sig.startsWith('%PDF')) return 'pdf'
  if (head[0] === 0x50 && head[1] === 0x4b) return 'epub' // ZIP container
  return null
}

/** Validates the file and reads whatever metadata it carries (title, author, cover, pages). */
export async function inspectFile(file: File): Promise<FileInfo> {
  if (file.size === 0) throw new BookFileError('El archivo está vacío.')
  if (file.size > MAX_FILE_MB * 1024 * 1024) throw new BookFileError(`El archivo pesa más de ${MAX_FILE_MB} MB. Prueba con una versión más ligera.`)
  const ext = file.name.toLowerCase().split('.').pop()
  const kind = await sniff(file)
  if (!kind || (ext !== 'epub' && ext !== 'pdf')) {
    throw new BookFileError('Formato no compatible. Sube un archivo EPUB o PDF.')
  }
  if (kind === 'pdf') {
    const m = await pdfMeta(file)
    return { format: 'pdf', ...m }
  }
  const parsed = await parseEpub(file)
  parsed.urls.forEach((u) => URL.revokeObjectURL(u))
  const text = parsed.chapters.map((c) => c.html.replace(/<[^>]+>/g, ' ')).join(' ')
  const words = text.split(/\s+/).filter(Boolean).length
  return {
    format: 'epub',
    title: parsed.meta.title,
    author: parsed.meta.author,
    description: parsed.meta.description,
    coverBlob: parsed.meta.coverBlob,
    pages: Math.max(1, Math.round(words / 250)),
  }
}

export async function paletteForBook(title: string, cover?: Blob) {
  return cover ? paletteFromImage(cover, title) : paletteFor(title)
}

export function emptyBook(id: string): Book {
  return {
    id,
    title: '',
    author: '',
    description: '',
    category: '',
    format: 'epub',
    addedAt: Date.now(),
    status: 'pendiente',
    favorite: false,
    palette: paletteFor(id),
    heightRatio: Math.random(),
  }
}
