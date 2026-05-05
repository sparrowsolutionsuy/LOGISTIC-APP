// -------------------------------------------------------------------------
// INSTRUCTIONS:
// 1. Paste this into Extensions > Apps Script in your Google Sheet.
// 2. Uploads: la app envía folderId (VITE_DRIVE_FOLDER_*); si falla, se usa carpeta por nombre.
// 3. DEPLOY as Web App -> Execute as: Me -> Access: Anyone (Cualquier persona).
// 4. URL del Web App en VITE_SHEET_URL (.env.local / GitHub Secrets).
// -------------------------------------------------------------------------

function getFolderByName(ss, folderName) {
  const parentFolder = DriveApp.getFileById(ss.getId()).getParents().next();
  const folders = parentFolder.getFoldersByName(folderName);
  return folders.hasNext() ? folders.next() : parentFolder.createFolder(folderName);
}

function uploadFile(data, folderNameFallback, updateSheetFn, sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const contentType = data.mimeType || 'application/pdf';
  const decoded = Utilities.base64Decode(data.fileData);
  const blob = Utilities.newBlob(decoded, contentType, data.fileName);

  var folder;
  if (data.folderId && data.folderId !== '') {
    try {
      folder = DriveApp.getFolderById(data.folderId);
    } catch (e) {
      folder = getFolderByName(ss, folderNameFallback);
    }
  } else {
    folder = getFolderByName(ss, folderNameFallback);
  }

  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const fileUrl = file.getUrl();

  const sheet = ss.getSheetByName(sheetName);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idIdx = headers.indexOf('id');

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][idIdx]) === String(data.tripId)) {
      updateSheetFn(sheet, i + 1, headers, fileUrl);
      break;
    }
  }

  return ContentService.createTextOutput(JSON.stringify({ status: 'success', url: fileUrl }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Ensure DB_Usuarios (Auth)
  let userSheet = ss.getSheetByName('DB_Usuarios');
  if (!userSheet) {
    userSheet = ss.insertSheet('DB_Usuarios');
    userSheet.appendRow(['usuario', 'password', 'nombre', 'rol']);
    // Default Admin User for first time setup
    userSheet.appendRow(['admin', 'admin123', 'Administrador General', 'admin']);
    userSheet.appendRow(['operativo', 'op123', 'Chofer Operativo', 'operativo']);
  }

  // Ensure Clients Sheet with NEW Columns
  let clientSheet = ss.getSheetByName('DB_Clientes');
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
      const headers = clientSheet.getRange(1, 1, 1, clientSheet.getLastColumn()).getValues()[0];
      if (!headers.includes('rut')) clientSheet.getRange(1, headers.length + 1).setValue('rut');
      if (!headers.includes('email')) clientSheet.getRange(1, headers.length + 2).setValue('email');
      if (!headers.includes('telefono')) clientSheet.getRange(1, headers.length + 3).setValue('telefono');
      if (!headers.includes('tieneFacturacionDiferente')) clientSheet.getRange(1, clientSheet.getLastColumn() + 1).setValue('tieneFacturacionDiferente');
      if (!headers.includes('facturacion')) clientSheet.getRange(1, clientSheet.getLastColumn() + 1).setValue('facturacion');
  }
  const clients = getSheetData('DB_Clientes');

  // Ensure Trips Sheet
  let tripSheet = ss.getSheetByName('DB_Viajes');
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
      'facturaFechaCobro'
    ]);
  }
  ensureTripSheetHeaders(tripSheet);

  const trips = getSheetData('DB_Viajes');

  let costSheet = ss.getSheetByName('DB_Costos');
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
      'currency',
      'tipoCambio',
      'montoUSD',
      'scheduledCostId',
      'comprobante',
      'registradoPor',
    ]);
  }
  ensureCostSheetHeaders(costSheet);
  const costs = getSheetData('DB_Costos');

  let defSheet = ss.getSheetByName('DB_CostosProgramados');
  if (!defSheet) {
    defSheet = ss.insertSheet('DB_CostosProgramados');
    defSheet.appendRow([
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
  ensureScheduledDefinitionSheetHeaders(defSheet);
  const scheduledCostDefinitions = getSheetData('DB_CostosProgramados');

  return ContentService.createTextOutput(
    JSON.stringify({ clients, trips, costs, scheduledCostDefinitions })
  ).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const body = JSON.parse(e.postData.contents);
  
  const type = body.type;
  const data = body.data;

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
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      sheet.appendRow(tripRowFromPayload(data, headers));
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
          const prevData = {};
          headers.forEach(function (h, idx) {
            prevData[h] = prev[idx];
          });
          const merged = Object.assign({}, prevData, data);
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
          'currency',
          'tipoCambio',
          'montoUSD',
          'scheduledCostId',
          'comprobante',
          'registradoPor',
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
    }

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
    if (h === 'tipoCambio') return data.tipoCambio != null ? data.tipoCambio : '';
    if (h === 'tarifaUYU') return data.tarifaUYU != null ? data.tarifaUYU : '';
    if (h === 'asignadoA') return data.asignadoA || '';
    if (h === 'facturaGenerada') return boolOrBlank(data.facturaGenerada);
    if (h === 'facturaSolicitada') return boolOrBlank(data.facturaSolicitada);
    if (h === 'facturaFechaSolicitud') return data.facturaFechaSolicitud || '';
    if (h === 'facturaCobrada') return boolOrBlank(data.facturaCobrada);
    if (h === 'facturaFechaCobro') return data.facturaFechaCobro || '';
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
  if (header === 'tipoCambio') return data.tipoCambio != null ? data.tipoCambio : '';
  if (header === 'montoUSD') return data.montoUSD != null ? data.montoUSD : '';
  if (header === 'scheduledCostId') return data.scheduledCostId || data.scheduleId || '';
  if (header === 'scheduleId') return data.scheduleId || '';
  if (header === 'isScheduled') return boolOrBlank(data.isScheduled);
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
  
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return []; // No data

  const headers = data[0];
  const rows = data.slice(1);

  return rows.map(row => {
    let obj = {};
    headers.forEach((header, index) => {
      let value = row[index];
      if (value instanceof Date) {
        value = value.toISOString().split('T')[0];
      }
      obj[header] = value;
    });
    return obj;
  });
}