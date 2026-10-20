# Ex Libris — biblioteca digital interactiva (beta)

React 19 + TypeScript + Vite, Tailwind 4, Motion, PDF.js, JSZip, IndexedDB (idb), vite-plugin-pwa.

```bash
npm install
npm run dev           # desarrollo en http://localhost:5173
npm run build         # dist/index.html autocontenido en un solo archivo
npm run build:pages   # app instalable (PWA) en dist/ para GitHub Pages u otro hosting estático
```

## Publicar la beta en GitHub Pages

La beta se publica sola en `https://<usuario>.github.io/<repositorio>/` cada vez que se sube un cambio a `main`
(workflow `.github/workflows/deploy-pages.yml`).

1. Crea un repositorio en GitHub (por ejemplo `ex-libris`) y sube esta carpeta:
   ```bash
   git init && git add . && git commit -m "Ex Libris beta"
   git branch -M main
   git remote add origin https://github.com/<usuario>/ex-libris.git
   git push -u origin main
   ```
2. En el repositorio: **Settings → Pages → Source: GitHub Actions**.
3. Ve a **Actions**: cuando el workflow «Publicar beta en GitHub Pages» termine en verde, el enlace aparece en Settings → Pages.
4. Comparte ese enlace con quienes van a probar.

**Privacidad:** el sitio es público para quien tenga el enlace, pero no contiene datos de nadie: cada persona empieza con la biblioteca vacía y sus libros quedan solo en su dispositivo.

## Para quienes prueban

- **iPhone:** abre el enlace en Safari → botón Compartir → «Agregar a pantalla de inicio».
- **Android:** abre el enlace en Chrome → menú ⋮ → «Instalar app».
- **Computadora:** Chrome o Edge muestran «Instalar» en la barra de direcciones (o el botón «Instalar app» de la app).
- Funciona sin conexión después de abrirla una vez.
- Los libros, notas y progreso se guardan **solo en ese dispositivo**: cada persona tiene su propia biblioteca y
  nadie más la ve. Si se borran los datos del navegador, se pierde.
- Solo abre EPUB y PDF sin DRM.

## Estructura

| Ruta | Qué hace |
|---|---|
| `src/state/library.tsx` | Estado global: libros, ajustes, historial, avisos |
| `src/lib/db.ts` | IndexedDB (metadatos, archivos, historial, ajustes) con respaldo en memoria |
| `src/lib/epub.ts` | Lector EPUB propio sobre JSZip: OPF, nav/NCX, portada, imágenes, saneado del HTML |
| `src/lib/pdf.ts` | PDF.js con el worker embebido; metadatos, portada, índice |
| `src/lib/source.ts` | Abre el contenido de cada libro y numera sus párrafos para los subrayados |
| `src/lib/importer.ts` | Validación de archivos (firma, extensión, tamaño) y extracción de metadatos |
| `src/lib/genres.ts` | Géneros y su relleno para libros antiguos |
| `src/components/Library.tsx` | Bienvenida, mesa de lectura, filtros, estantería 3D |
| `src/components/BookArt.tsx` | Libro 3D (tapa, lomo, cantos), portadas y lomos generados |
| `src/components/Stage.tsx` | Vista previa y animación de apertura/cierre |
| `src/components/reader/*` | Lector: paginación, giro de página, notas, subrayados, una o dos páginas |
| `src/components/BookForm.tsx` | Alta/edición de libros |
| `src/components/Collection.tsx`, `History.tsx`, `Stats.tsx`, `ReviewDialog.tsx` | Colección, historial, estadísticas por género, reseñas |
| `public/icons/` | Íconos de la app instalable |

## Notas de diseño

- **Paginación EPUB**: cada capítulo se compone en columnas CSS del ancho exacto de una página; el número de columnas es el número de páginas. Se recalcula al cambiar tamaño de letra o de pantalla, y la posición se guarda como capítulo + proporción para no perderse.
- **Giro de página**: hoja propia con dos caras en CSS 3D animada con Motion.
- **Movimiento reducido**: con `prefers-reduced-motion`, pantallas pequeñas o equipos de 2 núcleos o menos, las transiciones 3D se sustituyen por fundidos.

## Siguiente paso: cuentas y sincronización (Supabase)

Sustituir `src/lib/db.ts` por una implementación de la misma interfaz `Store` que use Supabase Auth, una tabla `books` con RLS por `user_id` y Storage para archivos y portadas.
