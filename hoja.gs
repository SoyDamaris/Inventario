var FOLDER = 'GO Services';
var MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
var WEEKDAYS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
var HEADERS = ['Id','Día','Fecha','Hora','Empleado','Servicio','Rim','Parches','Válvulas','Modelo','Descripción','Pago','Total','Porcentaje','Estado'];

function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  var folder = folderByName_();
  var touched = {};
  (data.sales || []).forEach(function(sale) {
    var parts = String(sale.date || '').split('-');
    var year = parts[0] || '';
    var monthIndex = Number(parts[1]) - 1;
    var day = Number(parts[2]) || 1;
    var book = spreadsheet_(folder, 'Ventas ' + year);
    var sheet = monthSheet_(book, MONTHS[monthIndex] || parts[1] || 'Mes');
    if (already_(sheet, sale.id)) return;
    var weekday = sale.weekday || WEEKDAYS[new Date(Number(year), monthIndex, day).getDay()] || '';
    sheet.appendRow([
      sale.id || '',
      weekday,
      sale.date || '',
      sale.time || '',
      sale.employeeName || '',
      sale.serviceName || '',
      sale.rim || '',
      sale.extraPatches || 0,
      sale.extraValves || 0,
      sale.carModel || '',
      sale.description || '',
      sale.payment || '',
      sale.total || 0,
      sale.commissionAmount || 0,
      sale.voided ? 'Anulada' : 'Registrada'
    ]);
    touched[book.getId() + '|' + sheet.getName()] = sheet;
  });
  Object.keys(touched).forEach(function(key) {
    var sheet = touched[key];
    if (sheet.getLastRow() > 1) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).sort([{ column: 3, ascending: true }, { column: 4, ascending: true }]);
    }
  });
  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
}

function folderByName_() {
  var found = DriveApp.getFoldersByName(FOLDER);
  return found.hasNext() ? found.next() : DriveApp.createFolder(FOLDER);
}

function spreadsheet_(folder, name) {
  var files = folder.getFilesByName(name);
  if (files.hasNext()) return SpreadsheetApp.open(files.next());
  var book = SpreadsheetApp.create(name);
  DriveApp.getFileById(book.getId()).moveTo(folder);
  return book;
}

function monthSheet_(book, name) {
  var sheet = book.getSheetByName(name);
  if (!sheet) {
    sheet = book.insertSheet(name);
    sheet.appendRow(HEADERS);
    sheet.hideColumns(1);
    sheet.setFrozenRows(1);
  }
  var blank = book.getSheetByName('Hoja 1');
  if (blank && book.getSheets().length > 1 && blank.getLastRow() === 0) book.deleteSheet(blank);
  return sheet;
}

function already_(sheet, id) {
  if (!id) return false;
  var values = sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), 1).getValues();
  return values.some(function(row) { return String(row[0]) === String(id); });
}
