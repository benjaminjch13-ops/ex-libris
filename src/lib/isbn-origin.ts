/**
 * What an ISBN says about itself: the country group and, for known registrants, the publisher.
 * Used when the catalogues don't know a book by its ISBN (common with Spanish-language
 * Penguin Random House editions), to point the reader to a title search with context.
 */

/** ISBN registration groups (after 978-) for Spanish-speaking countries and a few others. */
const GROUPS: [string, string][] = [
  ['84', 'España'], ['607', 'México'], ['968', 'México'], ['970', 'México'], ['950', 'Argentina'], ['987', 'Argentina'],
  ['958', 'Colombia'], ['956', 'Chile'], ['612', 'Perú'], ['9972', 'Perú'], ['9974', 'Uruguay'], ['980', 'Venezuela'],
  ['99922', 'Guatemala'], ['99939', 'Guatemala'], ['9977', 'Costa Rica'], ['9930', 'Costa Rica'], ['9968', 'Costa Rica'],
  ['9945', 'República Dominicana'], ['99934', 'República Dominicana'], ['9978', 'Ecuador'], ['9942', 'Ecuador'],
  ['9962', 'Panamá'], ['99923', 'El Salvador'], ['99961', 'El Salvador'], ['99926', 'Honduras'], ['99924', 'Nicaragua'],
  ['959', 'Cuba'], ['99905', 'Bolivia'], ['99954', 'Bolivia'], ['99925', 'Paraguay'], ['99953', 'Paraguay'],
  ['85', 'Brasil'], ['65', 'Brasil'], ['972', 'Portugal'], ['989', 'Portugal'],
]

/** Registrant prefixes (after 978-) of Penguin Random House Grupo Editorial imprints. */
const PRH: [string, string][] = [
  ['84204', 'Alfaguara'], ['84663', 'Debolsillo'], ['8401', 'Plaza & Janés'], ['84264', 'Lumen'], ['84253', 'Grijalbo'],
  ['84397', 'Mondadori'], ['84306', 'Taurus'], ['60731', 'Penguin Random House México'], ['60738', 'Penguin Random House México'],
  ['95007', 'Sudamericana'], ['1949061', 'Penguin Random House Grupo Editorial (EE. UU.)'], ['1947783', 'Penguin Random House Grupo Editorial (EE. UU.)'],
]

export interface IsbnOrigin { country?: string; publisher?: string; prh: boolean }

export function isbnOrigin(isbn13: string): IsbnOrigin {
  const body = isbn13.startsWith('978') ? isbn13.slice(3) : ''
  const longest = <T extends [string, string]>(list: T[]) => list.filter(([p]) => body.startsWith(p)).sort((a, b) => b[0].length - a[0].length)[0]
  const g = longest(GROUPS), p = longest(PRH)
  return { country: g?.[1], publisher: p?.[1], prh: !!p }
}

/** "Alfaguara (Penguin Random House) · edición de España"; the country is left out when the name already says it */
export function originLabel(o: IsbnOrigin): string {
  const pub = o.publisher ? (o.prh && !o.publisher.includes('Penguin') ? `${o.publisher} (Penguin Random House)` : o.publisher) : ''
  const where = o.country && !pub.includes(o.country) ? `edición de ${o.country}` : ''
  return [pub, where].filter(Boolean).join(' · ')
}

/** "es de Alfaguara (Penguin Random House), edición de España" / "es una edición de México" */
export function originSentence(o: IsbnOrigin): string {
  const pub = o.publisher ? (o.prh && !o.publisher.includes('Penguin') ? `${o.publisher} (Penguin Random House)` : o.publisher) : ''
  const where = o.country && !pub.includes(o.country) ? `edición de ${o.country}` : ''
  if (pub) return `es de ${pub}${where ? `, ${where}` : ''}`
  return where ? `es una ${where}` : ''
}
