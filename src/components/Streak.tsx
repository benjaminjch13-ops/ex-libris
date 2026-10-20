import { useMemo } from 'react'
import { motion } from 'motion/react'
import { useLibrary } from '../state/library'
import { streakInfo } from '../lib/streak'

function Ring({ value, size = 54, stroke = 5, children, label }: { value: number; size?: number; stroke?: number; children?: React.ReactNode; label: string }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, value))
  return (
    <span className="sk-ring" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--fg-rgb) / .12)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--gold)" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - v)} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dashoffset .8s var(--ease-out)' }} />
      </svg>
      <span className="sk-ring-in">{children}</span>
    </span>
  )
}

/** Daily reading streak, this week, today's minutes and the year goal, in one card on the home screen. */
export function StreakWidget({ onYear, onGoals }: { onYear: () => void; onGoals: () => void }) {
  const { history, books, settings } = useLibrary()
  const goals = settings.goals ?? {}
  const s = useMemo(() => streakInfo(history, goals.dailyMinutes), [history, goals.dailyMinutes])
  const year = new Date().getFullYear()
  const done = books.filter((b) => b.status === 'terminado' && b.finishedAt && new Date(b.finishedAt).getFullYear() === year).length
  const start = new Date(year, 0, 1).getTime()
  const frac = (Date.now() - start) / (new Date(year + 1, 0, 1).getTime() - start)
  const expected = goals.yearBooks ? goals.yearBooks * frac : 0
  const pace = goals.yearBooks ? (done >= Math.ceil(expected) ? (done > expected + 1 ? 'vas por delante' : 'vas al día') : `te faltan ${Math.ceil(expected) - done} para ir al día`) : ''

  const msg = s.current === 0
    ? (s.best ? `Tu mejor racha fue de ${s.best} ${s.best === 1 ? 'día' : 'días'}. Hoy es buen día para empezar otra.` : 'Lee un rato hoy y empieza tu racha.')
    : s.readToday ? (s.current === s.best && s.current > 2 ? '¡Tu mejor racha!' : 'Hoy ya leíste. ¡Sigue así!') : 'Lee hoy para no perderla.'

  return (
    <motion.section className="streak" aria-label="Racha de lectura" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <div className="sk-main">
        <span className={`sk-flame${s.current ? ' on' : ''}${s.readToday ? ' lit' : ''}`} aria-hidden>
          <svg viewBox="0 0 24 24" width="30" height="30"><path d="M12 2.5c.8 3.2 4.6 5.4 4.6 10.1A4.6 4.6 0 0 1 12 17.2a4.6 4.6 0 0 1-4.6-4.6c0-2 1-3.2 2-4.3.2 1.6.9 2.6 2 3 0-3 .2-5.8.6-8.8Z" /><path d="M12 21.5a6.5 6.5 0 0 0 6.5-6.5" opacity=".5" /></svg>
        </span>
        <div className="sk-text">
          <b><span className="sk-n">{s.current}</span> {s.current === 1 ? 'día seguido' : 'días seguidos'}</b>
          <span>{msg}</span>
        </div>
      </div>
      <ol className="sk-week" aria-label="Últimos siete días">
        {s.week.map((d) => (
          <li key={d.key} className={`${d.read ? 'read' : ''}${d.today ? ' today' : ''}${d.goalMet ? ' goal' : ''}`} title={d.read ? `${d.minutes} min` : 'Sin lectura'}>
            <i aria-hidden />
            <span>{d.label}</span>
            <span className="sr-only">{d.read ? `leíste${d.minutes ? ` ${d.minutes} minutos` : ''}` : 'sin lectura'}</span>
          </li>
        ))}
      </ol>
      <div className="sk-goals">
        {goals.dailyMinutes ? (
          <div className="sk-goal">
            <Ring value={s.todayMinutes / goals.dailyMinutes} label={`${s.todayMinutes} de ${goals.dailyMinutes} minutos hoy`}><b>{s.todayMinutes}</b></Ring>
            <span><b>de {goals.dailyMinutes} min</b><em>hoy</em></span>
          </div>
        ) : null}
        {goals.yearBooks ? (
          <div className="sk-goal">
            <Ring value={done / goals.yearBooks} label={`${done} de ${goals.yearBooks} libros este año`}><b>{done}</b></Ring>
            <span><b>de {goals.yearBooks} libros</b><em>{year} · {pace}</em></span>
          </div>
        ) : null}
        {!goals.dailyMinutes && !goals.yearBooks && (
          <button className="chip" onClick={onGoals}>Ponte una meta de lectura</button>
        )}
        <button className="chip sk-year" onClick={onYear}>Tu año en libros →</button>
      </div>
    </motion.section>
  )
}
