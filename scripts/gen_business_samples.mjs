import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function splitCsvLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur.trim());
  return result;
}

async function genSamples() {
  const retailPath = path.join(ROOT, 'samples', 'business', 'du-lieu-test-ban-le.csv');
  const rawRetailCsv = fs.readFileSync(retailPath, 'utf8');

  // 1. file-mau-kinh-doanh-co-loi.csv (the real retail test file with intentional dirt)
  const coLoiPath = path.join(ROOT, 'public', 'samples', 'file-mau-kinh-doanh-co-loi.csv');
  fs.writeFileSync(coLoiPath, rawRetailCsv, 'utf8');
  console.log('✓ Generated file-mau-kinh-doanh-co-loi.csv');

  // 2. Strip UTF-8 BOM if present
  const cleanText = rawRetailCsv.replace(/^\uFEFF/, '');
  const lines = cleanText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rawHeader = lines[0];
  const headerCells = splitCsvLine(rawHeader).map((c) => c.replace(/^"|"$/g, '').trim());

  const seenIds = new Set();
  const cleanRows = [];

  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i];
    const unquoted = splitCsvLine(rawLine).map((c) => c.replace(/^"|"$/g, '').trim());
    const id = unquoted[0];
    if (!id || unquoted.every((c) => !c)) continue; // Bỏ qua dòng trống hoàn toàn
    if (seenIds.has(id)) continue;
    if (!unquoted[3]) unquoted[3] = 'Miền Bắc';
    if (!unquoted[4]) unquoted[4] = 'Áo thun';
    seenIds.add(id);
    cleanRows.push(unquoted);
    if (cleanRows.length >= 47) break;
  }

  const cleanCsvLines = [
    headerCells.map((c) => '"' + c + '"').join(','),
    ...cleanRows.map((r) => r.map((c) => '"' + c + '"').join(',')),
  ];
  const cleanCsvText = cleanCsvLines.join('\r\n');
  const cleanCsvPath = path.join(ROOT, 'public', 'samples', 'file-mau-kinh-doanh.csv');
  fs.writeFileSync(cleanCsvPath, '\uFEFF' + cleanCsvText, 'utf8');
  console.log('✓ Generated file-mau-kinh-doanh.csv with', cleanRows.length, 'rows and', headerCells.length, 'columns');

  // 3. file-mau-kinh-doanh.xlsx
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('DuLieu');
  ws.addRow(headerCells);
  for (const r of cleanRows) {
    const formattedRow = r.map((c, idx) => {
      if (idx >= 5) {
        const n = parseInt(c, 10);
        return isNaN(n) ? c : n;
      }
      return c;
    });
    ws.addRow(formattedRow);
  }
  const cleanXlsxPath = path.join(ROOT, 'public', 'samples', 'file-mau-kinh-doanh.xlsx');
  await wb.xlsx.writeFile(cleanXlsxPath);
  console.log('✓ Generated file-mau-kinh-doanh.xlsx');

  // Also ensure file-mau-co-loi.csv exists for trading
  const tradingBadPath = path.join(ROOT, 'public', 'samples', 'file-mau-co-loi.csv');
  if (!fs.existsSync(tradingBadPath)) {
    const sourceBad = fs.readFileSync(path.join(ROOT, 'samples', 'test-cases', 'TC22_dong_trong_o_giua.csv'), 'utf8');
    fs.writeFileSync(tradingBadPath, sourceBad, 'utf8');
    console.log('✓ Generated file-mau-co-loi.csv');
  }
}

genSamples().catch(console.error);
