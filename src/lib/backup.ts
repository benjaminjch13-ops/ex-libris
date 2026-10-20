import type { Book, HistoryEntry, Settings, WishItem } from '../types'
import { store } from './db'

/**
 * Backup = one .zip the reader keeps wherever they like (Files, Drive, email):
 *   ex-libris.json        books (without blobs), history, preferences, queue, wishlist, taste
 *   portadas/<id>.<ext>   covers
 *   libros/<id>.<ext>     the EPUB/PDF files (optional, they are the heavy part)
 * Restoring merges into what is already on the device; nothing is deleted.
 */

interface BackupJson {
  app: 'ex-libris'
  version: 1
  exportedAt: number
  books: (Omit<Book, 'coverBlob'> & { cover?: string; file?: string })[]
  history: HistoryEntry[]
  prefs?: Settings
  tbr?: string[]
  wishlist?: WishItem[]
  recPrefs?: unknown
  recDismissed?: string[]
}

const ext = (b: Blob, fallback: string) => {
  const t = b.type
  if (t.includes('jpeg')) return 'jpg'
  if (t.includes('png')) return 'png'
  if (t.includes('webp')) return 'webp'
  if (t.includes('gif')) return 'gif'
  if (t.includes('epub')) return 'epub'
  if (t.includes('pdf')) return 'pdf'
  return fallback
}

export async function exportLibrary(opts: { includeFiles: boolean; onProgress?: (p: number) => void }): Promise<{ blob: Blob; name: string; books: number }> {
  const { default: JSZip } = await import('jszip')
  const s = await store()
  const zip = new JSZip()
  const books = await s.getBooks()
  const out: BackupJson['books'] = []
  let i = 0
  for (const b of books) {
    const { coverBlob, ...rest } = b
    const entry: BackupJson['books'][number] = { ...rest }
    if (coverBlob) {
      entry.cover = `portadas/${b.id}.${ext(coverBlob, 'jpg')}`
      zip.file(entry.cover, coverBlob)
    }
    if (opts.includeFiles && (b.format === 'epub' || b.format === 'pdf')) {
      const f = await s.getFile(b.id).catch(() => undefined)
      if (f) {
        entry.file = `libros/${b.id}.${b.format}`
        zip.file(entry.file, f)
      }
    }
    out.push(entry)
    opts.onProgress?.(++i / Math.max(1, books.length) * 0.5)
  }
  const json: BackupJson = {
    app: 'ex-libris', version: 1, exportedAt: Date.now(),
    books: out,
    history: await s.getHistory().catch(() => []),
    prefs: await s.getSetting<Settings>('prefs').catch(() => undefined),
    tbr: await s.getSetting<string[]>('tbr').catch(() => undefined),
    wishlist: await s.getSetting<WishItem[]>('wishlist').catch(() => undefined),
    recPrefs: await s.getSetting('recPrefs').catch(() => undefined),
    recDismissed: await s.getSetting<string[]>('recDismissed').catch(() => undefined),
  }
  zip.file('ex-libris.json', JSON.stringify(json))
  // books are already compressed formats; storing them as-is keeps big backups fast
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' }, (m) => opts.onProgress?.(0.5 + m.percent / 200))
  await s.setSetting('lastBackup', Date.now()).catch(() => {})
  const d = new Date()
  const name = `ex-libris-respaldo-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.zip`
  return { blob, name, books: books.length }
}

export async function importLibrary(file: File): Promise<{ added: number; updated: number }> {
  const { default: JSZip } = await import('jszip')
  let zip: InstanceType<typeof JSZip>
  try { zip = await JSZip.loadAsync(file) } catch { throw new Error('Ese archivo no es un respaldo de Ex Libris.') }
  const raw = await zip.file('ex-libris.json')?.async('string')
  if (!raw) throw new Error('Ese archivo no es un respaldo de Ex Libris.')
  const data = JSON.parse(raw) as BackupJson
  if (data.app !== 'ex-libris') throw new Error('Ese archivo no es un respaldo de Ex Libris.')

  const s = await store()
  const current = new Map((await s.getBooks()).map((b) => [b.id, b]))
  let added = 0, updated = 0
  for (const entry of data.books) {
    const { cover, file: filePath, ...rest } = entry
    const coverEntry = cover ? zip.file(cover) : null
    const coverBlob = coverEntry ? await coverEntry.async('blob').then((b) => new Blob([b], { type: cover!.endsWith('png') ? 'image/png' : cover!.endsWith('webp') ? 'image/webp' : 'image/jpeg' })) : current.get(entry.id)?.coverBlob
    const book: Book = { ...(rest as Book), coverBlob }
    const fileEntry = filePath ? zip.file(filePath) : null
    if (fileEntry) {
      const f = await fileEntry.async('blob')
      await s.putFile(book.id, new Blob([f], { type: book.format === 'pdf' ? 'application/pdf' : 'application/epub+zip' }))
    }
    if (current.has(book.id)) updated++; else added++
    await s.putBook(book)
  }
  // history: add what this device doesn't have yet
  const have = new Set((await s.getHistory().catch(() => [])).map((h) => `${h.bookId}|${h.type}|${h.at}`))
  for (const h of data.history ?? []) {
    const k = `${h.bookId}|${h.type}|${h.at}`
    if (!have.has(k)) { const { id: _id, ...rest } = h; void _id; await s.addHistory(rest).catch(() => {}) }
  }
  const tbr = (await s.getSetting<string[]>('tbr').catch(() => undefined)) ?? []
  await s.setSetting('tbr', [...new Set([...(data.tbr ?? []), ...tbr])])
  const wl = (await s.getSetting<WishItem[]>('wishlist').catch(() => undefined)) ?? []
  const wlIds = new Set(wl.map((w) => w.id))
  await s.setSetting('wishlist', [...wl, ...(data.wishlist ?? []).filter((w) => !wlIds.has(w.id))])
  const prefs = await s.getSetting<Settings>('prefs').catch(() => undefined)
  if (!prefs && data.prefs) await s.setSetting('prefs', data.prefs)
  if (data.recPrefs && !(await s.getSetting('recPrefs').catch(() => undefined))) await s.setSetting('recPrefs', data.recPrefs)
  const dis = (await s.getSetting<string[]>('recDismissed').catch(() => undefined)) ?? []
  await s.setSetting('recDismissed', [...new Set([...dis, ...(data.recDismissed ?? [])])])
  return { added, updated }
}

/** Hand the file to the person: the share sheet on phones (Save to Files, Drive…), a download elsewhere. */
export async function deliver(blob: Blob, name: string) {
  const file = new File([blob], name, { type: 'application/zip' })
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean }
  if (window.matchMedia?.('(pointer: coarse)').matches && nav.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Respaldo de Ex Libris' }); return 'shared' }
    catch (e) { if ((e as DOMException).name === 'AbortError') return 'cancelled' }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
  return 'downloaded'
}

/** Ask the browser not to clear this site's data under storage pressure (Safari otherwise may, after a few idle days). */
export async function protectStorage(): Promise<boolean | null> {
  const st = navigator.storage
  if (!st?.persisted) return null
  try {
    if (await st.persisted()) return true
    return st.persist ? await st.persist() : false
  } catch {
    return null
  }
}

export async function storageUse(): Promise<{ used: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.()
    return e?.usage != null && e.quota ? { used: e.usage, quota: e.quota } : null
  } catch {
    return null
  }
}

/** Covers from EPUBs and catalogues can weigh megabytes; ~900px tall is plenty for every place they are shown. */
export async function compressCover(blob: Blob): Promise<Blob> {
  if (blob.size < 220 * 1024 || typeof createImageBitmap !== 'function') return blob
  try {
    const bmp = await createImageBitmap(blob)
    const scale = Math.min(1, 900 / bmp.height, 620 / bmp.width)
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale)
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    c.getContext('2d')!.drawImage(bmp, 0, 0, w, h)
    bmp.close?.()
    const out = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.84))
    return out && out.size < blob.size ? out : blob
  } catch {
    return blob
  }
}
