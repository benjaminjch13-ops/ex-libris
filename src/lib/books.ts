import type { Book } from '../types'

/** Small book helpers used across screens (kept out of the dialogs' chunk). */

/** paper books, and books read in another app, are tracked by hand */
export const isManual = (b: Book) => b.format === 'fisico'
export const editionLabel = (b: Book) => (b.app ? `En ${b.app}` : 'Papel')

const DAY = 86400000
const NUDGE_DAYS = 21

/** A book "being read" that hasn't been touched for weeks. */
export function staleBook(books: Book[]): Book | undefined {
  const now = Date.now()
  return books
    .filter((b) => b.status === 'leyendo' && (b.nudgeAfter ?? 0) < now)
    .map((b) => ({ b, last: Math.max(b.lastOpenedAt ?? 0, b.progress?.updatedAt ?? 0, b.startedAt ?? 0, b.addedAt) }))
    .filter((x) => now - x.last > NUDGE_DAYS * DAY)
    .sort((a, b) => a.last - b.last)[0]?.b
}

export function weeksSince(b: Book) {
  const last = Math.max(b.lastOpenedAt ?? 0, b.progress?.updatedAt ?? 0, b.startedAt ?? 0, b.addedAt)
  return Math.max(3, Math.round((Date.now() - last) / (7 * DAY)))
}
