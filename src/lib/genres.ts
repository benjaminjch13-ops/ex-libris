import type { Book } from '../types'

export const GENRES = [
  'Novela', 'Relatos', 'Poesía', 'Ciencia ficción y distopía', 'Fantasía', 'Terror y misterio',
  'Ensayo', 'Feminismo', 'Memorias y biografía', 'Desarrollo personal', 'Creatividad', 'Psicología',
  'Filosofía y espiritualidad', 'Negocios y finanzas', 'Historia', 'Ciencia y divulgación', 'Manga y cómic',
]

const FROM_CATEGORY: Record<string, string> = {
  Novela: 'Novela', Relatos: 'Relatos', Poesía: 'Poesía', Ensayo: 'Ensayo', Historia: 'Historia',
  Divulgación: 'Ciencia y divulgación', Misterio: 'Terror y misterio', 'Ciencia ficción': 'Ciencia ficción y distopía',
  Fantasía: 'Fantasía', Biografía: 'Memorias y biografía', Filosofía: 'Filosofía y espiritualidad',
}

export const NO_GENRE = 'Sin género'

export function genreOf(b: Book): string {
  return b.genre || FROM_CATEGORY[b.category] || NO_GENRE
}

/** Genre for a book saved before genres existed, when it can be told from its category. */
export function genreFromCategory(b: Book): string | undefined {
  if (b.genre) return undefined
  return FROM_CATEGORY[b.category]
}
