import { useMemo } from 'react'
import { useLibrary } from '../state/library'
import { ChevronLeft } from './Icons'
import { EmptyArt } from './EmptyArt'

export function History({ onBack }: { onBack: () => void }) {
  const { history, books } = useLibrary()
  const days = useMemo(() => {
    const sorted = [...history].sort((a, b) => b.at - a.at)
    const m = new Map<string, typeof sorted>()
    for (const h of sorted) {
      const k = new Date(h.at).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      m.set(k, [...(m.get(k) ?? []), h])
    }
    return [...m.entries()]
  }, [history])

  const pagesRead = history.filter((h) => h.type === 'sesion').reduce((n, h) => n + Math.max(0, (h.toPage ?? 0) - (h.fromPage ?? 0)), 0)
  const minutes = history.filter((h) => h.type === 'sesion').reduce((n, h) => n + (h.minutes ?? 0), 0)
  const finished = books.filter((b) => b.status === 'terminado').length

  return (
    <section>
      <div className="view-title">
        <button className="icon-btn" onClick={onBack} aria-label="Volver a la estantería"><ChevronLeft /></button>
        <h1>Historial de lectura</h1>
      </div>
      <div className="stats" style={{ marginTop: 18 }}>
        <div className="stat"><b>{pagesRead}</b><span>páginas pasadas</span></div>
        <div className="stat"><b>{minutes}</b><span>minutos</span></div>
        <div className="stat"><b>{finished}</b><span>libros terminados</span></div>
      </div>
      {days.length === 0 ? (
        <div className="empty-state"><EmptyArt kind="history" /><h3>Todavía no hay lecturas</h3><p>Cuando abras un libro, cada sesión quedará anotada aquí con las páginas que avanzaste.</p></div>
      ) : (
        days.map(([day, entries]) => (
          <div className="hist-day" key={day}>
            <h3>{day}</h3>
            {entries.map((h, i) => (
              <div className="hist-row" key={h.id ?? i}>
                <span className="time">{new Date(h.at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</span>
                <div style={{ minWidth: 0 }}>
                  <b>{h.title}</b>
                  <div className="what">
                    {h.type === 'sesion' && (h.toPage && h.fromPage && h.toPage > h.fromPage
                      ? `Leíste de la página ${h.fromPage} a la ${h.toPage}`
                      : `Retomaste la lectura en la página ${h.toPage ?? h.fromPage ?? 1}`)}
                    {h.type === 'terminado' && 'Terminaste el libro'}
                    {h.type === 'agregado' && 'Añadido a la biblioteca'}
                    {h.type === 'abandonado' && (h.toPage ? `Lo dejaste en la página ${h.toPage}` : 'Lo dejaste')}
                    {h.type === 'prestado' && `Se lo prestaste a ${h.to ?? 'alguien'}`}
                    {h.type === 'devuelto' && `${h.to ?? 'Te'} te lo devolvió`}
                    {' · '}{h.author}
                  </div>
                </div>
                <span className="tag">{h.type === 'sesion' && h.minutes ? `${h.minutes} min` : h.type === 'terminado' ? '✓' : ''}</span>
              </div>
            ))}
          </div>
        ))
      )}
    </section>
  )
}
