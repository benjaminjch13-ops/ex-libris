import type { Book } from '../types'
import { useLibrary } from '../state/library'
import { Cover } from './BookArt'

/** «A continuación» on the home screen: the first book in the queue. */
export function TbrNext({ onStart, onOpen }: { onStart: (b: Book) => void; onOpen: () => void }) {
  const { tbr, books } = useLibrary()
  const next = tbr.map((id) => books.find((b) => b.id === id)).find(Boolean)
  if (!next) return null
  return (
    <div className="tbr-next fade-up">
      <span className="tn-cover"><Cover book={next} /></span>
      <span className="tn-text">
        <span className="eyebrow">A continuación</span>
        <b>{next.title}</b>
        <span className="muted">{next.author}{tbr.length > 1 ? ` · ${tbr.length - 1} más en la fila` : ''}</span>
      </span>
      <span className="tn-acts">
        <button className="chip" onClick={() => onStart(next)}>Empezar</button>
        <button className="chip" onClick={onOpen}>Ver la fila</button>
      </span>
    </div>
  )
}
