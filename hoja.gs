var FOLDER = 'GO Services';
var MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
var WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
var HEADERS = ['Id', 'Dia', 'Semana', 'Fecha', 'Hora', 'Empleado', 'Servicio', 'Rim', 'Parches', 'Valvulas', 'Modelo', 'Descripcion', 'Pago', 'Total', 'Porcentaje', 'Estado'];

function doPost(e) {
  var raw = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
  var data = JSON.parse(raw);
  var removed = quitarPruebas_();
  var folder = folderByName_();
  var touched = {};
  var written = [];
  (data.sales || []).forEach(function(sale) {
    var parts = String(sale.date || '').split('-');
    var year = parts[0] || String(new Date().getFullYear());
    var monthIndex = Number(parts[1]) - 1;
    var day = Number(parts[2]) || 1;
    if (!(monthIndex >= 0 && monthIndex <= 11)) return;
    var book = spreadsheet_(folder, 'Ventas ' + year);
    if (year === '2026') preparar2026_(book);
    var sheet = monthSheet_(book, monthIndex);
    if (already_(sheet, sale.id)) {
      written.push({ sheet: sheet.getName(), skipped: true, id: sale.id });
      return;
    }
    var weekday = sale.weekday || WEEKDAYS[new Date(Number(year), monthIndex, day).getDay()] || '';
    var row = [
      sale.id || '',
      day,
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
    ];
    var at = Math.max(sheet.getLastRow(), 1) + 1;
    sheet.getRange(at, 1, 1, HEADERS.length).setValues([row]);
    touched[book.getId() + '|' + sheet.getName()] = sheet;
    written.push({ sheet: sheet.getName(), row: at, id: sale.id, url: book.getUrl() });
  });
  Object.keys(touched).forEach(function(key) {
    var sheet = touched[key];
    if (sheet.getLastRow() > 1) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).sort([
        { column: 2, ascending: true },
        { column: 5, ascending: true }
      ]);
    }
  });
  SpreadsheetApp.flush();
  return ContentService.createTextOutput(JSON.stringify({
    ok: true,
    received: (data.sales || []).length,
    removed: removed,
    written: written
  })).setMimeType(ContentService.MimeType.JSON);
}

function quitarPruebas_() {
  var folder = folderByName_();
  var files = folder.getFilesByName('Ventas 2026');
  if (!files.hasNext()) return 0;
  var book = SpreadsheetApp.open(files.next());
  var sheet = book.getSheetByName('Noviembre');
  if (!sheet || sheet.getLastRow() < 2) return 0;
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).getValues();
  var removed = 0;
  for (var i = values.length - 1; i >= 0; i--) {
    var id = String(values[i][0] || '');
    var day = String(values[i][1] || '');
    var employee = String(values[i][5] || '');
    var filled = values[i].some(function(cell) { return String(cell) !== ''; });
    if (filled && (id.indexOf('prueba-') === 0 || employee === 'Prueba' || day === '')) {
      sheet.deleteRow(i + 2);
      removed++;
    }
  }
  return removed;
}

function preparar2026_(book) {
  monthSheet_(book, 10);
  monthSheet_(book, 11);
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

function monthSheet_(book, monthIndex) {
  var name = MONTHS[monthIndex];
  var sheet = book.getSheetByName(name);
  if (!sheet) {
    sheet = book.insertSheet(name);
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#ab2125').setFontColor('#ffffff');
    sheet.hideColumns(1);
    sheet.setFrozenRows(1);
    orderMonths_(book);
    sheet = book.getSheetByName(name);
  }
  var blank = book.getSheetByName('Hoja 1');
  if (blank && book.getSheets().length > 1 && blank.getLastRow() === 0) book.deleteSheet(blank);
  return sheet;
}

function orderMonths_(book) {
  var position = 1;
  MONTHS.forEach(function(name) {
    var sheet = book.getSheetByName(name);
    if (!sheet) return;
    book.setActiveSheet(sheet);
    book.moveActiveSheet(position);
    position = position + 1;
  });
}

function already_(sheet, id) {
  if (!id) return false;
  var values = sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), 1).getValues();
  return values.some(function(row) { return String(row[0]) === String(id); });
}
