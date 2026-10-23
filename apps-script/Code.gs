const SPREADSHEET_ID = '1guiYQ_gslGv325ttmCwve0y-G-h0tXssC-CHdVb-WuA';
const ALLOWED_EMAILS = ['elenaortizigualada@gmail.com', 'franjp17@gmail.com'];
const ALLOWED_APP_ORIGINS = [
  'https://financial-dashboard-alpha-lilac.vercel.app',
];

function isAllowedOrigin(origin) {
  try {
    const parsedOrigin = new URL(String(origin || '').trim());
    const normalizedOrigin = parsedOrigin.origin;
    const isLocalVite = parsedOrigin.protocol === 'http:' && /^localhost:517\d$/.test(parsedOrigin.host);
    const isFranelaPreview = parsedOrigin.protocol === 'https:'
      && /^financial-dashboard-[a-z0-9]+-elenaortizigualada\.vercel\.app$/i.test(parsedOrigin.hostname);
    return ALLOWED_APP_ORIGINS.includes(normalizedOrigin) || isLocalVite || isFranelaPreview;
  } catch (error) {
    return false;
  }
}

function assertAllowedUser() {
  const email = Session.getActiveUser().getEmail().trim().toLocaleLowerCase('en');
  const allowed = ALLOWED_EMAILS.map(value => value.trim().toLocaleLowerCase('en'));
  if (!email || !allowed.includes(email)) {
    throw new Error('Esta cuenta de Google no está autorizada para ver los datos financieros. Añade su email exacto a ALLOWED_EMAILS en Apps Script.');
  }
  return email;
}

function doGet(event) {
  const params = event && event.parameter ? event.parameter : {};
  const parentOrigin = params.parentOrigin || '';
  const mode = params.mode === 'authorize' ? 'authorize' : 'data';
  const callback = params.callback || '';

  // La pantalla de autorización no devuelve datos al dashboard. La comprobación
  // de origen se mantiene para las peticiones de datos, que sí leen la hoja.
  if (mode === 'authorize') {
    const template = HtmlService.createTemplateFromFile('Bridge');
    return template.evaluate().setTitle('franela Finanzas · Acceso a Google Sheets');
  }
  if (!isAllowedOrigin(parentOrigin)) {
    // Las peticiones de datos llegan como JSONP. Devolver HTML aquí hace que el
    // navegador solo muestre un error de carga de script y oculta la causa real.
    if (/^__franelaSheet_[A-Za-z0-9_]{12,80}$/.test(callback)) {
      return createJsonpResponse(callback, { error: 'Origen no autorizado. Añade el origen exacto de la app a ALLOWED_APP_ORIGINS y vuelve a desplegar esta versión.' });
    }
    return HtmlService.createHtmlOutput('Origen no autorizado. Añade el origen exacto de la app a ALLOWED_APP_ORIGINS.');
  }
  if (mode === 'data') {
    if (!/^__franelaSheet_[A-Za-z0-9_]{12,80}$/.test(callback)) {
      return HtmlService.createHtmlOutput('Solicitud inválida. Vuelve al dashboard e inténtalo de nuevo.');
    }
    if (params.sheet === 'savings') {
      try {
        assertAllowedUser();
        const sheetData = getSavingsData();
        return createJsonpResponse(callback, sheetData);
      } catch (error) {
        const message = error && error.message ? error.message : 'No se pudo leer la hoja AHORROS.';
        return createJsonpResponse(callback, { error: message });
      }
    }
    const year = Number(params.year);
    if (!Number.isInteger(year) || year < 2000 || year > 2200) {
      return createJsonpResponse(callback, { error: 'El año solicitado no es válido.' });
    }
    let years = [];
    try {
      assertAllowedUser();
      years = getAvailableYears();
      const sheetData = getSpreadsheetData(year);
      return createJsonpResponse(callback, { ...sheetData, years });
    } catch (error) {
      const message = error && error.message ? error.message : 'No se pudo leer la spreadsheet.';
      return createJsonpResponse(callback, { error: message, years });
    }
  }

  return HtmlService.createHtmlOutput('Solicitud no válida.');
}

function createJsonpResponse(callback, payload) {
  const safePayload = JSON.stringify(payload).replace(/</g, '\\u003c');
  return ContentService.createTextOutput(`${callback}(${safePayload});`)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function getAvailableYears() {
  assertAllowedUser();
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  return spreadsheet.getSheets()
    .map(sheet => sheet.getName().trim().match(/^GASTOS\s+(\d{4})$/i))
    .filter(Boolean)
    .map(match => Number(match[1]))
    .sort((a, b) => b - a);
}

function getSpreadsheetData(year) {
  assertAllowedUser();
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const expectedName = `GASTOS ${year}`.toLocaleLowerCase('es');
  const sheet = spreadsheet.getSheets().find(candidate => candidate.getName().trim().toLocaleLowerCase('es') === expectedName);
  if (!sheet) throw new Error(`No existe la pestaña GASTOS ${year}. Hojas detectadas: ${getAvailableYears().map(item => `GASTOS ${item}`).join(', ') || 'ninguna con formato GASTOS YYYY'}.`);
  const lastRow = sheet.getLastRow();
  const lastColumn = Math.min(Math.max(sheet.getLastColumn(), 1), 15);
  if (!lastRow) throw new Error('La pestaña no contiene datos.');
  return {
    sheetName: sheet.getName(),
    values: sheet.getRange(1, 1, lastRow, lastColumn).getDisplayValues(),
  };
}

function getSavingsData() {
  assertAllowedUser();
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = spreadsheet.getSheets().find(candidate => candidate.getName().trim().toLocaleLowerCase('es') === 'ahorros');
  if (!sheet) throw new Error('No existe una pestaña llamada AHORROS en la spreadsheet.');
  const lastRow = sheet.getLastRow();
  const lastColumn = Math.min(Math.max(sheet.getLastColumn(), 1), 15);
  if (!lastRow) throw new Error('La pestaña AHORROS no contiene datos.');
  return {
    sheetName: sheet.getName(),
    values: sheet.getRange(1, 1, lastRow, lastColumn).getDisplayValues(),
  };
}
