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
    clientSheet.appendRow(['id', 'nombreComercial', 'departamento', 'localidad', 'latitud', 'longitud', 'rut', 'email', 'telefono']);
  } else {
      const headers = clientSheet.getRange(1, 1, 1, clientSheet.getLastColumn()).getValues()[0];
      if (!headers.includes('rut')) clientSheet.getRange(1, headers.length + 1).setValue('rut');
      if (!headers.includes('email')) clientSheet.getRange(1, headers.length + 2).setValue('email');
      if (!headers.includes('telefono')) clientSheet.getRange(1, headers.length + 3).setValue('telefono');
  }
  const clients = getSheetData('DB_Clientes');

  // Ensure Trips Sheet
  let tripSheet = ss.getSheetByName('DB_Viajes');
  if (!tripSheet) {
    tripSheet = ss.insertSheet('DB_Viajes');
    tripSheet.appendRow(['id', 'fecha', 'clientId', 'estado', 'contenido', 'pesoKg', 'kmRecorridos', 'tarifa', 'origen', 'destino', 'facturaUrl', 'remitoUrl']);
  }
  
  const tripHeaders = tripSheet.getRange(1, 1, 1, tripSheet.getLastColumn()).getValues()[0];
  if (!tripHeaders.includes('facturaUrl')) {
    tripSheet.getRange(1, tripHeaders.length + 1).setValue('facturaUrl');
  }
  const tripHeaders2 = tripSheet.getRange(1, 1, 1, tripSheet.getLastColumn()).getValues()[0];
  if (!tripHeaders2.includes('remitoUrl')) {
    tripSheet.getRange(1, tripHeaders2.length + 1).setValue('remitoUrl');
  }

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
      'tipoCambio',
      'montoUSD',
      'scheduledCostId',
      'comprobante',
      'registradoPor',
    ]);
  }
  const costs = getSheetData('DB_Costos');

  return ContentService.createTextOutput(JSON.stringify({ clients, trips, costs }))
    .setMimeType(ContentService.MimeType.JSON);
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
      sheet.appendRow([
        data.id, 
        data.fecha, 
        data.clientId, 
        data.estado, 
        data.contenido, 
        data.pesoKg, 
        data.kmRecorridos, 
        data.tarifa, 
        data.origen, 
        data.destino,
        data.facturaUrl || '',
        data.remitoUrl || ''
      ]);
    } else if (type === 'client') {
      const sheet = ss.getSheetByName('DB_Clientes');
      sheet.appendRow([
        data.id,
        data.nombreComercial,
        data.departamento,
        data.localidad,
        data.latitud,
        data.longitud,
        data.rut || '',
        data.email || '',
        data.telefono || ''
      ]);
    } else if (type === 'updateTrip') {
      const sheet = ss.getSheetByName('DB_Viajes');
      let values = sheet.getDataRange().getValues();
      let headers = values[0];
      if (headers.indexOf('remitoUrl') === -1) {
        sheet.getRange(1, headers.length + 1).setValue('remitoUrl');
        values = sheet.getDataRange().getValues();
        headers = values[0];
      }
      const facturaIdx = headers.indexOf('facturaUrl');
      const remitoIdx = headers.indexOf('remitoUrl');
      
      for (let i = 1; i < values.length; i++) {
        if (String(values[i][0]) === String(data.id)) {
          const rowNum = i + 1;
          const prevFactura = facturaIdx > -1 && values[i][facturaIdx] != null ? String(values[i][facturaIdx]) : '';
          const prevRemito = remitoIdx > -1 && values[i][remitoIdx] != null ? String(values[i][remitoIdx]) : '';
          const newRow = [
            data.id, 
            data.fecha, 
            data.clientId, 
            data.estado, 
            data.contenido, 
            data.pesoKg, 
            data.kmRecorridos, 
            data.tarifa, 
            data.origen, 
            data.destino,
            data.facturaUrl != null && data.facturaUrl !== '' ? data.facturaUrl : prevFactura,
            data.remitoUrl != null && data.remitoUrl !== '' ? data.remitoUrl : prevRemito
          ];
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