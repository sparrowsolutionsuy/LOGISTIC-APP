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
| `VITE_SHEET_URL` | URL del Web App de Apps Script (GET: `clients`, `trips`, `costs`, `scheduledCostDefinitions`) |
| `VITE_GEMINI_API_KEY` | Opcional; si falta, los insights del dashboard usan texto fijo local |
| `VITE_DRIVE_FOLDER_REMITOS` | ID de carpeta de Drive para remitos (subida vía script) |
| `VITE_DRIVE_FOLDER_FACTURAS` | ID de carpeta de Drive para facturas |
| `VITE_ALLOW_MOCK` | **Ignored in production builds.** Local DEV/test mock is automatic when `VITE_SHEET_URL` is unset; a configured URL never falls back to mock data on failure. |

```bash
npm run dev
```

Abre la URL que muestra Vite (por defecto `http://localhost:5173/LOGISTIC-APP/` si usás el mismo `base` que en producción).

Otros comandos:

```bash
npx tsc --noEmit          # comprobar tipos
npm test                  # Vitest (normalizers + contrato de schema)
npm run test:watch        # Vitest en watch
npm run build             # build de producción → dist/
npm run preview           # servir dist
npm run maintenance:smoke # smoke vivo contra VITE_SHEET_URL (no imprime la URL completa)
```

Checklist operativa humana (redeploy GAS, UI, Drive): ver el procedure del harness  
`sparrow-harness/procedures/logistic-app-maintenance.md` (sibling repo).

---

## Despliegue en GitHub Pages

El workflow **Deploy to GitHub Pages** (`.github/workflows/deploy.yml`) se ejecuta en cada **push a `main`** y también manualmente (**Actions → Deploy to GitHub Pages → Run workflow**).

Los **pull requests** corren **PR Checks** (`.github/workflows/pr-checks.yml`): `tsc` + `npm test` + `build` (sin secrets reales).

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

Copiá el contenido de **`GOOGLE_APPS_SCRIPT.js`** en el proyecto de Apps Script vinculado a tu hoja, desplegá como **aplicación web** (nueva versión) y usá esa URL en `VITE_SHEET_URL`.

El cliente envía POST con `Content-Type: text/plain` y cuerpo JSON (`{ type, data }`) para evitar preflight innecesario; el script debe seguir usando `JSON.parse(e.postData.contents)`.

**Operaciones soportadas (POST `type`):** `login`, `trip`, `client`, `updateTrip`, `deleteTrip`, `cost`, `updateCost`, `deleteCost`, `saveScheduledCost`, `updateScheduledCost`, `deleteScheduledCost`, `uploadInvoice`, `uploadRemito`, `sendReportEmail`, `health`. Tipos desconocidos responden `status: error`.

**Remitos / facturas (Drive):** el cliente reintenta subidas 2–3 veces ante HTTP 404, HTML, red o JSON inválido; comprime fotos de remito (máx. ~1600px, JPEG ~0.8) antes de enviar. Los errores del script se muestran en toast/alerta.

**Health:** POST `{ type: "health", data: { remitosFolderId?, facturasFolderId? } }` o GET `?health=1` — tabs, row counts, probe Drive (`DriveApp.getFolderById` only; no crea archivos).

**Costos programados:** definiciones en `DB_CostosProgramados`; el GET las expone como `scheduledCostDefinitions`.

> Tras cambiar `GOOGLE_APPS_SCRIPT.js` en el repo, un humano debe **redeployar** la Web App (Manage deployments → New version). Hasta entonces producción sigue con el script viejo. **HITL obligatorio** tras merge si este PR tocó Apps Script.

---

## Estructura útil del repo

```
src/
  App.tsx                 # rutas por pestañas, carga inicial, login
  components/             # UI por módulos (viajes, clientes, costos, etc.)
  services/api.ts         # fetch al Web App (Sheets, login, uploads, health)
  services/geminiService.ts  # insights opcionales con Gemini
tests/
  fixtures/sheet-schema.json  # headers + filas fake (sin PII real)
  *.test.ts
scripts/maintenance-smoke.mjs
GOOGLE_APPS_SCRIPT.js     # referencia para pegar en Apps Script
```

---

## Licencia y soporte

Proyecto privado / uso interno GDC. Para incidencias de despliegue o datos, revisá la consola del navegador y los logs de **Actions** en GitHub.
