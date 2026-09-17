// -------------------------------------------------------------------------
// INSTRUCTIONS:
// 1. Paste this into Extensions > Apps Script in your Google Sheet.
// 2. Uploads: la app envía folderId (VITE_DRIVE_FOLDER_*); si falla, se usa carpeta por nombre.
// 3. DEPLOY as Web App -> Execute as: Me -> Access: Anyone (Cualquier persona).
// 4. URL del Web App en VITE_SHEET_URL (.env.local / GitHub Secrets).
// 5. After deploy / schema upgrades: hit GET ?migrate=1 once (or POST/GET health).
// 6. U3 Reportes: set TZ America/Montevideo; run installMonthlyReportTrigger() once (NOT from doGet).
// Pure dump helpers mirrored in src/gas/dumpHelpers.ts — keep in sync.
// -------------------------------------------------------------------------

/** Phase B: dump cache TTL (seconds). Writes bump epoch to invalidate. */
var DUMP_CACHE_TTL_SEC = 45;
var DUMP_CACHE_PREFIX = 'gdc_dump_v1';
var DUMP_CACHE_EPOCH_KEY = 'gdc_dump_epoch';
var DUMP_KEYS = ['clients', 'trips', 'costs', 'scheduledCostDefinitions', 'documents', 'reportEmails'];
var DUMP_SHEET_BY_KEY = {
  clients: 'DB_Clientes',
  trips: 'DB_Viajes',
  costs: 'DB_Costos',
  scheduledCostDefinitions: 'DB_CostosProgramados',
  documents: 'DB_Documentos',
  reportEmails: 'DB_ReportEmails',
};
var MAX_REPORT_EMAILS = 20;

/** Parse ?include= (comma-separated). Empty/missing → all dump keys. */
function parseIncludeParam(raw) {
  if (raw == null || String(raw).trim() === '') {
    return DUMP_KEYS.slice();
  }
  var allowed = {};
  for (var i = 0; i < DUMP_KEYS.length; i++) {
    allowed[DUMP_KEYS[i]] = true;
  }
  var parts = String(raw)
    .split(',')
    .map(function (s) {
      return s.trim();
    })
    .filter(function (s) {
      return s.length > 0 && allowed[s];
    });
  return parts.length > 0 ? parts : DUMP_KEYS.slice();
}

function getDumpCacheEpoch() {
  var cache = CacheService.getScriptCache();
  var epoch = cache.get(DUMP_CACHE_EPOCH_KEY);
  return epoch || '0';
}

function buildDumpCacheKey(epoch, includeKeys) {
  var sorted = includeKeys.slice().sort();
  return DUMP_CACHE_PREFIX + ':' + (epoch || '0') + ':' + sorted.join(',');
}

/** Invalidate all dump cache entries by bumping epoch (old keys expire naturally). */
function invalidateDumpCache() {
  var cache = CacheService.getScriptCache();
  cache.put(DUMP_CACHE_EPOCH_KEY, String(Date.now()), 21600);
}

function getFolderByName(ss, folderName) {
  var parents = DriveApp.getFileById(ss.getId()).getParents();
  if (!parents.hasNext()) {
    throw new Error(
      'La hoja no tiene carpeta padre en Drive; configurá VITE_DRIVE_FOLDER_* o mové la hoja a una carpeta.'
    );
  }
  var parentFolder = parents.next();
  var folders = parentFolder.getFoldersByName(folderName);
  return folders.hasNext() ? folders.next() : parentFolder.createFolder(folderName);
}

/** Strip optional `data:*;base64,` prefix from client payloads. */
function stripBase64Prefix(fileData) {
  var s = String(fileData || '');
  var marker = 'base64,';
  var idx = s.indexOf(marker);
  if (s.indexOf('data:') === 0 && idx !== -1) {
    return s.substring(idx + marker.length);
  }
  return s;
}

/** Envía un reporte PDF (base64) por email con adjunto. Optionally logs to DB_ReportLog. */
function sendReportEmail(data) {
  if (!data || !data.to || !data.fileData) {
    return createErrorResponse('Faltan datos para enviar el email (destinatario o archivo).');
  }
  var recipientsList = String(data.to)
    .split(/[;,]/)
    .map(function (s) {
      return s.trim().toLowerCase();
    })
    .filter(function (s) {
      return s.length > 0;
    });
  var recipients = recipientsList.join(',');
  if (!recipients) {
    return createErrorResponse('Destinatario inválido.');
  }
  var decoded = Utilities.base64Decode(data.fileData);
  var fileName = data.fileName || 'Reporte_GDC.pdf';
  var blob = Utilities.newBlob(decoded, data.mimeType || 'application/pdf', fileName);
  var subject = data.subject || 'Reporte GDC';
  var message = data.message || 'Adjuntamos el reporte solicitado.';
  try {
    MailApp.sendEmail({
      to: recipients,
      subject: subject,
      body: message,
      htmlBody: message.replace(/\n/g, '<br>'),
      attachments: [blob],
      name: 'GDC Reportes',
    });
    appendReportLog({
      monthKey: data.monthKey || '',
      channel: 'ondemand',
      recipients: recipients,
      status: 'ok',
      detail: 'PDF on-demand',
    });
    return ContentService.createTextOutput(JSON.stringify({ status: 'success' })).setMimeType(
      ContentService.MimeType.JSON
    );
  } catch (err) {
    appendReportLog({
      monthKey: data.monthKey || '',
      channel: 'ondemand',
      recipients: recipients,
      status: 'error',
      detail: String(err).slice(0, 200),
    });
    return createErrorResponse('Error al enviar email: ' + String(err));
  }
}

/** Resolve tripIds[] and/or singular tripId into a de-duplicated list. */
function resolveInvoiceTripIds(data) {
  var ids = [];
  var seen = {};
  function pushId(raw) {
    var id = String(raw == null ? '' : raw).trim();
    if (!id || seen[id]) return;
    seen[id] = true;
    ids.push(id);
  }
  if (data && data.tripIds && data.tripIds.length) {
    for (var i = 0; i < data.tripIds.length; i++) {
      pushId(data.tripIds[i]);
    }
  }
  if (data && data.tripId != null && String(data.tripId).trim() !== '') {
    pushId(data.tripId);
  }
  return ids;
}

/** Stamp facturaUrl + facturaGenerada + estado Cerrado on a DB_Viajes row. */
function stampInvoiceOnTripRow(sheet, rowNum, headers, fileUrl) {
  var statusIndex = headers.indexOf('estado');
  var urlIndex = headers.indexOf('facturaUrl');
  var genIndex = headers.indexOf('facturaGenerada');
  if (statusIndex > -1) {
    sheet.getRange(rowNum, statusIndex + 1).setValue('Cerrado');
  }
  if (urlIndex > -1) {
    sheet.getRange(rowNum, urlIndex + 1).setValue(fileUrl);
  }
  if (genIndex > -1) {
    sheet.getRange(rowNum, genIndex + 1).setValue(true);
  }
}

/**
 * Upload one invoice PDF to Drive Facturas and stamp the same URL on N trips.
 * Accepts tripIds: string[] and/or tripId (compat = one-element list).
 * Returns { status, url, updatedIds, missingIds }.
 */
function uploadInvoiceFile(data) {
  try {
    if (!data || !data.fileData) {
      return createErrorResponse('Faltan datos del archivo (fileData).');
    }
    var tripIds = resolveInvoiceTripIds(data);
    if (!tripIds.length) {
      return createErrorResponse('Falta tripId o tripIds.');
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const contentType = data.mimeType || 'application/pdf';
    var rawBase64 = stripBase64Prefix(data.fileData);
    var decoded;
    try {
      decoded = Utilities.base64Decode(rawBase64);
    } catch (decodeErr) {
      return createErrorResponse('No se pudo decodificar el archivo (base64 inválido).');
    }
    const blob = Utilities.newBlob(decoded, contentType, data.fileName || 'upload.bin');

    var folder;
    if (data.folderId && data.folderId !== '') {
      try {
        folder = DriveApp.getFolderById(data.folderId);
      } catch (e) {
        try {
          folder = getFolderByName(ss, 'Facturas');
        } catch (fallbackErr) {
          return createErrorResponse(
            'No se pudo abrir la carpeta Drive (folderId inválido) ni crear "Facturas": ' +
              String(fallbackErr)
          );
        }
      }
    } else {
      try {
        folder = getFolderByName(ss, 'Facturas');
      } catch (fallbackErr) {
        return createErrorResponse(
          'Sin folderId y no se pudo resolver carpeta "Facturas": ' +
            String(fallbackErr) +
            '. Configurá VITE_DRIVE_FOLDER_*.'
        );
      }
    }

    var file;
    try {
      file = folder.createFile(blob);
    } catch (createErr) {
      return createErrorResponse('No se pudo crear el archivo en Drive: ' + String(createErr));
    }

    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareErr) {
      // Sharing policy may block ANYONE_WITH_LINK; file URL is still returned for owners/editors.
    }
    const fileUrl = file.getUrl();

    var updatedIds = [];
    var missingIds = [];
    var wanted = {};
    for (var w = 0; w < tripIds.length; w++) {
      wanted[tripIds[w]] = true;
    }

    const sheet = ss.getSheetByName('DB_Viajes');
    if (sheet) {
      const values = sheet.getDataRange().getValues();
      const headers = values[0];
      const idIdx = headers.indexOf('id');
      if (idIdx >= 0) {
        for (var i = 1; i < values.length; i++) {
          var rowId = String(values[i][idIdx]);
          if (wanted[rowId]) {
            stampInvoiceOnTripRow(sheet, i + 1, headers, fileUrl);
            updatedIds.push(rowId);
            delete wanted[rowId];
          }
        }
      }
    }
    for (var m = 0; m < tripIds.length; m++) {
      if (wanted[tripIds[m]]) {
        missingIds.push(tripIds[m]);
      }
    }

    if (!updatedIds.length) {
      return createErrorResponse(
        'Ningún viaje encontrado para estampar factura: ' + tripIds.join(', ')
      );
    }

    invalidateDumpCache();
    return ContentService.createTextOutput(
      JSON.stringify({
        status: 'success',
        url: fileUrl,
        updatedIds: updatedIds,
        missingIds: missingIds,
      })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return createErrorResponse('Error al subir factura: ' + String(err));
  }
}

function uploadFile(data, folderNameFallback, updateSheetFn, sheetName) {
  try {
    if (!data || !data.fileData) {
      return createErrorResponse('Faltan datos del archivo (fileData).');
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const contentType = data.mimeType || 'application/pdf';
    var rawBase64 = stripBase64Prefix(data.fileData);
    var decoded;
    try {
      decoded = Utilities.base64Decode(rawBase64);
    } catch (decodeErr) {
      return createErrorResponse('No se pudo decodificar el archivo (base64 inválido).');
    }
    const blob = Utilities.newBlob(decoded, contentType, data.fileName || 'upload.bin');

    var folder;
    if (data.folderId && data.folderId !== '') {
      try {
        folder = DriveApp.getFolderById(data.folderId);
      } catch (e) {
        try {
          folder = getFolderByName(ss, folderNameFallback);
        } catch (fallbackErr) {
          return createErrorResponse(
            'No se pudo abrir la carpeta Drive (folderId inválido) ni crear "' +
              folderNameFallback +
              '": ' +
              String(fallbackErr)
          );
        }
      }
    } else {
      try {
        folder = getFolderByName(ss, folderNameFallback);
      } catch (fallbackErr) {
        return createErrorResponse(
          'Sin folderId y no se pudo resolver carpeta "' +
            folderNameFallback +
            '": ' +
            String(fallbackErr) +
            '. Configurá VITE_DRIVE_FOLDER_*.'
        );
      }
    }

    var file;
    try {
      file = folder.createFile(blob);
    } catch (createErr) {
      return createErrorResponse('No se pudo crear el archivo en Drive: ' + String(createErr));
    }

    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareErr) {
      // Sharing policy may block ANYONE_WITH_LINK; file URL is still returned for owners/editors.
    }
    const fileUrl = file.getUrl();

    const sheet = ss.getSheetByName(sheetName);
    if (sheet) {
      const values = sheet.getDataRange().getValues();
      const headers = values[0];
      const idIdx = headers.indexOf('id');
      if (idIdx >= 0) {
        for (var i = 1; i < values.length; i++) {
          if (String(values[i][idIdx]) === String(data.tripId)) {
            updateSheetFn(sheet, i + 1, headers, fileUrl);
            break;
          }
        }
      }
    }

    invalidateDumpCache();
    return ContentService.createTextOutput(JSON.stringify({ status: 'success', url: fileUrl }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return createErrorResponse('Error al subir archivo: ' + String(err));
  }
}

/**
 * Health probe: sheet tab presence/row counts + optional Drive folder ACL check.
 * Never creates files; never returns PII/passwords.
 */
function probeDriveFolder(folderId) {
  if (!folderId || String(folderId).trim() === '') {
    return { ok: false, error: 'missing folderId' };
  }
  try {
    DriveApp.getFolderById(String(folderId).trim());
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

function buildHealthPayload(folderIds) {
  var started = Date.now();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var names = [
    'DB_Viajes',
    'DB_Clientes',
    'DB_Costos',
    'DB_CostosProgramados',
    'DB_Documentos',
    'DB_ReportEmails',
    'DB_ReportLog',
    'DB_Usuarios',
  ];
  var sheets = {};
  for (var i = 0; i < names.length; i++) {
    var name = names[i];
    var sh = ss.getSheetByName(name);
    if (!sh) {
      sheets[name] = { exists: false, rows: 0 };
    } else {
      sheets[name] = { exists: true, rows: Math.max(0, sh.getLastRow() - 1) };
    }
  }
  var drive = {};
  var ids = folderIds && typeof folderIds === 'object' ? folderIds : {};
  var remitosId =
    ids.remitosFolderId ||
    (ids.folderIds && ids.folderIds.remitos) ||
    ids.remitos ||
    '';
  var facturasId =
    ids.facturasFolderId ||
    (ids.folderIds && ids.folderIds.facturas) ||
    ids.facturas ||
    '';
  var documentosId =
    ids.documentosFolderId ||
    (ids.folderIds && ids.folderIds.documentos) ||
    ids.documentos ||
    '';
  if (remitosId) {
    drive.remitos = probeDriveFolder(remitosId);
  }
  if (facturasId) {
    drive.facturas = probeDriveFolder(facturasId);
  }
  if (documentosId) {
    drive.documentos = probeDriveFolder(documentosId);
  }
  return {
    status: 'success',
    sheets: sheets,
    drive: drive,
    latencyMs: Date.now() - started,
  };
}

/**
 * Create missing sheets / headers / seed users. Not on hot dump GET.
 * Call via ?migrate=1, health, or write paths that already ensure headers.
 */
function ensureSchema() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var userSheet = ss.getSheetByName('DB_Usuarios');
  if (!userSheet) {
    userSheet = ss.insertSheet('DB_Usuarios');
    userSheet.appendRow(['usuario', 'password', 'nombre', 'rol']);
    userSheet.appendRow(['admin', 'admin123', 'Administrador General', 'admin']);
    userSheet.appendRow(['operativo', 'op123', 'Chofer Operativo', 'operativo']);
  }

  var clientSheet = ss.getSheetByName('DB_Clientes');
  if (!clientSheet) {
    clientSheet = ss.insertSheet('DB_Clientes');
    clientSheet.appendRow([
      'id',
      'nombreComercial',
      'departamento',
      'localidad',
      'latitud',
      'longitud',
      'rut',
      'email',
      'telefono',
      'tieneFacturacionDiferente',
      'facturacion',
    ]);
  } else {
    var clientLastCol = Math.max(1, clientSheet.getLastColumn());
    var headers = clientSheet.getRange(1, 1, 1, clientLastCol).getValues()[0];
    var clientCols = ['rut', 'email', 'telefono', 'tieneFacturacionDiferente', 'facturacion'];
    for (var ci = 0; ci < clientCols.length; ci++) {
      if (headers.indexOf(clientCols[ci]) === -1) {
        clientSheet.getRange(1, clientSheet.getLastColumn() + 1).setValue(clientCols[ci]);
        headers.push(clientCols[ci]);
      }
    }
  }

  var tripSheet = ss.getSheetByName('DB_Viajes');
  if (!tripSheet) {
    tripSheet = ss.insertSheet('DB_Viajes');
    tripSheet.appendRow([
      'id',
      'fecha',
      'clientId',
      'estado',
      'contenido',
      'pesoKg',
      'kmRecorridos',
      'tarifa',
      'origen',
      'destino',
      'facturaUrl',
      'remitoUrl',
      'moneda',
      'tipoCambio',
      'tarifaUYU',
      'asignadoA',
      'facturaGenerada',
      'facturaSolicitada',
      'facturaFechaSolicitud',
      'facturaCobrada',
      'facturaFechaCobro',
      'scheduledCostId',
    ]);
  } else {
    ensureTripSheetHeaders(tripSheet);
  }

  var costSheet = ss.getSheetByName('DB_Costos');
  if (!costSheet) {
    costSheet = ss.insertSheet('DB_Costos');
    costSheet.appendRow([
      'id',
      'fecha',
      'tripId',
      'categoria',
      'descripcion',
      'monto',
      'moneda',
      'tipoCambio',
      'montoUSD',
      'comprobante',
      'registradoPor',
      'isScheduled',
      'scheduleId',
    ]);
  }
  ensureCostSheetHeaders(costSheet);

  var scheduledSheet = ss.getSheetByName('DB_CostosProgramados');
  if (!scheduledSheet) {
    scheduledSheet = ss.insertSheet('DB_CostosProgramados');
    scheduledSheet.appendRow([
      'id',
      'categoria',
      'descripcion',
      'monto',
      'currency',
      'dayOfMonth',
      'active',
      'creadoPor',
      'creadoEn',
      'tripId',
    ]);
  }
  ensureScheduledDefinitionSheetHeaders(scheduledSheet);

  var docSheet = ss.getSheetByName('DB_Documentos');
  if (!docSheet) {
    docSheet = ss.insertSheet('DB_Documentos');
    docSheet.appendRow([
      'id',
      'titulo',
      'categoria',
      'entidadRef',
      'emitidoEn',
      'venceEn',
      'archivoUrl',
      'notas',
      'activo',
      'creadoPor',
      'creadoEn',
      'actualizadoEn',
    ]);
  }
  ensureDocumentSheetHeaders(docSheet);

  var reportEmailSheet = ss.getSheetByName('DB_ReportEmails');
  if (!reportEmailSheet) {
    reportEmailSheet = ss.insertSheet('DB_ReportEmails');
    reportEmailSheet.appendRow([
      'email',
      'autoMonthly',
      'activo',
      'updatedAt',
      'createdAt',
      'createdBy',
    ]);
  }
  ensureReportEmailSheetHeaders(reportEmailSheet);

  var reportLogSheet = ss.getSheetByName('DB_ReportLog');
  if (!reportLogSheet) {
    reportLogSheet = ss.insertSheet('DB_ReportLog');
    reportLogSheet.appendRow([
      'monthKey',
      'channel',
      'recipients',
      'sentAt',
      'status',
      'detail',
      'messageId',
    ]);
  }
  ensureReportLogSheetHeaders(reportLogSheet);
}

/** Build dump object for selected include keys (read-only; missing sheet → []). */
function buildDumpPayload(includeKeys) {
  var payload = {};
  for (var i = 0; i < includeKeys.length; i++) {
    var key = includeKeys[i];
    var sheetName = DUMP_SHEET_BY_KEY[key];
    payload[key] = sheetName ? getSheetData(sheetName) : [];
  }
  // Keep stable shape for clients that expect all keys when default include is used.
  if (includeKeys.length === DUMP_KEYS.length) {
    return {
      clients: payload.clients || [],
      trips: payload.trips || [],
      costs: payload.costs || [],
      scheduledCostDefinitions: payload.scheduledCostDefinitions || [],
      documents: payload.documents || [],
      reportEmails: payload.reportEmails || [],
    };
  }
  return payload;
}

function doGet(e) {
  var params = e && e.parameter ? e.parameter : {};

  if (String(params.health || '') === '1') {
    ensureSchema();
    var getFolderIds = {};
    if (params.remitosFolderId) getFolderIds.remitosFolderId = params.remitosFolderId;
    if (params.facturasFolderId) getFolderIds.facturasFolderId = params.facturasFolderId;
    if (params.documentosFolderId) getFolderIds.documentosFolderId = params.documentosFolderId;
    // Health is never stored as dump cache.
    return ContentService.createTextOutput(JSON.stringify(buildHealthPayload(getFolderIds))).setMimeType(
      ContentService.MimeType.JSON
    );
  }

  if (String(params.migrate || '') === '1') {
    ensureSchema();
  }

  var includeKeys = parseIncludeParam(params.include);
  var cache = CacheService.getScriptCache();
  var cacheKey = buildDumpCacheKey(getDumpCacheEpoch(), includeKeys);
  var cached = cache.get(cacheKey);
  if (cached) {
    return ContentService.createTextOutput(cached).setMimeType(ContentService.MimeType.JSON);
  }

  var payload = buildDumpPayload(includeKeys);
  var json = JSON.stringify(payload);
  // Never cache errors (this path only builds successful dumps).
  cache.put(cacheKey, json, DUMP_CACHE_TTL_SEC);
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const body = JSON.parse(e.postData.contents);
  
  const type = body.type;
  const data = body.data;

  if (type === 'health') {
    ensureSchema();
    return ContentService.createTextOutput(JSON.stringify(buildHealthPayload(data || {}))).setMimeType(
      ContentService.MimeType.JSON
    );
  }

  const lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    if (type === 'login') {
      const userSheet = ss.getSheetByName('DB_Usuarios');
      if (!userSheet) return createErrorResponse('Users DB missing');

      const userData = userSheet.getDataRange().getValues();
      const headers = userData[0];
      const rows = userData.slice(1);

      const userIdx = headers.indexOf('usuario');
      const passIdx = headers.indexOf('password');
      
      const foundUser = rows.find(r => String(r[userIdx]) === data.username && String(r[passIdx]) === data.password);

      if (foundUser) {
        return ContentService.createTextOutput(JSON.stringify({ 
          status: 'success', 
          user: {
            username: foundUser[0],
            nombre: foundUser[2],
            role: foundUser[3]
          } 
        })).setMimeType(ContentService.MimeType.JSON);
      } else {
        return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Invalid credentials' }))
          .setMimeType(ContentService.MimeType.JSON);
      }

    } else if (type === 'trip') {
      const sheet = ss.getSheetByName('DB_Viajes');
      ensureTripSheetHeaders(sheet);
      const tripHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      sheet.appendRow(tripRowFromPayload(data, tripHeaders));
    } else if (type === 'client') {
      const sheet = ss.getSheetByName('DB_Clientes');
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      sheet.appendRow(buildRow(headers, data));
    } else if (type === 'updateTrip') {
      const sheet = ss.getSheetByName('DB_Viajes');
      ensureTripSheetHeaders(sheet);
      let values = sheet.getDataRange().getValues();
      let headers = values[0];
      const idCol = headers.indexOf('id');
      
      for (let i = 1; i < values.length; i++) {
        if (String(values[i][idCol]) === String(data.id)) {
          const rowNum = i + 1;
          const prev = values[i];
          var prevFactura =
            headers.indexOf('facturaUrl') > -1 ? prev[headers.indexOf('facturaUrl')] : '';
          var prevRemito =
            headers.indexOf('remitoUrl') > -1 ? prev[headers.indexOf('remitoUrl')] : '';
          const merged = {
            id: data.id,
            fecha: data.fecha,
            clientId: data.clientId,
            estado: data.estado,
            contenido: data.contenido,
            pesoKg: data.pesoKg,
            kmRecorridos: data.kmRecorridos,
            tarifa: data.tarifa,
            origen: data.origen,
            destino: data.destino,
            facturaUrl: data.facturaUrl !== undefined ? data.facturaUrl || '' : prevFactura,
            remitoUrl: data.remitoUrl !== undefined ? data.remitoUrl || '' : prevRemito,
            asignadoA: data.asignadoA || '',
            moneda: data.moneda || 'USD',
            tipoCambio: data.tipoCambio || 1,
            tarifaUYU: data.tarifaUYU || '',
            facturaGenerada:
              data.facturaGenerada !== undefined
                ? data.facturaGenerada
                : headers.indexOf('facturaGenerada') > -1
                  ? prev[headers.indexOf('facturaGenerada')]
                  : false,
            facturaSolicitada:
              data.facturaSolicitada !== undefined
                ? data.facturaSolicitada
                : headers.indexOf('facturaSolicitada') > -1
                  ? prev[headers.indexOf('facturaSolicitada')]
                  : false,
            facturaFechaSolicitud:
              data.facturaFechaSolicitud ||
              (headers.indexOf('facturaFechaSolicitud') > -1
                ? prev[headers.indexOf('facturaFechaSolicitud')]
                : '') ||
              '',
            facturaCobrada:
              data.facturaCobrada !== undefined
                ? data.facturaCobrada
                : headers.indexOf('facturaCobrada') > -1
                  ? prev[headers.indexOf('facturaCobrada')]
                  : false,
            facturaFechaCobro:
              data.facturaFechaCobro ||
              (headers.indexOf('facturaFechaCobro') > -1
                ? prev[headers.indexOf('facturaFechaCobro')]
                : '') ||
              '',
          };
          const newRow = tripRowFromPayload(merged, headers);
          sheet.getRange(rowNum, 1, 1, newRow.length).setValues([newRow]);
          break;
        }
      }
    } else if (type === 'deleteTrip') {
      const sheet = ss.getSheetByName('DB_Viajes');
      const dataRange = sheet.getDataRange();
      const values = dataRange.getValues();
      
      for (let i = 1; i < values.length; i++) {
        if (String(values[i][0]) === String(data.id)) { 
          sheet.deleteRow(i + 1);
          break;
        }
      }
    } else if (type === 'cost') {
      let sheet = ss.getSheetByName('DB_Costos');
      if (!sheet) {
        sheet = ss.insertSheet('DB_Costos');
        sheet.appendRow([
          'id',
          'fecha',
          'tripId',
          'categoria',
          'descripcion',
          'monto',
          'moneda',
          'tipoCambio',
          'montoUSD',
          'comprobante',
          'registradoPor',
          'isScheduled',
          'scheduleId',
        ]);
      }
      ensureCostSheetHeaders(sheet);
      var costHdrNew = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      sheet.appendRow(costRowValuesFromPayload(data, costHdrNew));
    } else if (type === 'updateCost') {
      const sheet = ss.getSheetByName('DB_Costos');
      if (!sheet) {
        return createErrorResponse('DB_Costos no existe');
      }
      ensureCostSheetHeaders(sheet);
      const values = sheet.getDataRange().getValues();
      const headers = values[0];
      const idCol = headers.indexOf('id');
      if (idCol === -1) {
        return createErrorResponse('DB_Costos sin columna id');
      }
      var found = false;
      for (var r = 1; r < values.length; r++) {
        if (String(values[r][idCol]) === String(data.id)) {
          var row = costRowValuesFromPayload(data, headers);
          for (var c = 0; c < row.length; c++) {
            sheet.getRange(r + 1, c + 1).setValue(row[c]);
          }
          found = true;
          break;
        }
      }
      if (!found) {
        return createErrorResponse('Costo no encontrado: ' + data.id);
      }
    } else if (type === 'deleteCost') {
      const sheet = ss.getSheetByName('DB_Costos');
      if (!sheet) {
        return createErrorResponse('DB_Costos no existe');
      }
      const values = sheet.getDataRange().getValues();
      const headers = values[0];
      const idCol = headers.indexOf('id');
      if (idCol === -1) {
        return createErrorResponse('DB_Costos sin columna id');
      }
      var deleted = false;
      for (var d = 1; d < values.length; d++) {
        if (String(values[d][idCol]) === String(data.id)) {
          sheet.deleteRow(d + 1);
          deleted = true;
          break;
        }
      }
      if (!deleted) {
        return createErrorResponse('Costo no encontrado: ' + data.id);
      }
    } else if (type === 'saveScheduledCost') {
      let defS = ss.getSheetByName('DB_CostosProgramados');
      if (!defS) {
        defS = ss.insertSheet('DB_CostosProgramados');
        defS.appendRow([
          'id',
          'categoria',
          'descripcion',
          'monto',
          'currency',
          'dayOfMonth',
          'active',
          'creadoPor',
          'creadoEn',
          'tripId',
        ]);
      }
      ensureScheduledDefinitionSheetHeaders(defS);
      var defHdr = defS.getRange(1, 1, 1, defS.getLastColumn()).getValues()[0];
      defS.appendRow(definitionRowValues(data, defHdr));
    } else if (type === 'updateScheduledCost') {
      var defSheetU = ss.getSheetByName('DB_CostosProgramados');
      if (!defSheetU) {
        return createErrorResponse('DB_CostosProgramados no existe');
      }
      ensureScheduledDefinitionSheetHeaders(defSheetU);
      var defVals = defSheetU.getDataRange().getValues();
      var defHeadersU = defVals[0];
      var defIdCol = defHeadersU.indexOf('id');
      if (defIdCol === -1) {
        return createErrorResponse('DB_CostosProgramados sin columna id');
      }
      var defFound = false;
      for (var du = 1; du < defVals.length; du++) {
        if (String(defVals[du][defIdCol]) === String(data.id)) {
          var defNewRow = definitionRowValues(data, defHeadersU);
          for (var duc = 0; duc < defNewRow.length; duc++) {
            defSheetU.getRange(du + 1, duc + 1).setValue(defNewRow[duc]);
          }
          defFound = true;
          break;
        }
      }
      if (!defFound) {
        return createErrorResponse('Definición no encontrada: ' + data.id);
      }
    } else if (type === 'deleteScheduledCost') {
      var defSheetD = ss.getSheetByName('DB_CostosProgramados');
      if (!defSheetD) {
        return createErrorResponse('DB_CostosProgramados no existe');
      }
      var defValsD = defSheetD.getDataRange().getValues();
      var defIdColD = defValsD[0].indexOf('id');
      if (defIdColD === -1) {
        return createErrorResponse('DB_CostosProgramados sin columna id');
      }
      var defDel = false;
      for (var dd = 1; dd < defValsD.length; dd++) {
        if (String(defValsD[dd][defIdColD]) === String(data.id)) {
          defSheetD.deleteRow(dd + 1);
          defDel = true;
          break;
        }
      }
      if (!defDel) {
        return createErrorResponse('Definición no encontrada: ' + data.id);
      }
    } else if (type === 'uploadInvoice') {
      return uploadInvoiceFile(data);

    } else if (type === 'sendReportEmail') {
      return sendReportEmail(data);

    } else if (type === 'sendMonthlyReportHtml') {
      return sendMonthlyReport(data || {});

    } else if (type === 'uploadRemito') {
      if (!data.mimeType) {
        data.mimeType = 'image/jpeg';
      }
      return uploadFile(data, 'Remitos', function (sheet, rowNum, headers, fileUrl) {
        var h = headers;
        var remitoUrlIdx = h.indexOf('remitoUrl');
        if (remitoUrlIdx === -1) {
          sheet.getRange(1, h.length + 1).setValue('remitoUrl');
          var newHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
          remitoUrlIdx = newHeaders.indexOf('remitoUrl');
        }
        sheet.getRange(rowNum, remitoUrlIdx + 1).setValue(fileUrl);
      }, 'DB_Viajes');
    } else if (type === 'document') {
      var docSheetNew = ss.getSheetByName('DB_Documentos');
      if (!docSheetNew) {
        docSheetNew = ss.insertSheet('DB_Documentos');
        docSheetNew.appendRow([
          'id',
          'titulo',
          'categoria',
          'entidadRef',
          'emitidoEn',
          'venceEn',
          'archivoUrl',
          'notas',
          'activo',
          'creadoPor',
          'creadoEn',
          'actualizadoEn',
        ]);
      }
      ensureDocumentSheetHeaders(docSheetNew);
      var docHdrNew = docSheetNew.getRange(1, 1, 1, docSheetNew.getLastColumn()).getValues()[0];
      docSheetNew.appendRow(documentRowValues(data, docHdrNew));
    } else if (type === 'updateDocument') {
      var docSheetU = ss.getSheetByName('DB_Documentos');
      if (!docSheetU) {
        return createErrorResponse('DB_Documentos no existe');
      }
      ensureDocumentSheetHeaders(docSheetU);
      var docValsU = docSheetU.getDataRange().getValues();
      var docHeadersU = docValsU[0];
      var docIdColU = docHeadersU.indexOf('id');
      if (docIdColU === -1) {
        return createErrorResponse('DB_Documentos sin columna id');
      }
      var docFoundU = false;
      for (var duDoc = 1; duDoc < docValsU.length; duDoc++) {
        if (String(docValsU[duDoc][docIdColU]) === String(data.id)) {
          var docNewRow = documentRowValues(data, docHeadersU);
          for (var ducDoc = 0; ducDoc < docNewRow.length; ducDoc++) {
            docSheetU.getRange(duDoc + 1, ducDoc + 1).setValue(docNewRow[ducDoc]);
          }
          docFoundU = true;
          break;
        }
      }
      if (!docFoundU) {
        return createErrorResponse('Documento no encontrado: ' + data.id);
      }
    } else if (type === 'deleteDocument') {
      var docSheetD = ss.getSheetByName('DB_Documentos');
      if (!docSheetD) {
        return createErrorResponse('DB_Documentos no existe');
      }
      ensureDocumentSheetHeaders(docSheetD);
      var docValsD = docSheetD.getDataRange().getValues();
      var docHeadersD = docValsD[0];
      var docIdColD = docHeadersD.indexOf('id');
      var docActivoCol = docHeadersD.indexOf('activo');
      var docActualizadoCol = docHeadersD.indexOf('actualizadoEn');
      if (docIdColD === -1) {
        return createErrorResponse('DB_Documentos sin columna id');
      }
      var docDel = false;
      for (var ddDoc = 1; ddDoc < docValsD.length; ddDoc++) {
        if (String(docValsD[ddDoc][docIdColD]) === String(data.id)) {
          if (docActivoCol > -1) {
            docSheetD.getRange(ddDoc + 1, docActivoCol + 1).setValue(false);
          }
          if (docActualizadoCol > -1) {
            docSheetD
              .getRange(ddDoc + 1, docActualizadoCol + 1)
              .setValue(data.actualizadoEn || new Date().toISOString().split('T')[0]);
          }
          docDel = true;
          break;
        }
      }
      if (!docDel) {
        return createErrorResponse('Documento no encontrado: ' + data.id);
      }
    } else if (type === 'uploadDocument') {
      return uploadDocument(data);
    } else if (type === 'reportEmail') {
      var reSheet = ss.getSheetByName('DB_ReportEmails');
      if (!reSheet) {
        reSheet = ss.insertSheet('DB_ReportEmails');
        reSheet.appendRow([
          'email',
          'autoMonthly',
          'activo',
          'updatedAt',
          'createdAt',
          'createdBy',
        ]);
      }
      ensureReportEmailSheetHeaders(reSheet);
      var upsertResult = upsertReportEmailRow(reSheet, data);
      if (upsertResult.error) {
        return createErrorResponse(upsertResult.error);
      }
    } else if (type === 'updateReportEmail') {
      var reSheetU = ss.getSheetByName('DB_ReportEmails');
      if (!reSheetU) {
        return createErrorResponse('DB_ReportEmails no existe');
      }
      ensureReportEmailSheetHeaders(reSheetU);
      var updResult = updateReportEmailRow(reSheetU, data);
      if (updResult.error) {
        return createErrorResponse(updResult.error);
      }
    } else if (type === 'deleteReportEmail') {
      var reSheetD = ss.getSheetByName('DB_ReportEmails');
      if (!reSheetD) {
        return createErrorResponse('DB_ReportEmails no existe');
      }
      ensureReportEmailSheetHeaders(reSheetD);
      var delResult = softDeleteReportEmailRow(reSheetD, data);
      if (delResult.error) {
        return createErrorResponse(delResult.error);
      }
    } else {
      return createErrorResponse('Unknown type: ' + String(type));
    }

    invalidateDumpCache();
    return ContentService.createTextOutput(JSON.stringify({ status: 'success' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return createErrorResponse(err.toString());
  } finally {
    lock.releaseLock();
  }
}

function ensureTripSheetHeaders(sheet) {
  var expected = [
    'id',
    'fecha',
    'clientId',
    'estado',
    'contenido',
    'pesoKg',
    'kmRecorridos',
    'tarifa',
    'origen',
    'destino',
    'facturaUrl',
    'remitoUrl',
    'moneda',
    'tipoCambio',
    'tarifaUYU',
    'asignadoA',
    'facturaGenerada',
    'facturaSolicitada',
    'facturaFechaSolicitud',
    'facturaCobrada',
    'facturaFechaCobro',
    'scheduledCostId',
  ];
  var lastCol = Math.max(1, sheet.getLastColumn());
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  for (var i = 0; i < expected.length; i++) {
    var name = expected[i];
    if (headers.indexOf(name) === -1) {
      var lc = sheet.getLastColumn();
      sheet.getRange(1, lc + 1).setValue(name);
      headers.push(name);
    }
  }
}

function boolOrBlank(v) {
  if (v === true || String(v).toUpperCase() === 'TRUE') {
    return true;
  }
  if (v === false || String(v).toUpperCase() === 'FALSE') {
    return false;
  }
  return '';
}

/** Fila alineada al orden de columnas esperado en DB_Viajes. */
function tripRowFromPayload(data, headers) {
  return headers.map(function (h) {
    if (h === 'id') return data.id || '';
    if (h === 'fecha') return data.fecha || '';
    if (h === 'clientId') return data.clientId || '';
    if (h === 'estado') return data.estado || 'Pendiente';
    if (h === 'contenido') return data.contenido || '';
    if (h === 'pesoKg') return data.pesoKg != null ? data.pesoKg : 0;
    if (h === 'kmRecorridos') return data.kmRecorridos != null ? data.kmRecorridos : 0;
    if (h === 'tarifa') return data.tarifa != null ? data.tarifa : 0;
    if (h === 'origen') return data.origen || '';
    if (h === 'destino') return data.destino || '';
    if (h === 'facturaUrl') return data.facturaUrl || '';
    if (h === 'remitoUrl') return data.remitoUrl || '';
    if (h === 'moneda') return data.moneda || 'USD';
    if (h === 'tarifaUYU') return data.tarifaUYU != null ? data.tarifaUYU : '';
    if (h === 'asignadoA') return data.asignadoA || '';
    if (h === 'facturaGenerada') return data.facturaGenerada ? 1 : 0;
    if (h === 'facturaSolicitada') return data.facturaSolicitada ? 1 : 0;
    if (h === 'facturaFechaSolicitud') return data.facturaFechaSolicitud || '';
    if (h === 'facturaCobrada') return data.facturaCobrada ? 1 : 0;
    if (h === 'facturaFechaCobro') return data.facturaFechaCobro || '';
    if (h === 'tipoCambio') return data.tipoCambio != null && data.tipoCambio !== '' ? data.tipoCambio : 1;
    // Preserva columnas extra/legadas sin romper el orden actual de la hoja.
    return data[h] != null ? data[h] : '';
  });
}

/** Asegura columnas esperadas por la app en DB_Costos (hojas antiguas). */
function ensureCostSheetHeaders(sheet) {
  var expected = [
    'id',
    'fecha',
    'tripId',
    'categoria',
    'descripcion',
    'monto',
    'moneda',
    'currency',
    'tipoCambio',
    'montoUSD',
    'scheduledCostId',
    'comprobante',
    'registradoPor',
    'isScheduled',
    'scheduleId',
    'scheduledDay',
    'scheduledMonths',
  ];
  var lastCol = Math.max(1, sheet.getLastColumn());
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  for (var i = 0; i < expected.length; i++) {
    var name = expected[i];
    if (headers.indexOf(name) === -1) {
      var lc = sheet.getLastColumn();
      sheet.getRange(1, lc + 1).setValue(name);
      headers.push(name);
    }
  }
}

/** Asegura columnas esperadas en DB_CostosProgramados (hojas antiguas). */
function ensureScheduledDefinitionSheetHeaders(sheet) {
  var expected = [
    'id',
    'categoria',
    'descripcion',
    'monto',
    'currency',
    'dayOfMonth',
    'active',
    'creadoPor',
    'creadoEn',
    'tripId',
  ];
  var lastCol = Math.max(1, sheet.getLastColumn());
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  for (var si = 0; si < expected.length; si++) {
    var sname = expected[si];
    if (headers.indexOf(sname) === -1) {
      var slc = sheet.getLastColumn();
      sheet.getRange(1, slc + 1).setValue(sname);
      headers.push(sname);
    }
  }
}

function costCellValue(header, data) {
  if (header === 'id') return data.id || '';
  if (header === 'fecha') return data.fecha || '';
  if (header === 'tripId') return data.tripId != null && String(data.tripId) !== '' ? data.tripId : '';
  if (header === 'categoria') return data.categoria || 'Otros';
  if (header === 'descripcion') return data.descripcion || '';
  if (header === 'monto') return data.monto != null ? data.monto : 0;
  if (header === 'moneda') return data.moneda || data.currency || 'USD';
  if (header === 'currency') return data.currency || data.moneda || 'USD';
  if (header === 'tipoCambio') return data.tipoCambio != null && data.tipoCambio !== '' ? data.tipoCambio : 1;
  if (header === 'montoUSD') {
    return data.montoUSD != null && data.montoUSD !== '' ? data.montoUSD : data.monto != null ? data.monto : 0;
  }
  if (header === 'scheduledCostId') return data.scheduledCostId || data.scheduleId || '';
  if (header === 'scheduleId') return data.scheduleId || '';
  if (header === 'isScheduled') return data.isScheduled ? 1 : 0;
  if (header === 'scheduledDay') return data.scheduledDay != null ? data.scheduledDay : '';
  if (header === 'scheduledMonths') {
    if (data.scheduledMonths != null && typeof data.scheduledMonths === 'object') {
      return JSON.stringify(data.scheduledMonths);
    }
    return data.scheduledMonths || '';
  }
  if (header === 'comprobante') return data.comprobante != null && data.comprobante !== undefined ? data.comprobante : '';
  if (header === 'registradoPor') return data.registradoPor || '';
  return data[header] != null ? data[header] : '';
}

function costRowValuesFromPayload(data, headers) {
  return headers.map(function (h) {
    return costCellValue(h, data);
  });
}

function definitionRowValues(data, headers) {
  return headers.map(function (h) {
    if (h === 'id') return data.id || '';
    if (h === 'categoria') return data.categoria || 'Otros';
    if (h === 'descripcion') return data.descripcion || '';
    if (h === 'monto') return data.monto != null ? data.monto : 0;
    if (h === 'currency') return data.currency || 'USD';
    if (h === 'dayOfMonth') return data.dayOfMonth != null ? data.dayOfMonth : 1;
    if (h === 'active') return boolOrBlank(data.active);
    if (h === 'creadoPor') return data.creadoPor || '';
    if (h === 'creadoEn') return data.creadoEn || '';
    if (h === 'tripId') return data.tripId != null && String(data.tripId) !== '' ? String(data.tripId) : '';
    return data[h] != null ? data[h] : '';
  });
}

/** Asegura columnas esperadas en DB_Documentos (hojas antiguas). */
function ensureDocumentSheetHeaders(sheet) {
  var expected = [
    'id',
    'titulo',
    'categoria',
    'entidadRef',
    'emitidoEn',
    'venceEn',
    'archivoUrl',
    'notas',
    'activo',
    'creadoPor',
    'creadoEn',
    'actualizadoEn',
  ];
  var lastCol = Math.max(1, sheet.getLastColumn());
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  for (var di = 0; di < expected.length; di++) {
    var dname = expected[di];
    if (headers.indexOf(dname) === -1) {
      var dlc = sheet.getLastColumn();
      sheet.getRange(1, dlc + 1).setValue(dname);
      headers.push(dname);
    }
  }
}

function documentRowValues(data, headers) {
  return headers.map(function (h) {
    if (h === 'id') return data.id || '';
    if (h === 'titulo') return data.titulo || '';
    if (h === 'categoria') return data.categoria || 'otro';
    if (h === 'entidadRef') return data.entidadRef || '';
    if (h === 'emitidoEn') return data.emitidoEn || '';
    if (h === 'venceEn') return data.venceEn || '';
    if (h === 'archivoUrl') return data.archivoUrl || '';
    if (h === 'notas') return data.notas || '';
    if (h === 'activo') {
      if (data.activo === undefined || data.activo === null || data.activo === '') {
        return true;
      }
      return boolOrBlank(data.activo);
    }
    if (h === 'creadoPor') return data.creadoPor || '';
    if (h === 'creadoEn') return data.creadoEn || '';
    if (h === 'actualizadoEn') return data.actualizadoEn || '';
    return data[h] != null ? data[h] : '';
  });
}

/**
 * Upload fleet document to Drive and set archivoUrl on DB_Documentos by documentId.
 * Does not use tripId (keeps remito/invoice uploadFile path unchanged).
 */
function uploadDocument(data) {
  try {
    if (!data || !data.fileData) {
      return createErrorResponse('Faltan datos del archivo (fileData).');
    }
    var documentId = data.documentId || data.id;
    if (!documentId) {
      return createErrorResponse('Falta documentId.');
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var contentType = data.mimeType || 'application/pdf';
    var rawBase64 = stripBase64Prefix(data.fileData);
    var decoded;
    try {
      decoded = Utilities.base64Decode(rawBase64);
    } catch (decodeErr) {
      return createErrorResponse('No se pudo decodificar el archivo (base64 inválido).');
    }
    var blob = Utilities.newBlob(decoded, contentType, data.fileName || 'documento.bin');

    var folder;
    if (data.folderId && data.folderId !== '') {
      try {
        folder = DriveApp.getFolderById(data.folderId);
      } catch (e) {
        try {
          folder = getFolderByName(ss, 'Documentos');
        } catch (fallbackErr) {
          return createErrorResponse(
            'No se pudo abrir la carpeta Drive (folderId inválido) ni crear "Documentos": ' +
              String(fallbackErr)
          );
        }
      }
    } else {
      try {
        folder = getFolderByName(ss, 'Documentos');
      } catch (fallbackErr) {
        return createErrorResponse(
          'Sin folderId y no se pudo resolver carpeta "Documentos": ' +
            String(fallbackErr) +
            '. Configurá VITE_DRIVE_FOLDER_DOCUMENTOS.'
        );
      }
    }

    var file;
    try {
      file = folder.createFile(blob);
    } catch (createErr) {
      return createErrorResponse('No se pudo crear el archivo en Drive: ' + String(createErr));
    }

    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareErr) {
      // Sharing policy may block ANYONE_WITH_LINK.
    }
    var fileUrl = file.getUrl();

    var sheet = ss.getSheetByName('DB_Documentos');
    if (sheet) {
      ensureDocumentSheetHeaders(sheet);
      var values = sheet.getDataRange().getValues();
      var headers = values[0];
      var idIdx = headers.indexOf('id');
      var urlIdx = headers.indexOf('archivoUrl');
      var updIdx = headers.indexOf('actualizadoEn');
      if (idIdx >= 0) {
        for (var i = 1; i < values.length; i++) {
          if (String(values[i][idIdx]) === String(documentId)) {
            if (urlIdx > -1) {
              sheet.getRange(i + 1, urlIdx + 1).setValue(fileUrl);
            }
            if (updIdx > -1) {
              sheet
                .getRange(i + 1, updIdx + 1)
                .setValue(data.actualizadoEn || new Date().toISOString().split('T')[0]);
            }
            break;
          }
        }
      }
    }

    invalidateDumpCache();
    return ContentService.createTextOutput(JSON.stringify({ status: 'success', url: fileUrl })).setMimeType(
      ContentService.MimeType.JSON
    );
  } catch (err) {
    return createErrorResponse('Error al subir documento: ' + String(err));
  }
}

function buildRow(headers, data) {
  return headers.map(function (h) {
    var v = data[h];
    if (v === undefined || v === null) return '';
    if (v === true) return 'TRUE';
    if (v === false) return 'FALSE';
    if (typeof v === 'object') return JSON.stringify(v);
    return v;
  });
}

function createErrorResponse(msg) {
  return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: msg }))
      .setMimeType(ContentService.MimeType.JSON);
}

function getSheetData(sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return [];

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  // Empty sheet or header-only: no data rows.
  if (lastRow < 2 || lastCol < 1) return [];

  const data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  if (data.length <= 1) return [];

  const headers = data[0];
  const rows = data.slice(1);

  return rows.map(function (row) {
    var obj = {};
    headers.forEach(function (header, index) {
      if (header == null || header === '') return;
      var value = row[index];
      if (value instanceof Date) {
        value = value.toISOString().split('T')[0];
      }
      obj[header] = value;
    });
    return obj;
  });
}

// ---------------------------------------------------------------------------
// Report emails (DB_ReportEmails) + monthly HTML cron (DB_ReportLog)
// ---------------------------------------------------------------------------

function ensureReportEmailSheetHeaders(sheet) {
  var expected = ['email', 'autoMonthly', 'activo', 'updatedAt', 'createdAt', 'createdBy'];
  var lastCol = Math.max(1, sheet.getLastColumn());
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  for (var i = 0; i < expected.length; i++) {
    var name = expected[i];
    if (headers.indexOf(name) === -1) {
      var lc = sheet.getLastColumn();
      sheet.getRange(1, lc + 1).setValue(name);
      headers.push(name);
    }
  }
}

function ensureReportLogSheetHeaders(sheet) {
  var expected = ['monthKey', 'channel', 'recipients', 'sentAt', 'status', 'detail', 'messageId'];
  var lastCol = Math.max(1, sheet.getLastColumn());
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  for (var i = 0; i < expected.length; i++) {
    var name = expected[i];
    if (headers.indexOf(name) === -1) {
      var lc = sheet.getLastColumn();
      sheet.getRange(1, lc + 1).setValue(name);
      headers.push(name);
    }
  }
}

function normalizeEmailGas(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

function isValidEmailGas(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function sheetBoolGas(v, defaultValue) {
  if (v === undefined || v === null || v === '') return defaultValue;
  if (v === true || v === 1) return true;
  if (v === false || v === 0) return false;
  var s = String(v).trim().toUpperCase();
  if (s === 'TRUE' || s === '1' || s === 'YES' || s === 'SI' || s === 'SÍ') return true;
  if (s === 'FALSE' || s === '0' || s === 'NO') return false;
  return defaultValue;
}

function reportEmailRowValues(data, headers) {
  var email = normalizeEmailGas(data.email);
  var now = new Date().toISOString().split('T')[0];
  return headers.map(function (h) {
    if (h === 'email') return email;
    if (h === 'autoMonthly') return boolOrBlank(sheetBoolGas(data.autoMonthly, false));
    if (h === 'activo') {
      if (data.activo === undefined || data.activo === null || data.activo === '') {
        return true;
      }
      return boolOrBlank(data.activo);
    }
    if (h === 'updatedAt') return data.updatedAt || now;
    if (h === 'createdAt') return data.createdAt || now;
    if (h === 'createdBy') return data.createdBy || '';
    return data[h] != null ? data[h] : '';
  });
}

function countActiveReportEmails(sheet) {
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return 0;
  var headers = values[0];
  var emailCol = headers.indexOf('email');
  var activoCol = headers.indexOf('activo');
  var n = 0;
  for (var i = 1; i < values.length; i++) {
    var em = normalizeEmailGas(values[i][emailCol]);
    if (!isValidEmailGas(em)) continue;
    var activo = activoCol === -1 ? true : sheetBoolGas(values[i][activoCol], true);
    if (activo) n += 1;
  }
  return n;
}

/** Upsert by email. preserveAutoMonthly keeps existing autoMonthly on conflict. */
function upsertReportEmailRow(sheet, data) {
  var email = normalizeEmailGas(data && data.email);
  if (!isValidEmailGas(email)) {
    return { error: 'Email inválido' };
  }
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var emailCol = headers.indexOf('email');
  if (emailCol === -1) return { error: 'DB_ReportEmails sin columna email' };
  var values = sheet.getDataRange().getValues();
  var preserve = data.preserveAutoMonthly === true || String(data.preserveAutoMonthly).toUpperCase() === 'TRUE';
  for (var i = 1; i < values.length; i++) {
    if (normalizeEmailGas(values[i][emailCol]) === email) {
      var existingAuto =
        headers.indexOf('autoMonthly') > -1
          ? sheetBoolGas(values[i][headers.indexOf('autoMonthly')], false)
          : false;
      var merged = {
        email: email,
        autoMonthly: preserve ? existingAuto : sheetBoolGas(data.autoMonthly, existingAuto),
        activo: true,
        updatedAt: data.updatedAt || new Date().toISOString().split('T')[0],
        createdAt:
          headers.indexOf('createdAt') > -1 ? values[i][headers.indexOf('createdAt')] || data.createdAt : data.createdAt,
        createdBy:
          headers.indexOf('createdBy') > -1
            ? values[i][headers.indexOf('createdBy')] || data.createdBy || ''
            : data.createdBy || '',
      };
      var row = reportEmailRowValues(merged, headers);
      for (var c = 0; c < row.length; c++) {
        sheet.getRange(i + 1, c + 1).setValue(row[c]);
      }
      return { ok: true };
    }
  }
  if (countActiveReportEmails(sheet) >= MAX_REPORT_EMAILS) {
    return { error: 'Máximo ' + MAX_REPORT_EMAILS + ' correos autorizados' };
  }
  sheet.appendRow(reportEmailRowValues(data, headers));
  return { ok: true };
}

function updateReportEmailRow(sheet, data) {
  var email = normalizeEmailGas(data && data.email);
  if (!isValidEmailGas(email)) return { error: 'Email inválido' };
  var values = sheet.getDataRange().getValues();
  var headers = values[0];
  var emailCol = headers.indexOf('email');
  if (emailCol === -1) return { error: 'DB_ReportEmails sin columna email' };
  for (var i = 1; i < values.length; i++) {
    if (normalizeEmailGas(values[i][emailCol]) === email) {
      var merged = {
        email: email,
        autoMonthly:
          data.autoMonthly !== undefined
            ? sheetBoolGas(data.autoMonthly, false)
            : sheetBoolGas(values[i][headers.indexOf('autoMonthly')], false),
        activo:
          data.activo !== undefined
            ? sheetBoolGas(data.activo, true)
            : sheetBoolGas(values[i][headers.indexOf('activo')], true),
        updatedAt: data.updatedAt || new Date().toISOString().split('T')[0],
        createdAt: headers.indexOf('createdAt') > -1 ? values[i][headers.indexOf('createdAt')] : '',
        createdBy: headers.indexOf('createdBy') > -1 ? values[i][headers.indexOf('createdBy')] : '',
      };
      var row = reportEmailRowValues(merged, headers);
      for (var c = 0; c < row.length; c++) {
        sheet.getRange(i + 1, c + 1).setValue(row[c]);
      }
      return { ok: true };
    }
  }
  return { error: 'Email no encontrado: ' + email };
}

function softDeleteReportEmailRow(sheet, data) {
  var email = normalizeEmailGas(data && data.email);
  if (!email) return { error: 'Falta email' };
  var values = sheet.getDataRange().getValues();
  var headers = values[0];
  var emailCol = headers.indexOf('email');
  var activoCol = headers.indexOf('activo');
  var updatedCol = headers.indexOf('updatedAt');
  if (emailCol === -1) return { error: 'DB_ReportEmails sin columna email' };
  for (var i = 1; i < values.length; i++) {
    if (normalizeEmailGas(values[i][emailCol]) === email) {
      if (activoCol > -1) sheet.getRange(i + 1, activoCol + 1).setValue(false);
      if (updatedCol > -1) {
        sheet
          .getRange(i + 1, updatedCol + 1)
          .setValue(data.updatedAt || new Date().toISOString().split('T')[0]);
      }
      return { ok: true };
    }
  }
  return { error: 'Email no encontrado: ' + email };
}

function appendReportLog(entry) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('DB_ReportLog');
    if (!sheet) {
      sheet = ss.insertSheet('DB_ReportLog');
      sheet.appendRow([
        'monthKey',
        'channel',
        'recipients',
        'sentAt',
        'status',
        'detail',
        'messageId',
      ]);
    }
    ensureReportLogSheetHeaders(sheet);
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var row = headers.map(function (h) {
      if (h === 'monthKey') return entry.monthKey || '';
      if (h === 'channel') return entry.channel || '';
      if (h === 'recipients') return entry.recipients || '';
      if (h === 'sentAt') return entry.sentAt || new Date().toISOString();
      if (h === 'status') return entry.status || '';
      if (h === 'detail') return entry.detail || '';
      if (h === 'messageId') return entry.messageId || 'R' + Date.now();
      return '';
    });
    sheet.appendRow(row);
  } catch (e) {
    // Logging must not break send path.
  }
}

function previousMonthKeyGas(dateOpt) {
  var d = dateOpt || new Date();
  var y = d.getFullYear();
  var m = d.getMonth();
  var prev = new Date(y, m - 1, 1);
  return prev.getFullYear() + '-' + String(prev.getMonth() + 1).padStart(2, '0');
}

function hasSuccessfulCronLog(monthKey) {
  var rows = getSheetData('DB_ReportLog');
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (
      String(r.channel) === 'cron' &&
      String(r.monthKey) === monthKey &&
      (String(r.status) === 'ok' || String(r.status) === 'partial')
    ) {
      return true;
    }
  }
  return false;
}

function listAutoMonthlyRecipients() {
  var rows = getSheetData('DB_ReportEmails');
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var email = normalizeEmailGas(rows[i].email);
    if (!isValidEmailGas(email)) continue;
    if (!sheetBoolGas(rows[i].activo, true)) continue;
    if (!sheetBoolGas(rows[i].autoMonthly, false)) continue;
    out.push(email);
  }
  return out;
}

function tripRevenueUSDGas(t) {
  var tons = (Number(t.pesoKg) || 0) / 1000;
  var moneda = String(t.moneda || 'USD').trim();
  if (moneda === 'UYU') {
    var totalUYU =
      t.tarifaUYU != null && Number(t.tarifaUYU) > 0 ? Number(t.tarifaUYU) : (Number(t.tarifa) || 0) * tons;
    var tc = t.tipoCambio != null && Number(t.tipoCambio) > 0 ? Number(t.tipoCambio) : 1;
    return totalUYU / tc;
  }
  return (Number(t.tarifa) || 0) * tons;
}

function isCobradoGas(t) {
  return sheetBoolGas(t.facturaCobrada, false);
}

function isPendienteCobroGas(t) {
  return sheetBoolGas(t.facturaSolicitada, false) && !isCobradoGas(t);
}

function calcCombustiblePorKmGas(trips, costs) {
  var totalComb = 0;
  for (var i = 0; i < costs.length; i++) {
    if (String(costs[i].categoria) === 'Combustible') {
      totalComb += Number(costs[i].montoUSD) || 0;
    }
  }
  var totalKm = 0;
  for (var j = 0; j < trips.length; j++) {
    totalKm += Number(trips[j].kmRecorridos) || 0;
  }
  if (totalKm === 0 || totalComb === 0) return 0;
  return (totalComb * 0.7) / totalKm;
}

function filterByMonthGas(items, monthKey) {
  return items.filter(function (x) {
    return String(x.fecha || '').indexOf(monthKey) === 0;
  });
}

function computeSnapshotGas(tripsR, costsR, rate) {
  var totalGenerado = 0;
  var totalCobrado = 0;
  var totalPendiente = 0;
  var totalKm = 0;
  for (var i = 0; i < tripsR.length; i++) {
    var rev = tripRevenueUSDGas(tripsR[i]);
    totalGenerado += rev;
    if (isCobradoGas(tripsR[i])) totalCobrado += rev;
    if (isPendienteCobroGas(tripsR[i])) totalPendiente += rev;
    totalKm += Number(tripsR[i].kmRecorridos) || 0;
  }
  var totalCostos = 0;
  for (var c = 0; c < costsR.length; c++) {
    totalCostos += Number(costsR[c].montoUSD) || 0;
  }
  var fuelImputedRef = 0;
  var r = Number(rate) || 0;
  if (r > 0) {
    for (var t = 0; t < tripsR.length; t++) {
      fuelImputedRef += (Number(tripsR[t].kmRecorridos) || 0) * r;
    }
  }
  return {
    totalGenerado: totalGenerado,
    totalCobrado: totalCobrado,
    totalPendiente: totalPendiente,
    totalCostos: totalCostos,
    fuelImputedRef: fuelImputedRef,
    totalTrips: tripsR.length,
    totalKm: totalKm,
  };
}

function pctDeltaGas(curr, prev) {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return ((curr - prev) / prev) * 100;
}

function fmtUsdGas(n) {
  var v = Math.round(Number(n) || 0);
  try {
    return v.toLocaleString('es-UY', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  } catch (e) {
    return 'USD ' + v.toLocaleString('es-UY');
  }
}

/** Per-km rates with 2 decimals (never use fmtUsdGas for $/km). */
function fmtPerKmGas(n) {
  var v = Number(n) || 0;
  try {
    return v.toLocaleString('es-UY', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch (e) {
    return 'USD ' + v.toFixed(2);
  }
}

function monthLabelGas(ym) {
  var parts = String(ym).split('-');
  var y = Number(parts[0]);
  var m = Number(parts[1]);
  if (!y || !m) return ym;
  var names = [
    'ene',
    'feb',
    'mar',
    'abr',
    'may',
    'jun',
    'jul',
    'ago',
    'set',
    'oct',
    'nov',
    'dic',
  ];
  return names[m - 1] + ' ' + y;
}

/** Registered categories only — sum closes with KPI totalCostos. */
var FUEL_IMPUTED_REF_LABEL_GAS = 'Combustible imputado (ref.)';

function costsByCategoryGas(costsR) {
  var totals = {};
  for (var i = 0; i < costsR.length; i++) {
    var cat = String(costsR[i].categoria || 'Otros');
    var usd = Number(costsR[i].montoUSD) || 0;
    totals[cat] = (totals[cat] || 0) + usd;
  }
  var grand = 0;
  for (var gk in totals) {
    if (Object.prototype.hasOwnProperty.call(totals, gk)) grand += totals[gk];
  }
  var arr = [];
  for (var k in totals) {
    if (Object.prototype.hasOwnProperty.call(totals, k)) {
      arr.push({
        category: k,
        total: totals[k],
        pct: grand > 0 ? (totals[k] / grand) * 100 : 0,
      });
    }
  }
  arr.sort(function (a, b) {
    return b.total - a.total;
  });
  return arr;
}

/**
 * Build monthly metrics + fallback insights (port of reportData mensual / buildFallbackAi).
 * No Gemini / charts in cron (D3).
 */
function buildMonthlyReportPayload(monthKey) {
  var trips = getSheetData('DB_Viajes');
  var costs = getSheetData('DB_Costos');
  var clients = getSheetData('DB_Clientes');
  var clientName = {};
  for (var ci = 0; ci < clients.length; ci++) {
    clientName[String(clients[ci].id)] = clients[ci].nombreComercial || clients[ci].id;
  }

  var rate = calcCombustiblePorKmGas(trips, costs);
  var tripsR = filterByMonthGas(trips, monthKey);
  var costsR = filterByMonthGas(costs, monthKey);
  var cur = computeSnapshotGas(tripsR, costsR, rate);
  var netMargin = cur.totalGenerado - cur.totalCostos;
  var marginPct = cur.totalGenerado > 0 ? (netMargin / cur.totalGenerado) * 100 : 0;
  var collectionRate = cur.totalGenerado > 0 ? (cur.totalCobrado / cur.totalGenerado) * 100 : 0;
  var avgTicket = cur.totalTrips > 0 ? cur.totalGenerado / cur.totalTrips : 0;
  var costPerKm = cur.totalKm > 0 ? cur.totalCostos / cur.totalKm : 0;
  var revenuePerKm = cur.totalKm > 0 ? cur.totalGenerado / cur.totalKm : 0;
  var marginPerKm = revenuePerKm - costPerKm;

  var parts = monthKey.split('-');
  var py = Number(parts[0]);
  var pm = Number(parts[1]);
  var prevDate = new Date(py, pm - 2, 1);
  var prevKey =
    prevDate.getFullYear() + '-' + String(prevDate.getMonth() + 1).padStart(2, '0');
  var prevSnap = computeSnapshotGas(filterByMonthGas(trips, prevKey), filterByMonthGas(costs, prevKey), rate);
  var prevMarginPct =
    prevSnap.totalGenerado > 0
      ? ((prevSnap.totalGenerado - prevSnap.totalCostos) / prevSnap.totalGenerado) * 100
      : 0;
  var comparison = {
    available: true,
    label: 'vs mes anterior',
    revenueDelta: pctDeltaGas(cur.totalGenerado, prevSnap.totalGenerado),
    costsDelta: pctDeltaGas(cur.totalCostos, prevSnap.totalCostos),
    marginDelta: pctDeltaGas(netMargin, prevSnap.totalGenerado - prevSnap.totalCostos),
    marginPctDeltaPp: marginPct - prevMarginPct,
  };

  var byClient = {};
  for (var ti = 0; ti < tripsR.length; ti++) {
    var id = String(tripsR[ti].clientId || '');
    if (!byClient[id]) byClient[id] = { revenue: 0, trips: 0 };
    byClient[id].revenue += tripRevenueUSDGas(tripsR[ti]);
    byClient[id].trips += 1;
  }
  var clientBreakdown = [];
  for (var cid in byClient) {
    if (Object.prototype.hasOwnProperty.call(byClient, cid)) {
      clientBreakdown.push({
        name: clientName[cid] || cid,
        revenue: byClient[cid].revenue,
        trips: byClient[cid].trips,
      });
    }
  }
  clientBreakdown.sort(function (a, b) {
    return b.revenue - a.revenue;
  });
  var topClient = clientBreakdown[0] || { name: '—', revenue: 0, trips: 0 };

  var byRoute = {};
  for (var tr = 0; tr < tripsR.length; tr++) {
    var route = String(tripsR[tr].origen || '') + ' → ' + String(tripsR[tr].destino || '');
    if (!byRoute[route]) byRoute[route] = { revenue: 0, count: 0 };
    byRoute[route].revenue += tripRevenueUSDGas(tripsR[tr]);
    byRoute[route].count += 1;
  }
  var topRoute = { route: '—', revenue: 0, count: 0 };
  for (var rk in byRoute) {
    if (Object.prototype.hasOwnProperty.call(byRoute, rk) && byRoute[rk].revenue > topRoute.revenue) {
      topRoute = { route: rk, revenue: byRoute[rk].revenue, count: byRoute[rk].count };
    }
  }

  var byProduct = {};
  for (var tp = 0; tp < tripsR.length; tp++) {
    var pname = String(tripsR[tp].contenido || '').trim() || 'Sin especificar';
    if (!byProduct[pname]) byProduct[pname] = { revenue: 0, tons: 0 };
    byProduct[pname].revenue += tripRevenueUSDGas(tripsR[tp]);
    byProduct[pname].tons += (Number(tripsR[tp].pesoKg) || 0) / 1000;
  }
  var topProduct = { name: '—', revenue: 0, tons: 0 };
  for (var pk in byProduct) {
    if (Object.prototype.hasOwnProperty.call(byProduct, pk) && byProduct[pk].revenue > topProduct.revenue) {
      topProduct = { name: pk, revenue: byProduct[pk].revenue, tons: byProduct[pk].tons };
    }
  }

  // Light trip margin (direct non-fuel + fleet fuel×km) — parity with enrichTrips policy A
  var bestMarginTrip = { id: '—', client: '—', marginPct: 0 };
  var worstMarginTrip = { id: '—', client: '—', marginPct: 0 };
  var bestPct = -Infinity;
  var worstPct = Infinity;
  for (var em = 0; em < tripsR.length; em++) {
    var trip = tripsR[em];
    var rev = tripRevenueUSDGas(trip);
    if (rev <= 0) continue;
    var directCosts = 0;
    for (var dc = 0; dc < costs.length; dc++) {
      if (String(costs[dc].tripId) === String(trip.id) && String(costs[dc].categoria) !== 'Combustible') {
        directCosts += Number(costs[dc].montoUSD) || 0;
      }
    }
    var fuelEst = (Number(trip.kmRecorridos) || 0) * rate;
    var mPct = ((rev - directCosts - fuelEst) / rev) * 100;
    var cname = clientName[String(trip.clientId)] || String(trip.clientId);
    if (mPct > bestPct) {
      bestPct = mPct;
      bestMarginTrip = { id: String(trip.id), client: cname, marginPct: mPct };
    }
    if (mPct < worstPct) {
      worstPct = mPct;
      worstMarginTrip = { id: String(trip.id), client: cname, marginPct: mPct };
    }
  }
  if (bestPct === -Infinity) bestMarginTrip = { id: '—', client: '—', marginPct: 0 };
  if (worstPct === Infinity) worstMarginTrip = { id: '—', client: '—', marginPct: 0 };

  var costsByCategory = costsByCategoryGas(costsR);
  var periodLabel = monthLabelGas(monthKey);

  var cmp =
    comparison.revenueDelta > 2
      ? ' Los ingresos crecieron ' + comparison.revenueDelta.toFixed(1) + '% ' + comparison.label + '.'
      : comparison.revenueDelta < -2
        ? ' Los ingresos cayeron ' + Math.abs(comparison.revenueDelta).toFixed(1) + '% ' + comparison.label + '.'
        : ' El nivel de ingresos se mantuvo estable ' + comparison.label + '.';

  var aiSummary =
    'En ' +
    periodLabel +
    ', GDC generó ' +
    fmtUsdGas(cur.totalGenerado) +
    ' en ingresos (' +
    fmtUsdGas(cur.totalCobrado) +
    ' cobrados, ' +
    collectionRate.toFixed(0) +
    '% de cobranza) con ' +
    cur.totalTrips +
    ' viajes y un margen operativo del ' +
    marginPct.toFixed(1) +
    '% (' +
    fmtUsdGas(netMargin) +
    '). Costos del período: ' +
    fmtUsdGas(cur.totalCostos) +
    '.' +
    cmp;

  var topShare = cur.totalGenerado > 0 ? (topClient.revenue / cur.totalGenerado) * 100 : 0;
  var topCatEarly = costsByCategory[0];
  var commentaryP1 =
    'En ' +
    periodLabel +
    ' la operativa generó ' +
    fmtUsdGas(cur.totalGenerado) +
    ' con un margen de ' +
    fmtUsdGas(netMargin) +
    ' (' +
    marginPct.toFixed(1) +
    '%). Se cobró el ' +
    collectionRate.toFixed(0) +
    '% (' +
    fmtUsdGas(cur.totalCobrado) +
    '); queda pendiente ' +
    fmtUsdGas(cur.totalPendiente) +
    '.';
  var commentaryP2 =
    'Por kilómetro, el costo fue ' +
    fmtPerKmGas(costPerKm) +
    ' frente a un ingreso de ' +
    fmtPerKmGas(revenuePerKm) +
    ', lo que deja un margen/km de ' +
    fmtPerKmGas(marginPerKm) +
    ' sobre ' +
    Math.round(cur.totalKm).toLocaleString('es-UY') +
    ' km.';
  var commentaryP3Parts = [];
  if (topClient.trips > 0) {
    commentaryP3Parts.push(
      'El principal cliente fue ' +
        topClient.name +
        ' (' +
        fmtUsdGas(topClient.revenue) +
        ', ' +
        topShare.toFixed(0) +
        '% de los ingresos)'
    );
  }
  if (topCatEarly) {
    commentaryP3Parts.push(
      'la categoría de costo líder fue ' +
        topCatEarly.category +
        ' (' +
        fmtUsdGas(topCatEarly.total) +
        ', ' +
        topCatEarly.pct.toFixed(0) +
        '% del total)'
    );
  }
  var commentaryP3 =
    commentaryP3Parts.length > 0
      ? commentaryP3Parts.join('; ') +
        '. Monitoreá cobranza, concentración de clientes y carga completa de costos en DB_Costos.'
      : 'Sin viajes relevantes en el período; revisá la carga operativa y la captura de costos.';
  if (cur.fuelImputedRef > 0) {
    commentaryP3 +=
      '\n\n' +
      FUEL_IMPUTED_REF_LABEL_GAS +
      ': ' +
      fmtUsdGas(cur.fuelImputedRef) +
      ' (proxy km×tasa; no entra al margen de período).';
  }
  var aiCommentary = commentaryP1 + '\n\n' + commentaryP2 + '\n\n' + commentaryP3;

  var aiAlerts = [];
  if (marginPct < 15) {
    aiAlerts.push('Margen operativo del ' + marginPct.toFixed(1) + '%, por debajo del 15% objetivo.');
  }
  if (collectionRate < 70 && cur.totalGenerado > 0) {
    aiAlerts.push(
      'Solo se cobró el ' +
        collectionRate.toFixed(0) +
        '% de lo generado; hay ' +
        fmtUsdGas(cur.totalPendiente) +
        ' pendientes.'
    );
  }
  if (worstMarginTrip.marginPct < 0) {
    aiAlerts.push(
      'El viaje ' +
        worstMarginTrip.id +
        ' (' +
        worstMarginTrip.client +
        ') operó con margen negativo (' +
        worstMarginTrip.marginPct.toFixed(1) +
        '%).'
    );
  }
  if (topShare > 55) {
    aiAlerts.push(
      topClient.name + ' concentra el ' + topShare.toFixed(0) + '% de los ingresos: riesgo de dependencia.'
    );
  }
  if (comparison.available && comparison.costsDelta > 15) {
    aiAlerts.push(
      'Los costos subieron ' +
        comparison.costsDelta.toFixed(1) +
        '% ' +
        comparison.label +
        ' (umbral +15%).'
    );
  }

  var aiRecommendations = [];
  if (cur.totalPendiente > 0) {
    aiRecommendations.push(
      'Acelerá la cobranza de ' + fmtUsdGas(cur.totalPendiente) + ' pendientes para mejorar el flujo de caja.'
    );
  }
  if (topShare > 55) {
    aiRecommendations.push(
      'Diversificá la cartera: reforzá contratos con clientes secundarios para reducir la dependencia de ' +
        topClient.name +
        '.'
    );
  }
  var topCat = costsByCategory[0];
  if (topCat && topCat.pct > 40) {
    aiRecommendations.push(
      topCat.category +
        ' representa el ' +
        topCat.pct.toFixed(0) +
        '% de los costos; renegociá proveedores o revisá eficiencia en esa categoría.'
    );
  }
  if (topRoute.count > 0) {
    aiRecommendations.push(
      'La ruta ' +
        topRoute.route +
        ' es la de mayor ingreso; evaluá retornos con carga y consolidación para subir el margen.'
    );
  }

  return {
    monthKey: monthKey,
    periodLabel: periodLabel,
    totalGenerado: cur.totalGenerado,
    totalCobrado: cur.totalCobrado,
    totalPendiente: cur.totalPendiente,
    totalCostos: cur.totalCostos,
    fuelImputedRef: cur.fuelImputedRef,
    netMargin: netMargin,
    marginPct: marginPct,
    collectionRate: collectionRate,
    totalTrips: cur.totalTrips,
    totalKm: cur.totalKm,
    avgTicket: avgTicket,
    costPerKm: costPerKm,
    revenuePerKm: revenuePerKm,
    marginPerKm: marginPerKm,
    comparison: comparison,
    topClient: topClient,
    topRoute: topRoute,
    topProduct: topProduct,
    bestMarginTrip: bestMarginTrip,
    worstMarginTrip: worstMarginTrip,
    costsByCategory: costsByCategory,
    clientBreakdown: clientBreakdown.slice(0, 8),
    aiSummary: aiSummary,
    aiCommentary: aiCommentary,
    aiAlerts: aiAlerts.slice(0, 4),
    aiRecommendations: aiRecommendations.slice(0, 4),
  };
}

function escapeHtmlGas(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildMonthlyReportHtml(payload) {
  function kpiRow(label, value) {
    return (
      '<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;">' +
      escapeHtmlGas(label) +
      '</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;">' +
      escapeHtmlGas(value) +
      '</td></tr>'
    );
  }
  var cmp = payload.comparison;
  var kpis =
    '<table style="width:100%;border-collapse:collapse;font-size:14px;">' +
    kpiRow('Ingresos generados', fmtUsdGas(payload.totalGenerado)) +
    kpiRow('Ingresos cobrados', fmtUsdGas(payload.totalCobrado) + ' (' + payload.collectionRate.toFixed(0) + '%)') +
    kpiRow('Pendiente', fmtUsdGas(payload.totalPendiente)) +
    kpiRow('Costos', fmtUsdGas(payload.totalCostos)) +
    kpiRow('Margen neto', fmtUsdGas(payload.netMargin) + ' (' + payload.marginPct.toFixed(1) + '%)') +
    kpiRow('Viajes', String(payload.totalTrips)) +
    kpiRow('Ticket promedio', fmtUsdGas(payload.avgTicket)) +
    kpiRow('Costo / km', fmtPerKmGas(payload.costPerKm)) +
    kpiRow('Ingreso / km', fmtPerKmGas(payload.revenuePerKm)) +
    kpiRow('Margen / km', fmtPerKmGas(payload.marginPerKm != null ? payload.marginPerKm : payload.revenuePerKm - payload.costPerKm)) +
    kpiRow(
      'Δ ingresos ' + cmp.label,
      (cmp.revenueDelta >= 0 ? '+' : '') + cmp.revenueDelta.toFixed(1) + '%'
    ) +
    '</table>';

  var commentaryHtml = '';
  if (payload.aiCommentary) {
    var paras = String(payload.aiCommentary).split(/\n\n+/);
    commentaryHtml = '<h2 style="font-size:15px;margin:16px 0 8px;">Comentario</h2>';
    for (var cp = 0; cp < paras.length; cp++) {
      var para = String(paras[cp] || '').trim();
      if (!para) continue;
      commentaryHtml +=
        '<p style="font-size:14px;line-height:1.55;margin:0 0 12px;">' + escapeHtmlGas(para) + '</p>';
    }
  }

  var costsRows = '';
  for (var i = 0; i < payload.costsByCategory.length; i++) {
    var c = payload.costsByCategory[i];
    costsRows +=
      '<tr><td style="padding:4px 8px;">' +
      escapeHtmlGas(c.category) +
      '</td><td style="padding:4px 8px;text-align:right;">' +
      escapeHtmlGas(fmtUsdGas(c.total)) +
      '</td><td style="padding:4px 8px;text-align:right;">' +
      c.pct.toFixed(0) +
      '%</td></tr>';
  }

  var clientRows = '';
  for (var j = 0; j < payload.clientBreakdown.length; j++) {
    var cl = payload.clientBreakdown[j];
    clientRows +=
      '<tr><td style="padding:4px 8px;">' +
      escapeHtmlGas(cl.name) +
      '</td><td style="padding:4px 8px;text-align:right;">' +
      escapeHtmlGas(fmtUsdGas(cl.revenue)) +
      '</td><td style="padding:4px 8px;text-align:right;">' +
      cl.trips +
      '</td></tr>';
  }

  function ul(items) {
    if (!items || !items.length) return '<p style="color:#64748b;font-size:13px;">—</p>';
    var html = '<ul style="padding-left:18px;margin:8px 0;">';
    for (var u = 0; u < items.length; u++) {
      html += '<li style="margin-bottom:4px;">' + escapeHtmlGas(items[u]) + '</li>';
    }
    return html + '</ul>';
  }

  return (
    '<div style="font-family:system-ui,-apple-system,sans-serif;color:#0f172a;max-width:640px;margin:0 auto;">' +
    '<h1 style="font-size:20px;margin:0 0 4px;">Reporte mensual · ' +
    escapeHtmlGas(payload.periodLabel) +
    '</h1>' +
    '<p style="color:#64748b;font-size:13px;margin:0 0 16px;">GDC Transporte de Carga</p>' +
    '<p style="font-size:14px;line-height:1.5;margin-bottom:12px;">' +
    escapeHtmlGas(payload.aiSummary) +
    '</p>' +
    commentaryHtml +
    '<h2 style="font-size:15px;margin:16px 0 8px;">Indicadores</h2>' +
    kpis +
    '<h2 style="font-size:15px;margin:20px 0 8px;">Costos por categoría</h2>' +
    '<table style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr>' +
    '<th style="text-align:left;padding:4px 8px;">Categoría</th><th style="text-align:right;padding:4px 8px;">USD</th><th style="text-align:right;padding:4px 8px;">%</th>' +
    '</tr></thead><tbody>' +
    (costsRows || '<tr><td colspan="3" style="padding:8px;color:#64748b;">Sin costos</td></tr>') +
    '</tbody></table>' +
    '<h2 style="font-size:15px;margin:20px 0 8px;">Top clientes</h2>' +
    '<table style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr>' +
    '<th style="text-align:left;padding:4px 8px;">Cliente</th><th style="text-align:right;padding:4px 8px;">Ingresos</th><th style="text-align:right;padding:4px 8px;">Viajes</th>' +
    '</tr></thead><tbody>' +
    (clientRows || '<tr><td colspan="3" style="padding:8px;color:#64748b;">Sin viajes</td></tr>') +
    '</tbody></table>' +
    '<p style="font-size:13px;margin-top:16px;"><strong>Mejor cliente:</strong> ' +
    escapeHtmlGas(payload.topClient.name) +
    ' · <strong>Ruta:</strong> ' +
    escapeHtmlGas(payload.topRoute.route) +
    ' · <strong>Producto:</strong> ' +
    escapeHtmlGas(payload.topProduct.name) +
    '</p>' +
    '<h2 style="font-size:15px;margin:20px 0 8px;color:#b91c1c;">Alertas</h2>' +
    ul(payload.aiAlerts) +
    '<h2 style="font-size:15px;margin:16px 0 8px;color:#1d4ed8;">Recomendaciones</h2>' +
    ul(payload.aiRecommendations) +
    '<p style="font-size:11px;color:#94a3b8;margin-top:24px;">Costos = suma registrada DB_Costos del período.' +
    (payload.fuelImputedRef > 0
      ? ' ' +
        FUEL_IMPUTED_REF_LABEL_GAS +
        ': ' +
        escapeHtmlGas(fmtUsdGas(payload.fuelImputedRef)) +
        ' (no entra al margen).'
      : '') +
    ' Márgenes por viaje estimados. Reporte automático HTML (sin gráficos). On-demand PDF disponible en la app.</p>' +
    '</div>'
  );
}

function buildMonthlyReportText(payload) {
  var lines = [
    'Reporte mensual · ' + payload.periodLabel + ' — GDC',
    '',
    payload.aiSummary,
    '',
  ];
  if (payload.aiCommentary) {
    lines.push('Comentario:', payload.aiCommentary, '');
  }
  lines.push(
    'Ingresos: ' + fmtUsdGas(payload.totalGenerado),
    'Cobrados: ' + fmtUsdGas(payload.totalCobrado),
    'Costos: ' + fmtUsdGas(payload.totalCostos),
    'Margen: ' + fmtUsdGas(payload.netMargin) + ' (' + payload.marginPct.toFixed(1) + '%)',
    'Costo/km: ' + fmtPerKmGas(payload.costPerKm),
    'Ingreso/km: ' + fmtPerKmGas(payload.revenuePerKm),
    'Margen/km: ' +
      fmtPerKmGas(
        payload.marginPerKm != null ? payload.marginPerKm : payload.revenuePerKm - payload.costPerKm
      ),
    'Viajes: ' + payload.totalTrips,
    '',
    'Alertas:'
  );
  for (var i = 0; i < payload.aiAlerts.length; i++) lines.push('- ' + payload.aiAlerts[i]);
  if (!payload.aiAlerts.length) lines.push('- (ninguna)');
  lines.push('', 'Recomendaciones:');
  for (var j = 0; j < payload.aiRecommendations.length; j++) {
    lines.push('- ' + payload.aiRecommendations[j]);
  }
  return lines.join('\n');
}

/**
 * Cron / manual monthly HTML send.
 * data: { monthKey?, force?, recipients? }
 * Does NOT auto-install triggers. Safe to call from editor or POST sendMonthlyReportHtml.
 */
function sendMonthlyReport(data) {
  // Clock triggers pass an event with triggerUid; ignore and use cron defaults.
  if (!data || typeof data !== 'object' || data.triggerUid != null || data.authMode != null) {
    data = {};
  }
  try {
    var monthKey = data.monthKey || previousMonthKeyGas(new Date());
    var force = data.force === true || String(data.force).toUpperCase() === 'TRUE';

    if (!force && hasSuccessfulCronLog(monthKey)) {
      return ContentService.createTextOutput(
        JSON.stringify({
          status: 'success',
          skipped: true,
          reason: 'already_sent',
          monthKey: monthKey,
        })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    var recipients =
      data.recipients && String(data.recipients).trim()
        ? String(data.recipients)
            .split(/[;,]/)
            .map(function (s) {
              return normalizeEmailGas(s);
            })
            .filter(isValidEmailGas)
        : listAutoMonthlyRecipients();

    if (!recipients.length) {
      appendReportLog({
        monthKey: monthKey,
        channel: 'cron',
        recipients: '',
        status: 'error',
        detail: 'Sin destinatarios autoMonthly',
      });
      return createErrorResponse('Sin destinatarios con autoMonthly activo');
    }

    var quota = MailApp.getRemainingDailyQuota();
    if (quota < recipients.length) {
      appendReportLog({
        monthKey: monthKey,
        channel: 'cron',
        recipients: recipients.join(','),
        status: 'error',
        detail: 'Cuota MailApp insuficiente (' + quota + ' restantes)',
      });
      return createErrorResponse('Cuota de email insuficiente (' + quota + ' restantes)');
    }

    var payload = buildMonthlyReportPayload(monthKey);
    var html = buildMonthlyReportHtml(payload);
    var text = buildMonthlyReportText(payload);
    var subject = 'Reporte mensual · ' + payload.periodLabel + ' — GDC';

    var sent = [];
    var failed = [];
    for (var i = 0; i < recipients.length; i++) {
      try {
        MailApp.sendEmail({
          to: recipients[i],
          subject: subject,
          body: text,
          htmlBody: html,
          name: 'GDC Reportes',
        });
        sent.push(recipients[i]);
      } catch (sendErr) {
        failed.push(recipients[i] + ': ' + String(sendErr).slice(0, 80));
      }
    }

    var status = failed.length === 0 ? 'ok' : sent.length > 0 ? 'partial' : 'error';
    appendReportLog({
      monthKey: monthKey,
      channel: 'cron',
      recipients: sent.join(','),
      status: status,
      detail: failed.length ? failed.join(' | ').slice(0, 200) : 'HTML monthly',
    });

    if (status === 'error') {
      return createErrorResponse('No se pudo enviar el reporte: ' + failed.join('; '));
    }

    return ContentService.createTextOutput(
      JSON.stringify({
        status: 'success',
        monthKey: monthKey,
        sent: sent.length,
        failed: failed.length,
        reportStatus: status,
      })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    appendReportLog({
      monthKey: (data && data.monthKey) || '',
      channel: 'cron',
      recipients: '',
      status: 'error',
      detail: String(err).slice(0, 200),
    });
    return createErrorResponse('sendMonthlyReport: ' + String(err));
  }
}

/**
 * Install (or reinstall) day-5 monthly trigger. Run manually from Apps Script editor.
 * Dedupes existing sendMonthlyReport triggers. NEVER call from doGet/doPost.
 *
 * HITL steps: set project TZ America/Montevideo → run this once → authorize MailApp.
 */
function installMonthlyReportTrigger() {
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) {
    if (existing[i].getHandlerFunction() === 'sendMonthlyReport') {
      ScriptApp.deleteTrigger(existing[i]);
    }
  }
  ScriptApp.newTrigger('sendMonthlyReport').timeBased().onMonthDay(5).atHour(8).create();
  return 'OK: trigger sendMonthlyReport día 5 a las 8:00 (TZ del proyecto)';
}
