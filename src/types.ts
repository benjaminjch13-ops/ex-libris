export type Status = 'pendiente' | 'leyendo' | 'terminado' | 'abandonado'
/** fisico: a paper copy the reader owns; progress is entered by hand */
export type BookFormat = 'epub' | 'pdf' | 'demo' | 'catalogo' | 'fisico'

export type DropReason = 'no-engancho' | 'estilo' | 'momento' | 'lento' | 'contenido' | 'otro'

export const DROP_REASONS: { key: DropReason; label: string }[] = [
  { key: 'no-engancho', label: 'No me enganchó' },
  { key: 'estilo', label: 'No me gustó el estilo' },
  { key: 'momento', label: 'No es el momento' },
  { key: 'lento', label: 'Muy largo o lento' },
  { key: 'contenido', label: 'Contenido que no esperaba' },
  { key: 'otro', label: 'Otro motivo' },
]

export interface Palette {
  bg: string
  fg: string
  accent: string
}

export interface Progress {
  /** Flowing books: chapter index + position inside the chapter (0..1). PDF: chapter = 0, page = page index. */
  chapter: number
  ratio: number
  page: number
  total: number
  percent: number
  updatedAt: number
}

export type NoteColor = 'amarillo' | 'rosa' | 'verde' | 'azul'

export interface Note {
  id: string
  /** flowing books: chapter index (-1 = title page) + position inside the chapter (0..1) */
  chapter: number
  ratio: number
  /** PDF: page index */
  page?: number
  /** horizontal / vertical position on the page, 0..1 */
  x: number
  y: number
  text: string
  color: NoteColor
  createdAt: number
  updatedAt: number
}

export interface Highlight {
  id: string
  chapter: number
  /** index of the paragraph (block element) inside the chapter */
  block: number
  color: NoteColor
  text: string
  createdAt: number
}

export interface Book {
  id: string
  title: string
  author: string
  description: string
  category: string
  format: BookFormat
  fileName?: string
  fileSize?: number
  addedAt: number
  pages?: number
  status: Status
  favorite: boolean
  progress?: Progress
  coverBlob?: Blob
  palette: Palette
  /** 0..1, varies the height of the book on the shelf */
  heightRatio: number
  lastOpenedAt?: number
  finishedAt?: number
  notes?: Note[]
  highlights?: Highlight[]
  /** first time the book was opened in the reader */
  startedAt?: number
  /** rating in half-star steps (0–5) and an optional link to a published review */
  review?: { rating: number; text: string; url?: string; updatedAt: number }
  year?: number
  genre?: string
  /** where the entry came from (an external list or catalogue) */
  sourceUrl?: string
  isbn?: string
  /** bought in a reading app (Kindle, Apple Books…): tracked by hand like a paper book */
  app?: string
  /** remote cover (catalogue lookup) used when the image could not be stored locally */
  coverRemote?: string
  /** why and where the reader left the book */
  dropped?: { reason: DropReason; note?: string; at: number; page?: number; percent?: number }
  /** the reader said "keep going" to the inactivity nudge; don't ask again before this */
  nudgeAfter?: number
}

export interface WishLink { url: string; store: string; price?: string }

export interface WishItem {
  id: string
  title: string
  author: string
  coverRemote?: string
  isbn?: string
  pages?: number
  year?: number
  description?: string
  genre?: string
  links: WishLink[]
  note?: string
  addedAt: number
}

export interface HistoryEntry {
  id?: number
  bookId: string
  title: string
  author: string
  type: 'sesion' | 'terminado' | 'agregado' | 'abandonado'
  at: number
  fromPage?: number
  toPage?: number
  total?: number
  minutes?: number
  seconds?: number
}

export interface Chapter {
  title: string
  html: string
  href?: string
}

export interface TocEntry {
  title: string
  level: number
  /** flow books: chapter index; pdf: page index */
  target: number
  /** optional fragment inside the chapter (unused for pagination, kept for future) */
  fragment?: string
}

export interface Settings {
  libraryName: string
  readerName: string
  fontScale: number
  night: boolean
  /** reader layout: automatic (by screen), always one page, or two facing pages */
  pageMode?: 'auto' | 'una' | 'dos'
}

export const STATUS_LABEL: Record<Status, string> = {
  pendiente: 'Pendiente',
  leyendo: 'Leyendo',
  terminado: 'Terminado',
  abandonado: 'Abandonado',
}
