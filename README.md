# GDC Logistics Platform

Aplicación web para **Gorrión del Cielo SAS**: gestión de viajes, clientes, costos, facturación y mapa operativo. Los datos viven en **Google Sheets** y la app se comunica con un **Web App de Google Apps Script** desplegado desde la misma hoja.

- **Interfaz:** React 18 + TypeScript + Vite  
- **Hosting:** [GitHub Pages](https://pages.github.com/) (`base: /LOGISTIC-APP/`)  
- **Backend ligero:** Apps Script (`GOOGLE_APPS_SCRIPT.js` en este repo como referencia para pegar en el editor de la hoja)

---

## Requisitos

- Node.js **20** (recomendado; CI usa 20)
- Cuenta Google con hoja de cálculo + proyecto Apps Script publicado como Web App (**Ejecutar como: yo** · **Quién tiene acceso: cualquier persona**)

---

## Desarrollo local

```bash
npm ci
```

Creá un archivo **`.env.local`** en la raíz (no se sube a git) con al menos:

| Variable | Descripción |
|----------|-------------|
| `VITE_SHEET_URL` | URL del Web App de Apps Script (GET devuelve JSON con `clients`, `trips`, `costs`) |
| `VITE_GEMINI_API_KEY` | Opcional; si falta, los insights del dashboard usan texto fijo local |
| `VITE_DRIVE_FOLDER_REMITOS` | ID de carpeta de Drive para remitos (subida vía script) |
| `VITE_DRIVE_FOLDER_FACTURAS` | ID de carpeta de Drive para facturas |

```bash
npm run dev
```

Abre la URL que muestra Vite (por defecto `http://localhost:5173/LOGISTIC-APP/` si usás el mismo `base` que en producción; en local a veces se sirve en la raíz según cómo abras el enlace).

Otros comandos:

```bash
npx tsc --noEmit   # comprobar tipos
npm run build      # build de producción → dist/
npm run preview    # servir dist (p. ej. puerto 4173)
```

---

## Despliegue en GitHub Pages

El workflow **Deploy to GitHub Pages** (`.github/workflows/deploy.yml`) se ejecuta en cada **push a `main`** y también manualmente (**Actions → Deploy to GitHub Pages → Run workflow**).

### Secrets de GitHub (Settings → Secrets and variables → Actions)

Definí al menos (nombres exactos):

- `VITE_SHEET_URL`
- `VITE_GEMINI_API_KEY`
- `VITE_DRIVE_FOLDER_REMITOS`
- `VITE_DRIVE_FOLDER_FACTURAS`

Si usás el **environment** `github-pages` en el repo, replicá los mismos secrets ahí para que el job de build los reciba.

El build escribe `.env.production.local` y exporta las mismas variables en el paso `npm run build`, de modo que Vite las incruste en el bundle.

---

## Apps Script

Copiá el contenido de **`GOOGLE_APPS_SCRIPT.js`** en el proyecto de Apps Script vinculado a tu hoja, desplegá como **aplicación web** y usá esa URL en `VITE_SHEET_URL`.

El cliente envía POST con `Content-Type: text/plain` y cuerpo JSON (`{ type, data }`) para evitar preflight innecesario; el script debe seguir usando `JSON.parse(e.postData.contents)`.

**Operaciones soportadas por el script (POST `type`):** `login`, `trip`, `client`, `updateTrip`, `deleteTrip`, `cost`, `updateCost`, `deleteCost`, `uploadInvoice`, `uploadRemito`. Si actualizás el script desde este repo, volvé a **desplegar** la versión nueva de la Web App para que los costos se persistan en `DB_Costos`.

**Costos programados (recurrentes):** hoy se guardan solo en el **navegador** (`localStorage`). Los costos que generan automáticamente cada mes sí se intentan grabar en `DB_Costos` como filas normales cuando corresponde; la **definición** del programado no está en el Sheet hasta que exista una extensión dedicada.

---

## Estructura útil del repo

```
src/
  App.tsx                 # rutas por pestañas, carga inicial, login
  components/             # UI por módulos (viajes, clientes, costos, etc.)
  services/api.ts         # fetch al Web App (Sheets, login, uploads)
  services/geminiService.ts  # insights opcionales con Gemini
```

---

## Licencia y soporte

Proyecto privado / uso interno GDC. Para incidencias de despliegue o datos, revisá la consola del navegador y los logs de **Actions** en GitHub.
