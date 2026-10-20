import JSZip from 'jszip'
import type { Chapter, TocEntry } from '../types'

export interface EpubMeta {
  title?: string
  author?: string
  description?: string
  language?: string
  coverBlob?: Blob
}

export interface ParsedEpub {
  meta: EpubMeta
  chapters: Chapter[]
  toc: TocEntry[]
  /** object URLs created for images; revoke when the reader closes */
  urls: string[]
}

export class BookFileError extends Error {}

const KEEP = new Set([
  'p', 'div', 'span', 'section', 'article', 'header', 'footer', 'aside', 'main', 'nav',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'em', 'i', 'strong', 'b', 'u', 's', 'small', 'sub', 'sup',
  'blockquote', 'q', 'cite', 'br', 'hr', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'a', 'img', 'figure',
  'figcaption', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'pre', 'code', 'abbr', 'mark',
])
const DROP = new Set(['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'link', 'meta', 'title', 'head', 'audio', 'video', 'noscript', 'math'])

function dirname(p: string) {
  const i = p.lastIndexOf('/')
  return i < 0 ? '' : p.slice(0, i + 1)
}

export function resolvePath(base: string, rel: string) {
  if (/^[a-z]+:/i.test(rel)) return rel
  const parts = (dirname(base) + decodeURIComponent(rel.split('#')[0])).split('/')
  const out: string[] = []
  for (const part of parts) {
    if (part === '..') out.pop()
    else if (part !== '.' && part !== '') out.push(part)
  }
  return out.join('/')
}

function text(el: Element | null | undefined) {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function byLocalName(root: Document | Element, name: string): Element[] {
  return Array.from(root.getElementsByTagName('*')).filter((e) => e.localName === name)
}

function parseXml(src: string, type: DOMParserSupportedType = 'application/xml') {
  const doc = new DOMParser().parseFromString(src, type)
  if (doc.getElementsByTagName('parsererror').length) {
    return new DOMParser().parseFromString(src, 'text/html')
  }
  return doc
}

function stripHtml(s: string) {
  const d = new DOMParser().parseFromString(s, 'text/html')
  return text(d.body)
}

export async function parseEpub(blob: Blob, opts: { metaOnly?: boolean } = {}): Promise<ParsedEpub> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(blob)
  } catch {
    throw new BookFileError('El archivo no es un EPUB válido o está dañado.')
  }
  const containerSrc = await zip.file('META-INF/container.xml')?.async('string')
  if (!containerSrc) throw new BookFileError('Al EPUB le falta META-INF/container.xml; no se puede leer su estructura.')
  const rootfile = byLocalName(parseXml(containerSrc), 'rootfile')[0]?.getAttribute('full-path')
  if (!rootfile) throw new BookFileError('El EPUB no indica dónde está su paquete de contenido (OPF).')
  const opfSrc = await zip.file(rootfile)?.async('string')
  if (!opfSrc) throw new BookFileError('No se encontró el paquete de contenido del EPUB.')
  const opf = parseXml(opfSrc)

  const meta: EpubMeta = {
    title: text(byLocalName(opf, 'title')[0]) || undefined,
    author: byLocalName(opf, 'creator').map(text).filter(Boolean).join(', ') || undefined,
    language: text(byLocalName(opf, 'language')[0]) || undefined,
  }
  const desc = text(byLocalName(opf, 'description')[0])
  if (desc) meta.description = stripHtml(desc)

  const manifest = new Map<string, { href: string; type: string; props: string }>()
  for (const item of byLocalName(opf, 'item')) {
    const id = item.getAttribute('id')
    const href = item.getAttribute('href')
    if (!id || !href) continue
    manifest.set(id, {
      href: resolvePath(rootfile, href),
      type: item.getAttribute('media-type') ?? '',
      props: item.getAttribute('properties') ?? '',
    })
  }

  // Cover image: EPUB3 `cover-image` property, or EPUB2 <meta name="cover">.
  let coverPath: string | undefined
  for (const m of manifest.values()) if (m.props.split(/\s+/).includes('cover-image')) coverPath = m.href
  if (!coverPath) {
    const coverId = byLocalName(opf, 'meta').find((m) => m.getAttribute('name') === 'cover')?.getAttribute('content')
    if (coverId && manifest.get(coverId)?.type.startsWith('image/')) coverPath = manifest.get(coverId)!.href
  }
  if (!coverPath) {
    for (const m of manifest.values()) if (m.type.startsWith('image/') && /cover/i.test(m.href)) { coverPath = m.href; break }
  }
  if (coverPath) {
    const data = await zip.file(coverPath)?.async('blob')
    const type = [...manifest.values()].find((m) => m.href === coverPath)?.type || 'image/jpeg'
    if (data) meta.coverBlob = new Blob([data], { type })
  }

  if (opts.metaOnly) return { meta, chapters: [], toc: [], urls: [] }

  // Table of contents (EPUB3 nav, then EPUB2 NCX).
  const tocRaw: { title: string; level: number; path: string; fragment?: string }[] = []
  const navItem = [...manifest.values()].find((m) => m.props.split(/\s+/).includes('nav'))
  if (navItem) {
    const navSrc = await zip.file(navItem.href)?.async('string')
    if (navSrc) {
      const navDoc = parseXml(navSrc, 'application/xhtml+xml')
      const navs = byLocalName(navDoc, 'nav')
      const tocNav = navs.find((n) => (n.getAttribute('epub:type') ?? n.getAttributeNS('http://www.idpf.org/2007/ops', 'type') ?? '').includes('toc')) ?? navs[0]
      if (tocNav) {
        for (const a of byLocalName(tocNav, 'a')) {
          const href = a.getAttribute('href')
          if (!href) continue
          let level = 0
          for (let p = a.parentElement; p && p !== tocNav; p = p.parentElement) if (p.localName === 'ol') level++
          tocRaw.push({ title: text(a), level: Math.max(0, level - 1), path: resolvePath(navItem.href, href), fragment: href.split('#')[1] })
        }
      }
    }
  }
  if (!tocRaw.length) {
    const spineEl = byLocalName(opf, 'spine')[0]
    const ncx = manifest.get(spineEl?.getAttribute('toc') ?? '') ?? [...manifest.values()].find((m) => m.type === 'application/x-dtbncx+xml')
    const ncxSrc = ncx && (await zip.file(ncx.href)?.async('string'))
    if (ncx && ncxSrc) {
      const walk = (el: Element, level: number) => {
        for (const np of Array.from(el.children).filter((c) => c.localName === 'navPoint')) {
          const label = text(byLocalName(np, 'text')[0])
          const src = byLocalName(np, 'content')[0]?.getAttribute('src')
          if (src) tocRaw.push({ title: label, level, path: resolvePath(ncx.href, src), fragment: src.split('#')[1] })
          walk(np, level + 1)
        }
      }
      const navMap = byLocalName(parseXml(ncxSrc), 'navMap')[0]
      if (navMap) walk(navMap, 0)
    }
  }

  const urls: string[] = []
  const imageCache = new Map<string, string>()
  async function imageUrl(path: string) {
    if (imageCache.has(path)) return imageCache.get(path)!
    const f = zip.file(path)
    if (!f) return ''
    const type = [...manifest.values()].find((m) => m.href === path)?.type || (path.endsWith('.svg') ? 'image/svg+xml' : 'image/jpeg')
    const url = URL.createObjectURL(new Blob([await f.async('blob')], { type }))
    urls.push(url)
    imageCache.set(path, url)
    return url
  }

  const spine = byLocalName(opf, 'itemref')
    .filter((r) => r.getAttribute('linear') !== 'no')
    .map((r) => manifest.get(r.getAttribute('idref') ?? ''))
    .filter((m): m is NonNullable<typeof m> => !!m && /html|xml/.test(m.type))

  if (!spine.length) throw new BookFileError('El EPUB no contiene capítulos legibles.')

  const chapters: Chapter[] = []
  for (const item of spine) {
    const src = await zip.file(item.href)?.async('string')
    if (!src) continue
    const doc = parseXml(src, 'application/xhtml+xml')
    const body = doc.getElementsByTagName('body')[0] ?? doc.documentElement
    const out = document.createElement('div')
    await sanitizeInto(body, out, item.href, imageUrl)
    const plain = (out.textContent ?? '').trim()
    if (!plain && !out.querySelector('img')) continue
    const tocTitle = tocRaw.find((t) => t.path === item.href)?.title
    const heading = text(out.querySelector('h1, h2, h3'))
    const title = tocTitle || heading || (out.querySelector('img') && !plain ? 'Ilustración' : `Sección ${chapters.length + 1}`)
    chapters.push({ title, html: out.innerHTML, href: item.href })
  }
  if (!chapters.length) throw new BookFileError('No se encontró texto legible dentro del EPUB.')

  const toc: TocEntry[] = tocRaw
    .map((t) => ({ title: t.title || 'Sin título', level: t.level, target: chapters.findIndex((c) => c.href === t.path), fragment: t.fragment }))
    .filter((t) => t.target >= 0)
  const finalToc = toc.length ? toc : chapters.map((c, i) => ({ title: c.title, level: 0, target: i }))

  return { meta, chapters, toc: finalToc, urls }
}

async function sanitizeInto(src: Element, dest: HTMLElement, basePath: string, imageUrl: (p: string) => Promise<string>) {
  for (const node of Array.from(src.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      dest.appendChild(document.createTextNode(node.textContent ?? ''))
      continue
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue
    const el = node as Element
    const tag = el.localName.toLowerCase()
    if (DROP.has(tag)) continue
    // SVG wrappers used for full-page covers: keep only the referenced image.
    if (tag === 'svg') {
      const img = byLocalName(el, 'image')[0]
      const href = img?.getAttribute('href') ?? img?.getAttributeNS('http://www.w3.org/1999/xlink', 'href')
      if (href) {
        const url = await imageUrl(resolvePath(basePath, href))
        if (url) {
          const i = document.createElement('img')
          i.src = url
          i.alt = ''
          i.className = 'full'
          dest.appendChild(i)
        }
      }
      continue
    }
    if (!KEEP.has(tag)) {
      await sanitizeInto(el, dest, basePath, imageUrl)
      continue
    }
    const out = document.createElement(tag)
    if (tag === 'img') {
      const s = el.getAttribute('src')
      if (!s) continue
      const url = await imageUrl(resolvePath(basePath, s))
      if (!url) continue
      ;(out as HTMLImageElement).src = url
      ;(out as HTMLImageElement).alt = el.getAttribute('alt') ?? ''
    }
    if (tag === 'a') {
      const href = el.getAttribute('href') ?? ''
      if (/^https?:/i.test(href)) {
        out.setAttribute('href', href)
        out.setAttribute('target', '_blank')
        out.setAttribute('rel', 'noopener noreferrer')
      }
    }
    for (const a of ['colspan', 'rowspan', 'lang']) {
      const v = el.getAttribute(a)
      if (v) out.setAttribute(a, v)
    }
    // Preserve common inline semantics expressed through classes in many EPUBs.
    const cls = el.getAttribute('class') ?? ''
    if (/center|centrado|centered/i.test(cls)) out.setAttribute('data-align', 'center')
    if (/right|derecha/i.test(cls)) out.setAttribute('data-align', 'right')
    if (/italic|cursiva|em\b/i.test(cls)) out.setAttribute('data-italic', '')
    dest.appendChild(out)
    if (tag !== 'img' && tag !== 'br' && tag !== 'hr') await sanitizeInto(el, out, basePath, imageUrl)
  }
}
