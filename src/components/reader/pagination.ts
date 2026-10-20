import type { Chapter } from '../../types'

export type PageRef =
  | { t: 'title' }
  | { t: 'blank' }
  | { t: 'flow'; c: number; k: number; n: number }
  | { t: 'pdf'; i: number }

export interface TextBox {
  pageW: number
  pageH: number
  mx: number
  top: number
  bottom: number
  W: number
  H: number
  G: number
  fontSize: number
}

export function textBox(pageW: number, pageH: number, fontScale: number): TextBox {
  const mx = Math.round(Math.max(18, pageW * 0.1))
  const top = Math.round(Math.max(38, pageH * 0.085))
  const bottom = Math.round(Math.max(30, pageH * 0.085))
  // short, wide pages (phone in landscape) would otherwise get a big type size and only a few lines
  const base = Math.min(19, Math.max(14.5, Math.min(pageW / 25, pageH / 16)))
  return {
    pageW, pageH, mx, top, bottom,
    W: Math.floor(pageW - mx * 2),
    H: Math.floor(pageH - top - bottom),
    G: 48,
    fontSize: Math.round(base * fontScale * 10) / 10,
  }
}

/**
 * Counts how many visual pages each chapter needs at the given text box.
 * The chapter is laid out in CSS columns exactly one page wide; the number of columns is the page count.
 * The same `.flow` styles are used for display, so measurement and rendering always agree.
 */
export interface Pagination { counts: number[]; blockPage: number[][] }

export async function paginate(chapters: Chapter[], box: TextBox, signal: { cancelled: boolean }): Promise<Pagination | null> {
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText = 'position:fixed;left:-99999px;top:0;visibility:hidden;pointer-events:none;contain:layout style;'
  const el = document.createElement('div')
  el.className = 'flow'
  el.style.cssText = `width:${box.W}px;height:${box.H}px;column-width:${box.W}px;column-gap:${box.G}px;font-size:${box.fontSize}px;--page-h:${box.H}px;`
  host.appendChild(el)
  document.body.appendChild(host)
  try {
    if (document.fonts?.ready) await document.fonts.ready
    const counts: number[] = []
    const blockPage: number[][] = []
    for (let i = 0; i < chapters.length; i++) {
      if (signal.cancelled) return null
      el.innerHTML = chapters[i].html
      const imgs = Array.from(el.querySelectorAll('img'))
      if (imgs.length) await Promise.all(imgs.map((im) => (im.complete ? Promise.resolve() : im.decode().catch(() => {}))))
      const n = Math.max(1, Math.round((el.scrollWidth + box.G) / (box.W + box.G)))
      counts.push(n)
      const base = el.getBoundingClientRect().left
      const pages: number[] = []
      el.querySelectorAll<HTMLElement>('[data-b]').forEach((b) => {
        const i = Number(b.dataset.b)
        pages[i] = Math.min(n - 1, Math.max(0, Math.floor((b.getBoundingClientRect().left - base + 1) / (box.W + box.G))))
      })
      blockPage.push(pages)
      // yield to keep the UI responsive on long books
      if (i % 8 === 7) await new Promise((r) => setTimeout(r, 0))
    }
    return { counts, blockPage }
  } finally {
    host.remove()
  }
}

export function buildFlowPages(counts: number[]): PageRef[] {
  const pages: PageRef[] = [{ t: 'title' }]
  counts.forEach((n, c) => {
    for (let k = 0; k < n; k++) pages.push({ t: 'flow', c, k, n })
  })
  return pages
}

export function buildSlots(pages: PageRef[], spread: boolean): PageRef[] {
  if (!spread) return pages
  const s: PageRef[] = [{ t: 'blank' }, ...pages]
  if (s.length % 2) s.push({ t: 'blank' })
  return s
}

export const pageOfSlot = (slot: number, spread: boolean) => (spread ? slot - 1 : slot)
export const slotOfPage = (page: number, spread: boolean) => (spread ? (page + 1) - ((page + 1) % 2) : page)
