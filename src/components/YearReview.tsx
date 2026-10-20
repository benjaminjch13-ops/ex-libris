import { useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import type { Book } from '../types'
import { useLibrary } from '../state/library'
import { genreOf } from '../lib/genres'
import { yearStats, type YearStats } from '../lib/streak'
import { Cover } from './BookArt'
import { Stars } from './ReviewDialog'
import { ExLibrisSeal } from './ExLibrisSeal'
import { ChevronLeft } from './Icons'

const MONTHS = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
const fmtHours = (m: number) => (m < 60 ? `${m} min` : `${Math.round(m / 6) / 10} h`.replace('.', ','))

/** «Tu año en libros»: the year's numbers, and a picture to share. */
export function YearReview({ onBack, onOpenBook }: { onBack: () => void; onOpenBook: (b: Book, el: HTMLElement) => void }) {
  const { books, history, settings, notify, coverUrl } = useLibrary()
  const years = useMemo(() => {
    const ys = new Set<number>([new Date().getFullYear()])
    books.forEach((b) => b.finishedAt && ys.add(new Date(b.finishedAt).getFullYear()))
    history.forEach((h) => ys.add(new Date(h.at).getFullYear()))
    return [...ys].sort((a, b) => b - a)
  }, [books, history])
  const [year, setYear] = useState(years[0])
  const goal = year === new Date().getFullYear() ? settings.goals?.yearBooks : undefined
  const st = useMemo(() => yearStats(year, books, history, genreOf, goal), [year, books, history, goal])
  const max = Math.max(1, ...st.perMonth)
  const [busy, setBusy] = useState(false)

  const share = async () => {
    setBusy(true)
    try {
      const blob = await drawCard(st, settings.readerName, settings.exlibris?.enabled ? settings.exlibris : undefined, st.best ? coverUrl(st.best) : undefined)
      const file = new File([blob], `mi-año-en-libros-${year}.png`, { type: 'image/png' })
      const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean }
      if (nav.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `Mi año en libros ${year}` }).catch(() => {})
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove()
        setTimeout(() => URL.revokeObjectURL(url), 30000)
        notify('Imagen descargada')
      }
    } catch (e) {
      console.error(e); notify('No se pudo crear la imagen.', 'error')
    } finally { setBusy(false) }
  }

  return (
    <section className="year-view">
      <div className="view-title">
        <button className="icon-btn" onClick={onBack} aria-label="Volver a la estantería"><ChevronLeft /></button>
        <h1>Tu año en libros</h1>
      </div>
      <div className="recs-tools">
        {years.map((y) => <button key={y} className="chip" aria-pressed={y === year} onClick={() => setYear(y)}>{y}</button>)}
        <button className="btn btn-gold small-btn" onClick={share} disabled={busy || st.finished.length === 0}>{busy ? <span className="spin" /> : null}Compartir imagen</button>
      </div>

      {st.finished.length === 0 && st.minutes === 0 ? (
        <div className="empty-state"><h3>Todavía no hay lecturas en {year}</h3><p>Cuando termines libros o anotes sesiones, aquí aparecerá el resumen de tu año.</p></div>
      ) : (
        <>
          <div className="yr-hero">
            <div className="yr-big"><b>{st.finished.length}</b><span>{st.finished.length === 1 ? 'libro terminado' : 'libros terminados'}{st.goal ? ` de ${st.goal}` : ''}</span></div>
            {st.goal ? <div className="meter big" aria-hidden><i style={{ width: `${Math.min(100, (st.finished.length / st.goal) * 100)}%` }} /></div> : null}
            {st.goal && st.expected != null ? <p className="muted small">{st.finished.length >= st.goal ? '¡Meta cumplida!' : st.finished.length >= Math.ceil(st.expected) ? 'Vas al día con tu meta.' : `Para ir al día deberías llevar ${Math.ceil(st.expected)}.`}</p> : null}
          </div>
          <div className="stat-tiles">
            <div className="tile"><span className="tile-label">Páginas</span><b>{st.pages.toLocaleString('es')}</b><span className="tile-sub">en libros terminados</span></div>
            <div className="tile"><span className="tile-label">Tiempo leyendo</span><b className="tile-text">{fmtHours(st.minutes)}</b><span className="tile-sub">{st.daysRead} {st.daysRead === 1 ? 'día' : 'días'} con lectura</span></div>
            <div className="tile"><span className="tile-label">Racha más larga</span><b>{st.bestStreak}</b><span className="tile-sub">{st.bestStreak === 1 ? 'día' : 'días seguidos'}</span></div>
            {st.topGenre && <div className="tile"><span className="tile-label">Tu género</span><b className="tile-text">{st.topGenre.genre}</b><span className="tile-sub">{st.topGenre.n} {st.topGenre.n === 1 ? 'libro' : 'libros'}</span></div>}
            {st.topAuthor && <div className="tile"><span className="tile-label">Autor del año</span><b className="tile-text">{st.topAuthor.author}</b><span className="tile-sub">{st.topAuthor.n} libros</span></div>}
            {st.dropped > 0 && <div className="tile"><span className="tile-label">Abandonados</span><b>{st.dropped}</b><span className="tile-sub">y está bien</span></div>}
          </div>

          {st.best && (
            <div className="yr-best">
              <button className="yr-cover" data-book-id={st.best.id} onClick={(e) => onOpenBook(st.best!, e.currentTarget)} aria-label={`Ver ${st.best.title}`}><Cover book={st.best} /></button>
              <div>
                <span className="eyebrow" style={{ color: 'var(--gold)' }}>{(st.best.review?.rating ?? 0) > 0 ? 'Tu favorito del año' : 'Tu última lectura del año'}</span>
                <h3>{st.best.title}</h3>
                <p className="muted">{st.best.author}</p>
                {st.best.review?.rating ? <Stars value={st.best.review.rating} size={18} /> : null}
              </div>
            </div>
          )}

          <div className="chart-card">
            <div className="chart-head"><div><h2>Libros por mes</h2></div></div>
            <div className="yr-months" role="img" aria-label={st.perMonth.map((n, i) => `${MONTHS[i]}: ${n}`).join(', ')}>
              {st.perMonth.map((n, i) => (
                <div key={i} className="ym"><span className="ym-bar"><i style={{ height: `${(n / max) * 100}%` }} /></span><b>{n || ''}</b><em>{MONTHS[i]}</em></div>
              ))}
            </div>
          </div>

          {st.finished.length > 0 && (
            <div className="chart-card">
              <div className="chart-head"><div><h2>Lo que leíste</h2><p>En el orden en que los terminaste.</p></div></div>
              <ol className="yr-list">
                {st.finished.map((b) => (
                  <li key={b.id}><button data-book-id={b.id} onClick={(e) => onOpenBook(b, e.currentTarget)}><span className="il-cover"><Cover book={b} /></span><span className="il-text"><b>{b.title}</b><span>{b.author} · {new Date(b.finishedAt!).toLocaleDateString('es', { day: 'numeric', month: 'short' })}</span></span>{b.review?.rating ? <Stars value={b.review.rating} size={12} /> : null}</button></li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}
    </section>
  )
}

// ---------- the shareable picture (1080×1350, in the current theme's colours) ----------
async function drawCard(st: YearStats, name: string, ex: Parameters<typeof ExLibrisSeal>[0]['cfg'] | undefined, cover?: string): Promise<Blob> {
  const css = getComputedStyle(document.documentElement)
  const v = (n: string, f: string) => css.getPropertyValue(n).trim() || f
  const room = v('--room', '#13100e'), room2 = v('--room-2', '#1c1714'), fg = v('--ivory', '#efe4cc'), dim = v('--ivory-dim', '#b9a98d'), gold = v('--gold', '#cfa864')
  const W = 1080, H = 1350
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const g = c.getContext('2d')!
  await document.fonts?.ready
  const grad = g.createLinearGradient(0, 0, 0, H); grad.addColorStop(0, room2); grad.addColorStop(1, room)
  g.fillStyle = grad; g.fillRect(0, 0, W, H)
  g.strokeStyle = gold; g.globalAlpha = .5; g.lineWidth = 2; g.strokeRect(40, 40, W - 80, H - 80); g.globalAlpha = 1
  g.textAlign = 'center'
  g.fillStyle = gold; g.font = '600 30px "Hanken Grotesk", system-ui, sans-serif'
  g.fillText(`${name ? `${name.toUpperCase()} · ` : ''}MI AÑO EN LIBROS`, W / 2, 130)
  g.fillStyle = fg; g.font = '400 120px "Bodoni Moda", Georgia, serif'
  g.fillText(String(st.year), W / 2, 260)
  g.font = '400 230px "Bodoni Moda", Georgia, serif'; g.fillText(String(st.finished.length), W / 2, 500)
  g.fillStyle = dim; g.font = '500 40px "Hanken Grotesk", system-ui, sans-serif'
  g.fillText(`${st.finished.length === 1 ? 'libro terminado' : 'libros terminados'}${st.goal ? ` de ${st.goal}` : ''}`, W / 2, 565)
  const tiles: [string, string][] = [[st.pages.toLocaleString('es'), 'páginas'], [fmtHours(st.minutes), 'leyendo'], [String(st.bestStreak), 'días de racha']]
  tiles.forEach(([n, l], i) => {
    const x = 220 + i * 320
    g.fillStyle = fg; g.font = '400 66px "Bodoni Moda", Georgia, serif'; g.fillText(n, x, 700)
    g.fillStyle = dim; g.font = '500 28px "Hanken Grotesk", system-ui, sans-serif'; g.fillText(l, x, 745)
  })
  let y = 840
  if (st.topGenre) {
    g.fillStyle = gold; g.font = '600 26px "Hanken Grotesk", system-ui, sans-serif'; g.fillText('MI GÉNERO', W / 2, y)
    g.fillStyle = fg; g.font = 'italic 400 54px "Bodoni Moda", Georgia, serif'; g.fillText(st.topGenre.genre, W / 2, y + 62); y += 130
  }
  if (st.best) {
    let x0 = 140
    if (cover) {
      try {
        const img = await loadImg(cover); const ch = 230, cw = ch * 0.67
        g.drawImage(img, x0, y, cw, ch); x0 += cw + 40
      } catch { /* cover not drawable */ }
    }
    g.textAlign = 'left'
    g.fillStyle = gold; g.font = '600 26px "Hanken Grotesk", system-ui, sans-serif'; g.fillText((st.best.review?.rating ?? 0) > 0 ? 'MI FAVORITO' : 'MI ÚLTIMA LECTURA', x0, y + 50)
    g.fillStyle = fg; g.font = '400 50px "Bodoni Moda", Georgia, serif'
    wrap(g, st.best.title, x0, y + 110, W - x0 - 140, 58, 2)
    g.fillStyle = dim; g.font = '500 30px "Hanken Grotesk", system-ui, sans-serif'; g.fillText(st.best.author, x0, y + 215)
    g.textAlign = 'center'
  }
  if (ex) {
    try {
      // render the seal off-screen and read back its SVG markup
      const host = document.createElement('div')
      const root = createRoot(host)
      flushSync(() => root.render(<ExLibrisSeal cfg={{ ...ex, ink: gold }} size={150} />))
      const svg = host.innerHTML.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
      root.unmount()
      const img = await loadImg(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
      g.globalAlpha = .9; g.drawImage(img, W - 230, H - 230, 125 * (img.width / img.height), 125); g.globalAlpha = 1
    } catch { /* ignore */ }
  }
  g.fillStyle = dim; g.font = 'italic 400 34px "Bodoni Moda", Georgia, serif'; g.fillText('Ex Libris', W / 2, H - 90)
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('canvas'))), 'image/png'))
}

function loadImg(src: string) {
  return new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = src })
}

function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number, maxLines: number) {
  const words = text.split(' '); let line = '', n = 0
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (g.measureText(test).width > maxW && line) {
      if (++n === maxLines) { g.fillText(`${line}…`, x, y); return }
      g.fillText(line, x, y); line = w; y += lh
    } else line = test
  }
  g.fillText(line, x, y)
}
