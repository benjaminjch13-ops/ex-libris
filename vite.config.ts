import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Two builds from the same code:
 *  - `npm run build`        → one self-contained HTML file (the Claude artifact).
 *  - `npm run build:pages`  → an installable PWA for GitHub Pages (or any static host).
 *    BASE_PATH sets the sub-folder, e.g. "/ex-libris/" for https://<user>.github.io/ex-libris/.
 */
export default defineConfig(({ mode }) => {
  const pages = mode === 'pages'
  const base = pages ? process.env.BASE_PATH || '/' : '/'

  const headTags: Plugin = {
    name: 'pwa-head-tags',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { name: 'theme-color', content: '#1c1714' }, injectTo: 'head' },
      { tag: 'meta', attrs: { name: 'apple-mobile-web-app-capable', content: 'yes' }, injectTo: 'head' },
      { tag: 'meta', attrs: { name: 'mobile-web-app-capable', content: 'yes' }, injectTo: 'head' },
      { tag: 'meta', attrs: { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' }, injectTo: 'head' },
      { tag: 'meta', attrs: { name: 'apple-mobile-web-app-title', content: 'Ex Libris' }, injectTo: 'head' },
      { tag: 'link', attrs: { rel: 'apple-touch-icon', href: `${base}icons/apple-touch-icon.png` }, injectTo: 'head' },
      { tag: 'link', attrs: { rel: 'icon', type: 'image/png', href: `${base}icons/favicon-64.png` }, injectTo: 'head' },
    ],
  }

  return {
    base,
    plugins: [
      react(),
      tailwindcss(),
      ...(pages
        ? [
            headTags,
            VitePWA({
              registerType: 'autoUpdate',
              includeAssets: ['icons/*.png'],
              manifest: {
                name: 'Ex Libris',
                short_name: 'Ex Libris',
                description: 'Tu biblioteca personal: estantería, lector EPUB y PDF, notas, subrayados y reseñas.',
                lang: 'es',
                start_url: base,
                scope: base,
                display: 'standalone',
                orientation: 'any',
                background_color: '#13100e',
                theme_color: '#1c1714',
                icons: [
                  { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
                  { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
                  { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
                ],
                // "Abrir con Ex Libris" for EPUB/PDF on Chrome/Edge desktop when installed
                file_handlers: [
                  { action: base, accept: { 'application/epub+zip': ['.epub'], 'application/pdf': ['.pdf'] } },
                ],
                // Android: "Compartir → Ex Libris" from a store app drops the link into the wishlist
                share_target: { action: `${base}?share=1`, method: 'GET', params: { title: 'title', text: 'text', url: 'url' } },
              } as Record<string, unknown>,
              workbox: {
                // the PDF engine ships inside the main bundle, so allow large files in the offline cache
                maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
                globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
                runtimeCaching: [
                  {
                    urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
                    handler: 'CacheFirst',
                    options: { cacheName: 'google-fonts', expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 } },
                  },
                  {
                    // catalogue covers shown in the wishlist and search results stay visible offline
                    urlPattern: /^https:\/\/(covers\.openlibrary\.org|books\.google\.com\/books\/(content|publisher)|is\d-ssl\.mzstatic\.com|archive\.org)\/.*/i,
                    handler: 'CacheFirst',
                    options: { cacheName: 'book-covers', expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 180 }, cacheableResponse: { statuses: [0, 200] } },
                  },
                ],
              },
            }),
          ]
        : [viteSingleFile()]),
    ],
    define: {
      __BETA__: JSON.stringify(pages),
      __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
    },
    build: { target: 'es2022', assetsInlineLimit: pages ? 4096 : 100_000_000, chunkSizeWarningLimit: 5000 },
  }
})
