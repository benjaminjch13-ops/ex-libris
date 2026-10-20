import type { Book, Status } from '../types'

export interface Filters {
  q: string
  status: Status | 'todos'
  category: string
  author: string
  fav: boolean
  shelf?: string
}

export const EMPTY_FILTERS: Filters = { q: '', status: 'todos', category: '', author: '', fav: false }

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

export function applyFilters(books: Book[], f: Filters) {
  const q = norm(f.q.trim())
  return books.filter((b) => {
    if (f.status !== 'todos' && b.status !== f.status) return false
    if (f.category && b.category !== f.category) return false
    if (f.author && b.author !== f.author) return false
    if (f.fav && !b.favorite) return false
    if (f.shelf && !b.shelves?.includes(f.shelf)) return false
    if (q && !norm(`${b.title} ${b.author} ${b.category}`).includes(q)) return false
    return true
  })
}
