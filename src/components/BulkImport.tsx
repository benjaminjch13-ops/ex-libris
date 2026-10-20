import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { Book } from '../types'
import { STATUS_LABEL } from '../types'
import { useLibrary } from '../state/library'
import { inspectFile, emptyBook, paletteForBook } from '../lib/importer'
import { uid } from '../lib/db'
import { fmtSize } from '../lib/hooks'
import { bookKey, scanInputs, type ListRow, type Scan } from '../lib/bulk'
import { fetchCoverBlob, genreFromSubjects, lookupIsbn, searchCatalog, type CatalogHit } from '../lib/lookup'
import { Check, Upload } from './Icons'

type Item =
  | { kind: 'file'; key: string; file: File; title: string; dup: boolean; on: boolean }
  | { kind: 'row'; key: string; row: ListRow; dup: boolean; on: boolean }

type Phase = 'pick' | 'reading' | 'review' | 'saving' | 'done'

const SUM_ONE = { terminado: 'leído', leyendo: 'en curso', pendiente: 'por leer', abandonado: 'abandonado' }
const SUM_MANY = { terminado: 'leídos', leyendo: 'en curso', pendiente: 'por leer', abandonado: 'abandonados' }

const nkey = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Find the same book in the catalogues to borrow its cover and missing details. */
async function enrich(r: ListRow): Promise<CatalogHit | undefined> {
  try {
    if (r.isbn) { const h = await lookupIsbn(r.isbn); if (h) return h }
    const hits = await searchCatalog(`${r.title} ${r.author.split(',')[0] ?? ''}`.trim())
    const t = nkey(r.title).slice(0, 18)
    return hits.find((h) => nkey(h.title).startsWith(t) || t.startsWith(nkey(h.title).slice(0, 18)))
  } catch { return undefined }
}

/** Runs `fn` over `items` a few at a time (catalogue lookups), calling back as each one ends. */
async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]) }))
}

export function BulkImport({ initial, onDone }: { initial?: File[]; onDone: () => void }) {
  const { books, saveBook, addToTbr, notify } = useLibrary()
  const [phase, setPhase] = useState<Phase>('pick')
  const [scan, setScan] = useState<Scan | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [paper, setPaper] = useState(true)
  const [online, setOnline] = useState(true)
  const [toTbr, setToTbr] = useState(false)
  const [over, setOver] = useState(false)
  const [done, setDone] = useState({ n: 0, ok: 0, failed: [] as string[] })
  const input = useRef<HTMLInputElement>(null)
  const started = useRef(false)

  const owned = useMemo(() => new Set(books.map((b) => bookKey(b.title, b.author))), [books])
  const ownedIsbn = useMemo(() => new Set(books.map((b) => b.isbn).filter(Boolean)), [books])

  async function take(list: File[]) {
    if (!list.length) return
    setPhase('reading')
    try {
      const s = await scanInputs(list)
      setScan(s)
      const next: Item[] = [
        ...s.files.map((f, i): Item => {
          const title = f.name.replace(/\.(epub|pdf)$/i, '').replace(/[_-]+/g, ' ').trim()
          const dup = books.some((b) => b.fileName === f.name && b.fileSize === f.size)
          return { kind: 'file', key: `f${i}`, file: f, title, dup, on: !dup }
        }),
        ...s.rows.map((row, i): Item => {
          const dup = owned.has(bookKey(row.title, row.author)) || (!!row.isbn && ownedIsbn.has(row.isbn))
          return { kind: 'row', key: `r${i}`, row, dup, on: !dup }
        }),
      ]
      setItems(next)
      setPhase(next.length ? 'review' : 'pick')
      if (!next.length) notify('No encontré libros ni listas en lo que subiste. Prueba con EPUB, PDF, un .zip o un CSV.', 'error')
    } catch (e) {
      console.error(e)
      notify('No se pudo leer lo que subiste. ¿Está dañado el archivo?', 'error')
      setPhase('pick')
    }
  }

  // files dropped on the single-book form arrive here already chosen
  useEffect(() => {
    if (initial?.length && !started.current) { started.current = true; take(initial) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const chosen = items.filter((x) => x.on)
  const rows = items.filter((x) => x.kind === 'row')
  const hasRows = rows.length > 0
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const x of items) if (x.kind === 'row') c[x.row.status] = (c[x.row.status] ?? 0) + 1
    return c
  }, [items])

  async function run() {
    setPhase('saving')
    const total = chosen.length
    let ok = 0
    const failed: string[] = []
    setDone({ n: 0, ok: 0, failed })
    const tick = () => setDone({ n: ok + failed.length, ok, failed: [...failed] })

    // digital files one by one: reading an EPUB or PDF is heavy
    for (const it of chosen) {
      if (it.kind !== 'file') continue
      try {
        const info = await inspectFile(it.file)
        const title = info.title || it.title
        const b: Book = {
          ...emptyBook(uid()),
          format: info.format, fileName: it.file.name, fileSize: it.file.size,
          title, author: info.author || 'Autor desconocido', description: info.description ?? '',
          pages: info.pages, coverBlob: info.coverBlob, category: 'Sin categoría',
          palette: await paletteForBook(title, info.coverBlob),
        }
        await saveBook(b, it.file)
        if (toTbr) addToTbr(b.id)
        ok++
      } catch (e) {
        failed.push(`${it.file.name}: ${(e as Error).message || 'no se pudo leer'}`)
      }
      tick()
    }

    // list rows: a few catalogue lookups at a time
    await pool(chosen.filter((x) => x.kind === 'row'), 3, async (it) => {
      if (it.kind !== 'row') return
      const r = it.row
      try {
        const h = online ? await enrich(r) : undefined
        const coverUrl = r.cover ?? h?.cover
        const coverBlob = online ? await fetchCoverBlob(coverUrl) : undefined
        const fmt: Book['format'] = r.app ? 'fisico' : r.ebook ? 'catalogo' : paper ? 'fisico' : 'catalogo'
        const now = Date.now()
        const b: Book = {
          ...emptyBook(uid()),
          format: fmt, app: r.app,
          title: r.title, author: r.author || h?.author || 'Autor desconocido',
          description: h?.description ?? '',
          pages: r.pages ?? h?.pages, year: r.year ?? h?.year, isbn: r.isbn ?? h?.isbn,
          category: r.genre || 'Sin categoría',
          genre: genreFromSubjects(r.genre ? [r.genre] : []) ?? h?.genre,
          status: r.status, startedAt: r.startedAt,
          finishedAt: r.status === 'terminado' ? r.finishedAt : undefined,
          review: r.rating || r.review ? { rating: r.rating ?? 0, text: r.review ?? '', updatedAt: now } : undefined,
          coverBlob, coverRemote: coverBlob ? undefined : coverUrl,
          palette: await paletteForBook(r.title, coverBlob),
        }
        await saveBook(b)
        if (toTbr && r.status === 'pendiente') addToTbr(b.id)
        ok++
      } catch (e) {
        console.error(e)
        failed.push(`${r.title}: no se pudo guardar`)
      }
      tick()
    })
    setDone({ n: total, ok, failed })
    setPhase('done')
    notify(ok === 1 ? '1 libro añadido a la biblioteca' : `${ok} libros añadidos a la biblioteca`)
  }

  const toggleAll = (on: boolean) => setItems((l) => l.map((x) => ({ ...x, on: on && !x.dup })))

  return (
    <div className="bulk">
      <AnimatePresence mode="wait" initial={false}>
        {(phase === 'pick' || phase === 'reading') && (
          <motion.div key="pick" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.22 }}>
            <button
              type="button"
              className={`dropzone${over ? ' over' : ''}`}
              style={{ width: '100%' }}
              onClick={() => input.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setOver(true) }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); take([...e.dataTransfer.files]) }}
              disabled={phase === 'reading'}
            >
              {phase === 'reading' ? <><span className="spin" /> Leyendo lo que subiste…</> : <>
                <Upload />
                <span><b>Arrastra un .zip, varios EPUB/PDF o un CSV</b> o haz clic para elegirlos</span>
              </>}
            </button>
            <input ref={input} type="file" multiple hidden accept=".zip,.epub,.pdf,.csv,.tsv,application/zip,application/epub+zip,application/pdf,text/csv" onChange={(e) => { take([...(e.target.files ?? [])]); e.target.value = '' }} />
            <div className="bulk-help">
              <details>
                <summary>Desde Notion</summary>
                <p>Abre tu base de datos de lecturas → menú <b>•••</b> (arriba a la derecha) → <b>Exportar</b> → formato <b>Markdown y CSV</b>. Sube aquí el .zip que descarga, tal cual. Leo título, autor, estado, calificación, fechas, páginas, género y reseña, aunque las columnas tengan otros nombres o emojis.</p>
              </details>
              <details>
                <summary>Desde Goodreads</summary>
                <p>En la web: <b>My Books</b> → <b>Import and export</b> → <b>Export Library</b>. Sube el archivo .csv. Tus estantes (leído, leyendo, por leer), estrellas, reseñas y fechas pasan a Ex Libris.</p>
              </details>
              <details>
                <summary>Desde una hoja de cálculo</summary>
                <p>Exporta como CSV con una fila por libro. Basta con una columna <b>Título</b>; si hay <b>Autor</b>, <b>Estado</b>, <b>Calificación</b> o <b>Fecha</b>, también los uso.</p>
              </details>
              <details>
                <summary>Muchos EPUB o PDF</summary>
                <p>Selecciona varios a la vez o comprímelos en un .zip (pueden ir en carpetas). Cada uno se coloca con su portada y sus datos.</p>
              </details>
            </div>
          </motion.div>
        )}

        {phase === 'review' && (
          <motion.div key="review" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.22 }}>
            <p className="bulk-sum">
              Encontré <b>{items.length} {items.length === 1 ? 'libro' : 'libros'}</b>
              {scan?.lists.length ? <> en {scan.lists.map((l) => `«${l.replace(/\.(csv|tsv)$/i, '')}»`).join(', ')}</> : null}
              {hasRows ? <>: {(['terminado', 'leyendo', 'pendiente', 'abandonado'] as const).filter((s) => counts[s]).map((s) => `${counts[s]} ${(counts[s] === 1 ? SUM_ONE : SUM_MANY)[s]}`).join(' · ')}</> : null}.
              {items.some((x) => x.dup) ? <> Los que ya tienes van desmarcados.</> : null}
            </p>
            {scan?.skipped.length ? <p className="hint">No usé: {scan.skipped.slice(0, 4).join(', ')}{scan.skipped.length > 4 ? ` y ${scan.skipped.length - 4} más` : ''}.</p> : null}
            <div className="bulk-tools">
              <button type="button" className="chip" onClick={() => toggleAll(true)}>Marcar todos</button>
              <button type="button" className="chip" onClick={() => toggleAll(false)}>Ninguno</button>
            </div>
            <ul className="bulk-list">
              {items.map((x) => (
                <li key={x.key} className={x.on ? 'on' : ''}>
                  <label>
                    <input type="checkbox" checked={x.on} onChange={(e) => setItems((l) => l.map((y) => (y.key === x.key ? { ...y, on: e.target.checked } : y)))} />
                    <span className="bl-main">
                      <b>{x.kind === 'file' ? x.title : x.row.title}</b>
                      <em>{x.kind === 'file' ? `${x.file.name.toLowerCase().endsWith('.pdf') ? 'PDF' : 'EPUB'} · ${fmtSize(x.file.size)}` : [x.row.author, x.row.rating ? `${'★'.repeat(Math.round(x.row.rating))}` : '', x.row.app].filter(Boolean).join(' · ')}</em>
                    </span>
                    {x.dup ? <span className="bl-tag">ya lo tienes</span> : x.kind === 'row' ? <span className={`bl-tag st-${x.row.status}`}>{STATUS_LABEL[x.row.status]}</span> : null}
                  </label>
                </li>
              ))}
            </ul>
            <div className="bulk-opts">
              {hasRows && (
                <div className="field">
                  <span className="lbl">Los libros de la lista son…</span>
                  <div className="seg seg-n" role="radiogroup" aria-label="Formato de los libros de la lista">
                    <button type="button" role="radio" aria-checked={paper} onClick={() => setPaper(true)}>De papel</button>
                    <button type="button" role="radio" aria-checked={!paper} onClick={() => setPaper(false)}>Digitales (subo el archivo después)</button>
                  </div>
                  <span className="hint">Si tu lista dice Kindle, Apple Books o ebook, lo respeto libro por libro.</span>
                </div>
              )}
              {hasRows && <label className="check"><input type="checkbox" checked={online} onChange={(e) => setOnline(e.target.checked)} /> Buscar portadas y datos en Google Books, Open Library y Apple Books</label>}
              <label className="check"><input type="checkbox" checked={toTbr} onChange={(e) => setToTbr(e.target.checked)} /> Añadir {hasRows ? 'los pendientes' : 'los libros'} a mi lista «Por leer»</label>
            </div>
            <div className="bulk-actions">
              <button type="button" className="btn" onClick={() => { setItems([]); setScan(null); setPhase('pick') }}>Elegir otros</button>
              <button type="button" className="btn btn-gold" disabled={!chosen.length} onClick={run}>
                Importar {chosen.length} {chosen.length === 1 ? 'libro' : 'libros'}
              </button>
            </div>
          </motion.div>
        )}

        {(phase === 'saving' || phase === 'done') && (
          <motion.div key="saving" className="bulk-progress" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }} aria-live="polite">
            <div className={`bp-seal${phase === 'done' ? ' done' : ''}`} aria-hidden>{phase === 'done' ? <Check size={26} /> : <span className="spin" />}</div>
            <h3>{phase === 'done' ? (done.ok === 1 ? '1 libro en tu biblioteca' : `${done.ok} libros en tu biblioteca`) : `Colocando libros… ${done.n} de ${chosen.length}`}</h3>
            <div className="meter big" aria-hidden><i style={{ width: `${chosen.length ? (done.n / chosen.length) * 100 : 0}%` }} /></div>
            {phase === 'saving' && online && hasRows && <p className="hint">Busco cada portada en los catálogos; con listas largas tarda un poco. Puedes dejar esta ventana abierta.</p>}
            {done.failed.length > 0 && (
              <details className="bulk-failed" open={phase === 'done'}>
                <summary>{done.failed.length} no se pudieron añadir</summary>
                <ul>{done.failed.map((f) => <li key={f}>{f}</li>)}</ul>
              </details>
            )}
            {phase === 'done' && <div className="bulk-actions"><button type="button" className="btn btn-gold" onClick={onDone}>Ver mi estantería</button></div>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
