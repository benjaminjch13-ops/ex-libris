import { test, expect, type Page } from '@playwright/test'

/** The catalogues answer from here, never from the network. */
async function mockCatalogs(page: Page) {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort())
  await page.route(/googleapis\.com\/books/, (r) => r.fulfill({ json: { totalItems: 0 } }))
  await page.route(/openlibrary\.org/, (r) => r.fulfill({ json: r.request().url().includes('api/books') ? {} : { docs: [] } }))
  await page.route(/archive\.org|graphql\.anilist|api\.jikan|covers\.openlibrary/, (r) => r.fulfill({ status: 404, body: '' }))
  await page.route(/itunes\.apple\.com/, (r) => {
    const cb = new URL(r.request().url()).searchParams.get('callback')
    return r.fulfill({ body: `${cb}({"results":[]})`, contentType: 'text/javascript' })
  })
}

function watchErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error' && !/net::|Failed to load resource/.test(m.text())) errors.push(m.text()) })
  return errors
}

test.beforeEach(async ({ page }) => { await mockCatalogs(page) })

test('la app abre vacía, sin errores y sin barra de búsqueda en el inicio', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/')
  await expect(page.getByText('Los estantes esperan su primer libro')).toBeVisible()
  await expect(page.locator('.empty-art').first()).toBeVisible()
  await expect(page.locator('header #q')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('añadir un libro de papel a mano, prestarlo y devolverlo', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Añadir libro' }).first().click()
  await page.getByRole('radio', { name: 'Libro de papel' }).click()
  await page.fill('#bf-title', 'Rayuela')
  await page.fill('#bf-author', 'Julio Cortázar')
  await page.locator('button[type=submit]').click()
  const book = page.locator('.shelf-book').first()
  await expect(book).toBeVisible()

  await book.click()
  await page.getByRole('button', { name: 'Prestar', exact: true }).click()
  await page.fill('#ln-to', 'Ana')
  await page.getByRole('button', { name: 'Prestar', exact: true }).last().click()
  await expect(page.locator('.loan-card')).toContainText('Prestado a Ana')
  await expect(page.locator('.modal')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.locator('.stage')).toHaveCount(0)
  await expect(page.locator('.shelf-book.loaned')).toHaveCount(1)
  await expect(page.locator('.loan-item')).toContainText('Ana')

  await page.locator('.loan-item').getByRole('button', { name: 'Devuelto' }).click()
  await expect(page.locator('.loan-item')).toHaveCount(0)
  await expect(page.locator('.shelf-book.loaned')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('las secciones abren y la colección tiene su buscador', async ({ page, isMobile }) => {
  const errors = watchErrors(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Añadir libro' }).first().click()
  await page.getByRole('radio', { name: 'Libro de papel' }).click()
  await page.fill('#bf-title', 'Pedro Páramo'); await page.fill('#bf-author', 'Juan Rulfo')
  await page.locator('button[type=submit]').click()
  await expect(page.locator('.shelf-book')).toHaveCount(1)

  const open = async (name: string, desk: string) => {
    if (isMobile) {
      const tab = page.locator('.tabbar button', { hasText: name })
      if (await tab.count()) await tab.click()
      else { await page.locator('.tabbar button', { hasText: 'Más' }).click(); await page.getByRole('menuitem', { name }).click() }
    } else await page.getByRole('button', { name: desk, exact: true }).first().click()
  }
  for (const [name, desk, heading] of [
    ['Para ti', 'Libros que pueden gustarte', 'Libros que pueden gustarte'],
    ['Por leer', 'Por leer', 'Por leer'],
    ['Wishlist', 'Wishlist', 'Wishlist'],
    ['Historial de lectura', 'Historial de lectura', 'Historial de lectura'],
    ['Colección completa', 'Colección completa', 'Colección completa'],
  ]) {
    await open(name, desk)
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
  }
  await page.fill('#q', 'páramo')
  await expect(page.locator('.coll-item')).toHaveCount(1)
  await page.fill('#q', 'zzz')
  await expect(page.getByText('Ningún libro coincide')).toBeVisible()
  expect(errors).toEqual([])
})

test('PDF escaneado: recorta márgenes, separa hojas dobles y se puede ampliar', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Añadir libro' }).first().click()
  await page.setInputFiles('#bf-file', 'tests/fixtures/escaneado.pdf')
  await expect(page.locator('#bf-title')).not.toHaveValue('')
  await page.fill('#bf-title', 'Escaneado'); await page.fill('#bf-author', 'Anónimo')
  await page.locator('button[type=submit]').click()
  await page.locator('.shelf-book').first().click()
  await page.locator('.preview .btn-gold').first().click()
  // 2 scanned sheets, the second one a two-page spread → 3 pages
  await expect(page.locator('.reader-bar .ttl span')).toHaveText('PDF · 3 páginas', { timeout: 15000 })
  await expect(page.locator('.pdf-page.fitted img').first()).toBeVisible({ timeout: 15000 })
  await page.getByRole('button', { name: 'Ampliar la página' }).first().click()
  await expect(page.locator('.pz-page')).toHaveText('Página 1 de 3')
  await page.getByRole('button', { name: 'Acercar' }).click()
  await expect(page.locator('.pz-scale')).not.toHaveText('100%')
  await page.locator('.pz-nav.next').click()
  await expect(page.locator('.pz-page')).toHaveText('Página 2 de 3')
  await page.getByRole('button', { name: 'Cerrar la vista ampliada' }).click()
  await expect(page.locator('.pdf-zoom')).toHaveCount(0)
  expect(errors).toEqual([])
})
