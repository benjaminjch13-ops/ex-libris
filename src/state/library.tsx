import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Book, DropReason, HistoryEntry, Progress, Settings, Status, WishItem } from '../types'
import { DEFAULT_SETTINGS, loadSettings, saveSettings, store } from '../lib/db'
import { genreFromCategory } from '../lib/genres'
import { compressCover, protectStorage } from '../lib/backup'


interface Toast { id: number; text: string; tone?: 'ok' | 'error' }

interface LibraryCtx {
  ready: boolean
  persistent: boolean
  /** the browser agreed not to evict this site's data (null: can't tell) */
  storageProtected: boolean | null
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
  /** reading queue: book ids, or `w:<id>` for wishlist entries not bought yet */
  tbr: string[]
  setTbr: (ids: string[]) => void
  addToTbr: (id: string, where?: 'start' | 'end') => void
  removeFromTbr: (id: string) => void
  dropBook: (id: string, reason: DropReason, note?: string, retry?: boolean) => Promise<void>
  wishes: WishItem[]
  saveWish: (w: WishItem) => void
  removeWish: (id: string) => void
  wishBought: (wishId: string, bookId: string, keepInTbr: boolean) => void
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
  const [storageProtected, setStorageProtected] = useState<boolean | null>(null)
  const [books, setBooks] = useState<Book[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [tbrRaw, setTbrRaw] = useState<string[]>([])
  const [wishes, setWishes] = useState<WishItem[]>([])
  const tbrRef = useRef<string[]>([])
  tbrRef.current = tbrRaw
  const wishesRef = useRef<WishItem[]>([])
  wishesRef.current = wishes
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
      setTbrRaw((await s.getSetting<string[]>('tbr').catch(() => undefined)) ?? [])
      setWishes((await s.getSetting<WishItem[]>('wishlist').catch(() => undefined)) ?? [])
      setReady(true)
      setStorageProtected(await protectStorage())
      // shrink oversized covers saved by earlier versions, quietly, after the shelf is up
      setTimeout(async () => {
        for (const b of list) {
          if (!b.coverBlob || b.coverBlob.size < 400 * 1024) continue
          const small = await compressCover(b.coverBlob)
          if (small === b.coverBlob) continue
          const cur = booksRef.current.find((x) => x.id === b.id)
          if (!cur || cur.coverBlob !== b.coverBlob) continue
          const nb = { ...cur, coverBlob: small }
          await s.putBook(nb).catch(() => {})
          booksRef.current = booksRef.current.map((x) => (x.id === b.id ? nb : x))
          setBooks((l) => l.map((x) => (x.id === b.id ? nb : x)))
        }
      }, 4000)
    })()
  }, [])

  const coverUrl = useCallback((b: Book) => {
    if (!b.coverBlob) return b.coverRemote
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

  const saveBook = useCallback(async (input: Book, file?: Blob) => {
    const s = await store()
    const b = input.coverBlob ? { ...input, coverBlob: await compressCover(input.coverBlob) } : input
    if (file) await s.putFile(b.id, file)
    await s.putBook(b)
    setBooks((list) => (list.some((x) => x.id === b.id) ? list.map((x) => (x.id === b.id ? b : x)) : [...list, b]))
  }, [])

  const removeBook = useCallback(async (id: string) => {
    const s = await store()
    await s.deleteBook(id)
    setBooks((list) => list.filter((x) => x.id !== id))
    if (tbrRef.current.includes(id)) {
      const next = tbrRef.current.filter((x) => x !== id)
      setTbrRaw(next)
      s.setSetting('tbr', next).catch(() => {})
    }
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

  const writeTbr = useCallback((next: string[]) => {
    tbrRef.current = next
    setTbrRaw(next)
    store().then((s) => s.setSetting('tbr', next)).catch(() => {})
  }, [])
  const setTbr = useCallback((ids: string[]) => writeTbr([...new Set(ids)]), [writeTbr])
  const addToTbr = useCallback((id: string, where: 'start' | 'end' = 'end') => {
    const rest = tbrRef.current.filter((x) => x !== id)
    writeTbr(where === 'start' ? [id, ...rest] : [...rest, id])
  }, [writeTbr])
  const removeFromTbr = useCallback((id: string) => {
    if (tbrRef.current.includes(id)) writeTbr(tbrRef.current.filter((x) => x !== id))
  }, [writeTbr])

  const setStatus = useCallback((id: string, status: Status) => {
    const cur = booksRef.current.find((x) => x.id === id)
    const patch: Partial<Book> = { status }
    if (status === 'terminado') patch.finishedAt = Date.now()
    if (status === 'leyendo' && !cur?.startedAt) patch.startedAt = Date.now()
    if (status !== 'abandonado') patch.dropped = undefined
    patchBook(id, patch)
    // starting, finishing or leaving a book takes it out of the queue
    if (status !== 'pendiente') removeFromTbr(id)
  }, [patchBook, removeFromTbr])

  const addHistoryRef = useRef<(h: HistoryEntry) => Promise<void>>(async () => {})

  const dropBook = useCallback(async (id: string, reason: DropReason, note?: string, retry?: boolean) => {
    const b = booksRef.current.find((x) => x.id === id)
    if (!b) return
    await patchBook(id, {
      status: 'abandonado',
      dropped: { reason, note: note?.trim() || undefined, at: Date.now(), page: b.progress?.page, percent: b.progress?.percent },
    })
    if (retry) addToTbr(id, 'end')
    else removeFromTbr(id)
    addHistoryRef.current({ bookId: id, title: b.title, author: b.author, type: 'abandonado', at: Date.now(), toPage: b.progress?.page, total: b.progress?.total })
  }, [patchBook, addToTbr, removeFromTbr])

  const writeWishes = useCallback((next: WishItem[]) => {
    wishesRef.current = next
    setWishes(next)
    store().then((s) => s.setSetting('wishlist', next)).catch(() => {})
  }, [])
  const saveWish = useCallback((w: WishItem) => {
    const l = wishesRef.current
    writeWishes(l.some((x) => x.id === w.id) ? l.map((x) => (x.id === w.id ? w : x)) : [w, ...l])
  }, [writeWishes])
  const removeWish = useCallback((id: string) => {
    writeWishes(wishesRef.current.filter((x) => x.id !== id))
    removeFromTbr(`w:${id}`)
  }, [writeWishes, removeFromTbr])
  /** A wishlist entry was bought: the new book takes its place in the queue (or leaves it). */
  const wishBought = useCallback((wishId: string, bookId: string, keepInTbr: boolean) => {
    const key = `w:${wishId}`
    const cur = tbrRef.current
    if (keepInTbr) writeTbr(cur.includes(key) ? cur.map((x) => (x === key ? bookId : x)) : [...cur, bookId])
    else if (cur.includes(key)) writeTbr(cur.filter((x) => x !== key))
    writeWishes(wishesRef.current.filter((x) => x.id !== wishId))
  }, [writeTbr, writeWishes])

  const saveProgress = useCallback(async (id: string, p: Progress) => {
    await patchBook(id, { progress: p, lastOpenedAt: Date.now() })
  }, [patchBook])

  const addHistory = useCallback(async (h: HistoryEntry) => {
    const s = await store()
    await s.addHistory(h).catch(() => {})
    setHistory(await s.getHistory().catch(() => []))
  }, [])
  addHistoryRef.current = addHistory

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((cur) => {
      const next = { ...cur, ...patch }
      saveSettings(next)
      return next
    })
  }, [])

  // only entries that still exist; a finished or abandoned-for-good book never lingers in the queue
  const tbr = useMemo(() => tbrRaw.filter((id) => (id.startsWith('w:') ? wishes.some((w) => `w:${w.id}` === id) : books.some((b) => b.id === id))), [tbrRaw, books, wishes])

  const value = useMemo<LibraryCtx>(() => ({
    ready, persistent, storageProtected, books, history, settings, coverUrl, saveBook, removeBook, patchBook,
    toggleFavorite, setStatus, saveProgress, addHistory, updateSettings, toasts, notify,
    tbr, setTbr, addToTbr, removeFromTbr, dropBook, wishes, saveWish, removeWish, wishBought,
  }), [ready, persistent, storageProtected, books, history, settings, coverUrl, saveBook, removeBook, patchBook, toggleFavorite, setStatus, saveProgress, addHistory, updateSettings, toasts, notify, tbr, setTbr, addToTbr, removeFromTbr, dropBook, wishes, saveWish, removeWish, wishBought])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
