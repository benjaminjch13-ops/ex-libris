import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { Book } from './types'
import { LibraryProvider, useLibrary } from './state/library'
import { Library, type OpenOrigin } from './components/Library'
import { Stage } from './components/Stage'
import { TimerPill, elapsed, useReadingTimer } from './components/Timer'
import { LoanDialog, lendable, loanState } from './components/Loans'
import { ConfirmDialog } from './components/Modal'
import { applyFilters, EMPTY_FILTERS, type Filters } from './lib/filters'
import { Check, Clock, Close, Plus, Settings as SettingsIcon, Books, BarChart, Queue, Bag, More, Shelf, Sparkle } from './components/Icons'
import type { SharedIn } from './components/Wishlist'
import { isManual } from './lib/books'
import type { PrefTab } from './components/Preferences'
import type { AddKind } from './components/BookForm'
import { ViewSkeleton } from './components/Skeleton'
import { haptic } from './lib/haptics'

// Everything not needed for the first screen loads on demand (and is cached for offline use by the service worker).
const Reader = lazy(() => import('./components/reader/Reader').then((m) => ({ default: m.Reader })))
const BookForm = lazy(() => import('./components/BookForm').then((m) => ({ default: m.BookForm })))
const Collection = lazy(() => import('./components/Collection').then((m) => ({ default: m.Collection })))
const History = lazy(() => import('./components/History').then((m) => ({ default: m.History })))
const Stats = lazy(() => import('./components/Stats').then((m) => ({ default: m.Stats })))
const Tbr = lazy(() => import('./components/Tbr').then((m) => ({ default: m.Tbr })))
const Wishlist = lazy(() => import('./components/Wishlist').then((m) => ({ default: m.Wishlist })))
const Recs = lazy(() => import('./components/Recs').then((m) => ({ default: m.Recs })))
const ReviewDialog = lazy(() => import('./components/ReviewDialog').then((m) => ({ default: m.ReviewDialog })))
const DropDialog = lazy(() => import('./components/Flows').then((m) => ({ default: m.DropDialog })))
const PageDialog = lazy(() => import('./components/Flows').then((m) => ({ default: m.PageDialog })))
const NextUpDialog = lazy(() => import('./components/Flows').then((m) => ({ default: m.NextUpDialog })))

const Preferences = lazy(() => import('./components/Preferences').then((m) => ({ default: m.Preferences })))
const YearReview = lazy(() => import('./components/YearReview').then((m) => ({ default: m.YearReview })))


type View = 'library' | 'collection' | 'history' | 'stats' | 'tbr' | 'wishlist' | 'recs' | 'year'

/** Android share sheet → `?share=1&url=…&text=…&title=…` (manifest share_target) */
function readShare(): SharedIn | null {
  const p = new URLSearchParams(window.location.search)
  if (!p.has('share')) return null
  const shared = { url: p.get('url') ?? undefined, text: p.get('text') ?? undefined, title: p.get('title') ?? undefined }
  window.history.replaceState(null, '', window.location.pathname)
  return shared
}

export default function App() {
  return (
    <LibraryProvider>
      <Shell />
    </LibraryProvider>
  )
}

function Shell() {
  const { ready, books, settings, removeBook, notify, persistent, toasts, setStatus, wishBought } = useLibrary()
  const [shared, setShared] = useState<SharedIn | null>(readShare)
  const [view, setView] = useState<View>(() => (shared ? 'wishlist' : 'library'))
  const [drop, setDrop] = useState<Book | null>(null)
  const [pageFor, setPageFor] = useState<{ book: Book; seconds?: number } | null>(null)
  const { timer, start: startTimer, toggle: toggleTimer, stop: stopTimer } = useReadingTimer()
  const timerBook = timer ? books.find((b) => b.id === timer.bookId) : undefined
  const [dropTimer, setDropTimer] = useState(false)
  const [lendFor, setLendFor] = useState<Book | null>(null)
  // a running session for this book travels with the page note, and stops only once the note is saved
  const logPage = (b: Book) => setPageFor({ book: b, seconds: timer?.bookId === b.id ? Math.round(elapsed(timer) / 1000) : undefined })
  const [nextUp, setNextUp] = useState<string | null>(null)
  const [more, setMore] = useState(false)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  // the text search lives in «Colección completa»; leaving it clears the query so the shelves never stay filtered unseen
  useEffect(() => { if (view !== 'collection') setFilters((f) => (f.q ? { ...f, q: '' } : f)) }, [view])
  const [stage, setStage] = useState<{ id: string; origin: OpenOrigin; initial: 'enter' | 'return'; n: number } | null>(null)
  const [reading, setReading] = useState<{ id: string; fromStart: boolean } | null>(null)
  const [form, setForm] = useState<{ book?: Book; kind?: AddKind; preset?: Partial<Book>; onSaved?: (b: Book) => void } | null>(null)
  const [confirmDel, setConfirmDel] = useState<Book | null>(null)
  const [showSettings, setShowSettings] = useState<PrefTab | false>(false)
  const [review, setReview] = useState<{ id: string; justFinished?: boolean } | null>(null)
  const pendingReview = useRef<string | null>(null)

  // Chrome/Edge/Android offer an install prompt for the PWA build; keep it for an "Instalar app" button.
  const [installEvt, setInstallEvt] = useState<(Event & { prompt: () => Promise<void> }) | null>(null)
  useEffect(() => {
    const on = (e: Event) => { e.preventDefault(); setInstallEvt(e as Event & { prompt: () => Promise<void> }) }
    const done = () => setInstallEvt(null)
    window.addEventListener('beforeinstallprompt', on)
    window.addEventListener('appinstalled', done)
    return () => { window.removeEventListener('beforeinstallprompt', on); window.removeEventListener('appinstalled', done) }
  }, [])
  const install = async () => { await installEvt?.prompt().catch(() => {}); setInstallEvt(null) }

  useEffect(() => { window.scrollTo({ top: 0 }) }, [view])

  // after restoring a backup the page reloads; say what came back
  useEffect(() => {
    if (!ready) return
    try {
      const r = sessionStorage.getItem('exl-restored')
      if (!r) return
      sessionStorage.removeItem('exl-restored')
      const { added, updated } = JSON.parse(r) as { added: number; updated: number }
      notify(`Respaldo restaurado: ${added} ${added === 1 ? 'libro nuevo' : 'libros nuevos'}${updated ? `, ${updated} actualizados` : ''}`)
    } catch { /* ignore */ }
  }, [ready, notify])

  const visible = useMemo(() => applyFilters(books, filters), [books, filters])
  const stageBook = stage ? books.find((b) => b.id === stage.id) : undefined
  const readingBook = reading ? books.find((b) => b.id === reading.id) : undefined

  // Hide the library behind the reader so it doesn't scroll underneath
  useEffect(() => {
    document.body.style.overflow = stage || reading ? 'hidden' : ''
  }, [stage, reading])

  const open = useCallback((b: Book, origin: OpenOrigin) => {
    setStage({ id: b.id, origin, initial: 'enter', n: Date.now() })
  }, [])

  const openFromElement = useCallback((b: Book, el: HTMLElement) => {
    open(b, { rect: el.getBoundingClientRect(), pose: 'flat' })
  }, [open])

  const closeReader = useCallback((finishedNow?: boolean) => {
    if (!reading) return
    const id = reading.id
    // a book finished in this session gets its review card once it is back on the shelf
    if (finishedNow) pendingReview.current = id
    setReading(null)
    // show the closing book, then let it fly back to its shelf
    setStage({ id, origin: { rect: new DOMRect(), pose: 'spine' }, initial: 'return', n: Date.now() })
  }, [reading])

  /** Start the next book: paper books just change state; digital ones open their preview. */
  const startBook = useCallback((b: Book) => {
    if (isManual(b)) {
      setStatus(b.id, 'leyendo')
      notify(`¡A leer «${b.title}»! Anota tu página cuando quieras.`)
      setView('library')
      return
    }
    const w = window.innerWidth, h = window.innerHeight
    setView('library')
    open(b, { rect: new DOMRect(w / 2 - 60, h / 2 - 90, 120, 180), pose: 'flat' })
  }, [open, setStatus, notify])

  const go = (v: View) => { setMore(false); setView(view === v ? 'library' : v) }

  const doDelete = async (b: Book) => {
    setConfirmDel(null)
    setForm(null)
    if (stage?.id === b.id) setStage(null)
    await removeBook(b.id)
    notify(`«${b.title}» se retiró de la biblioteca`)
  }

  // once a day, a gentle note about books that should have come back
  useEffect(() => {
    if (!ready) return
    const late = books.filter((b) => b.loan && loanState(b.loan).overdue)
    if (!late.length) return
    const key = 'exl-loan-nudge', today = new Date().toDateString()
    try { if (localStorage.getItem(key) === today) return; localStorage.setItem(key, today) } catch { /* private mode: show it anyway */ }
    const t = setTimeout(() => notify(late.length === 1 ? `«${late[0].title}» ya debería haber vuelto de casa de ${late[0].loan!.to.split(' ')[0]}` : `${late.length} libros prestados ya deberían haber vuelto`), 1800)
    return () => clearTimeout(t)
  }, [ready]) // eslint-disable-line react-hooks/exhaustive-deps

  const libraryName = settings.libraryName || 'Ex Libris'

  return (
    <div className="room">
      <div className="wrap">
        <header className="topbar">
          <button className="wordmark" onClick={() => setView('library')} aria-label={`${libraryName}, ir a la estantería`}>
            {libraryName.split(' ').length > 1
              ? <>{libraryName.split(' ').slice(0, -1).join(' ')} <i>{libraryName.split(' ').slice(-1)}</i></>
              : <i>{libraryName}</i>}
            {__BETA__ && <span className="beta-tag">Beta</span>}
          </button>
          {installEvt && (
            <button className="chip hide-sm" onClick={install}>Instalar app</button>
          )}
          <nav className="topnav" aria-label="Secciones">
            <button className="icon-btn hide-sm" aria-pressed={view === 'recs'} onClick={() => go('recs')} aria-label="Libros que pueden gustarte" title="Libros que pueden gustarte"><Sparkle /></button>
            <button className="icon-btn hide-sm" aria-pressed={view === 'tbr'} onClick={() => go('tbr')} aria-label="Por leer" title="Por leer"><Queue /></button>
            <button className="icon-btn hide-sm" aria-pressed={view === 'wishlist'} onClick={() => go('wishlist')} aria-label="Wishlist" title="Wishlist"><Bag /></button>
            <button className="icon-btn hide-sm" aria-pressed={view === 'collection'} onClick={() => go('collection')} aria-label="Colección completa" title="Colección completa"><Books /></button>
            <button className="icon-btn hide-sm" aria-pressed={view === 'stats'} onClick={() => go('stats')} aria-label="Estadísticas por género" title="Estadísticas por género"><BarChart /></button>
            <button className="icon-btn hide-sm" aria-pressed={view === 'history'} onClick={() => go('history')} aria-label="Historial de lectura" title="Historial de lectura"><Clock /></button>
            <button className="icon-btn hide-sm" onClick={() => setShowSettings('apariencia')} aria-label="Preferencias" title="Preferencias"><SettingsIcon /></button>
            <button className="btn btn-gold" onClick={() => setForm({})} aria-label="Añadir libro"><Plus size={16} /><span className="hide-sm">Añadir libro</span></button>
          </nav>
        </header>

        {!persistent && ready && (
          <p className="notice">Este navegador no permite guardar datos en este momento. Puedes leer y añadir libros, pero se perderán al cerrar la pestaña.</p>
        )}

        {!ready ? (
          <div className="empty-state" role="status"><div className="spin" /><p>Abriendo la biblioteca…</p></div>
        ) : (
          // CSS entrance: the new view appears at once, without waiting for the old one to fade out
          <main key={view} className="view-in">
              <Suspense fallback={<ViewSkeleton />}>
              {view === 'library' && (
                <Library
                  visible={visible}
                  filters={filters}
                  setFilters={setFilters}
                  selectedId={stage?.id ?? reading?.id}
                  onOpen={open}
                  onAdd={() => setForm({})}
                  onCollection={() => setView('collection')}
                  onStart={startBook}
                  onTbr={() => setView('tbr')}
                  onDrop={setDrop}
                  onRecs={() => setView('recs')}
                  onYear={() => setView('year')}
                  onGoals={() => setShowSettings('metas')}
                />
              )}
              {view === 'year' && <YearReview onBack={() => setView('library')} onOpenBook={openFromElement} />}
              {view === 'collection' && (
                <Collection
                  visible={visible}
                  filters={filters}
                  setFilters={setFilters}
                  onBack={() => setView('library')}
                  onAdd={() => setForm({})}
                  onEdit={(b) => setForm({ book: b })}
                  onDelete={(b) => setConfirmDel(b)}
                  onPreview={openFromElement}
                  onReview={(b) => setReview({ id: b.id })}
                  onDrop={setDrop}
                  onPage={logPage}
                />
              )}
              {view === 'recs' && <Recs onBack={() => setView('library')} onWishlist={() => setView('wishlist')} />}
              {view === 'tbr' && <Tbr onBack={() => setView('library')} onStart={startBook} onOpenBook={openFromElement} onWishlist={() => setView('wishlist')} />}
              {view === 'wishlist' && (
                <Wishlist
                  onBack={() => setView('library')}
                  shared={shared}
                  onSharedDone={() => setShared(null)}
                  onBuyDigital={(preset, wishId, keep) => setForm({ kind: 'digital', preset, onSaved: (b) => wishBought(wishId, b.id, keep) })}
                  onRecs={() => setView('recs')}
                />
              )}
              {view === 'history' && <History onBack={() => setView('library')} />}
              {view === 'stats' && <Stats onBack={() => setView('library')} onOpenBook={openFromElement} />}
              </Suspense>
          </main>
        )}
      </div>

      {stage && stageBook && (
        <Stage
          key={stage.n}
          book={stageBook}
          origin={stage.origin}
          initial={stage.initial}
          onRead={(fromStart) => {
            setReading({ id: stageBook.id, fromStart })
            setTimeout(() => setStage((s) => (s && s.initial === 'enter' ? null : s)), 500)
          }}
          onClosed={() => {
            setStage(null)
            if (pendingReview.current) { setReview({ id: pendingReview.current, justFinished: true }); pendingReview.current = null }
          }}
          onEdit={() => setForm({ book: stageBook })}
          onReview={() => setReview({ id: stageBook.id })}
          onPage={() => logPage(stageBook)}
          timing={timer?.bookId === stageBook.id}
          onLend={lendable(stageBook) ? () => setLendFor(stageBook) : undefined}
          onTimer={isManual(stageBook) && timer?.bookId !== stageBook.id ? () => { startTimer(stageBook.id); haptic('tap'); notify('Cronómetro en marcha. Cuando termines, anota tu página.') } : undefined}
          onDrop={() => setDrop(stageBook)}
        />
      )}

      <Suspense fallback={null}><AnimatePresence>
        {reading && readingBook && <Reader key={reading.id} book={readingBook} fromStart={reading.fromStart} onClose={closeReader} />}
      </AnimatePresence></Suspense>

      <Suspense fallback={null}><AnimatePresence>
        {form && (
          <BookForm key={form.book?.id ?? 'new'} book={form.book} kind={form.kind} preset={form.preset} onSaved={form.onSaved} onClose={() => setForm(null)} onDelete={(b) => setConfirmDel(b)} />
        )}
      </AnimatePresence></Suspense>

      <AnimatePresence>
        {confirmDel && (
          <ConfirmDialog
            title="¿Eliminar este libro?"
            message={<>Se quitará <b style={{ color: 'var(--ivory)' }}>«{confirmDel.title}»</b> de la estantería junto con su archivo y su progreso de lectura. Esta acción no se puede deshacer.</>}
            confirmLabel="Eliminar libro"
            onConfirm={() => doDelete(confirmDel)}
            onCancel={() => setConfirmDel(null)}
          />
        )}
      </AnimatePresence>

      <Suspense fallback={null}><AnimatePresence>
        {review && books.find((b) => b.id === review.id) && (
          <ReviewDialog key={review.id} book={books.find((b) => b.id === review.id)!} justFinished={review.justFinished} onClose={() => { if (review.justFinished) setNextUp(review.id); setReview(null) }} />
        )}
      </AnimatePresence></Suspense>

      <Suspense fallback={null}><AnimatePresence>{showSettings && <Preferences initialTab={showSettings} onClose={() => setShowSettings(false)} />}</AnimatePresence></Suspense>
      <Suspense fallback={null}><AnimatePresence>
        {drop && <DropDialog key={drop.id} book={books.find((b) => b.id === drop.id) ?? drop} onClose={() => setDrop(null)} onDropped={(id) => { if (stage?.id === id) setStage(null); setNextUp(id) }} />}
      </AnimatePresence></Suspense>
      <Suspense fallback={null}><AnimatePresence>
        {pageFor && <PageDialog key={pageFor.book.id} book={books.find((b) => b.id === pageFor.book.id) ?? pageFor.book} seconds={pageFor.seconds} onLogged={pageFor.seconds ? stopTimer : undefined} onClose={() => setPageFor(null)} onFinished={(id) => setReview({ id, justFinished: true })} />}
      </AnimatePresence></Suspense>
      <AnimatePresence>
        {lendFor && <LoanDialog key={lendFor.id} book={books.find((b) => b.id === lendFor.id) ?? lendFor} onClose={() => setLendFor(null)} />}
      </AnimatePresence>
      <Suspense fallback={null}><AnimatePresence>
        {nextUp && <NextUpDialog afterId={nextUp} onClose={() => setNextUp(null)} onStart={(b) => { setStage(null); startBook(b) }} onGoTbr={() => { setStage(null); setView('tbr') }} />}
      </AnimatePresence></Suspense>

      {/* phone: sections live in a bottom bar, like an app */}
      <nav className="tabbar" aria-label="Secciones">
        {([['library', 'Estantería', Shelf], ['recs', 'Para ti', Sparkle], ['tbr', 'Por leer', Queue], ['wishlist', 'Wishlist', Bag]] as const).map(([v, label, Icon]) => (
          <button key={v} aria-current={view === v && !more ? 'page' : undefined} onClick={() => { setMore(false); setView(v) }}><Icon size={20} /><span>{label}</span></button>
        ))}
        <button aria-expanded={more} aria-current={more || view === 'stats' || view === 'history' || view === 'collection' || view === 'year' ? 'page' : undefined} onClick={() => setMore((m) => !m)}><More size={20} /><span>Más</span></button>
      </nav>
      <AnimatePresence>
        {more && (
          <>
            <motion.div className="sheet-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMore(false)} />
            <motion.div className="sheet" role="menu" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }} transition={{ duration: 0.22 }}>
              <button role="menuitem" onClick={() => { setMore(false); setView('collection') }}><Books /> Colección completa</button>
              <button role="menuitem" onClick={() => { setMore(false); setView('stats') }}><BarChart /> Estadísticas</button>
              <button role="menuitem" onClick={() => { setMore(false); setView('history') }}><Clock /> Historial de lectura</button>
              <button role="menuitem" onClick={() => { setMore(false); setView('year') }}><Sparkle /> Tu año en libros</button>
              <button role="menuitem" onClick={() => { setMore(false); setShowSettings('apariencia') }}><SettingsIcon /> Preferencias</button>
              {installEvt && <button role="menuitem" onClick={() => { setMore(false); install() }}><Plus /> Instalar app</button>}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {timer && timerBook && !reading && (
          <TimerPill
            timer={timer}
            book={timerBook}
            onToggle={toggleTimer}
            onFinish={() => logPage(timerBook)}
            onDiscard={() => (elapsed(timer) > 60000 ? setDropTimer(true) : (stopTimer(), notify('Cronómetro descartado')))}
            onOpen={() => { if (stage?.id !== timerBook.id) open(timerBook, { rect: new DOMRect(window.innerWidth / 2 - 60, window.innerHeight / 2 - 90, 120, 180), pose: 'flat' }) }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {dropTimer && (
          <ConfirmDialog
            title="¿Descartar esta sesión?"
            message="El tiempo cronometrado no se guardará en tu racha ni en tus estadísticas."
            confirmLabel="Descartar"
            onConfirm={() => { stopTimer(); setDropTimer(false); notify('Cronómetro descartado') }}
            onCancel={() => setDropTimer(false)}
          />
        )}
      </AnimatePresence>

      <div className="toasts" aria-live="polite">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div key={t.id} className={`toast${t.tone === 'error' ? ' error' : ''}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
              {t.tone === 'error' ? <Close size={14} /> : <Check size={14} />}{t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
