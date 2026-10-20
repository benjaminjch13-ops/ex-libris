import { Suspense, lazy, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { Book, Status } from '../types'
import { useLibrary } from '../state/library'
import { inspectFile, emptyBook, paletteForBook, MAX_FILE_MB } from '../lib/importer'
import { uid } from '../lib/db'
import { fmtSize } from '../lib/hooks'
import { Modal } from './Modal'
import { Cover } from './BookArt'
import { Camera, Trash, Upload } from './Icons'
import type { PhotoKind } from './PhotoCrop'
import { GENRES } from '../lib/genres'
import { Scanner } from './Scanner'
import { Finder, type PickExtra } from './Finder'
import { fetchCoverBlob, lookupIsbn, type CatalogHit } from '../lib/lookup'
import { isbnOrigin, originLabel, originSentence } from '../lib/isbn-origin'

export type AddKind = 'digital' | 'fisico' | 'lote'

const BulkImport = lazy(() => import('./BulkImport').then((m) => ({ default: m.BulkImport })))
const PhotoCrop = lazy(() => import('./PhotoCrop').then((m) => ({ default: m.PhotoCrop })))

const BASE_CATEGORIES = ['Novela', 'Relatos', 'Poesía', 'Ensayo', 'Historia', 'Divulgación', 'Misterio', 'Biografía', 'Filosofía', 'Fantasía', 'Ciencia ficción', 'Infantil', 'Técnico', 'Manga', 'Cómic']

export function BookForm({ book, onClose, onDelete, kind: initialKind, preset, onSaved }: {
  book?: Book
  onClose: () => void
  onDelete?: (b: Book) => void
  kind?: AddKind
  /** fields already known (a wishlist entry that was bought) */
  preset?: Partial<Book>
  onSaved?: (b: Book) => void
}) {
  const { books, saveBook, notify, coverUrl, spineUrl, addHistory, addToTbr } = useLibrary()
  const editing = !!book
  const [kind, setKind] = useState<AddKind>(book ? (book.format === 'fisico' ? 'fisico' : 'digital') : initialKind ?? 'digital')
  const [draft, setDraft] = useState<Book>(() => book ? { ...book } : { ...emptyBook(uid()), ...preset })
  const [scan, setScan] = useState<null | 'one' | 'many'>(null)
  const [looking, setLooking] = useState(false)
  const [batch, setBatch] = useState<{ isbn: string; title?: string; state: 'busy' | 'ok' | 'dup' | 'miss' }[]>([])
  const [batchTbr, setBatchTbr] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [coverTouched, setCoverTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [inspecting, setInspecting] = useState(false)
  const [fileError, setFileError] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [over, setOver] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const coverInput = useRef<HTMLInputElement>(null)
  const [newCat, setNewCat] = useState(false)
  const [bulkFiles, setBulkFiles] = useState<File[] | undefined>()
  const [photo, setPhoto] = useState<{ kind: PhotoKind; file: File } | null>(null)
  /** a scanned ISBN the catalogues don't know: the title search keeps it and the publisher */
  const [miss, setMiss] = useState<{ isbn: string; label: string; publisher?: string } | null>(null)
  const lookFor = (isbn: string) => {
    const o = isbnOrigin(isbn)
    setMiss({ isbn, label: originSentence(o), publisher: o.publisher })
    set({ isbn, publisher: o.publisher })
    setTimeout(() => document.getElementById('finder-q')?.focus(), 350)
  }
  const camInput = useRef<HTMLInputElement>(null)
  const camKind = useRef<PhotoKind>('portada')
  const shoot = (k: PhotoKind) => { camKind.current = k; camInput.current?.click() }
  const spinePreview = spineUrl(draft)
  /** several files, a .zip or a CSV dropped on the single-book form go to the bulk import */
  const toBulk = (list: File[]) => { setBulkFiles(list); setKind('lote'); setScan(null) }

  const categories = useMemo(() => {
    const s = new Set([...BASE_CATEGORIES, ...books.map((b) => b.category).filter(Boolean)])
    return [...s].sort((a, b) => a.localeCompare(b, 'es'))
  }, [books])

  const set = (patch: Partial<Book>) => setDraft((d) => ({ ...d, ...patch }))

  async function takeFile(f: File) {
    setFileError('')
    setInspecting(true)
    try {
      const info = await inspectFile(f)
      setFile(f)
      setDraft((d) => ({
        ...d,
        format: info.format,
        fileName: f.name,
        fileSize: f.size,
        pages: info.pages ?? d.pages,
        title: d.title || info.title || f.name.replace(/\.(epub|pdf)$/i, '').replace(/[_-]+/g, ' '),
        author: d.author || info.author || '',
        description: d.description || info.description || '',
        coverBlob: coverTouched ? d.coverBlob : info.coverBlob ?? d.coverBlob,
        progress: editing && d.fileName !== f.name ? undefined : d.progress,
      }))
    } catch (e) {
      setFile(null)
      setFileError((e as Error).message || 'No se pudo leer el archivo.')
    } finally {
      setInspecting(false)
    }
  }

  /** Fill the form from a catalogue result; the cover is stored locally when the host allows it. */
  async function applyHit(h: CatalogHit, extra?: PickExtra) {
    setDraft((d) => ({
      ...d,
      title: h.title || d.title,
      ...(h.manga ? { volume: extra?.volume ?? d.volume, category: d.category || 'Manga' } : {}),
      author: h.author || d.author,
      pages: h.pages ?? d.pages,
      year: h.year ?? d.year,
      // a scanned ISBN stays: the result may be another edition (often the e-book) of the same book
      isbn: miss?.isbn ?? h.isbn ?? d.isbn,
      // for manga the catalogues know the series, not the Spanish publisher of your edition
      publisher: miss?.publisher ?? (h.manga ? d.publisher : h.publisher) ?? d.publisher,
      description: d.description || h.description || '',
      genre: d.genre || h.genre,
      coverRemote: coverTouched ? d.coverRemote : h.cover,
      coverBlob: coverTouched ? d.coverBlob : undefined,
    }))
    if (!coverTouched && h.cover) {
      const blob = await fetchCoverBlob(h.cover)
      if (blob) setDraft((d) => (d.coverRemote === h.cover ? { ...d, coverBlob: blob, coverRemote: undefined } : d))
    }
  }

  async function scanned(isbn: string) {
    setScan(null)
    setLooking(true)
    const h = await lookupIsbn(isbn).catch(() => undefined)
    setLooking(false)
    if (h) { setMiss(null); await applyHit(h); notify(`Encontré «${h.title}»`) }
    else lookFor(isbn)
  }

  /** "Escanear varios": every code becomes a paper book on the shelf straight away. */
  async function scannedMany(isbn: string) {
    if (books.some((b) => b.isbn === isbn) || batch.some((x) => x.isbn === isbn)) {
      setBatch((l) => (l.some((x) => x.isbn === isbn) ? l : [{ isbn, title: books.find((b) => b.isbn === isbn)?.title, state: 'dup' }, ...l]))
      return
    }
    setBatch((l) => [{ isbn, state: 'busy' }, ...l])
    const h = await lookupIsbn(isbn).catch(() => undefined)
    if (!h) { setBatch((l) => l.map((x) => (x.isbn === isbn ? { ...x, state: 'miss' } : x))); return }
    const coverBlob = await fetchCoverBlob(h.cover)
    const b: Book = {
      ...emptyBook(uid()),
      format: 'fisico',
      title: h.title, author: h.author || 'Autor desconocido', pages: h.pages, year: h.year, isbn, publisher: h.publisher ?? isbnOrigin(isbn).publisher,
      description: h.description ?? '', genre: h.genre, category: 'Sin categoría',
      coverBlob, coverRemote: coverBlob ? undefined : h.cover,
      palette: await paletteForBook(h.title, coverBlob),
    }
    await saveBook(b)
    addHistory({ bookId: b.id, title: b.title, author: b.author, type: 'agregado', at: Date.now() })
    if (batchTbr) addToTbr(b.id)
    setBatch((l) => l.map((x) => (x.isbn === isbn ? { ...x, title: h.title, state: 'ok' } : x)))
  }

  async function takeCover(f: File) {
    if (!f.type.startsWith('image/')) { notify('La portada debe ser una imagen (JPG, PNG o WebP).', 'error'); return }
    if (f.size > 12 * 1024 * 1024) { notify('La imagen de portada pesa más de 12 MB.', 'error'); return }
    setCoverTouched(true)
    set({ coverBlob: f })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!draft.title.trim()) errs.title = 'Escribe el título.'
    if (!draft.author.trim()) errs.author = 'Escribe el autor o autora.'
    if (!editing && !file && kind === 'digital') errs.file = 'Elige un archivo EPUB o PDF.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    try {
      const palette = await paletteForBook(draft.title, draft.coverBlob)
      const final: Book = {
        ...draft,
        format: kind === 'fisico' ? 'fisico' : draft.format === 'fisico' ? 'epub' : draft.format,
        title: draft.title.trim(),
        author: draft.author.trim(),
        description: draft.description.trim(),
        category: draft.category.trim() || 'Sin categoría',
        palette: draft.coverBlob || !editing ? palette : draft.palette,
        // marked as finished from the form: record when, so the review shows a date instead of «—»
        finishedAt: draft.status === 'terminado' ? draft.finishedAt ?? Date.now() : draft.finishedAt,
      }
      await saveBook(final, file ?? undefined)
      onSaved?.(final)
      notify(editing ? 'Cambios guardados' : `«${final.title}» ya está en la estantería`)
      if (!editing) {
        addHistory({ bookId: final.id, title: final.title, author: final.author, type: 'agregado', at: Date.now() })
      }
      onClose()
    } catch (err) {
      console.error(err)
      notify('No se pudo guardar. Puede que el navegador no tenga espacio disponible.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const previewBook: Book = { ...draft, title: draft.title || 'Título del libro', author: draft.author || 'Autor', category: draft.category }
  const hasCover = !!coverUrl(draft)
  const added = batch.filter((x) => x.state === 'ok').length

  return (
    <Modal
      title={editing ? 'Editar libro' : scan === 'many' ? 'Escanear varios libros' : kind === 'lote' ? 'Importar libros' : 'Añadir un libro'}
      onClose={onClose}
      footer={kind === 'lote' || photo ? undefined : <>
        {scan === 'many' ? <button type="button" className="btn btn-gold" onClick={() => { setScan(null); if (added) onClose() }}>{added ? `Listo · ${added} ${added === 1 ? 'libro añadido' : 'libros añadidos'}` : 'Cerrar escáner'}</button> : <>
        {editing && onDelete && <button type="button" className="btn" style={{ marginRight: 'auto', color: 'var(--danger)' }} onClick={() => onDelete(book!)}><Trash size={15} /> Eliminar</button>}
        <button type="button" className="btn" onClick={onClose}>Cancelar</button>
        <button type="submit" form="book-form" className="btn btn-gold" disabled={busy || inspecting}>
          {busy ? <span className="spin" /> : null}{editing ? 'Guardar cambios' : 'Colocar en la estantería'}
        </button>
      </>}</>}
    >
      {!editing && !preset?.title && (
        <div className="seg seg-3" role="radiogroup" aria-label="Tipo de libro">
          <button type="button" role="radio" aria-checked={kind === 'digital'} onClick={() => { setKind('digital'); setScan(null) }}>EPUB o PDF</button>
          <button type="button" role="radio" aria-checked={kind === 'fisico'} onClick={() => setKind('fisico')}>Libro de papel</button>
          <button type="button" role="radio" aria-checked={kind === 'lote'} onClick={() => { setKind('lote'); setScan(null) }}>Importar</button>
        </div>
      )}
      <AnimatePresence>
        {scan && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
            <Scanner continuous={scan === 'many'} onCode={scan === 'many' ? scannedMany : scanned} onClose={() => setScan(null)}>
              {scan === 'many' && (
                <>
                  <label className="check"><input type="checkbox" checked={batchTbr} onChange={(e) => setBatchTbr(e.target.checked)} /> Añadirlos también a mi lista «Por leer»</label>
                  {batch.length > 0 && (
                    <ul className="batch" aria-live="polite">
                      {batch.map((x) => (
                        <li key={x.isbn} className={`b-${x.state}`}>
                          <span>{x.state === 'busy' ? <span className="spin" /> : x.state === 'ok' ? '✓' : x.state === 'dup' ? '=' : '?'}</span>
                          <b>{x.title ?? x.isbn}</b>
                          <em>{x.state === 'busy' ? 'buscando…' : x.state === 'ok' ? 'en la estantería' : x.state === 'dup' ? 'ya lo tienes' : `no está por ISBN${originLabel(isbnOrigin(x.isbn)) ? ` · ${originLabel(isbnOrigin(x.isbn))}` : ''}`}</em>
                          {x.state === 'miss' && <button type="button" className="chip b-find" onClick={() => { setScan(null); lookFor(x.isbn); setBatch((l) => l.filter((y) => y.isbn !== x.isbn)) }}>Buscar por título</button>}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </Scanner>
          </motion.div>
        )}
      </AnimatePresence>
      {kind === 'lote' && (
        <Suspense fallback={<p className="hint"><span className="spin" /> Preparando…</p>}>
          <BulkImport initial={bulkFiles} onDone={onClose} />
        </Suspense>
      )}
      {photo && (
        <Suspense fallback={<p className="hint"><span className="spin" /> Abriendo la foto…</p>}>
          <PhotoCrop
            file={photo.file}
            kind={photo.kind}
            onCancel={() => setPhoto(null)}
            onRetake={() => shoot(photo.kind)}
            onDone={(blob, ratio) => {
              if (photo.kind === 'portada') { setCoverTouched(true); set({ coverBlob: blob, coverRemote: undefined, coverRatio: ratio }) }
              else set({ spineBlob: blob, spineRatio: ratio })
              setPhoto(null)
              notify(photo.kind === 'portada' ? 'Portada lista: así se verá en tu estante' : 'Lomo listo: así se verá en tu estante')
            }}
          />
        </Suspense>
      )}
      <form id="book-form" onSubmit={submit} noValidate style={{ display: scan === 'many' || kind === 'lote' || photo ? 'none' : undefined }}>
        <div className={`form-grid${kind === 'fisico' ? ' paper' : ''}`}>
          <div className="cover-col">
            <div className="cover-pick-row">
              <div className="cover-pick"><Cover book={previewBook} /></div>
              {kind === 'fisico' && (
                <button type="button" className={`spine-pick${spinePreview ? ' has' : ''}`} onClick={() => shoot('lomo')} aria-label={spinePreview ? 'Cambiar foto del lomo' : 'Tomar foto del lomo'} title="Foto del lomo">
                  {spinePreview ? <img src={spinePreview} alt="Lomo del libro" /> : <span>Lomo</span>}
                </button>
              )}
            </div>
            {kind === 'fisico' && (
              <div className="photo-btns">
                <button type="button" className="btn small-btn" onClick={() => shoot('portada')}><Camera size={15} /> Foto de portada</button>
                <button type="button" className="btn small-btn" onClick={() => shoot('lomo')}><Camera size={15} /> {spinePreview ? 'Otra foto del lomo' : 'Foto del lomo'}</button>
                {spinePreview && <button type="button" className="btn small-btn" onClick={() => set({ spineBlob: undefined, spineRatio: undefined })}>Quitar lomo</button>}
              </div>
            )}
            <input ref={camInput} className="sr-only-input" type="file" accept="image/*" capture="environment" aria-label="Foto del libro" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setPhoto({ kind: camKind.current, file: f }); setScan(null) } e.target.value = '' }} />
            <div className="cover-actions">
              <button type="button" className="btn small-btn" onClick={() => coverInput.current?.click()}><Upload size={14} /> {hasCover ? 'Cambiar portada' : 'Subir portada'}</button>
              {hasCover && <button type="button" className="btn small-btn" onClick={() => { setCoverTouched(true); set({ coverBlob: undefined, coverRemote: undefined, coverRatio: undefined }) }}>Quitar</button>}
            </div>
            <input ref={coverInput} id="bf-cover" className="sr-only-input" type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) takeCover(f); e.target.value = '' }} />
            {!hasCover && <p className="field" style={{ marginTop: 10 }}><span className="hint">Sin imagen, la portada se compone con el título y un color de tela.</span></p>}
          </div>

          <div className="fields">
            {kind === 'fisico' ? (
              <div className="field">
                <span className="lbl">Buscar el libro</span>
                <div className="scan-btns">
                  <button type="button" className="btn btn-gold" onClick={() => setScan('one')} disabled={looking}>{looking ? <span className="spin" /> : <BarcodeIcon />} Escanear código de barras</button>
                  {!editing && <button type="button" className="btn" onClick={() => setScan('many')}>Escanear varios</button>}
                </div>
                {miss && (
                  <div className="miss-note" role="status">
                    <b>Ese ISBN no está en los catálogos{miss.label ? `: ${miss.label}` : ''}.</b>
                    <span>Muchas ediciones en español no se registran por ISBN, pero sí aparecen por título. Escribe el título y elige el que coincida: guardo tu ISBN {miss.isbn}{miss.publisher ? ' y la editorial' : ''}.</span>
                  </div>
                )}
                <Finder onPick={applyHit} autoQuery={preset?.title} onIsbnMiss={lookFor} placeholder={miss ? 'Título del libro (y autor si lo sabes)' : undefined} />
                <span className="hint">Traemos título, autor, editorial, páginas y portada de Google Books, Open Library y Apple Books.</span>
              </div>
            ) : (
            <div className="field">
              <span className="lbl">Archivo del libro</span>
              <div
                className={`dropzone${over ? ' over' : ''}${file || (editing && draft.fileName) ? ' has-file' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => fileInput.current?.click()}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.current?.click() } }}
                onDragOver={(e) => { e.preventDefault(); setOver(true) }}
                onDragLeave={() => setOver(false)}
                onDrop={(e) => { e.preventDefault(); setOver(false); const fs = [...(e.dataTransfer.files ?? [])]; if (fs.length > 1 || /\.(zip|csv|tsv)$/i.test(fs[0]?.name ?? '')) toBulk(fs); else if (fs[0]) takeFile(fs[0]) }}
                aria-describedby="bf-file-hint"
              >
                {inspecting ? (
                  <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}><span className="spin" /> Leyendo el archivo…</span>
                ) : file || (editing && draft.fileName) ? (
                  <span><b>{draft.fileName ?? 'Edición de muestra'}</b> · {draft.format.toUpperCase()}{draft.fileSize ? ` · ${fmtSize(draft.fileSize)}` : ''}<br /><span className="hint" style={{ color: 'var(--muted)', fontSize: 12.5 }}>Haz clic para reemplazarlo</span></span>
                ) : editing && draft.format === 'catalogo' ? (
                  <span><b>Sin archivo todavía</b><br /><span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Arrastra o elige el EPUB o PDF para poder leerlo aquí</span></span>
                ) : editing && draft.format === 'demo' ? (
                  <span><b>Edición de muestra</b><br /><span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Puedes cargar un EPUB o PDF para reemplazarla</span></span>
                ) : (
                  <>
                    <Upload size={22} />
                    {window.matchMedia?.('(hover: none)').matches
                      ? <span><b>Toca para elegir un EPUB o PDF</b></span>
                      : <span><b>Arrastra un EPUB o PDF</b> o haz clic para elegirlo</span>}
                  </>
                )}
              </div>
              <input ref={fileInput} id="bf-file" className="sr-only-input" type="file" multiple accept=".epub,.pdf,application/epub+zip,application/pdf" onChange={(e) => { const fs = [...(e.target.files ?? [])]; if (fs.length > 1) toBulk(fs); else if (fs[0]) takeFile(fs[0]); e.target.value = '' }} />
              <span id="bf-file-hint" className="hint">Hasta {MAX_FILE_MB} MB. Leemos título, autor y portada automáticamente si el archivo los incluye.</span>
              {(fileError || errors.file) && <span className="err" role="alert">{fileError || errors.file}</span>}
            </div>
            )}

            <div className="field">
              <label htmlFor="bf-title">Título</label>
              <input id="bf-title" value={draft.title} onChange={(e) => set({ title: e.target.value })} aria-invalid={!!errors.title} />
              {errors.title && <span className="err">{errors.title}</span>}
            </div>
            <div className="row2">
              <div className="field">
                <label htmlFor="bf-author">Autor</label>
                <input id="bf-author" value={draft.author} onChange={(e) => set({ author: e.target.value })} aria-invalid={!!errors.author} />
                {errors.author && <span className="err">{errors.author}</span>}
              </div>
              <div className="field">
                <label htmlFor="bf-cat">Categoría</label>
                {newCat ? (
                  <input id="bf-cat" value={draft.category} onChange={(e) => set({ category: e.target.value })} placeholder="Nueva categoría" onBlur={() => !draft.category && setNewCat(false)} />
                ) : (
                  <select id="bf-cat" value={draft.category} onChange={(e) => (e.target.value === '__new' ? (setNewCat(true), set({ category: '' })) : set({ category: e.target.value }))}>
                    <option value="">Elige una categoría</option>
                    {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                    <option value="__new">+ Nueva categoría…</option>
                  </select>
                )}
              </div>
            </div>
            {kind === 'fisico' && (
              <div className="row3">
                <div className="field">
                  <label htmlFor="bf-pages">Páginas</label>
                  <input id="bf-pages" inputMode="numeric" value={draft.pages ?? ''} onChange={(e) => set({ pages: Number(e.target.value.replace(/\D/g, '')) || undefined })} />
                </div>
                <div className="field">
                  <label htmlFor="bf-year">Año</label>
                  <input id="bf-year" inputMode="numeric" value={draft.year ?? ''} onChange={(e) => set({ year: Number(e.target.value.replace(/[^\d-]/g, '')) || undefined })} />
                </div>
                <div className="field">
                  <label htmlFor="bf-isbn">ISBN</label>
                  <input id="bf-isbn" inputMode="numeric" value={draft.isbn ?? ''} onChange={(e) => set({ isbn: e.target.value.trim() || undefined })} />
                </div>
              </div>
            )}
            {(draft.genre === 'Manga y cómic' || draft.volume) && (
              <div className="field">
                <label htmlFor="bf-volume">Tomo</label>
                <input id="bf-volume" inputMode="numeric" value={draft.volume ?? ''} placeholder="Número de tomo de la serie" onChange={(e) => set({ volume: Number(e.target.value.replace(/\D/g, '')) || undefined })} />
              </div>
            )}
            <div className="field">
              <label htmlFor="bf-genre">Género</label>
              <select id="bf-genre" value={draft.genre ?? ''} onChange={(e) => set({ genre: e.target.value || undefined })}>
                <option value="">Sin género</option>
                {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
              <span className="hint">Se usa en las estadísticas por género.</span>
            </div>
            <div className="field">
              <label htmlFor="bf-desc">Descripción</label>
              <textarea id="bf-desc" value={draft.description} onChange={(e) => set({ description: e.target.value })} placeholder="Una sinopsis breve o por qué quieres leerlo" />
            </div>
            <div className="row2">
              <div className="field">
                <label htmlFor="bf-status">Estado</label>
                <select id="bf-status" value={draft.status} onChange={(e) => set({ status: e.target.value as Status })}>
                  <option value="pendiente">Pendiente</option>
                  <option value="leyendo">Leyendo</option>
                  <option value="terminado">Terminado</option>
                  {editing && <option value="abandonado">Abandonado</option>}
                </select>
              </div>
              <div className="field">
                <label htmlFor="bf-fav">Favorito</label>
                <select id="bf-fav" value={draft.favorite ? '1' : '0'} onChange={(e) => set({ favorite: e.target.value === '1' })}>
                  <option value="0">No</option>
                  <option value="1">Sí</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </form>
    </Modal>
  )
}

function BarcodeIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden><path d="M3 7V4h3M21 7V4h-3M3 17v3h3M21 17v3h-3M7 8v8M10 8v8M13 8v8M16.5 8v8" /></svg>
}
