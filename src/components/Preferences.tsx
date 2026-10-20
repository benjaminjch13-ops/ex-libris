import { useState } from 'react'
import type { DecorId, ExLibris, HomeSection, ReadingPrefs, ShelfPrefs } from '../types'
import { useLibrary } from '../state/library'
import { Modal } from './Modal'
import { DataPanel } from './DataPanel'
import { THEMES, type ThemeId } from '../lib/themes'
import { PAPERS, READ_FONTS } from '../lib/reading'
import { ExLibrisSeal, INKS, MOTIFS, MotifArt } from './ExLibrisSeal'
import { Close } from './Icons'

export type PrefTab = 'apariencia' | 'lectura' | 'estanteria' | 'inicio' | 'metas' | 'exlibris' | 'datos'
const TABS: { id: PrefTab; label: string }[] = [
  { id: 'apariencia', label: 'Apariencia' }, { id: 'lectura', label: 'Lectura' }, { id: 'estanteria', label: 'Estantería' },
  { id: 'inicio', label: 'Inicio' }, { id: 'metas', label: 'Metas' }, { id: 'exlibris', label: 'Ex libris' }, { id: 'datos', label: 'Tus datos' },
]

/** Preferences in tabs. Every change applies at once, so the person sees the result behind the dialog. */
export function Preferences({ onClose, initialTab = 'apariencia' }: { onClose: () => void; initialTab?: PrefTab }) {
  const [tab, setTab] = useState<PrefTab>(initialTab)
  return (
    <Modal title="Preferencias" tall onClose={onClose} footer={<button className="btn btn-gold" onClick={onClose}>Listo</button>}>
      <div className="pref-tabs" role="tablist" aria-label="Secciones de preferencias">
        {TABS.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} className="chip" aria-pressed={tab === t.id} onClick={(e) => { setTab(t.id); e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }) }}>{t.label}</button>)}
      </div>
      <div className="pref-body" role="tabpanel" key={tab}>
        {tab === 'apariencia' && <Appearance />}
        {tab === 'lectura' && <ReadingPanel />}
        {tab === 'estanteria' && <ShelfPanel />}
        {tab === 'inicio' && <HomePanel />}
        {tab === 'metas' && <GoalsPanel />}
        {tab === 'exlibris' && <ExLibrisPanel />}
        {tab === 'datos' && <DataTab />}
      </div>
    </Modal>
  )
}

function Appearance() {
  const { settings, updateSettings } = useLibrary()
  const value = settings.theme ?? 'nocturna'
  return (
    <div className="fields">
      <div className="field">
        <span className="lbl" id="theme-lbl">Tema</span>
        <div className="theme-grid" role="radiogroup" aria-labelledby="theme-lbl">
          {THEMES.map((t) => (
            <button key={t.id} type="button" role="radio" aria-checked={value === t.id} className="theme-card" onClick={() => updateSettings({ theme: t.id })}>
              <span className="tc-swatch" style={{ background: t.sky ?? t.room }} aria-hidden>
                {t.spines.map((c, i) => <i key={i} style={{ background: c, height: 30 + ((i * 13) % 22) }} />)}
                <span className="tc-plank" style={{ background: t.wood }} />
                <span className="tc-dot" style={{ background: t.accent }} />
              </span>
              <b>{t.name}</b>
              <span className="tc-line">{t.line}</span>
            </button>
          ))}
        </div>
        <label className="check" style={{ marginTop: 4 }}>
          <input type="checkbox" checked={value === 'auto'} onChange={(e) => updateSettings({ theme: (e.target.checked ? 'auto' : 'nocturna') as ThemeId })} />
          Automático: Pergamino de día y Biblioteca nocturna de noche, según tu teléfono
        </label>
      </div>
      <div className="row2">
        <div className="field">
          <label htmlFor="s-lib">Nombre de la biblioteca</label>
          <input id="s-lib" defaultValue={settings.libraryName} maxLength={40} onBlur={(e) => updateSettings({ libraryName: e.target.value.trim() || 'Ex Libris' })} />
        </div>
        <div className="field">
          <label htmlFor="s-name">Tu nombre</label>
          <input id="s-name" defaultValue={settings.readerName} maxLength={30} placeholder="Para el saludo" onBlur={(e) => updateSettings({ readerName: e.target.value.trim() })} />
        </div>
      </div>
    </div>
  )
}

/** Font, spacing, margins, alignment and page colour. Also opened from the reader's «Aa» button. */
export function ReadingPanel({ compact }: { compact?: boolean }) {
  const { settings, updateSettings } = useLibrary()
  const r: ReadingPrefs = settings.reading ?? { font: 'literata', spacing: 'normal', margins: 'normal', align: 'justificado', paper: 'tema' }
  const set = (p: Partial<ReadingPrefs>) => updateSettings({ reading: { ...r, ...p } })
  const seg = <K extends keyof ReadingPrefs>(k: K, opts: [ReadingPrefs[K], string][], label: string) => (
    <div className="field">
      <span className="lbl">{label}</span>
      <div className="seg seg-n" role="radiogroup" aria-label={label} style={{ gridTemplateColumns: `repeat(${opts.length}, 1fr)` }}>
        {opts.map(([v, l]) => <button key={String(v)} type="button" role="radio" aria-checked={r[k] === v} onClick={() => set({ [k]: v } as Partial<ReadingPrefs>)}>{l}</button>)}
      </div>
    </div>
  )
  return (
    <div className={`fields reading-panel${compact ? ' compact' : ''}`}>
      <div className="field">
        <span className="lbl">Letra</span>
        <div className="font-grid" role="radiogroup" aria-label="Letra">
          {READ_FONTS.map((f) => (
            <button key={f.id} type="button" role="radio" aria-checked={r.font === f.id} className="font-card" onClick={() => set({ font: f.id })}>
              <b style={{ fontFamily: f.family }}>Aa</b>
              <span>{f.name}</span>
              {!compact && <em>{f.note}</em>}
            </button>
          ))}
        </div>
      </div>
      {seg('spacing', [['compacto', 'Compacto'], ['normal', 'Normal'], ['amplio', 'Amplio']], 'Interlineado')}
      {seg('margins', [['estrecho', 'Estrechos'], ['normal', 'Normales'], ['amplio', 'Amplios']], 'Márgenes')}
      {seg('align', [['justificado', 'Justificado'], ['izquierda', 'A la izquierda']], 'Alineación')}
      <div className="field">
        <span className="lbl">Color de la página</span>
        <div className="paper-row" role="radiogroup" aria-label="Color de la página">
          {PAPERS.map((p) => (
            <button key={p.id} type="button" role="radio" aria-checked={r.paper === p.id} className="paper-chip" onClick={() => set({ paper: p.id })}>
              <i style={{ background: p.paper ?? 'linear-gradient(135deg, var(--paper) 50%, var(--room-3) 50%)', color: p.ink }} aria-hidden>Aa</i>
              <span>{p.name}</span>
            </button>
          ))}
        </div>
      </div>
      {!compact && (
        <div className="read-sample" aria-hidden>
          <p>En un lugar de la Mancha, de cuyo nombre no quiero acordarme, no ha mucho tiempo que vivía un hidalgo de los de lanza en astillero, adarga antigua, rocín flaco y galgo corredor.</p>
        </div>
      )}
    </div>
  )
}

const DECORS: { id: DecorId; name: string }[] = [
  { id: 'planta', name: 'Planta' }, { id: 'pila', name: 'Pila de libros' }, { id: 'gato', name: 'Gato dormido' },
  { id: 'vela', name: 'Vela' }, { id: 'globo', name: 'Globo terráqueo' }, { id: 'reloj', name: 'Reloj de arena' },
]

function ShelfPanel() {
  const { settings, updateSettings, books, patchBook, notify } = useLibrary()
  const sp: ShelfPrefs = settings.shelf ?? { group: 'categoria', sort: 'reciente', decor: ['planta', 'pila'] }
  const custom = settings.customShelves ?? []
  const [name, setName] = useState('')
  const set = (p: Partial<ShelfPrefs>) => updateSettings({ shelf: { ...sp, ...p } })
  const add = () => {
    const n = name.trim()
    if (!n || custom.includes(n)) return
    updateSettings({ customShelves: [...custom, n] })
    setName('')
    notify(`Estante «${n}» creado. Añade libros desde su vista previa.`)
  }
  const remove = (n: string) => {
    updateSettings({ customShelves: custom.filter((x) => x !== n) })
    books.filter((b) => b.shelves?.includes(n)).forEach((b) => patchBook(b.id, { shelves: b.shelves!.filter((x) => x !== n) }))
  }
  return (
    <div className="fields">
      <div className="row2">
        <div className="field">
          <label htmlFor="sh-group">Agrupar por</label>
          <select id="sh-group" value={sp.group} onChange={(e) => set({ group: e.target.value as ShelfPrefs['group'] })}>
            <option value="categoria">Categoría</option>
            <option value="genero">Género</option>
            <option value="autor">Autor</option>
            <option value="estante">Mis estantes</option>
            <option value="ninguno">Sin separadores</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="sh-sort">Ordenar los libros</label>
          <select id="sh-sort" value={sp.sort} onChange={(e) => set({ sort: e.target.value as ShelfPrefs['sort'] })}>
            <option value="reciente">Añadidos recientemente</option>
            <option value="titulo">Título A–Z</option>
            <option value="autor">Autor A–Z</option>
            <option value="color">Por color (estante arcoíris)</option>
            <option value="altura">Por altura</option>
          </select>
        </div>
      </div>
      <div className="field">
        <span className="lbl">Adornos</span>
        <div className="filters" role="group" aria-label="Adornos de la estantería">
          {DECORS.map((d) => (
            <button key={d.id} type="button" className="chip" aria-pressed={sp.decor.includes(d.id)}
              onClick={() => set({ decor: sp.decor.includes(d.id) ? sp.decor.filter((x) => x !== d.id) : [...sp.decor, d.id] })}>{d.name}</button>
          ))}
        </div>
        <span className="hint">Se reparten por los estantes en el orden en que los eliges.</span>
      </div>
      <div className="field">
        <span className="lbl">Mis estantes</span>
        {custom.length === 0 && <span className="hint">Crea estantes propios, como «Club de lectura», «Favoritos de {new Date().getFullYear()}» o «Para regalar». Un libro puede estar en varios.</span>}
        <ul className="custom-shelves">
          {custom.map((n) => (
            <li key={n}><b>{n}</b><span className="muted small">{books.filter((b) => b.shelves?.includes(n)).length} libros</span>
              <button type="button" className="icon-btn" onClick={() => remove(n)} aria-label={`Eliminar el estante ${n}`}><Close size={14} /></button></li>
          ))}
        </ul>
        <div className="we-addlink">
          <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }} placeholder="Nombre del estante" maxLength={32} aria-label="Nombre del nuevo estante" />
          <button type="button" className="btn small-btn" onClick={add} disabled={!name.trim()}>Crear</button>
        </div>
        {custom.length > 0 && sp.group !== 'estante' && <button type="button" className="linkish" onClick={() => set({ group: 'estante' })}>Agrupar la estantería por mis estantes</button>}
      </div>
    </div>
  )
}

const SECTIONS: { id: HomeSection; name: string; note: string }[] = [
  { id: 'racha', name: 'Racha y metas', note: 'Días seguidos leyendo, la semana y tus metas' },
  { id: 'mesa', name: 'Sobre la mesa', note: 'Los libros que estás leyendo' },
  { id: 'siguiente', name: 'A continuación', note: 'El siguiente de tu lista «Por leer»' },
  { id: 'parati', name: 'Para ti', note: 'Libros que pueden gustarte' },
  { id: 'resumen', name: 'Resumen', note: 'Libros, en curso y terminados, junto al saludo' },
]

function HomePanel() {
  const { settings, updateSettings } = useLibrary()
  const home = settings.home ?? { order: SECTIONS.map((x) => x.id), hidden: [] }
  const move = (id: HomeSection, d: -1 | 1) => {
    const o = [...home.order]; const i = o.indexOf(id); const j = i + d
    if (j < 0 || j >= o.length) return
    ;[o[i], o[j]] = [o[j], o[i]]
    updateSettings({ home: { ...home, order: o } })
  }
  const toggle = (id: HomeSection) => updateSettings({ home: { ...home, hidden: home.hidden.includes(id) ? home.hidden.filter((x) => x !== id) : [...home.hidden, id] } })
  return (
    <div className="fields">
      <p className="muted small">Elige qué ves al abrir la app y en qué orden. La estantería siempre está al final.</p>
      <ol className="home-sections">
        {home.order.map((id, i) => {
          const sec = SECTIONS.find((x) => x.id === id)!
          return (
            <li key={id} className={home.hidden.includes(id) ? 'off' : ''}>
              <label className="check"><input type="checkbox" checked={!home.hidden.includes(id)} onChange={() => toggle(id)} /> <span><b>{sec.name}</b><em>{sec.note}</em></span></label>
              <span className="tbr-arrows">
                <button type="button" className="icon-btn" disabled={i === 0} onClick={() => move(id, -1)} aria-label={`Subir ${sec.name}`}>↑</button>
                <button type="button" className="icon-btn" disabled={i === home.order.length - 1} onClick={() => move(id, 1)} aria-label={`Bajar ${sec.name}`}>↓</button>
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function GoalsPanel() {
  const { settings, updateSettings } = useLibrary()
  const g = settings.goals ?? {}
  const set = (p: Partial<typeof g>) => updateSettings({ goals: { ...g, ...p } })
  const year = new Date().getFullYear()
  return (
    <div className="fields">
      <div className="field">
        <span className="lbl">Libros en {year}</span>
        <div className="filters" role="radiogroup" aria-label="Meta anual">
          {[0, 6, 12, 24, 36, 52].map((n) => <button key={n} type="button" className="chip" role="radio" aria-checked={(g.yearBooks ?? 0) === n} onClick={() => set({ yearBooks: n || undefined })}>{n ? n : 'Sin meta'}</button>)}
          <input className="goal-in" inputMode="numeric" aria-label="Otra cantidad de libros" placeholder="Otra" defaultValue={g.yearBooks && ![6, 12, 24, 36, 52].includes(g.yearBooks) ? g.yearBooks : ''}
            onBlur={(e) => { const n = Number(e.target.value.replace(/\D/g, '')); if (n) set({ yearBooks: n }) }} />
        </div>
        <span className="hint">{g.yearBooks ? `Son unos ${Math.max(1, Math.round(52 / g.yearBooks * 10) / 10).toString().replace('.', ',')} semanas por libro.` : 'Una meta ayuda a mantener el ritmo, pero es opcional.'}</span>
      </div>
      <div className="field">
        <span className="lbl">Minutos al día</span>
        <div className="filters" role="radiogroup" aria-label="Meta diaria">
          {[0, 10, 15, 20, 30, 45, 60].map((n) => <button key={n} type="button" className="chip" role="radio" aria-checked={(g.dailyMinutes ?? 0) === n} onClick={() => set({ dailyMinutes: n || undefined })}>{n ? `${n} min` : 'Sin meta'}</button>)}
        </div>
        <span className="hint">La racha suma cada día en que lees, aunque sea un poco. La meta diaria marca los días en que llegaste a tus minutos.</span>
      </div>
    </div>
  )
}

function ExLibrisPanel() {
  const { settings, updateSettings } = useLibrary()
  const ex: ExLibris = settings.exlibris ?? { enabled: false, name: '', motif: 'buho', phrase: '', ink: '#5b1f24', shape: 'ovalo' }
  const set = (p: Partial<ExLibris>) => updateSettings({ exlibris: { ...ex, ...p, enabled: p.enabled ?? true } })
  return (
    <div className="exlibris-designer">
      <div className="ex-preview">
        <div className="ex-paper"><ExLibrisSeal cfg={{ ...ex, name: ex.name || settings.readerName }} size={190} /></div>
        <label className="check"><input type="checkbox" checked={ex.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> Sellar la primera página de mis libros</label>
      </div>
      <div className="fields">
        <p className="muted small">«Ex libris» significa «de los libros de…». Era el sello que se pegaba dentro de un libro para decir a quién pertenecía. Diseña el tuyo.</p>
        <div className="row2">
          <div className="field"><label htmlFor="ex-name">Nombre</label><input id="ex-name" defaultValue={ex.name || settings.readerName} maxLength={28} onBlur={(e) => set({ name: e.target.value.trim() })} placeholder="Tu nombre" /></div>
          <div className="field"><label htmlFor="ex-phrase">Frase <em className="opt">opcional</em></label><input id="ex-phrase" defaultValue={ex.phrase} maxLength={34} onBlur={(e) => set({ phrase: e.target.value })} placeholder="Leer es viajar" /></div>
        </div>
        <div className="field">
          <span className="lbl">Motivo</span>
          <div className="motif-grid" role="radiogroup" aria-label="Motivo">
            {MOTIFS.map((m) => (
              <button key={m.id} type="button" role="radio" aria-checked={ex.motif === m.id} onClick={() => set({ motif: m.id })} title={m.name}>
                <svg viewBox="0 0 60 60" width="34" height="34" aria-hidden><MotifArt id={m.id} ink="currentColor" /></svg>
                <span>{m.name}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="row2">
          <div className="field">
            <span className="lbl">Forma</span>
            <div className="seg seg-n" role="radiogroup" aria-label="Forma" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(84px, 1fr))' }}>
              {([['ovalo', 'Óvalo'], ['circulo', 'Círculo'], ['escudo', 'Escudo'], ['rect', 'Marco']] as const).map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={ex.shape === v} onClick={() => set({ shape: v })}>{l}</button>)}
            </div>
          </div>
          <div className="field">
            <span className="lbl">Tinta</span>
            <div className="ink-row" role="radiogroup" aria-label="Tinta">
              {INKS.map((c) => <button key={c} type="button" role="radio" aria-checked={ex.ink === c} style={{ background: c }} onClick={() => set({ ink: c })} aria-label={`Tinta ${c}`} />)}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function DataTab() {
  return (
    <div className="fields">
      <DataPanel />
      {__BETA__ && (
        <div className="install-help">
          <b>Instalar en el teléfono</b>
          <p><span>iPhone (Safari):</span> botón Compartir → «Agregar a pantalla de inicio».</p>
          <p><span>Android (Chrome):</span> menú ⋮ → «Instalar app» o «Agregar a pantalla principal».</p>
          <p className="ver">Versión beta del {__BUILD_DATE__}</p>
        </div>
      )}
    </div>
  )
}
