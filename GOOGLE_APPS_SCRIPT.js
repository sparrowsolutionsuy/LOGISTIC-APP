// -------------------------------------------------------------------------
// INSTRUCTIONS:
// 1. Paste this into Extensions > Apps Script in your Google Sheet.
// 2. Uploads: la app envía folderId (VITE_DRIVE_FOLDER_*); si falla, se usa carpeta por nombre.
// 3. DEPLOY as Web App -> Execute as: Me -> Access: Anyone (Cualquier persona).
// 4. URL del Web App en VITE_SHEET_URL (.env.local / GitHub Secrets).
// 5. After deploy / schema upgrades: hit GET ?migrate=1 once (or POST/GET health).
// Pure dump helpers mirrored in src/gas/dumpHelpers.ts — keep in sync.
// -------------------------------------------------------------------------

/** Phase B: dump cache TTL (seconds). Writes bump epoch to invalidate. */
var DUMP_CACHE_TTL_SEC = 45;
var DUMP_CACHE_PREFIX = 'gdc_dump_v1';
var DUMP_CACHE_EPOCH_KEY = 'gdc_dump_epoch';
var DUMP_KEYS = ['clients', 'trips', 'costs', 'scheduledCostDefinitions', 'documents'];
var DUMP_SHEET_BY_KEY = {
  clients: 'DB_Clientes',
  trips: 'DB_Viajes',
  costs: 'DB_Costos',
  scheduledCostDefinitions: 'DB_CostosProgramados',
  documents: 'DB_Documentos',
};

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

/** Envía un reporte PDF (base64) por email con adjunto. */
function sendReportEmail(data) {
  if (!data || !data.to || !data.fileData) {
    return createErrorResponse('Faltan datos para enviar el email (destinatario o archivo).');
  }
  var recipients = String(data.to)
    .split(/[;,]/)
    .map(function (s) { return s.trim(); })
    .filter(function (s) { return s.length > 0; })
    .join(',');
  if (!recipients) {
    return createErrorResponse('Destinatario inválido.');
  }
  var decoded = Utilities.base64Decode(data.fileData);
  var fileName = data.fileName || 'Reporte_GDC.pdf';
  var blob = Utilities.newBlob(decoded, data.mimeType || 'application/pdf', fileName);
  var subject = data.subject || 'Reporte GDC';
  var message = data.message || 'Adjuntamos el reporte solicitado.';
  MailApp.sendEmail({
    to: recipients,
    subject: subject,
    body: message,
    htmlBody: message.replace(/\n/g, '<br>'),
    attachments: [blob],
    name: 'GDC Reportes',
  });
  return ContentService.createTextOutput(JSON.stringify({ status: 'success' }))
    .setMimeType(ContentService.MimeType.JSON);
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
      return uploadFile(data, 'Facturas', function (sheet, rowNum, headers, fileUrl) {
        const statusIndex = headers.indexOf('estado');
        const urlIndex = headers.indexOf('facturaUrl');
        sheet.getRange(rowNum, statusIndex + 1).setValue('Cerrado');
        if (urlIndex > -1) {
          sheet.getRange(rowNum, urlIndex + 1).setValue(fileUrl);
        }
      }, 'DB_Viajes');

    } else if (type === 'sendReportEmail') {
      return sendReportEmail(data);

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