import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Book, HistoryEntry, Progress, Settings, Status } from '../types'
import { DEFAULT_SETTINGS, loadSettings, saveSettings, store } from '../lib/db'
import { genreFromCategory } from '../lib/genres'


interface Toast { id: number; text: string; tone?: 'ok' | 'error' }

interface LibraryCtx {
  ready: boolean
  persistent: boolean
  books: Book[]
  history: HistoryEntry[]
  settings: Settings
  coverUrl: (b: Book) => string | undefined
  saveBook: (b: Book, file?: Blob) => Promise<void>
  removeBook: (id: string) => Promise<void>
  patchBook: (id: string, patch: Partial<Book>) => Promise<void>
  toggleFavorite: (id: string) => void
  setStatus: (id: string, s: Status) => void
  saveProgress: (id: string, p: Progress) => Promise<void>
  addHistory: (h: HistoryEntry) => Promise<void>
  updateSettings: (patch: Partial<Settings>) => void
  toasts: Toast[]
  notify: (text: string, tone?: Toast['tone']) => void
}

const Ctx = createContext<LibraryCtx | null>(null)

export function useLibrary() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useLibrary fuera de LibraryProvider')
  return c
}

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [persistent, setPersistent] = useState(true)
  const [books, setBooks] = useState<Book[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [toasts, setToasts] = useState<Toast[]>([])
  const urls = useRef(new Map<string, { blob: Blob; url: string }>())
  const booksRef = useRef<Book[]>([])
  booksRef.current = books

  useEffect(() => {
    ;(async () => {
      const s = await store()
      setPersistent(s.persistent)
      let list = await s.getBooks().catch(() => [] as Book[])
      // books saved before genres existed get theirs once
      list = await Promise.all(list.map(async (b) => {
        const g = genreFromCategory(b)
        if (!g) return b
        const nb = { ...b, genre: g }
        await s.putBook(nb).catch(() => {})
        return nb
      }))
      setBooks(list)
      setHistory(await s.getHistory().catch(() => []))
      setSettings(await loadSettings())
      setReady(true)
    })()
  }, [])

  const coverUrl = useCallback((b: Book) => {
    if (!b.coverBlob) return undefined
    const cached = urls.current.get(b.id)
    if (cached && cached.blob === b.coverBlob) return cached.url
    if (cached) URL.revokeObjectURL(cached.url)
    const url = URL.createObjectURL(b.coverBlob)
    urls.current.set(b.id, { blob: b.coverBlob, url })
    return url
  }, [])

  const notify = useCallback((text: string, tone: Toast['tone'] = 'ok') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t.slice(-2), { id, text, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200)
  }, [])

  const persist = useCallback(async (b: Book) => {
    const s = await store()
    await s.putBook(b)
  }, [])

  const saveBook = useCallback(async (b: Book, file?: Blob) => {
    const s = await store()
    if (file) await s.putFile(b.id, file)
    await s.putBook(b)
    setBooks((list) => (list.some((x) => x.id === b.id) ? list.map((x) => (x.id === b.id ? b : x)) : [...list, b]))
  }, [])

  const removeBook = useCallback(async (id: string) => {
    const s = await store()
    await s.deleteBook(id)
    setBooks((list) => list.filter((x) => x.id !== id))
  }, [])

  const patchBook = useCallback(async (id: string, patch: Partial<Book>) => {
    const cur = booksRef.current.find((x) => x.id === id)
    if (!cur) return
    const next = { ...cur, ...patch }
    booksRef.current = booksRef.current.map((x) => (x.id === id ? next : x))
    setBooks((list) => list.map((x) => (x.id === id ? { ...x, ...patch } : x)))
    await persist(next).catch(() => {})
  }, [persist])

  const toggleFavorite = useCallback((id: string) => {
    const b = books.find((x) => x.id === id)
    if (!b) return
    patchBook(id, { favorite: !b.favorite })
    notify(b.favorite ? 'Quitado de favoritos' : 'Añadido a favoritos')
  }, [books, patchBook, notify])

  const setStatus = useCallback((id: string, status: Status) => {
    patchBook(id, { status, ...(status === 'terminado' ? { finishedAt: Date.now() } : {}) })
  }, [patchBook])

  const saveProgress = useCallback(async (id: string, p: Progress) => {
    await patchBook(id, { progress: p, lastOpenedAt: Date.now() })
  }, [patchBook])

  const addHistory = useCallback(async (h: HistoryEntry) => {
    const s = await store()
    await s.addHistory(h).catch(() => {})
    setHistory(await s.getHistory().catch(() => []))
  }, [])

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((cur) => {
      const next = { ...cur, ...patch }
      saveSettings(next)
      return next
    })
  }, [])

  const value = useMemo<LibraryCtx>(() => ({
    ready, persistent, books, history, settings, coverUrl, saveBook, removeBook, patchBook,
    toggleFavorite, setStatus, saveProgress, addHistory, updateSettings, toasts, notify,
  }), [ready, persistent, books, history, settings, coverUrl, saveBook, removeBook, patchBook, toggleFavorite, setStatus, saveProgress, addHistory, updateSettings, toasts, notify])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
