import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { Book } from './types'
import { LibraryProvider, useLibrary } from './state/library'
import { Library, type OpenOrigin } from './components/Library'
import { Stage } from './components/Stage'
import { Reader } from './components/reader/Reader'
import { BookForm } from './components/BookForm'
import { Collection } from './components/Collection'
import { History } from './components/History'
import { ReviewDialog } from './components/ReviewDialog'
import { Stats } from './components/Stats'
import { ConfirmDialog, Modal } from './components/Modal'
import { applyFilters, EMPTY_FILTERS, type Filters } from './lib/filters'
import { Check, Clock, Close, Plus, Search, Settings as SettingsIcon, Books, BarChart } from './components/Icons'

type View = 'library' | 'collection' | 'history' | 'stats'

export default function App() {
  return (
    <LibraryProvider>
      <Shell />
    </LibraryProvider>
  )
}

function Shell() {
  const { ready, books, settings, removeBook, notify, persistent, toasts } = useLibrary()
  const [view, setView] = useState<View>('library')
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [stage, setStage] = useState<{ id: string; origin: OpenOrigin; initial: 'enter' | 'return'; n: number } | null>(null)
  const [reading, setReading] = useState<{ id: string; fromStart: boolean } | null>(null)
  const [form, setForm] = useState<{ book?: Book } | null>(null)
  const [confirmDel, setConfirmDel] = useState<Book | null>(null)
  const [showSettings, setShowSettings] = useState(false)
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

  const doDelete = async (b: Book) => {
    setConfirmDel(null)
    setForm(null)
    if (stage?.id === b.id) setStage(null)
    await removeBook(b.id)
    notify(`«${b.title}» se retiró de la biblioteca`)
  }

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
          <label className="search" htmlFor="q">
            <Search size={16} style={{ color: 'var(--muted)', flex: 'none' }} />
            <input
              id="q"
              type="search"
              placeholder="Buscar por título, autor o categoría"
              value={filters.q}
              onChange={(e) => setFilters({ ...filters, q: e.target.value })}
              autoComplete="off"
            />
            {filters.q && <button className="icon-btn" style={{ width: 24, height: 24 }} onClick={() => setFilters({ ...filters, q: '' })} aria-label="Borrar búsqueda"><Close size={14} /></button>}
          </label>
          <nav style={{ display: 'flex', gap: 4, alignItems: 'center' }} aria-label="Secciones">
            <button className="icon-btn" aria-pressed={view === 'collection'} onClick={() => setView(view === 'collection' ? 'library' : 'collection')} aria-label="Colección completa" title="Colección completa"><Books /></button>
            <button className="icon-btn" aria-pressed={view === 'stats'} onClick={() => setView(view === 'stats' ? 'library' : 'stats')} aria-label="Estadísticas por género" title="Estadísticas por género"><BarChart /></button>
            <button className="icon-btn" aria-pressed={view === 'history'} onClick={() => setView(view === 'history' ? 'library' : 'history')} aria-label="Historial de lectura" title="Historial de lectura"><Clock /></button>
            <button className="icon-btn" onClick={() => setShowSettings(true)} aria-label="Preferencias" title="Preferencias"><SettingsIcon /></button>
            <button className="btn btn-gold" onClick={() => setForm({})}><Plus size={16} /><span className="hide-sm">Añadir libro</span></button>
          </nav>
        </header>

        {!persistent && ready && (
          <p className="notice">Este navegador no permite guardar datos en este momento. Puedes leer y añadir libros, pero se perderán al cerrar la pestaña.</p>
        )}

        {!ready ? (
          <div className="empty-state" role="status"><div className="spin" /><p>Abriendo la biblioteca…</p></div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.main key={view} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }}>
              {view === 'library' && (
                <Library
                  visible={visible}
                  filters={filters}
                  setFilters={setFilters}
                  selectedId={stage?.id ?? reading?.id}
                  onOpen={open}
                  onAdd={() => setForm({})}
                  onCollection={() => setView('collection')}
                />
              )}
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
                />
              )}
              {view === 'history' && <History onBack={() => setView('library')} />}
              {view === 'stats' && <Stats onBack={() => setView('library')} onOpenBook={openFromElement} />}
            </motion.main>
          </AnimatePresence>
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
        />
      )}

      <AnimatePresence>
        {reading && readingBook && <Reader key={reading.id} book={readingBook} fromStart={reading.fromStart} onClose={closeReader} />}
      </AnimatePresence>

      <AnimatePresence>
        {form && (
          <BookForm key={form.book?.id ?? 'new'} book={form.book} onClose={() => setForm(null)} onDelete={(b) => setConfirmDel(b)} />
        )}
      </AnimatePresence>

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

      <AnimatePresence>
        {review && books.find((b) => b.id === review.id) && (
          <ReviewDialog key={review.id} book={books.find((b) => b.id === review.id)!} justFinished={review.justFinished} onClose={() => setReview(null)} />
        )}
      </AnimatePresence>

      <AnimatePresence>{showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}</AnimatePresence>

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

function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { settings, updateSettings, notify } = useLibrary()
  const [libraryName, setLibraryName] = useState(settings.libraryName)
  const [readerName, setReaderName] = useState(settings.readerName)
  return (
    <Modal
      title="Preferencias"
      onClose={onClose}
      narrow
      footer={<>
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn-gold" onClick={() => { updateSettings({ libraryName: libraryName.trim() || 'Ex Libris', readerName: readerName.trim() }); notify('Preferencias guardadas'); onClose() }}>Guardar</button>
      </>}
    >
      <div className="fields">
        <div className="field">
          <label htmlFor="s-lib">Nombre de la biblioteca</label>
          <input id="s-lib" value={libraryName} onChange={(e) => setLibraryName(e.target.value)} maxLength={40} />
        </div>
        <div className="field">
          <label htmlFor="s-name">Tu nombre</label>
          <input id="s-name" value={readerName} onChange={(e) => setReaderName(e.target.value)} maxLength={30} placeholder="Para el saludo de bienvenida" />
        </div>
        <p className="hint" style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.5 }}>Tus libros, portadas y progreso se guardan solo en este navegador.</p>
        {__BETA__ && (
          <div className="install-help">
            <b>Instalar en el teléfono</b>
            <p><span>iPhone (Safari):</span> botón Compartir → «Agregar a pantalla de inicio».</p>
            <p><span>Android (Chrome):</span> menú ⋮ → «Instalar app» o «Agregar a pantalla principal».</p>
            <p className="ver">Versión beta del {__BUILD_DATE__}</p>
          </div>
        )}
      </div>
    </Modal>
  )
}
