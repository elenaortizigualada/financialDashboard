import { useState, type CSSProperties } from 'react';
import { ChartNoAxesCombined, ExternalLink, LayoutDashboard, PiggyBank, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type RowType = 'income' | 'contribution' | 'expense' | 'saving' | 'income-total' | 'expense-total' | 'other';
type SheetRow = { label: string; rowNumber: number; type: RowType; values: number[] };
type View = 'resumen' | 'anual' | 'categorias' | 'ahorros';
type AppsScriptPayload = { values?: (string | number | boolean)[][]; years?: number[]; sheetName?: string; error?: string };
type SavingsPosition = { name: string; amount: number };
type SavingsGroup = { name: string; total: number; positions: SavingsPosition[] };

declare global {
  interface ImportMeta { readonly env: { readonly VITE_GOOGLE_APPS_SCRIPT_URL?: string } }
}

const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const statementRows = { jointContribution: 2, franContribution: 7, elenaContribution: 8, elenaInvestment: 9, elenaSavings: 10, jointSavings: 11, expenseTotal: 13, incomeTotal: 46 };
const sheetUrl = 'https://docs.google.com/spreadsheets/d/1guiYQ_gslGv325ttmCwve0y-G-h0tXssC-CHdVb-WuA/edit';
const appsScriptUrl = import.meta.env.VITE_GOOGLE_APPS_SCRIPT_URL?.trim() ?? '';
const colors = ['#187c68', '#e49b38', '#4f83c2', '#b86855', '#8b78ad', '#6d9f86', '#d2769a', '#87949b', '#c2a64d', '#5eaaa6', '#9a6d54', '#7391b6'];
const money = (value: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value);

function parseAmount(value: string | number | boolean | undefined): number {
  if (!value) return 0;
  const cleaned = String(value).replace(/[€\s]/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeCell(value: string | number | boolean | undefined): string {
  return String(value ?? '').replace(/^\uFEFF/, '').trim().toLocaleLowerCase('es');
}

function parseSheet(table: (string | number | boolean)[][]): SheetRow[] {
  const headerIndex = table.findIndex(record => record.filter(cell => months.includes(normalizeCell(cell))).length >= 6);
  if (headerIndex < 0) {
    const sample = table.slice(0, 4).map(record => record.map(normalizeCell).filter(Boolean).join(' | ')).filter(Boolean).join(' / ');
    throw new Error(`No encuentro la fila de meses en la pestaña. Primeras filas: ${sample || 'vacías'}. Comprueba que la hoja se llama GASTOS <año> y contiene enero-diciembre.`);
  }
  const header = table[headerIndex].map(normalizeCell);
  const monthColumns = months.map(name => header.indexOf(name));
  if (monthColumns.every(index => index < 0)) throw new Error('La hoja debe incluir al menos una columna mensual reconocible.');
  let section: 'income' | 'expense' | 'other' = 'income';
  const rows: SheetRow[] = [];
  for (let rowIndex = headerIndex + 1; rowIndex < table.length; rowIndex++) {
    const record = table[rowIndex];
    const sheetRowNumber = rowIndex + 1;
    const label = String(record[0] ?? '').trim();
    const normalized = label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
    if (!label) continue;
    if (sheetRowNumber === statementRows.expenseTotal || normalized === 'gastos') { section = 'expense'; rows.push({ label, rowNumber: sheetRowNumber, type: 'expense-total', values: monthColumns.map(index => parseAmount(record[index])) }); continue; }
    if (normalized === 'sobra') { section = 'other'; continue; }
    if (sheetRowNumber === statementRows.incomeTotal || normalized === 'ingresos totales') { rows.push({ label, rowNumber: sheetRowNumber, type: 'income-total', values: monthColumns.map(index => parseAmount(record[index])) }); continue; }
    if ([statementRows.jointContribution, statementRows.franContribution, statementRows.elenaContribution].includes(sheetRowNumber)) {
      rows.push({ label, rowNumber: sheetRowNumber, type: 'contribution', values: monthColumns.map(index => parseAmount(record[index])) });
      continue;
    }
    const isSavingsRow = [statementRows.elenaInvestment, statementRows.elenaSavings, statementRows.jointSavings].includes(sheetRowNumber) || normalized.startsWith('ahorro') || /invers|invertid/.test(normalized);
    const type: RowType = isSavingsRow ? 'saving' : section === 'expense' ? 'expense' : section === 'income' ? 'income' : 'other';
    if (type !== 'other') rows.push({ label, rowNumber: sheetRowNumber, type, values: monthColumns.map(index => parseAmount(record[index])) });
  }
  if (!rows.some(item => item.type === 'income-total' || item.type === 'income') || !rows.some(item => item.type === 'expense-total' || item.type === 'expense')) {
    throw new Error('No encuentro filas de ingresos y gastos en la hoja.');
  }
  return rows;
}

function parseSavingsSheet(table: (string | number | boolean)[][]): SavingsGroup[] {
  const groups: SavingsGroup[] = [];
  let current: SavingsGroup | undefined;
  const ownerPattern = /^(ahorro\s+(elena|fran)|conjunto)$/;
  const isAmountCell = (value: string | number | boolean | undefined) => {
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value !== 'string') return false;
    return /^-?\s*\d[\d.\s]*(?:,\d+)?\s*€?$/.test(value.trim());
  };

  for (const record of table) {
    const ownerColumn = record.findIndex(value => ownerPattern.test(normalizeCell(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '')));
    let scanFrom = 0;
    if (ownerColumn >= 0) {
      const name = String(record[ownerColumn] ?? '').trim();
      const totalColumn = record.findIndex((value, column) => column > ownerColumn && isAmountCell(value));
      const totalCell = totalColumn >= 0 ? record[totalColumn] : undefined;
      current = { name, total: parseAmount(totalCell), positions: [] };
      groups.push(current);
      scanFrom = totalColumn >= 0 ? totalColumn + 1 : ownerColumn + 1;
    }
    if (!current) continue;
    for (let column = scanFrom; column < record.length; column++) {
      const positionName = String(record[column] ?? '').trim();
      if (!positionName || ownerPattern.test(normalizeCell(positionName))) continue;
      const amountColumn = record.findIndex((value, nextColumn) => nextColumn > column && isAmountCell(value));
      if (amountColumn < 0) continue;
      current.positions.push({ name: positionName, amount: parseAmount(record[amountColumn]) });
      column = amountColumn;
    }
  }
  if (groups.length === 0) {
    throw new Error('La pestaña se encontró, pero no detecté las etiquetas AHORRO ELENA, AHORRO FRAN o CONJUNTO. Revisa la versión de Code.gs desplegada y que los nombres estén en celdas individuales.');
  }
  return groups;
}

function getValue(rows: SheetRow[], type: RowType, monthIndex: number): number {
  const summary = rows.find(item => item.type === type);
  if (summary) return summary.values[monthIndex] ?? 0;
  const fallbackType = type === 'income-total' ? 'income' : 'expense';
  return rows.filter(item => item.type === fallbackType).reduce((total, item) => total + (item.values[monthIndex] ?? 0), 0);
}

function fetchAppsScriptSheet(endpoint: string, year: number): Promise<AppsScriptPayload> {
  return new Promise((resolve, reject) => {
    const callbackName = `__franelaSheet_${crypto.randomUUID().replace(/-/g, '_')}`;
    const script = document.createElement('script');
    const callbacks = window as unknown as Record<string, (payload: AppsScriptPayload) => void>;
    const finish = (error?: Error, data?: AppsScriptPayload) => {
      window.clearTimeout(timeout);
      delete callbacks[callbackName];
      script.remove();
      if (error) { reject(error); return; }
      if (!data) { reject(new Error('Apps Script devolvió una respuesta vacía.')); return; }
      resolve(data);
    };
    const timeout = window.setTimeout(() => finish(new Error('Apps Script no devolvió una respuesta. Autoriza primero la Web App en una pestaña normal y verifica que su URL /exec sea la misma que usa el dashboard.')), 30000);
    callbacks[callbackName] = data => finish(undefined, data);
    script.onerror = () => finish(new Error('Google no pudo cargar la respuesta. Comprueba que autorizaste Apps Script y que la URL /exec apunta al despliegue actual.'));
    script.async = true;
    const url = new URL(endpoint);
    url.searchParams.set('mode', 'data');
    url.searchParams.set('parentOrigin', window.location.origin);
    url.searchParams.set('year', String(year));
    url.searchParams.set('callback', callbackName);
    url.searchParams.set('_', String(Date.now()));
    script.src = url.toString();
    document.head.appendChild(script);
  });
}

function fetchAppsScriptSavings(endpoint: string): Promise<AppsScriptPayload> {
  return new Promise((resolve, reject) => {
    const callbackName = `__franelaSheet_${crypto.randomUUID().replace(/-/g, '_')}`;
    const script = document.createElement('script');
    const callbacks = window as unknown as Record<string, (payload: AppsScriptPayload) => void>;
    const finish = (error?: Error, data?: AppsScriptPayload) => {
      window.clearTimeout(timeout);
      delete callbacks[callbackName];
      script.remove();
      if (error) { reject(error); return; }
      if (!data) { reject(new Error('Apps Script devolvió una respuesta vacía.')); return; }
      resolve(data);
    };
    const timeout = window.setTimeout(() => finish(new Error('Apps Script no respondió al leer AHORROS.')), 30000);
    callbacks[callbackName] = data => finish(undefined, data);
    script.onerror = () => finish(new Error('Google no pudo cargar la hoja AHORROS.'));
    script.async = true;
    const url = new URL(endpoint);
    url.searchParams.set('mode', 'data');
    url.searchParams.set('sheet', 'savings');
    url.searchParams.set('parentOrigin', window.location.origin);
    url.searchParams.set('callback', callbackName);
    url.searchParams.set('_', String(Date.now()));
    script.src = url.toString();
    document.head.appendChild(script);
  });
}

export default function FinancialDashboard() {
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [savingsGroups, setSavingsGroups] = useState<SavingsGroup[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedYears, setSelectedYears] = useState<number[]>([new Date().getFullYear()]);
  const [rowsByYear, setRowsByYear] = useState<Record<number, SheetRow[]>>({});
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [view, setView] = useState<View>('resumen');
  const [monthIndex, setMonthIndex] = useState(9);
  const [selectedMonths, setSelectedMonths] = useState<number[]>(months.map((_, index) => index));
  const [selectedCategory, setSelectedCategory] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const income = getValue(rows, 'income-total', monthIndex);
  const expenses = getValue(rows, 'expense-total', monthIndex);
  const savings = rows.find(item => item.rowNumber === statementRows.jointSavings)?.values[monthIndex] ?? 0;
  const elenaSavings = rows.find(item => item.rowNumber === statementRows.elenaSavings)?.values[monthIndex] ?? 0;
  const elenaInvestment = rows.find(item => item.rowNumber === statementRows.elenaInvestment)?.values[monthIndex] ?? 0;
  const incomeContributions = [
    { label: 'Cuenta conjunta', rowNumber: statementRows.jointContribution },
    { label: 'Fran', rowNumber: statementRows.franContribution },
    { label: 'Elena', rowNumber: statementRows.elenaContribution },
  ].map(item => ({ ...item, amount: rows.find(row => row.rowNumber === item.rowNumber)?.values[monthIndex] ?? 0 }));
  const isInvestment = (item: SheetRow) => /invers|invertid/.test(item.label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es'));
  const annualIncome = months.reduce((total, _, index) => total + getValue(rows, 'income-total', index), 0);
  const annualExpenses = months.reduce((total, _, index) => total + getValue(rows, 'expense-total', index), 0);
  const annualRowValue = (rowNumber: number) => rows.find(item => item.rowNumber === rowNumber)?.values.reduce((sum, value) => sum + value, 0) ?? 0;
  const annualIncomeContributions = [
    { label: 'Cuenta conjunta', rowNumber: statementRows.jointContribution },
    { label: 'Fran', rowNumber: statementRows.franContribution },
    { label: 'Elena', rowNumber: statementRows.elenaContribution },
  ].map(item => ({ ...item, amount: annualRowValue(item.rowNumber) }));
  const annualJointSavings = annualRowValue(statementRows.jointSavings);
  const annualElenaSavings = annualRowValue(statementRows.elenaSavings);
  const annualElenaInvestment = annualRowValue(statementRows.elenaInvestment);
  const annualInvestment = rows.filter(item => item.rowNumber === statementRows.elenaInvestment || isInvestment(item)).reduce((total, item) => total + item.values.reduce((sum, value) => sum + value, 0), 0);
  const annualSavings = rows.filter(item => item.rowNumber === statementRows.elenaSavings || item.rowNumber === statementRows.jointSavings).reduce((total, item) => total + item.values.reduce((sum, value) => sum + value, 0), 0);
  const annualPercent = (value: number) => annualIncome ? value / annualIncome * 100 : 0;
  const monthlyChart = months.map((name, index) => ({
    name: name.slice(0, 3),
    ingresos: getValue(rows, 'income-total', index),
    gastos: getValue(rows, 'expense-total', index),
    ahorro: (rows.find(item => item.rowNumber === statementRows.elenaSavings)?.values[index] ?? 0) + (rows.find(item => item.rowNumber === statementRows.jointSavings)?.values[index] ?? 0),
  }));
  const yearlyChart = months.map((name, index) => ({
    name: name.slice(0, 3),
    ingresos: getValue(rows, 'income-total', index),
    gastos: getValue(rows, 'expense-total', index),
    ahorro: (rows.find(item => item.rowNumber === statementRows.elenaSavings)?.values[index] ?? 0) + (rows.find(item => item.rowNumber === statementRows.jointSavings)?.values[index] ?? 0),
    inversion: (rows.find(item => item.rowNumber === statementRows.elenaInvestment)?.values[index] ?? 0) + rows.filter(item => isInvestment(item) && item.rowNumber !== statementRows.elenaInvestment).reduce((sum, item) => sum + item.values[index], 0),
  }));
  const annualSpending = rows.filter(item => item.type === 'expense')
    .map((item, index) => ({ name: item.label, value: item.values.reduce((sum, amount) => sum + amount, 0), fill: colors[index % colors.length] }))
    .filter(item => item.value > 0)
    .sort((a, b) => b.value - a.value);
  const spending = rows.filter(item => item.type === 'expense' && (item.values[monthIndex] ?? 0) !== 0)
    .map((item, index) => ({ name: item.label, value: item.values[monthIndex], fill: colors[index % colors.length] }))
    .sort((a, b) => b.value - a.value);
  const pageTitle = view === 'resumen' ? 'Resumen mensual' : view === 'anual' ? 'Resumen anual' : view === 'ahorros' ? 'Ahorros' : 'Categorías';
  const totalSavings = savingsGroups.reduce((total, group) => total + group.total, 0);

  const categoryNames = Array.from(new Set(Object.values(rowsByYear).flatMap(yearRows => yearRows.filter(item => item.type === 'expense').map(item => item.label))));
  const activeCategory = categoryNames.includes(selectedCategory) ? selectedCategory : categoryNames[0] ?? '';
  const selectedYearRows = selectedYears.map(selectedYear => ({ year: selectedYear, rows: rowsByYear[selectedYear] })).filter((entry): entry is { year: number; rows: SheetRow[] } => Boolean(entry.rows));
  const categoryTotals = categoryNames.map((label, index) => ({
    label,
    color: colors[index % colors.length],
    byYear: selectedYearRows.map(entry => ({
      year: entry.year,
      amount: entry.rows.find(item => item.type === 'expense' && item.label === label)?.values.reduce((sum, value, month) => sum + (selectedMonths.includes(month) ? value : 0), 0) ?? 0,
    })),
  })).map(item => ({ ...item, total: item.byYear.reduce((sum, entry) => sum + entry.amount, 0) })).sort((a, b) => b.total - a.total);
  const categoryLineData = selectedMonths.map(month => {
    const point: Record<string, string | number> = { month: months[month].slice(0, 3) };
    selectedYearRows.forEach(entry => {
      point[String(entry.year)] = entry.rows.find(item => item.type === 'expense' && item.label === activeCategory)?.values[month] ?? 0;
    });
    return point;
  });

  async function loadYearData(requestedYear: number) {
    const payload = await fetchAppsScriptSheet(appsScriptUrl, requestedYear);
    if (payload.error) throw new Error(payload.error);
    const expectedSheet = `GASTOS ${requestedYear}`;
    if (payload.sheetName?.trim().toLocaleLowerCase('es') !== expectedSheet.toLocaleLowerCase('es')) {
      throw new Error(`La Web App no confirma la pestaña ${expectedSheet}; actualiza Code.gs y despliega una nueva versión.`);
    }
    if (!payload.values?.length) throw new Error(`La pestaña ${expectedSheet} no devolvió datos.`);
    return { parsed: parseSheet(payload.values), payload };
  }

  async function syncSheet(requestedYear = year) {
    if (!appsScriptUrl) return;
    setYear(requestedYear); setLoading(true); setStatus('');
    try {
      const { parsed, payload } = await loadYearData(requestedYear);
      setAvailableYears(payload.years ?? []);
      setRows(parsed);
      setRowsByYear(previous => ({ ...previous, [requestedYear]: parsed }));
      setSelectedYears(previous => previous.includes(requestedYear) ? previous : [...previous, requestedYear]);
      setStatus(`Actualizada desde ${payload.sheetName} · ${parsed.length} filas leídas.`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'No se pudo conectar con Google Sheets.';
      setStatus(reason);
      setRows([]);
    } finally { setLoading(false); }
  }

  async function syncSavings() {
    if (!appsScriptUrl) return;
    setLoading(true); setStatus('');
    try {
      const payload = await fetchAppsScriptSavings(appsScriptUrl);
      if (payload.error) {
        if (/año solicitado no es válido/i.test(payload.error)) throw new Error('La URL /exec apunta a una versión antigua de Apps Script que aún no reconoce la hoja AHORROS. Actualiza Code.gs y despliega una nueva versión.');
        throw new Error(payload.error);
      }
      if (payload.sheetName?.trim().toLocaleLowerCase('es') !== 'ahorros') throw new Error('La Web App no confirma la pestaña AHORROS. Actualiza Code.gs y despliega una nueva versión.');
      const groups = parseSavingsSheet(payload.values ?? []);
      setSavingsGroups(groups);
      setStatus(`Actualizado desde ${payload.sheetName}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'No se pudo leer AHORROS.');
      setSavingsGroups([]);
    } finally { setLoading(false); }
  }

  async function toggleYear(selectedYear: number) {
    if (selectedYears.includes(selectedYear)) {
      if (selectedYears.length > 1) setSelectedYears(previous => previous.filter(item => item !== selectedYear));
      return;
    }
    setSelectedYears(previous => [...previous, selectedYear].sort((a, b) => a - b));
    if (rowsByYear[selectedYear]) return;
    setLoading(true);
    try {
      const { parsed, payload } = await loadYearData(selectedYear);
      setRowsByYear(previous => ({ ...previous, [selectedYear]: parsed }));
      setAvailableYears(payload.years ?? availableYears);
      setStatus(`GASTOS ${selectedYear} cargado para comparar.`);
    } catch (error) {
      setSelectedYears(previous => previous.filter(item => item !== selectedYear));
      setStatus(error instanceof Error ? error.message : `No se pudo leer GASTOS ${selectedYear}.`);
    } finally { setLoading(false); }
  }

  function toggleMonth(month: number) {
    setSelectedMonths(previous => previous.includes(month)
      ? previous.length > 1 ? previous.filter(item => item !== month) : previous
      : [...previous, month].sort((a, b) => a - b));
  }

  function authorizeAppsScript() {
    if (!appsScriptUrl) return;
    const url = new URL(appsScriptUrl);
    url.searchParams.set('mode', 'authorize');
    url.searchParams.set('parentOrigin', window.location.origin);
    window.open(url.toString(), '_blank');
    setStatus('Completa el inicio de sesión y acepta el acceso de Apps Script en la pestaña nueva. Después vuelve aquí y carga la hoja.');
  }

  if (rows.length === 0) return <main className="google-gate">
    <section className="google-gate-panel">
      <a className="finance-brand gate-brand" href="#inicio"><span className="brand-symbol">f</span><span>Franela<small>FINANZAS DE CASA</small></span></a>
      <span className="overline">ACCESO PRIVADO</span>
      <h1>Inicia sesión<br/>para ver vuestras finanzas.</h1>
      <p>Conecta tu cuenta de Workspace para consultar la spreadsheet configurada. El acceso se limita a usuarios autorizados y solo lectura.</p>
      {availableYears.length > 0 && <label className="month-control gate-year"><span>HOJA</span><select aria-label="Año de gastos" value={year} onChange={event => setYear(Number(event.target.value))}>{availableYears.map(optionYear => <option key={optionYear} value={optionYear}>GASTOS {optionYear}</option>)}</select></label>}
      {appsScriptUrl && <button className="google-signin" onClick={authorizeAppsScript} disabled={loading}><span className="google-g">G</span>Autorizar con Google Workspace</button>}
      {!appsScriptUrl && <div className="setup-message" role="status"><strong>Falta desplegar Apps Script</strong><span>Despliega el script de la carpeta <code>apps-script</code> como Web App para tu organización y añade su URL `/exec` en <code>VITE_GOOGLE_APPS_SCRIPT_URL</code>.</span></div>}
      {appsScriptUrl && <button className="google-signin connect-sheet" onClick={() => void syncSheet()} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''}/>{loading ? 'Abriendo conexión segura…' : 'Cargar spreadsheet'}</button>}
      {status && <p className="login-status" role="alert">{status}</p>}
      <a className="gate-sheet-link" href={sheetUrl} target="_blank" rel="noreferrer">Spreadsheet configurada <ExternalLink size={13}/></a>
      <small className="privacy-caption">La hoja solo se lee con tu sesión de Google Workspace. Los datos se mantienen en memoria mientras usas el dashboard.</small>
    </section>
  </main>;

  return <div className="finance-app">
    <aside className="finance-sidebar">
      <a className="finance-brand" href="#resumen" onClick={() => setView('resumen')}><span className="brand-symbol">f</span><span>Franela<small>FINANZAS DE CASA</small></span></a>
      <span className="side-caption">TU ESPACIO</span>
      <nav className="finance-nav" aria-label="Navegación principal">
        <button className={view === 'resumen' ? 'selected' : ''} onClick={() => setView('resumen')}><LayoutDashboard size={18}/>Resumen mensual</button>
        <button className={view === 'anual' ? 'selected' : ''} onClick={() => setView('anual')}><ChartNoAxesCombined size={18}/>Resumen anual</button>
        <button className={view === 'categorias' ? 'selected' : ''} onClick={() => setView('categorias')}><ChartNoAxesCombined size={18}/>Categorías</button>
        <button className={view === 'ahorros' ? 'selected' : ''} onClick={() => { setView('ahorros'); if (!savingsGroups.length) void syncSavings(); }}><PiggyBank size={18}/>Ahorros</button>
      </nav>
      <div className="side-source"><span className={`source-led ${loading ? 'syncing' : status.includes('Actualizada') ? 'connected' : status ? 'disconnected' : ''}`}/><div><strong>Hoja financiera</strong><small>{loading ? 'Sincronizando…' : status.includes('Actualizada') ? 'Conectada a Google Sheets' : 'Datos en memoria de sesión'}</small></div></div>
    </aside>

    <main className="finance-main">
      <header className="finance-topbar"><span>Finanzas personales <span>/</span> {pageTitle}</span><span className="topbar-date">HOJA <strong>GASTOS {year}</strong></span></header>
      <div className={`finance-content ${view === 'ahorros' ? 'savings-page' : ''}`}>
        <section className="finance-heading">
          <div><span className="overline">FRANELA · CONTROL DEL HOGAR</span><h1>{pageTitle}</h1><p>{view === 'anual' ? `Totales y distribución de GASTOS ${year}.` : view === 'categorias' ? 'Compara el gasto por categoría y su evolución.' : 'Una lectura sencilla de vuestro dinero, mes a mes.'}</p></div>
          <div className="period-controls">
            <details className="multi-filter"><summary>{selectedYears.length} {selectedYears.length === 1 ? 'año' : 'años'}</summary><div className="multi-options" aria-label="Seleccionar hojas anuales">{Array.from(new Set([...availableYears, ...selectedYears])).sort((a, b) => a - b).map(optionYear => <label key={optionYear}><input type="checkbox" checked={selectedYears.includes(optionYear)} onChange={() => void toggleYear(optionYear)}/><span>GASTOS {optionYear}</span></label>)}</div></details>
            <details className="multi-filter"><summary>{selectedMonths.length === 12 ? 'Todos los meses' : `${selectedMonths.length} meses`}</summary><div className="multi-options month-options" aria-label="Seleccionar meses">{months.map((name, index) => <label key={name}><input type="checkbox" checked={selectedMonths.includes(index)} onChange={() => toggleMonth(index)}/><span>{name.charAt(0).toLocaleUpperCase('es') + name.slice(1)}</span></label>)}</div></details>
            {view !== 'categorias' && <label className="month-control"><span>MES</span><select aria-label="Mes del resumen" value={monthIndex} onChange={event => setMonthIndex(Number(event.target.value))}>{months.map((name, index) => <option key={name} value={index}>{name.charAt(0).toLocaleUpperCase('es') + name.slice(1)}</option>)}</select></label>}
          </div>
        </section>

        {view === 'ahorros' ? <>
          <section className="savings-content-grid savings-table-layout">
            <article className="finance-panel savings-breakdown"><div className="panel-title"><div><span className="overline">DISTRIBUCIÓN</span><h2>Saldo por titular</h2></div></div>{savingsGroups.length ? <div className="savings-donut"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={savingsGroups} dataKey="total" nameKey="name" innerRadius={65} outerRadius={96} paddingAngle={3} stroke="none">{savingsGroups.map((group, index) => <Cell key={group.name} fill={colors[index % colors.length]}/>)}</Pie><Tooltip formatter={value => money(Number(value))}/><Legend verticalAlign="bottom" iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 9 }}/></PieChart></ResponsiveContainer><div className="savings-donut-center"><strong>{money(totalSavings)}</strong><small>patrimonio total</small></div></div> : <div className="chart-empty">Cargando AHORROS…</div>}</article>
            <article className="finance-panel savings-sheet-panel"><div className="savings-sheet-heading"><div><span className="overline">AHORROS · RESUMEN DE POSICIONES</span><h2>Patrimonio total <strong>{money(totalSavings)}</strong></h2></div><button className="icon-btn" aria-label="Actualizar ahorros" title="Actualizar ahorros" onClick={() => void syncSavings()} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''}/></button></div>{savingsGroups.length ? <div className="savings-table-wrap"><table className="savings-table"><thead><tr><th>Titular</th><th className="savings-amount">Saldo total</th><th>Cuenta / activo</th><th className="savings-amount">Importe</th></tr></thead><tbody>{savingsGroups.flatMap(group => group.positions.map((position, positionIndex) => <tr className={positionIndex === 0 ? 'savings-first-position' : ''} key={`${group.name}-${position.name}-${positionIndex}`}><td>{positionIndex === 0 ? <strong>{group.name}</strong> : null}</td><td className="savings-amount">{positionIndex === 0 ? <strong>{money(group.total)}</strong> : null}</td><td>{position.name}</td><td className="savings-amount">{money(position.amount)}</td></tr>))}</tbody><tfoot><tr><th>Total</th><th className="savings-amount">{money(totalSavings)}</th><td colSpan={2}/></tr></tfoot></table></div> : <div className="chart-empty">No hay posiciones para mostrar.</div>}</article>
          </section>
          {status && <p className={status.startsWith('Actualizado') ? 'import-status success' : 'import-status'} role="status">{status}</p>}
        </> : view === 'categorias' ? <>
          <section className="category-kpi-grid" aria-label="Gasto por categoría en los meses seleccionados">
            {categoryTotals.filter(item => item.total !== 0).map(item => <article className="category-kpi" key={item.label} style={{ '--category-color': item.color } as CSSProperties}>
              <div className="category-kpi-heading"><i/><strong>{item.label}</strong></div>
              <b>{money(item.total)}</b>
              <small>{selectedMonths.length === 12 ? 'Año completo' : `${selectedMonths.length} meses seleccionados`}</small>
              <div className="category-year-values">{item.byYear.map(entry => <span key={entry.year}>{entry.year} <strong>{money(entry.amount)}</strong></span>)}</div>
            </article>)}
            {categoryTotals.every(item => item.total === 0) && <div className="finance-panel category-empty">Carga las hojas de los años que quieres comparar para ver sus categorías.</div>}
          </section>
          <section className="finance-panel category-trend-panel">
            <div className="panel-title category-trend-heading"><div><span className="overline">COMPARATIVA MENSUAL · {selectedYears.slice().sort().join(' / ')}</span><h2>Evolución por categoría</h2></div><label className="category-select"><span>CATEGORÍA</span><select aria-label="Categoría a comparar" value={activeCategory} onChange={event => setSelectedCategory(event.target.value)}>{categoryNames.map(category => <option key={category} value={category}>{category}</option>)}</select></label></div>
            {activeCategory && selectedYearRows.length ? <div className="category-line-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={categoryLineData} margin={{ top: 12, right: 12, left: -12, bottom: 0 }}><CartesianGrid vertical={false} stroke="#e9eee9"/><XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: '#82918a', fontSize: 11 }}/><YAxis tickLine={false} axisLine={false} tick={{ fill: '#82918a', fontSize: 10 }} tickFormatter={value => `${Math.round(Number(value))} €`}/><Tooltip formatter={value => money(Number(value))}/><Legend verticalAlign="top" align="right" iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10, paddingBottom: 12 }}/>{selectedYearRows.map((entry, index) => <Line key={entry.year} type="monotone" dataKey={String(entry.year)} name={`GASTOS ${entry.year}`} stroke={colors[(index + 2) % colors.length]} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }}/>)}</LineChart></ResponsiveContainer></div> : <div className="chart-empty">Selecciona al menos una hoja anual con datos.</div>}
            <p className="chart-caption">El gráfico muestra solo los meses seleccionados arriba. Marca varios años para comparar sus líneas.</p>
          </section>
        </> : view === 'anual' ? <>
          <section className="finance-kpis monthly-kpis annual-kpis" aria-label={`Totales anuales de ${year}`}>
            <article className="kpi kpi-income kpi-income-breakdown"><div className="kpi-label"><span>Ingresos totales</span><TrendingUp size={17}/></div><strong>{money(annualIncome)}</strong><div className="income-sub-kpis">{annualIncomeContributions.map(item => <div key={item.rowNumber}><span>{item.label}</span><b>{money(item.amount)}</b></div>)}</div></article>
            <article className="kpi kpi-expense"><div className="kpi-label"><span>Gastos anuales</span><TrendingDown size={17}/></div><strong>{money(annualExpenses)}</strong><small>Total de enero a diciembre</small></article>
            <article className="kpi kpi-saving kpi-savings-breakdown"><div className="kpi-label"><span>Ahorro conjunto</span><PiggyBank size={17}/></div><strong>{money(annualJointSavings)}</strong><div className="savings-sub-kpis"><div><span>Ahorro Elena</span><b>{money(annualElenaSavings)}</b></div><div><span>Inversión Elena</span><b>{money(annualElenaInvestment)}</b></div></div></article>
          </section>
          <section className="chart-layout annual-layout">
            <article className="finance-panel trend-panel"><div className="panel-title"><div><span className="overline">GASTOS {year} · EVOLUCIÓN</span><h2>Flujo anual por mes</h2></div><span className="legend-chip"><i/> EUR</span></div><div className="annual-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={yearlyChart} margin={{ top: 12, right: 8, left: -12, bottom: 0 }} barGap={3}><CartesianGrid vertical={false} stroke="#e9eee9"/><XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: '#82918a', fontSize: 11 }}/><YAxis tickLine={false} axisLine={false} tick={{ fill: '#82918a', fontSize: 10 }} tickFormatter={value => `${Math.round(Number(value) / 1000)}k`}/><Tooltip formatter={value => money(Number(value))}/><Legend verticalAlign="top" align="right" iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10, paddingBottom: 12 }}/><Bar dataKey="ingresos" name="Ingresos" fill="#187c68" radius={[3, 3, 0, 0]} maxBarSize={20}/><Bar dataKey="gastos" name="Gastos" fill="#e6a751" radius={[3, 3, 0, 0]} maxBarSize={20}/><Bar dataKey="ahorro" name="Ahorro" fill="#8195bd" radius={[3, 3, 0, 0]} maxBarSize={20}/><Bar dataKey="inversion" name="Inversión" fill="#9b79a7" radius={[3, 3, 0, 0]} maxBarSize={20}/></BarChart></ResponsiveContainer></div><p className="chart-caption">Porcentajes calculados sobre el total ingresado en el año.</p></article>
            <article className="finance-panel category-panel"><div className="panel-title"><div><span className="overline">GASTOS {year} · CATEGORÍAS</span><h2>En qué se gastó</h2></div></div>{annualSpending.length ? <><div className="donut-chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={annualSpending.slice(0, 7)} dataKey="value" nameKey="name" innerRadius={58} outerRadius={83} paddingAngle={2} stroke="none">{annualSpending.slice(0, 7).map(item => <Cell key={item.name} fill={item.fill}/>)}</Pie><Tooltip formatter={value => money(Number(value))}/></PieChart></ResponsiveContainer><div className="donut-center"><strong>{money(annualExpenses)}</strong><small>gasto anual</small></div></div><div className="category-legend">{annualSpending.slice(0, 5).map(item => <div key={item.name}><span><i style={{ background: item.fill }}/>{item.name}</span><strong>{money(item.value)}</strong></div>)}</div></> : <div className="chart-empty">Sin gastos registrados este año.</div>}</article>
          </section>
          <section className="finance-panel annual-summary-panel"><div className="panel-title"><div><span className="overline">DISTRIBUCIÓN DE INGRESOS</span><h2>Porcentajes anuales</h2></div></div><div className="annual-percentage-list">{[{ label: 'Invertido', amount: annualInvestment, tone: 'investment' }, { label: 'Ahorrado', amount: annualSavings, tone: 'saving' }, { label: 'Gastado', amount: annualExpenses, tone: 'expense' }].map(item => <div className="annual-percentage-row" key={item.label}><div className="annual-percentage-label"><strong>{item.label}</strong><span>{money(item.amount)} · {annualPercent(item.amount).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%</span></div><div className="progress"><div className={`annual-progress-fill ${item.tone}`} style={{ width: `${Math.min(100, Math.abs(annualPercent(item.amount)))}%` }}/></div></div>)}</div><p className="chart-caption">“Invertido” suma las filas cuyo concepto contiene inversión/invertido. El resto de filas de ahorro se contabiliza como ahorro.</p></section>
        </> : <>
          <section className="finance-kpis monthly-kpis" aria-label="Indicadores del mes">
            <article className="kpi kpi-income kpi-income-breakdown"><div className="kpi-label"><span>Ingresos totales</span><TrendingUp size={17}/></div><strong>{money(income)}</strong><div className="income-sub-kpis">{incomeContributions.map(item => <div key={item.rowNumber}><span>{item.label}</span><b>{money(item.amount)}</b></div>)}</div></article>
            <article className="kpi kpi-expense"><div className="kpi-label"><span>Gastos</span><TrendingDown size={17}/></div><strong>{money(expenses)}</strong><small>Gasto total registrado</small></article>
            <article className="kpi kpi-saving kpi-savings-breakdown"><div className="kpi-label"><span>Ahorro conjunto</span><PiggyBank size={17}/></div><strong className={savings < 0 ? 'negative' : ''}>{money(savings)}</strong><div className="savings-sub-kpis"><div><span>Ahorro Elena</span><b>{money(elenaSavings)}</b></div><div><span>Inversión Elena</span><b>{money(elenaInvestment)}</b></div></div></article>
          </section>

          <section className="chart-layout">
            <article className="finance-panel trend-panel"><div className="panel-title"><div><span className="overline">VISTA ANUAL</span><h2>Ingresos, gastos y ahorro</h2></div><span className="legend-chip"><i/> EUR</span></div><div className="annual-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={monthlyChart} margin={{ top: 12, right: 8, left: -12, bottom: 0 }} barGap={4}><CartesianGrid vertical={false} stroke="#e9eee9"/><XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: '#82918a', fontSize: 11 }}/><YAxis tickLine={false} axisLine={false} tick={{ fill: '#82918a', fontSize: 10 }} tickFormatter={value => `${Math.round(Number(value) / 1000)}k`}/><Tooltip formatter={value => money(Number(value))} contentStyle={{ border: '1px solid #e5ebe5', borderRadius: 8, fontSize: 12 }}/><Legend verticalAlign="top" align="right" iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingBottom: 12 }}/><Bar dataKey="ingresos" name="Ingresos" fill="#187c68" radius={[3, 3, 0, 0]} maxBarSize={24}/><Bar dataKey="gastos" name="Gastos" fill="#e6a751" radius={[3, 3, 0, 0]} maxBarSize={24}/><Bar dataKey="ahorro" name="Ahorrado" fill="#8195bd" radius={[3, 3, 0, 0]} maxBarSize={24}/></BarChart></ResponsiveContainer></div><p className="chart-caption">El ahorro incluye el ahorro conjunto y el ahorro personal.</p></article>
            <article className="finance-panel category-panel"><div className="panel-title"><div><span className="overline">{months[monthIndex].toLocaleUpperCase('es')} · DISTRIBUCIÓN</span><h2>¿A dónde va?</h2></div></div>{spending.length ? <><div className="donut-chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={spending.slice(0, 7)} dataKey="value" nameKey="name" innerRadius={58} outerRadius={83} paddingAngle={2} stroke="none">{spending.slice(0, 7).map(item => <Cell key={item.name} fill={item.fill}/>)}</Pie><Tooltip formatter={value => money(Number(value))}/></PieChart></ResponsiveContainer><div className="donut-center"><strong>{money(expenses)}</strong><small>total gastos</small></div></div><div className="category-legend">{spending.slice(0, 5).map(item => <div key={item.name}><span><i style={{ background: item.fill }}/>{item.name}</span><strong>{money(item.value)}</strong></div>)}</div></> : <div className="chart-empty">Sin gastos para este mes.</div>}</article>
          </section>

        </>}
        <footer className="finance-footer"><span>Franela <i/> Apps Script · {rows.length} filas</span><button onClick={() => void syncSheet()} disabled={loading}><RefreshCw size={13} className={loading ? 'spin' : ''}/>{loading ? 'Actualizando' : 'Actualizar hoja'}</button></footer>
      </div>
    </main>
  </div>;
}