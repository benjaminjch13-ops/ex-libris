import { useEffect, useRef, useState } from 'react'
import { useLibrary } from '../state/library'
import { store } from '../lib/db'
import { deliver, exportLibrary, importLibrary, storageUse } from '../lib/backup'
import { fmtSize, relTime } from '../lib/hooks'

/** «Tus datos» in Preferences: is storage protected, how much is used, backup and restore. */
export function DataPanel() {
  const { books, storageProtected, notify } = useLibrary()
  const [use, setUse] = useState<{ used: number; quota: number } | null>(null)
  const [last, setLast] = useState<number | undefined>()
  const [withFiles, setWithFiles] = useState(true)
  const [busy, setBusy] = useState<null | 'export' | 'import'>(null)
  const [progress, setProgress] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    storageUse().then(setUse)
    store().then((s) => s.getSetting<number>('lastBackup')).then(setLast).catch(() => {})
  }, [])

  const doExport = async () => {
    setBusy('export'); setProgress(0)
    try {
      const { blob, name, books: n } = await exportLibrary({ includeFiles: withFiles, onProgress: setProgress })
      const how = await deliver(blob, name)
      if (how !== 'cancelled') { setLast(Date.now()); notify(`Respaldo listo: ${n} ${n === 1 ? 'libro' : 'libros'} · ${fmtSize(blob.size)}`) }
    } catch (e) {
      console.error(e)
      notify('No se pudo crear el respaldo. Prueba sin incluir los archivos.', 'error')
    } finally {
      setBusy(null)
    }
  }

  const doImport = async (f: File) => {
    setBusy('import')
    try {
      const r = await importLibrary(f)
      try { sessionStorage.setItem('exl-restored', JSON.stringify(r)) } catch { /* ignore */ }
      window.location.reload()
    } catch (e) {
      notify((e as Error).message || 'No se pudo restaurar el respaldo.', 'error')
      setBusy(null)
    }
  }

  const stale = books.length > 0 && (!last || Date.now() - last > 30 * 86400000)

  return (
    <div className="data-panel">
      <b>Tus datos</b>
      <p className={`dp-status ${storageProtected ? 'ok' : 'warn'}`}>
        {storageProtected
          ? '✓ Este navegador mantendrá tu biblioteca guardada aunque le falte espacio.'
          : storageProtected === false
            ? 'Este navegador podría borrar los datos si pasa mucho tiempo sin abrir la app o le falta espacio. Instalar la app en la pantalla de inicio y hacer respaldos lo evita.'
            : 'Tu biblioteca vive solo en este dispositivo. Haz un respaldo de vez en cuando.'}
      </p>
      {use && <p className="dp-use">Ocupa {fmtSize(use.used)} en este dispositivo.</p>}
      <p className="dp-last">{last ? `Último respaldo: ${relTime(last)}.` : 'Aún no has hecho ningún respaldo.'}{stale ? ' Te recomendamos hacer uno.' : ''}</p>
      <label className="check"><input type="checkbox" checked={withFiles} onChange={(e) => setWithFiles(e.target.checked)} /> Incluir los archivos EPUB y PDF (pesa más, pero no tendrás que volver a subirlos)</label>
      <div className="dp-acts">
        <button type="button" className="btn btn-gold" onClick={doExport} disabled={!!busy || books.length === 0}>
          {busy === 'export' ? <><span className="spin" /> {Math.round(progress * 100)}%</> : 'Descargar respaldo'}
        </button>
        <button type="button" className="btn" onClick={() => input.current?.click()} disabled={!!busy}>
          {busy === 'import' ? <><span className="spin" /> Restaurando…</> : 'Restaurar respaldo'}
        </button>
        <input ref={input} type="file" accept=".zip,application/zip" className="sr-only-input" aria-label="Archivo de respaldo" onChange={(e) => { const f = e.target.files?.[0]; if (f) doImport(f); e.target.value = '' }} />
      </div>
      <p className="dp-hint">El respaldo es un archivo .zip que puedes guardar en Archivos, Google Drive o enviarte por correo. Al restaurarlo en otro teléfono o navegador se suman tus libros, notas, reseñas, wishlist y lista «Por leer»; no se borra nada de lo que ya haya.</p>
    </div>
  )
}
