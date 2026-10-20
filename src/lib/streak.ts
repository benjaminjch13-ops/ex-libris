import type { Book, HistoryEntry } from '../types'

const pad = (n: number) => String(n).padStart(2, '0')
const dayKey = (t: number | Date) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
const DAY = 86400000

/** Seconds read per local day. Any reading session counts (a paper-book page update without minutes counts as a day read). */
function readingDays(history: HistoryEntry[]) {
  const m = new Map<string, number>()
  for (const h of history) {
    if (h.type !== 'sesion') continue
    const k = dayKey(h.at)
    m.set(k, (m.get(k) ?? 0) + (h.seconds ?? (h.minutes ?? 0) * 60))
  }
  return m
}

interface StreakInfo {
  current: number
  best: number
  readToday: boolean
  todayMinutes: number
  week: { key: string; label: string; read: boolean; minutes: number; today: boolean; goalMet: boolean }[]
}

const WEEKDAY = ['D', 'L', 'M', 'M', 'J', 'V', 'S']

export function streakInfo(history: HistoryEntry[], dailyGoal?: number, now = Date.now()): StreakInfo {
  const days = readingDays(history)
  const today = dayKey(now)
  const readToday = days.has(today)
  // the streak stays alive until the end of today: start counting from yesterday if today has no reading yet
  let current = 0
  for (let t = readToday ? now : now - DAY; days.has(dayKey(t)); t -= DAY) current++
  // longest run ever
  const sorted = [...days.keys()].sort()
  let best = 0, run = 0, prev: number | null = null
  for (const k of sorted) {
    const t = new Date(`${k}T12:00:00`).getTime()
    run = prev != null && Math.round((t - prev) / DAY) === 1 ? run + 1 : 1
    best = Math.max(best, run)
    prev = t
  }
  const week = Array.from({ length: 7 }, (_, i) => {
    const t = now - (6 - i) * DAY
    const k = dayKey(t)
    const minutes = Math.round((days.get(k) ?? 0) / 60)
    return { key: k, label: WEEKDAY[new Date(t).getDay()], read: days.has(k), minutes, today: k === today, goalMet: !!dailyGoal && minutes >= dailyGoal }
  })
  return { current, best: Math.max(best, current), readToday, todayMinutes: Math.round((days.get(today) ?? 0) / 60), week }
}

export interface YearStats {
  year: number
  finished: Book[]
  pages: number
  minutes: number
  daysRead: number
  bestStreak: number
  topGenre?: { genre: string; n: number }
  topAuthor?: { author: string; n: number }
  best?: Book
  perMonth: number[]
  dropped: number
  goal?: number
  /** how many the goal expects by today */
  expected?: number
}

export function yearStats(year: number, books: Book[], history: HistoryEntry[], genreOf: (b: Book) => string, goal?: number, now = Date.now()): YearStats {
  const inYear = (t?: number) => !!t && new Date(t).getFullYear() === year
  const finished = books.filter((b) => b.status === 'terminado' && inYear(b.finishedAt)).sort((a, b) => (a.finishedAt ?? 0) - (b.finishedAt ?? 0))
  const sessions = history.filter((h) => h.type === 'sesion' && inYear(h.at))
  const minutes = Math.round(sessions.reduce((n, h) => n + (h.seconds ?? (h.minutes ?? 0) * 60), 0) / 60)
  const days = readingDays(sessions)
  let bestStreak = 0, run = 0, prev: number | null = null
  for (const k of [...days.keys()].sort()) {
    const t = new Date(`${k}T12:00:00`).getTime()
    run = prev != null && Math.round((t - prev) / DAY) === 1 ? run + 1 : 1
    bestStreak = Math.max(bestStreak, run); prev = t
  }
  const count = <T,>(arr: T[]) => { const m = new Map<T, number>(); arr.forEach((x) => m.set(x, (m.get(x) ?? 0) + 1)); return [...m.entries()].sort((a, b) => b[1] - a[1])[0] }
  const g = count(finished.map(genreOf).filter((x) => x !== 'Sin género'))
  const a = count(finished.map((b) => b.author).filter(Boolean))
  const best = [...finished].sort((x, y) => (y.review?.rating ?? 0) - (x.review?.rating ?? 0) || Number(y.favorite) - Number(x.favorite))[0]
  const perMonth = Array.from({ length: 12 }, (_, m) => finished.filter((b) => new Date(b.finishedAt!).getMonth() === m).length)
  const start = new Date(year, 0, 1).getTime(), end = new Date(year + 1, 0, 1).getTime()
  const frac = Math.min(1, Math.max(0, (Math.min(now, end) - start) / (end - start)))
  return {
    year, finished, minutes, bestStreak,
    pages: finished.reduce((n, b) => n + (b.pages ?? 0), 0),
    daysRead: days.size,
    topGenre: g ? { genre: g[0], n: g[1] } : undefined,
    topAuthor: a && a[1] > 1 ? { author: a[0], n: a[1] } : undefined,
    best: best && ((best.review?.rating ?? 0) > 0 || best.favorite) ? best : finished[finished.length - 1],
    perMonth,
    dropped: books.filter((b) => b.status === 'abandonado' && inYear(b.dropped?.at)).length,
    goal, expected: goal ? Math.round(goal * frac * 10) / 10 : undefined,
  }
}
