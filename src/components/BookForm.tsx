import { useMemo, useRef, useState } from 'react'
import type { Book, Status } from '../types'
import { useLibrary } from '../state/library'
import { inspectFile, emptyBook, paletteForBook, MAX_FILE_MB } from '../lib/importer'
import { uid } from '../lib/db'
import { fmtSize } from '../lib/hooks'
import { Modal } from './Modal'
import { Cover } from './BookArt'
import { Trash, Upload } from './Icons'
import { GENRES } from '../lib/genres'

const BASE_CATEGORIES = ['Novela', 'Relatos', 'Poesía', 'Ensayo', 'Historia', 'Divulgación', 'Misterio', 'Biografía', 'Filosofía', 'Fantasía', 'Ciencia ficción', 'Infantil', 'Técnico']

export function BookForm({ book, onClose, onDelete }: { book?: Book; onClose: () => void; onDelete?: (b: Book) => void }) {
  const { books, saveBook, notify, coverUrl, addHistory } = useLibrary()
  const editing = !!book
  const [draft, setDraft] = useState<Book>(() => book ? { ...book } : emptyBook(uid()))
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
    if (!editing && !file) errs.file = 'Elige un archivo EPUB o PDF.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    try {
      const palette = await paletteForBook(draft.title, draft.coverBlob)
      const final: Book = {
        ...draft,
        title: draft.title.trim(),
        author: draft.author.trim(),
        description: draft.description.trim(),
        category: draft.category.trim() || 'Sin categoría',
        palette: draft.coverBlob || !editing ? palette : draft.palette,
      }
      await saveBook(final, file ?? undefined)
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
  const hasCover = !!draft.coverBlob && !!coverUrl(draft)

  return (
    <Modal
      title={editing ? 'Editar libro' : 'Añadir un libro'}
      onClose={onClose}
      footer={<>
        {editing && onDelete && <button type="button" className="btn" style={{ marginRight: 'auto', color: 'var(--danger)' }} onClick={() => onDelete(book!)}><Trash size={15} /> Eliminar</button>}
        <button type="button" className="btn" onClick={onClose}>Cancelar</button>
        <button type="submit" form="book-form" className="btn btn-gold" disabled={busy || inspecting}>
          {busy ? <span className="spin" /> : null}{editing ? 'Guardar cambios' : 'Colocar en la estantería'}
        </button>
      </>}
    >
      <form id="book-form" onSubmit={submit} noValidate>
        <div className="form-grid">
          <div>
            <div className="cover-pick"><Cover book={previewBook} /></div>
            <div className="cover-actions">
              <button type="button" className="btn small-btn" onClick={() => coverInput.current?.click()}><Upload size={14} /> {hasCover ? 'Cambiar portada' : 'Subir portada'}</button>
              {hasCover && <button type="button" className="btn small-btn" onClick={() => { setCoverTouched(true); set({ coverBlob: undefined }) }}>Quitar</button>}
            </div>
            <input ref={coverInput} id="bf-cover" className="sr-only-input" type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) takeCover(f); e.target.value = '' }} />
            {!hasCover && <p className="field" style={{ marginTop: 10 }}><span className="hint">Sin imagen, la portada se compone con el título y un color de tela.</span></p>}
          </div>

          <div className="fields">
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
                onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) takeFile(f) }}
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
                    <span><b>Arrastra un EPUB o PDF</b> o haz clic para elegirlo</span>
                  </>
                )}
              </div>
              <input ref={fileInput} id="bf-file" className="sr-only-input" type="file" accept=".epub,.pdf,application/epub+zip,application/pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) takeFile(f); e.target.value = '' }} />
              <span id="bf-file-hint" className="hint">Hasta {MAX_FILE_MB} MB. Leemos título, autor y portada automáticamente si el archivo los incluye.</span>
              {(fileError || errors.file) && <span className="err" role="alert">{fileError || errors.file}</span>}
            </div>

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
