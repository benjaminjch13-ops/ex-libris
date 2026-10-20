import { openDB, type IDBPDatabase } from 'idb'
import type { Book, HistoryEntry, Settings } from '../types'

/**
 * Local persistence. Books (metadata + cover blob) live in `books`,
 * the digital files in `files` (kept apart so listing the shelf never loads large blobs),
 * reading sessions in `history` and preferences in `settings`.
 * If IndexedDB is unavailable (private window, blocked storage) everything falls back
 * to memory so the app still works for the session.
 */

interface Store {
  getBooks(): Promise<Book[]>
  putBook(b: Book): Promise<void>
  deleteBook(id: string): Promise<void>
  getFile(id: string): Promise<Blob | undefined>
  putFile(id: string, f: Blob): Promise<void>
  getHistory(): Promise<HistoryEntry[]>
  addHistory(h: HistoryEntry): Promise<void>
  getSetting<T>(k: string): Promise<T | undefined>
  setSetting(k: string, v: unknown): Promise<void>
  persistent: boolean
}

function memoryStore(): Store {
  const books = new Map<string, Book>()
  const files = new Map<string, Blob>()
  const history: HistoryEntry[] = []
  const settings = new Map<string, unknown>()
  return {
    persistent: false,
    async getBooks() { return [...books.values()] },
    async putBook(b) { books.set(b.id, b) },
    async deleteBook(id) { books.delete(id); files.delete(id) },
    async getFile(id) { return files.get(id) },
    async putFile(id, f) { files.set(id, f) },
    async getHistory() { return [...history] },
    async addHistory(h) { history.push({ ...h, id: history.length + 1 }) },
    async getSetting<T>(k: string) { return settings.get(k) as T | undefined },
    async setSetting(k, v) { settings.set(k, v) },
  }
}

function idbStore(db: IDBPDatabase): Store {
  return {
    persistent: true,
    getBooks: () => db.getAll('books'),
    async putBook(b) { await db.put('books', b) },
    async deleteBook(id) {
      const tx = db.transaction(['books', 'files'], 'readwrite')
      await Promise.all([tx.objectStore('books').delete(id), tx.objectStore('files').delete(id), tx.done])
    },
    getFile: (id) => db.get('files', id),
    async putFile(id, f) { await db.put('files', f, id) },
    getHistory: () => db.getAll('history'),
    async addHistory(h) { await db.add('history', h) },
    getSetting: (k) => db.get('settings', k),
    async setSetting(k, v) { await db.put('settings', v, k) },
  }
}

let storePromise: Promise<Store> | null = null

export function store(): Promise<Store> {
  if (!storePromise) {
    storePromise = (async () => {
      try {
        const db = await openDB('ex-libris', 1, {
          upgrade(db) {
            db.createObjectStore('books', { keyPath: 'id' })
            db.createObjectStore('files')
            db.createObjectStore('history', { keyPath: 'id', autoIncrement: true })
            db.createObjectStore('settings')
          },
        })
        return idbStore(db)
      } catch (e) {
        console.warn('IndexedDB no disponible; usando memoria temporal.', e)
        return memoryStore()
      }
    })()
  }
  return storePromise
}

export const DEFAULT_SETTINGS: Settings = {
  libraryName: 'Ex Libris',
  readerName: '',
  fontScale: 1,
  night: false,
  pageMode: 'auto',
}

export async function loadSettings(): Promise<Settings> {
  const s = await store()
  const saved = await s.getSetting<Partial<Settings>>('prefs').catch(() => undefined)
  return { ...DEFAULT_SETTINGS, ...(saved ?? {}) }
}

export async function saveSettings(v: Settings) {
  const s = await store()
  await s.setSetting('prefs', v).catch(() => {})
}

export function uid() {
  return (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36))
}
