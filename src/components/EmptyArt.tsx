/**
 * Small line drawings for empty screens. They take the theme's colours (accent for the strokes,
 * text colour for the soft fills), so they belong to every theme without extra assets.
 */
export type EmptyKind = 'shelf' | 'search' | 'tbr' | 'wish' | 'history' | 'year'

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

export function EmptyArt({ kind }: { kind: EmptyKind }) {
  return (
    <svg className={`empty-art ea-${kind}`} viewBox="0 0 160 110" aria-hidden>
      <ellipse cx="80" cy="100" rx="58" ry="5" className="ea-shadow" />
      {kind === 'shelf' && (
        <g>
          <path {...S} d="M22 86h116" />
          <path {...S} d="M28 86v8M132 86v8" />
          {/* one lonely book leaning, and a little plant waiting for company */}
          <g className="ea-float">
            <rect {...S} x="58" y="40" width="14" height="46" rx="1.5" transform="rotate(-8 65 86)" className="ea-fill" />
            <path {...S} d="M60 50h10M60 76h10" transform="rotate(-8 65 86)" />
          </g>
          <path {...S} d="M104 86h18l-3 -14h-12z" className="ea-fill" />
          <path {...S} d="M113 72c0-10-6-16-12-18M113 72c0-12 6-18 12-20M113 72v-14" />
          <path {...S} d="M40 30l3 -6 3 6-6 -3h6z" className="ea-spark" />
        </g>
      )}
      {kind === 'search' && (
        <g>
          <rect {...S} x="44" y="30" width="38" height="52" rx="2" className="ea-fill" />
          <path {...S} d="M52 42h22M52 50h16M52 58h20" />
          <g className="ea-float">
            <circle {...S} cx="98" cy="54" r="15" />
            <path {...S} d="M109 65l14 14" strokeWidth="3" />
          </g>
        </g>
      )}
      {kind === 'tbr' && (
        <g>
          <rect {...S} x="46" y="72" width="68" height="12" rx="2" className="ea-fill" />
          <rect {...S} x="52" y="60" width="58" height="12" rx="2" />
          <rect {...S} x="48" y="48" width="62" height="12" rx="2" className="ea-fill" />
          <g className="ea-float">
            <path {...S} d="M70 18h20v22l-10 -7-10 7z" className="ea-ribbon" />
          </g>
        </g>
      )}
      {kind === 'wish' && (
        <g>
          <path {...S} d="M50 42h60l-5 44H55z" className="ea-fill" />
          <path {...S} d="M66 42c0-10 6-16 14-16s14 6 14 16" />
          <g className="ea-float">
            <path {...S} d="M80 76c-9-6-14-10-14-16a7 7 0 0 1 14-2 7 7 0 0 1 14 2c0 6-5 10-14 16z" className="ea-heart" />
          </g>
        </g>
      )}
      {kind === 'history' && (
        <g>
          <path {...S} d="M38 40c10-4 26-4 42 4 16-8 32-8 42-4v42c-10-4-26-4-42 4-16-8-32-8-42-4z" className="ea-fill" />
          <path {...S} d="M80 44v42" />
          <g className="ea-float">
            <path {...S} d="M66 12h28M66 34h28M70 12c0 7 10 7 10 11s-10 4-10 11M90 12c0 7-10 7-10 11s10 4 10 11" />
          </g>
        </g>
      )}
      {kind === 'year' && (
        <g>
          <rect {...S} x="46" y="30" width="68" height="56" rx="4" className="ea-fill" />
          <path {...S} d="M46 44h68M60 24v12M100 24v12" />
          <g className="ea-float">
            <path {...S} d="M80 54l3.5 7 7.5 1-5.5 5 1.5 7.5L80 71l-7 3.5L74.5 67 69 62l7.5-1z" className="ea-heart" />
          </g>
        </g>
      )}
    </svg>
  )
}
