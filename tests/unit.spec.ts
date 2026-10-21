import { test, expect } from '@playwright/test'
import { dateFrom, parseCsv, ratingFrom, rowsFromCsv, statusFrom } from '../src/lib/bulk'
import { isbnOrigin, originSentence } from '../src/lib/isbn-origin'

// pure functions: run once, not per device
test.describe.configure({ mode: 'parallel' })

test('lee CSV con comillas, punto y coma y BOM', ({}, info) => {
  test.skip(info.project.name !== 'escritorio')
  expect(parseCsv('﻿a;b\n"x;y";"di ""hola"""\n')).toEqual([['a', 'b'], ['x;y', 'di "hola"']])
})

test('entiende estados, estrellas y fechas en español e inglés', ({}, info) => {
  test.skip(info.project.name !== 'escritorio')
  expect(statusFrom('✅ Leído')).toBe('terminado')
  expect(statusFrom('currently-reading')).toBe('leyendo')
  expect(statusFrom('to-read')).toBe('pendiente')
  expect(statusFrom('No leído')).toBe('pendiente')
  expect(statusFrom('DNF')).toBe('abandonado')
  expect(ratingFrom('⭐⭐⭐⭐')).toBe(4)
  expect(ratingFrom('8')).toBe(4)
  expect(new Date(dateFrom('3 de octubre de 2024')!).getMonth()).toBe(9)
  expect(new Date(dateFrom('September 2, 2024 → October 3, 2024')!).getDate()).toBe(3)
})

test('exportación de Notion: columnas con emojis y títulos con enlace', ({}, info) => {
  test.skip(info.project.name !== 'escritorio')
  const rows = rowsFromCsv('Nombre,Autor,📌 Estado,Calificación\nPedro Páramo (Pedro%20P.md),Juan Rulfo,✅ Leído,4\n')
  expect(rows[0]).toMatchObject({ title: 'Pedro Páramo', author: 'Juan Rulfo', status: 'terminado', rating: 4 })
})

test('reconoce editorial y país desde el ISBN', ({}, info) => {
  test.skip(info.project.name !== 'escritorio')
  expect(isbnOrigin('9788420412146')).toMatchObject({ country: 'España', publisher: 'Alfaguara', prh: true })
  expect(originSentence(isbnOrigin('9786073822008'))).toBe('es de Penguin Random House México')
  expect(originSentence(isbnOrigin('9789992200001'))).toBe('es una edición de Guatemala')
})
