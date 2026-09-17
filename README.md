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
| `VITE_SHEET_URL` | URL del Web App de Apps Script (GET: `clients`, `trips`, `costs`, `scheduledCostDefinitions`, `documents`, `reportEmails`) |
| `VITE_GEMINI_API_KEY` | Opcional; si falta, los insights del dashboard usan texto fijo local |
| `VITE_DRIVE_FOLDER_REMITOS` | ID de carpeta de Drive para remitos (subida vía script) |
| `VITE_DRIVE_FOLDER_FACTURAS` | ID de carpeta de Drive para facturas |
| `VITE_DRIVE_FOLDER_DOCUMENTOS` | Opcional; ID de carpeta Drive para Documentos (fallback: carpeta `Documentos`) |
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
- `VITE_DRIVE_FOLDER_DOCUMENTOS` (opcional; si falta, GAS crea/usa carpeta `Documentos` bajo el padre de la hoja)

Si usás el **environment** `github-pages` en el repo, replicá los mismos secrets ahí para que el job de build los reciba.

El build escribe `.env.production.local` y exporta las mismas variables en el paso `npm run build`, de modo que Vite las incruste en el bundle.

---

## Apps Script

Copiá el contenido de **`GOOGLE_APPS_SCRIPT.js`** en el proyecto de Apps Script vinculado a tu hoja, desplegá como **aplicación web** (nueva versión) y usá esa URL en `VITE_SHEET_URL`.

El cliente envía POST con `Content-Type: text/plain` y cuerpo JSON (`{ type, data }`) para evitar preflight innecesario; el script debe seguir usando `JSON.parse(e.postData.contents)`.

**Operaciones soportadas (POST `type`):** `login`, `trip`, `client`, `updateTrip`, `deleteTrip`, `cost`, `updateCost`, `deleteCost`, `saveScheduledCost`, `updateScheduledCost`, `deleteScheduledCost`, `document`, `updateDocument`, `deleteDocument` (soft `activo=FALSE`), `uploadDocument`, `uploadInvoice`, `uploadRemito`, `reportEmail`, `updateReportEmail`, `deleteReportEmail` (soft), `sendReportEmail` (PDF on-demand), `sendMonthlyReportHtml` (HTML cron/test), `health`. Tipos desconocidos responden `status: error`.

**Remitos / facturas / documentos (Drive):** el cliente reintenta subidas 2–3 veces ante HTTP 404, HTML, red o JSON inválido; comprime fotos de remito (máx. ~1600px, JPEG ~0.8) antes de enviar. Los errores del script se muestran en toast/alerta. Documentos usan `documentId` (no `tripId`).

**Health:** POST `{ type: "health", data: { remitosFolderId?, facturasFolderId?, documentosFolderId? } }` or GET `?health=1` — runs `ensureSchema()` once, then reports tabs (incl. `DB_Documentos`, `DB_ReportEmails`, `DB_ReportLog`), row counts, probe Drive (`DriveApp.getFolderById` only; no crea archivos). Health responses are **not** dump-cached.

**Documentos (Operativo):** hoja `DB_Documentos` + carpeta Drive; GET dump key `documents`. Admin CRUD + upload; rol operativo solo lectura. Tras merge de U2: **redeploy GAS + `?migrate=1` obligatorio** (crea hoja/headers).

**Reportes email (U3):** hojas `DB_ReportEmails` (lista autorizada + `autoMonthly`) y `DB_ReportLog` (idempotencia / auditoría). GET dump key `reportEmails` (log **no** va en el dump). On-demand = PDF vía `sendReportEmail` (browser). Cron día 5 = HTML vía `sendMonthlyReport` (MailApp). El trigger **no** se instala solo en GET/POST.

### HITL post-merge U3 — redeploy + migrate + trigger + test

1. **Redeploy** Apps Script Web App (**nueva versión**) — pegá el `GOOGLE_APPS_SCRIPT.js` del repo.
2. Hit once: `GET …/exec?migrate=1` (o health) → crea `DB_ReportEmails` + `DB_ReportLog` si faltan.
3. En el editor de Apps Script: **Project Settings → Time zone → `America/Montevideo`**.
4. Ejecutá **una vez** la función `installMonthlyReportTrigger()` desde el editor (dedupea triggers previos; día 5 a las 8:00 TZ del proyecto). Autorizá MailApp en el primer run.
5. Smoke on-demand: en la app (admin → Generar reporte) agregá **tu** email a autorizados, generá PDF del mes, multi-seleccioná y enviá.
6. Opcional HTML cron: desde el editor `sendMonthlyReport({ force: true })` **o** POST `{ type: "sendMonthlyReportHtml", data: { force: true } }` con un destinatario `autoMonthly=true`. Verificá fila en `DB_ReportLog`.
7. No actives el cron en prod hasta confirmar el smoke (si instalás el trigger después del día 5 del mes, el próximo disparo es el mes siguiente — o usá `force` una vez).

> **Nunca** se auto-instala el trigger desde `doGet`/`doPost` (evita emails sorpresa).
**Costos programados:** definiciones en `DB_CostosProgramados`; el GET las expone como `scheduledCostDefinitions`. Tras **Phase A** (latencia), el login admin hace **un solo GET** y reutiliza esas defs — no un segundo dump completo.

### Latencia (carga inicial)

| Señal | Valor |
|-------|--------|
| Target p50 / p95 GET dump | &lt;4s / &lt;8s (medido con smoke / DevTools) |
| Smoke warn / fail | `SMOKE_LATENCY_WARN_MS` default **8000** / `SMOKE_LATENCY_MS` default **15000** |
| Front GET timeout | **30s** + 1–2 reintentos cortos ante 404/HTML/red |
| Dump ScriptCache TTL | **45s** (`gdc_dump_v1` + epoch); writes invalidan el cache |
| Schema migration | **Off** hot GET — `ensureSchema()` vía `?migrate=1` o health |

**Phase B (Apps Script):** hot dump GET only reads existing sheets (missing sheet → `[]`). Optional `?include=clients,trips,costs,scheduledCostDefinitions,documents,reportEmails` (comma-separated; default = all six). Second GET within TTL should be faster (cache hit); first GET after a write is cold.

After deploy / if schema might be old (incl. **U2 Documentos** / **U3 Reportes**):

1. Redeploy Apps Script Web App (**new version**) — paste latest `GOOGLE_APPS_SCRIPT.js`.
2. Hit once: `GET …/exec?migrate=1` **or** `GET …/exec?health=1` / POST `{ type: "health" }` (creates `DB_Documentos` / `DB_ReportEmails` / `DB_ReportLog` if missing).
3. Smoke: `npm run maintenance:smoke` (optional second GET within 45s to observe cache).
4. UI: Operativo → Documentos — crear metadata + subir un PDF de prueba (admin).
5. U3: install trigger + test send (ver sección HITL arriba).

> Tras cambiar `GOOGLE_APPS_SCRIPT.js` en el repo, un humano debe **redeployar** la Web App (Manage deployments → New version). Hasta entonces producción sigue con el script viejo. **HITL obligatorio** tras merge si este PR tocó Apps Script. **U2 Documentos** y **U3 Reportes** requieren redeploy + migrate; U3 además requiere instalar el trigger manualmente.
---

## Estructura útil del repo

```
src/
  App.tsx                 # rutas por pestañas, carga inicial, login
  components/             # UI por módulos (viajes, clientes, costos, etc.)
  services/api.ts         # fetch al Web App (Sheets, login, uploads, health)
  services/geminiService.ts  # insights opcionales con Gemini
  utils/analytics.ts      # KPIs, márgenes, tasa combustible flota (política A)
tests/
  fixtures/sheet-schema.json  # headers + filas fake (sin PII real)
  *.test.ts
scripts/maintenance-smoke.mjs
GOOGLE_APPS_SCRIPT.js     # referencia para pegar en Apps Script
```

### Rentabilidad por viaje (combustible)

Combustible se carga de a ratos (no por viaje). **Política A (tasa flota global):**

`tasa = (Σ Combustible montoUSD × 0.7) / Σ km de todos los viajes`

Al filtrar un mes, `enrichTrips` sigue usando esa tasa all-time (`rateTrips` / `rateCosts`); no dividir combustible histórico por km del mes. El margen es **estimado** (ingreso generado − directos con `tripId` − `km × tasa`).

---

## Licencia y soporte

Proyecto privado / uso interno GDC. Para incidencias de despliegue o datos, revisá la consola del navegador y los logs de **Actions** en GitHub.
