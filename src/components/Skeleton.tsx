/** Soft placeholders with a slow sheen, shown while a view or a search is on its way (instead of a blank moment). */
export function ViewSkeleton() {
  return (
    <div className="skel-view" role="status" aria-label="Cargando">
      <div className="sk sk-title" />
      <div className="sk sk-line" style={{ width: '58%' }} />
      <div className="skel-cards">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skel-card">
            <div className="sk sk-cover" />
            <div className="skel-text"><div className="sk sk-line" /><div className="sk sk-line" style={{ width: '60%' }} /><div className="sk sk-line" style={{ width: '40%' }} /></div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function TeaserSkeleton() {
  return (
    <div className="skel-teaser" aria-hidden>
      <div className="skel-covers">{[0, 1, 2, 3].map((i) => <div key={i} className="sk sk-mini" />)}</div>
      <div className="skel-text"><div className="sk sk-line" style={{ width: '30%' }} /><div className="sk sk-line" style={{ width: '70%' }} /></div>
    </div>
  )
}

export function RowsSkeleton({ n = 3 }: { n?: number }) {
  return (
    <ul className="finder-hits skel-rows" aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <li key={i}><div className="skel-row"><div className="sk sk-thumb" /><div className="skel-text"><div className="sk sk-line" /><div className="sk sk-line" style={{ width: '55%' }} /></div></div></li>
      ))}
    </ul>
  )
}
