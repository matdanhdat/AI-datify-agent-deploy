/**
 * Script to generate standard sample files and 34 validation test case files
 * with MANIFEST.json for Pixel Trading Agent.
 * Run via: node scripts/gen_samples.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import * as fflate from 'fflate';

const ROOT_DIR = process.cwd();
const SAMPLES_DIR = path.join(ROOT_DIR, 'public', 'samples');
const TEST_CASES_DIR = path.join(ROOT_DIR, 'samples', 'test-cases');

fs.mkdirSync(SAMPLES_DIR, { recursive: true });
fs.mkdirSync(TEST_CASES_DIR, { recursive: true });

// Seeded pseudo-random generator (mulberry32)
function createRng(seed = 42) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates trading dates for 2025 excluding weekends (Saturdays and Sundays).
 */
function generateTradingDates(count = 250) {
  const dates = [];
  const cur = new Date('2025-01-02T00:00:00Z');
  while (dates.length < count) {
    const day = cur.getUTCDay();
    if (day !== 0 && day !== 6) {
      // Format YYYY-MM-DD
      const iso = cur.toISOString().slice(0, 10);
      dates.push(iso);
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

/**
 * Generates synthetic OHLCV data using a geometric random walk.
 */
function generateOhlcvRows(symbolsConfig, tradingDates, seed = 12345) {
  const rng = createRng(seed);
  const rows = [];

  for (const { symbol, basePrice } of symbolsConfig) {
    let currentPrice = basePrice;

    for (const date of tradingDates) {
      // Daily return between -2.5% and +2.5%
      const ret = (rng() - 0.49) * 0.05;
      const open = Math.round(currentPrice * (1 + (rng() - 0.5) * 0.01) * 100) / 100;
      const close = Math.round(open * (1 + ret) * 100) / 100;

      const upper = Math.max(open, close);
      const lower = Math.min(open, close);

      const high = Math.round((upper + rng() * upper * 0.015) * 100) / 100;
      const low = Math.round(Math.max(0.1, lower - rng() * lower * 0.015) * 100) / 100;

      const volume = Math.floor(100000 + rng() * 1500000);
      const tradeValue = Math.round(volume * close);

      rows.push({
        date,
        symbol,
        open,
        high,
        low,
        close,
        volume,
        tradeValue,
      });

      currentPrice = close;
    }
  }

  // Sort chronologically then by symbol
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.symbol.localeCompare(b.symbol));
  return rows;
}

async function generateStandardFiles() {
  console.log('Generating public/samples/file-mau-chuan.xlsx and .csv ...');

  const symbols = [
    { symbol: 'TMA', basePrice: 52.0 },
    { symbol: 'TMB', basePrice: 88.0 },
    { symbol: 'TMC', basePrice: 24.5 },
  ];
  const dates = generateTradingDates(250);
  const rows = generateOhlcvRows(symbols, dates, 42);

  // 1. Generate Excel
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Pixel Trading Agent';
  wb.created = new Date();

  // Sheet 1: DuLieu
  const wsData = wb.addWorksheet('DuLieu');
  wsData.columns = [
    { header: 'Ngay', key: 'date', width: 14 },
    { header: 'Ma', key: 'symbol', width: 10 },
    { header: 'Mo', key: 'open', width: 12 },
    { header: 'Cao', key: 'high', width: 12 },
    { header: 'Thap', key: 'low', width: 12 },
    { header: 'Dong', key: 'close', width: 12 },
    { header: 'KhoiLuong', key: 'volume', width: 16 },
    { header: 'GiaTriGiaoDich', key: 'tradeValue', width: 18 },
  ];

  // Header style: Navy background, bold white text
  const headerRow = wsData.getRow(1);
  headerRow.height = 26;
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1D4E89' }, // Navy blue
    };
    cell.font = {
      name: 'Arial',
      size: 11,
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  for (const r of rows) {
    wsData.addRow({
      date: r.date,
      symbol: r.symbol,
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      volume: r.volume,
      tradeValue: r.tradeValue,
    });
  }

  // Format numbers
  for (let i = 2; i <= rows.length + 1; i++) {
    const row = wsData.getRow(i);
    row.getCell('open').numFmt = '#,##0.00';
    row.getCell('high').numFmt = '#,##0.00';
    row.getCell('low').numFmt = '#,##0.00';
    row.getCell('close').numFmt = '#,##0.00';
    row.getCell('volume').numFmt = '#,##0';
    row.getCell('tradeValue').numFmt = '#,##0';
  }

  // Sheet 2: HuongDan
  const wsGuide = wb.addWorksheet('HuongDan');
  wsGuide.columns = [
    { header: 'STT', key: 'idx', width: 6 },
    { header: 'Tên Cột', key: 'name', width: 18 },
    { header: 'Bắt Buộc', key: 'req', width: 14 },
    { header: 'Kiểu Dữ Liệu', key: 'type', width: 16 },
    { header: 'Mô Tả & Lưu Ý', key: 'desc', width: 45 },
  ];

  const guideHeader = wsGuide.getRow(1);
  guideHeader.height = 24;
  guideHeader.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2D3748' },
    };
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  const guideItems = [
    { idx: 1, name: 'Ngay', req: 'Bắt buộc', type: 'Ngày (YYYY-MM-DD)', desc: 'Ngày giao dịch, sắp xếp theo thời gian' },
    { idx: 2, name: 'Ma', req: 'Bắt buộc', type: 'Chuỗi (text)', desc: 'Mã cổ phiếu (1-12 ký tự: chữ hoa, số)' },
    { idx: 3, name: 'Mo', req: 'Bắt buộc', type: 'Số dương', desc: 'Giá mở cửa phiên' },
    { idx: 4, name: 'Cao', req: 'Bắt buộc', type: 'Số dương', desc: 'Giá cao nhất phiên (Cao >= Thap, Mo, Dong)' },
    { idx: 5, name: 'Thap', req: 'Bắt buộc', type: 'Số dương', desc: 'Giá thấp nhất phiên (Thap <= Mo, Dong, Cao)' },
    { idx: 6, name: 'Dong', req: 'Bắt buộc', type: 'Số dương', desc: 'Giá đóng cửa phiên' },
    { idx: 7, name: 'KhoiLuong', req: 'Bắt buộc', type: 'Số không âm', desc: 'Khối lượng giao dịch khớp lệnh' },
    { idx: 8, name: 'GiaTriGiaoDich', req: 'Tùy chọn', type: 'Số không âm', desc: 'Tổng giá trị giao dịch trong phiên' },
  ];

  for (const item of guideItems) {
    wsGuide.addRow(item);
  }

  wsGuide.addRow({});
  const noteRow = wsGuide.addRow({
    idx: '',
    name: 'LƯU Ý',
    req: '',
    type: '',
    desc: 'Dữ liệu mô phỏng, không phải dữ liệu thị trường thật. Dùng để thử nghiệm các tính năng của Pixel Trading Agent.',
  });
  noteRow.font = { name: 'Arial', size: 10, italic: true, bold: true, color: { argb: 'FFB8470F' } };

  const xlsxPath = path.join(SAMPLES_DIR, 'file-mau-chuan.xlsx');
  await wb.xlsx.writeFile(xlsxPath);

  // 2. Generate CSV (UTF-8 BOM)
  const csvHeaders = ['Ngay', 'Ma', 'Mo', 'Cao', 'Thap', 'Dong', 'KhoiLuong', 'GiaTriGiaoDich'];
  const csvLines = ['\uFEFF' + csvHeaders.join(',')];
  for (const r of rows) {
    csvLines.push(`${r.date},${r.symbol},${r.open},${r.high},${r.low},${r.close},${r.volume},${r.tradeValue}`);
  }
  const csvPath = path.join(SAMPLES_DIR, 'file-mau-chuan.csv');
  fs.writeFileSync(csvPath, csvLines.join('\r\n'), 'utf8');

  console.log(`Standard files generated: ${rows.length} rows (${symbols.length} symbols, ${dates.length} sessions).`);
}

async function generateTestCases() {
  console.log('Generating 34 test cases in samples/test-cases/ ...');
  const manifest = [];

  const baseDates = generateTradingDates(35);
  const baseRows = generateOhlcvRows([{ symbol: 'TMA', basePrice: 50.0 }], baseDates, 99);

  function writeCsv(filename, lines, encoding = 'utf8', prependBom = false) {
    const fullPath = path.join(TEST_CASES_DIR, filename);
    const content = (prependBom ? '\uFEFF' : '') + lines.join('\r\n');
    fs.writeFileSync(fullPath, content, encoding);
  }

  async function writeXlsx(filename, sheetName, columns, dataRows) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(sheetName);
    ws.columns = columns.map((col) => (typeof col === 'string' ? { header: col, key: col } : col));
    for (const r of dataRows) {
      ws.addRow(r);
    }
    const fullPath = path.join(TEST_CASES_DIR, filename);
    await wb.xlsx.writeFile(fullPath);
  }

  // --- REJECTIONS (TC01 - TC22) ---

  // TC01: 0 byte empty file
  fs.writeFileSync(path.join(TEST_CASES_DIR, 'TC01_file_rong.csv'), Buffer.alloc(0));
  manifest.push({
    id: 'TC01',
    filename: 'TC01_file_rong.csv',
    description: 'Tệp rỗng 0 bytes',
    expected_ok: false,
    expected_code: 'UPLOAD_EMPTY',
  });

  // TC02: Wrong file extension
  fs.writeFileSync(
    path.join(TEST_CASES_DIR, 'TC02_duoi_sai.txt'),
    'Day la file van ban txt khong duoc he thong chap nhan.'
  );
  manifest.push({
    id: 'TC02',
    filename: 'TC02_duoi_sai.txt',
    description: 'Tệp có phần mở rộng sai (.txt)',
    expected_ok: false,
    expected_code: 'UPLOAD_EXTENSION_UNSUPPORTED',
  });

  // TC03: Zip bomb > 200MB uncompressed
  const zipFiles = {};
  for (let i = 0; i < 210; i++) {
    zipFiles[`dummy_${i}.bin`] = new Uint8Array(1000000); // 210 MB total
  }
  const zipBombBuffer = fflate.zipSync(zipFiles);
  fs.writeFileSync(path.join(TEST_CASES_DIR, 'TC03_zip_bomb.xlsx'), zipBombBuffer);
  manifest.push({
    id: 'TC03',
    filename: 'TC03_zip_bomb.xlsx',
    description: 'Tệp nén zip bomb có kích thước giải nén > 200 MB',
    expected_ok: false,
    expected_code: 'UPLOAD_CORRUPT',
  });

  // TC04: Fake PNG renamed to .xlsx
  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
  fs.writeFileSync(path.join(TEST_CASES_DIR, 'TC04_file_fake_png.xlsx'), pngHeader);
  manifest.push({
    id: 'TC04',
    filename: 'TC04_file_fake_png.xlsx',
    description: 'Ảnh PNG đổi tên thành đuôi .xlsx',
    expected_ok: false,
    expected_code: 'UPLOAD_CONTENT_MISMATCH',
  });

  // TC05: Fake PDF renamed to .csv
  const pdfHeader = Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n');
  fs.writeFileSync(path.join(TEST_CASES_DIR, 'TC05_file_fake_pdf.csv'), pdfHeader);
  manifest.push({
    id: 'TC05',
    filename: 'TC05_file_fake_pdf.csv',
    description: 'Tài liệu PDF đổi tên thành đuôi .csv',
    expected_ok: false,
    expected_code: 'UPLOAD_CONTENT_MISMATCH',
  });

  // TC06: Missing sheet DuLieu (has Sheet1 with no valid trading headers)
  await writeXlsx('TC06_xlsx_mat_sheet_DuLieu.xlsx', 'ThongTinChung', ['TieuDe', 'GhiChu'], [
    { TieuDe: 'Bao Cao Cong Ty', GhiChu: 'Khong co du lieu giao dich o day' },
  ]);
  manifest.push({
    id: 'TC06',
    filename: 'TC06_xlsx_mat_sheet_DuLieu.xlsx',
    description: 'Không có sheet DuLieu và sheet mặc định không có cột dữ liệu',
    expected_ok: false,
    expected_code: 'UPLOAD_NO_HEADER',
  });

  // TC07: CSV missing required column Close/Dong
  const csvNoClose = ['Ngay,Ma,Mo,Cao,Thap,KhoiLuong'];
  for (const r of baseRows) {
    csvNoClose.push(`${r.date},${r.symbol},${r.open},${r.high},${r.low},${r.volume}`);
  }
  writeCsv('TC07_csv_thieu_cot_bat_buoc.csv', csvNoClose);
  manifest.push({
    id: 'TC07',
    filename: 'TC07_csv_thieu_cot_bat_buoc.csv',
    description: 'Thiếu cột bắt buộc Dong (Close)',
    expected_ok: false,
    expected_code: 'SCHEMA_MISSING_COLUMN',
  });

  // TC08: Duplicate column in Excel
  const wbDup = new ExcelJS.Workbook();
  const wsDup = wbDup.addWorksheet('DuLieu');
  wsDup.addRow(['Ngay', 'Ma', 'Mo', 'Cao', 'Thap', 'Dong', 'Dong', 'KhoiLuong']);
  wsDup.addRow(['2025-01-02', 'TMA', 50, 52, 49, 51, 51, 100000]);
  await wbDup.xlsx.writeFile(path.join(TEST_CASES_DIR, 'TC08_trung_lap_cot.xlsx'));
  manifest.push({
    id: 'TC08',
    filename: 'TC08_trung_lap_cot.xlsx',
    description: 'Trùng lặp cột trong bảng tính (hai cột Dong)',
    expected_ok: false,
    expected_code: 'SCHEMA_DUPLICATE_COLUMN',
  });

  // TC09: No header in first 10 rows
  const noHeaderRows = [];
  for (let i = 1; i <= 15; i++) {
    noHeaderRows.push(`${i},${i * 2},${i * 3},${i * 4},${i * 5},${i * 6}`);
  }
  writeCsv('TC09_khong_tim_thay_header.csv', noHeaderRows);
  manifest.push({
    id: 'TC09',
    filename: 'TC09_khong_tim_thay_header.csv',
    description: 'Không tìm thấy dòng tiêu đề trong 10 dòng đầu',
    expected_ok: false,
    expected_code: 'UPLOAD_NO_HEADER',
  });

  // TC10: Invalid symbol format
  const badSymRows = ['Ngay,Ma,Mo,Cao,Thap,Dong,KhoiLuong'];
  for (let i = 0; i < baseRows.length; i++) {
    const sym = i === 5 ? 'TMA#$@%' : 'TMA';
    const r = baseRows[i];
    badSymRows.push(`${r.date},${sym},${r.open},${r.high},${r.low},${r.close},${r.volume}`);
  }
  writeCsv('TC10_ma_sai_dinh_dang.csv', badSymRows);
  manifest.push({
    id: 'TC10',
    filename: 'TC10_ma_sai_dinh_dang.csv',
    description: 'Mã chứng khoán chứa ký tự không hợp lệ (TMA#$@%)',
    expected_ok: false,
    expected_code: 'DATA_BAD_SYMBOL',
  });

  // TC11: Negative price
  const negPriceRows = ['Ngay,Ma,Mo,Cao,Thap,Dong,KhoiLuong'];
  for (let i = 0; i < baseRows.length; i++) {
    const r = baseRows[i];
    const low = i === 10 ? -10.5 : r.low;
    negPriceRows.push(`${r.date},${r.symbol},${r.open},${r.high},${low},${r.close},${r.volume}`);
  }
  writeCsv('TC11_gia_am.csv', negPriceRows);
  manifest.push({
    id: 'TC11',
    filename: 'TC11_gia_am.csv',
    description: 'Giá thấp nhất bị âm (-10.5)',
    expected_ok: false,
    expected_code: 'DATA_NONPOSITIVE_PRICE',
  });

  // TC12: Negative volume
  const negVolRows = baseRows.map((r, idx) => ({
    ...r,
    volume: idx === 12 ? -500 : r.volume,
  }));
  await writeXlsx(
    'TC12_khoi_luong_am.xlsx',
    'DuLieu',
    ['Ngay', 'Ma', 'Mo', 'Cao', 'Thap', 'Dong', 'KhoiLuong'],
    negVolRows.map((r) => [r.date, r.symbol, r.open, r.high, r.low, r.close, r.volume])
  );
  manifest.push({
    id: 'TC12',
    filename: 'TC12_khoi_luong_am.xlsx',
    description: 'Khối lượng giao dịch bị âm (-500)',
    expected_ok: false,
    expected_code: 'DATA_NEGATIVE_VOLUME',
  });

  // TC13: Inconsistent OHLC (High < Low)
  const ohlcBadRows = ['Ngay,Ma,Mo,Cao,Thap,Dong,KhoiLuong'];
  for (let i = 0; i < baseRows.length; i++) {
    const r = baseRows[i];
    const high = i === 7 ? 40.0 : r.high;
    const low = i === 7 ? 55.0 : r.low;
    ohlcBadRows.push(`${r.date},${r.symbol},${r.open},${high},${low},${r.close},${r.volume}`);
  }
  writeCsv('TC13_ohlc_khong_hop_ly.csv', ohlcBadRows);
  manifest.push({
    id: 'TC13',
    filename: 'TC13_ohlc_khong_hop_ly.csv',
    description: 'Giá cao nhất nhỏ hơn giá thấp nhất (High < Low)',
    expected_ok: false,
    expected_code: 'DATA_OHLC_INCONSISTENT',
  });

  // TC14: Invalid date format
  const badDateRows = ['Ngay,Ma,Mo,Cao,Thap,Dong,KhoiLuong'];
  for (let i = 0; i < baseRows.length; i++) {
    const r = baseRows[i];
    const date = i === 8 ? '32/13/2025' : r.date;
    badDateRows.push(`${date},${r.symbol},${r.open},${r.high},${r.low},${r.close},${r.volume}`);
  }
  writeCsv('TC14_ngay_sai_dinh_dang.csv', badDateRows);
  manifest.push({
    id: 'TC14',
    filename: 'TC14_ngay_sai_dinh_dang.csv',
    description: 'Ngày sai định dạng (32/13/2025)',
    expected_ok: false,
    expected_code: 'DATA_BAD_DATE',
  });

  // TC15: Future date (2099-01-01)
  const futureRows = baseRows.map((r, idx) => ({
    ...r,
    date: idx === 15 ? '2099-01-01' : r.date,
  }));
  await writeXlsx(
    'TC15_ngay_tuong_lai.xlsx',
    'DuLieu',
    ['Ngay', 'Ma', 'Mo', 'Cao', 'Thap', 'Dong', 'KhoiLuong'],
    futureRows.map((r) => [r.date, r.symbol, r.open, r.high, r.low, r.close, r.volume])
  );
  manifest.push({
    id: 'TC15',
    filename: 'TC15_ngay_tuong_lai.xlsx',
    description: 'Ngày giao dịch trong tương lai (2099-01-01)',
    expected_ok: true,
    expected_warning: 'DATA_FUTURE_DATE',
  });

  // TC16: Conflicting duplicate (same symbol + date, different prices)
  const conflictRows = ['Ngay,Ma,Mo,Cao,Thap,Dong,KhoiLuong'];
  for (const r of baseRows) {
    conflictRows.push(`${r.date},${r.symbol},${r.open},${r.high},${r.low},${r.close},${r.volume}`);
  }
  // Inject conflict
  const dupTarget = baseRows[5];
  conflictRows.push(
    `${dupTarget.date},${dupTarget.symbol},${dupTarget.open + 5},${dupTarget.high + 5},${dupTarget.low + 5},${dupTarget.close + 5},${dupTarget.volume}`
  );
  writeCsv('TC16_trung_lap_xung_dot.csv', conflictRows);
  manifest.push({
    id: 'TC16',
    filename: 'TC16_trung_lap_xung_dot.csv',
    description: 'Trùng lặp xung đột (cùng ngày cùng mã nhưng khác giá)',
    expected_ok: false,
    expected_code: 'DATA_CONFLICT_DUPLICATE',
  });

  // TC17: Mixed decimal formats in same price column (12.5 and 12,5)
  const mixedDecRows = ['Ngay,Ma,Mo,Cao,Thap,Dong,KhoiLuong'];
  for (let i = 0; i < baseRows.length; i++) {
    const r = baseRows[i];
    const openStr = i % 2 === 0 ? String(r.open) : String(r.open).replace('.', ',');
    mixedDecRows.push(`${r.date},${r.symbol},"${openStr}",${r.high},${r.low},${r.close},${r.volume}`);
  }
  writeCsv('TC17_hon_hop_dau_thap_phan.csv', mixedDecRows);
  manifest.push({
    id: 'TC17',
    filename: 'TC17_hon_hop_dau_thap_phan.csv',
    description: 'Hỗn hợp dấu chấm và dấu phẩy thập phân trong cùng cột',
    expected_ok: false,
    expected_code: 'DATA_MIXED_NUMBER_FORMAT',
  });

  // TC18: Number overflow (1e16)
  const overflowRows = baseRows.map((r, idx) => ({
    ...r,
    close: idx === 10 ? 1e16 : r.close,
    high: idx === 10 ? 2e16 : r.high,
  }));
  await writeXlsx(
    'TC18_so_qua_lon.xlsx',
    'DuLieu',
    ['Ngay', 'Ma', 'Mo', 'Cao', 'Thap', 'Dong', 'KhoiLuong'],
    overflowRows.map((r) => [r.date, r.symbol, r.open, r.high, r.low, r.close, r.volume])
  );
  manifest.push({
    id: 'TC18',
    filename: 'TC18_so_qua_lon.xlsx',
    description: 'Giá trị số quá lớn vượt quá giới hạn an toàn (10^16)',
    expected_ok: false,
    expected_code: 'DATA_BAD_NUMBER',
  });

  // TC19: Exceeds max rows (50,005 rows > 50,000)
  const bigRows = ['Ngay,Ma,Mo,Cao,Thap,Dong,KhoiLuong'];
  for (let i = 0; i < 50005; i++) {
    bigRows.push(`2025-01-02,SYM,50.0,52.0,49.0,51.0,100000`);
  }
  writeCsv('TC19_vuot_qua_so_dong_toi_da.csv', bigRows);
  manifest.push({
    id: 'TC19',
    filename: 'TC19_vuot_qua_so_dong_toi_da.csv',
    description: 'Vượt quá số dòng tối đa cho phép (> 50,000 dòng)',
    expected_ok: false,
    expected_code: 'DATA_TOO_MANY_ROWS',
  });

  // TC20: Exceeds max symbols (11 symbols > 10)
  const symbols11 = [];
  for (let s = 1; s <= 11; s++) {
    symbols11.push({ symbol: `SYM${s}`, basePrice: 20 + s * 5 });
  }
  const rows11 = generateOhlcvRows(symbols11, baseDates.slice(0, 32), 101);
  const csv11Sym = ['Ngay,Ma,Mo,Cao,Thap,Dong,KhoiLuong'];
  for (const r of rows11) {
    csv11Sym.push(`${r.date},${r.symbol},${r.open},${r.high},${r.low},${r.close},${r.volume}`);
  }
  writeCsv('TC20_vuot_qua_so_ma_toi_da.csv', csv11Sym);
  manifest.push({
    id: 'TC20',
    filename: 'TC20_vuot_qua_so_ma_toi_da.csv',
    description: 'Vượt quá số lượng mã cổ phiếu cho phép (11 mã > 10 mã)',
    expected_ok: false,
    expected_code: 'DATA_TOO_MANY_SYMBOLS',
  });

  // TC21: Insufficient sessions (15 sessions < 30)
  const shortRows = ['Ngay,Ma,Mo,Cao,Thap,Dong,KhoiLuong'];
  for (let i = 0; i < 15; i++) {
    const r = baseRows[i];
    shortRows.push(`${r.date},${r.symbol},${r.open},${r.high},${r.low},${r.close},${r.volume}`);
  }
  writeCsv('TC21_khong_du_so_phien.csv', shortRows);
  manifest.push({
    id: 'TC21',
    filename: 'TC21_khong_du_so_phien.csv',
    description: 'Không đủ số phiên giao dịch tối thiểu (15 phiên < 30)',
    expected_ok: false,
    expected_code: 'DATA_SYMBOL_TOO_FEW_SESSIONS',
  });

  // TC22: Blank / missing key rows in between
  const emptyKeyRows = ['Ngay,Ma,Mo,Cao,Thap,Dong,KhoiLuong'];
  for (let i = 0; i < baseRows.length; i++) {
    const r = baseRows[i];
    if (i === 10) {
      emptyKeyRows.push(`,,50.0,52.0,48.0,51.0,10000`); // Missing date & symbol
    } else {
      emptyKeyRows.push(`${r.date},${r.symbol},${r.open},${r.high},${r.low},${r.close},${r.volume}`);
    }
  }
  writeCsv('TC22_dong_trong_o_giua.csv', emptyKeyRows);
  manifest.push({
    id: 'TC22',
    filename: 'TC22_dong_trong_o_giua.csv',
    description: 'Dòng dữ liệu bị thiếu khóa chính (ngày hoặc mã) ở giữa bảng',
    expected_ok: false,
    expected_code: 'DATA_EMPTY_KEY',
  });

  // --- ACCEPTED WITH WARNINGS OR ACCEPTED CLEAN (TC23 - TC34) ---

  // TC23: Unknown extra columns (accepted with warning)
  const unknownColRows = ['Ngay,Ma,Mo,Cao,Thap,Dong,KhoiLuong,CotLa1,CotLa2,CotLa3'];
  for (const r of baseRows) {
    unknownColRows.push(`${r.date},${r.symbol},${r.open},${r.high},${r.low},${r.close},${r.volume},X,Y,Z`);
  }
  writeCsv('TC23_cot_la_nhung_van_du_cot_chuan.csv', unknownColRows);
  manifest.push({
    id: 'TC23',
    filename: 'TC23_cot_la_nhung_van_du_cot_chuan.csv',
    description: 'Đầy đủ cột chuẩn kèm thêm các cột lạ ngoài danh mục',
    expected_ok: true,
    expected_warning: 'SCHEMA_UNKNOWN_COLUMN',
  });

  // TC24: Exact duplicate rows (accepted with warning)
  const exactDupRows = ['Ngay,Ma,Mo,Cao,Thap,Dong,KhoiLuong'];
  for (const r of baseRows) {
    exactDupRows.push(`${r.date},${r.symbol},${r.open},${r.high},${r.low},${r.close},${r.volume}`);
  }
  // Repeat the exact 5th row
  const rDup = baseRows[5];
  exactDupRows.push(`${rDup.date},${rDup.symbol},${rDup.open},${rDup.high},${rDup.low},${rDup.close},${rDup.volume}`);
  writeCsv('TC24_trung_lap_y_het.csv', exactDupRows);
  manifest.push({
    id: 'TC24',
    filename: 'TC24_trung_lap_y_het.csv',
    description: 'Trùng lặp y hệt dòng (cùng mã, ngày, giá và khối lượng)',
    expected_ok: true,
    expected_warning: 'DATA_EXACT_DUPLICATE',
  });

  // TC25: Large date gap > 10 days (accepted with warning)
  const gapRows = [];
  for (let i = 0; i < baseRows.length; i++) {
    const r = baseRows[i];
    let d = r.date;
    if (i >= 15) {
      // Add 45 days gap
      const dt = new Date(`${r.date}T00:00:00Z`);
      dt.setUTCDate(dt.getUTCDate() + 45);
      d = dt.toISOString().slice(0, 10);
    }
    gapRows.push([d, r.symbol, r.open, r.high, r.low, r.close, r.volume]);
  }
  await writeXlsx(
    'TC25_khoang_trong_ngay_lon.xlsx',
    'DuLieu',
    ['Ngay', 'Ma', 'Mo', 'Cao', 'Thap', 'Dong', 'KhoiLuong'],
    gapRows
  );
  manifest.push({
    id: 'TC25',
    filename: 'TC25_khoang_trong_ngay_lon.xlsx',
    description: 'Khoảng cách ngày giao dịch lớn (> 10 ngày không có phiên)',
    expected_ok: true,
    expected_warning: 'DATA_LONG_GAP',
  });

  // TC26: Price spike > 20% (accepted with warning)
  const spikeRows = ['Ngay,Ma,Mo,Cao,Thap,Dong,KhoiLuong'];
  for (let i = 0; i < baseRows.length; i++) {
    const r = baseRows[i];
    if (i === 15) {
      // 35% jump
      const op = r.open * 1.35;
      const cl = r.close * 1.35;
      const hi = Math.max(op, cl) * 1.02;
      const lo = Math.min(op, cl) * 0.98;
      spikeRows.push(`${r.date},${r.symbol},${op.toFixed(2)},${hi.toFixed(2)},${lo.toFixed(2)},${cl.toFixed(2)},${r.volume}`);
    } else {
      spikeRows.push(`${r.date},${r.symbol},${r.open},${r.high},${r.low},${r.close},${r.volume}`);
    }
  }
  writeCsv('TC26_bien_dong_gia_lon.csv', spikeRows);
  manifest.push({
    id: 'TC26',
    filename: 'TC26_bien_dong_gia_lon.csv',
    description: 'Biến động giá mạnh bất thường (> 20% trong 1 phiên)',
    expected_ok: true,
    expected_warning: 'DATA_LARGE_MOVE',
  });

  // TC27: Ambiguous number strings like '51.234' (accepted with warning)
  const ambigRows = ['Ngay,Ma,Mo,Cao,Thap,Dong,KhoiLuong'];
  for (let i = 0; i < baseRows.length; i++) {
    const r = baseRows[i];
    if (i === 10) {
      ambigRows.push(`${r.date},${r.symbol},51.234,53.00,50.00,52.00,${r.volume}`);
    } else {
      ambigRows.push(`${r.date},${r.symbol},${r.open},${r.high},${r.low},${r.close},${r.volume}`);
    }
  }
  writeCsv('TC27_chuoi_so_nhap_nhang.csv', ambigRows);
  manifest.push({
    id: 'TC27',
    filename: 'TC27_chuoi_so_nhap_nhang.csv',
    description: 'Chuỗi số có định dạng mơ hồ (1.234 có thể là nghìn hoặc phẩy)',
    expected_ok: true,
    expected_warning: 'DATA_AMBIGUOUS_NUMBER',
  });

  // TC28: Standard UTF-8 with BOM
  const bomRows = ['Ngay,Ma,Mo,Cao,Thap,Dong,KhoiLuong'];
  for (const r of baseRows) {
    bomRows.push(`${r.date},${r.symbol},${r.open},${r.high},${r.low},${r.close},${r.volume}`);
  }
  writeCsv('TC28_file_utf8_bom.csv', bomRows, 'utf8', true);
  manifest.push({
    id: 'TC28',
    filename: 'TC28_file_utf8_bom.csv',
    description: 'Tệp CSV chuẩn định dạng UTF-8 có BOM',
    expected_ok: true,
  });

  // TC29: Windows-1258 encoded CSV
  // Construct bytes with Windows-1258 headers: Ngày,Mã,Mở,Cao,Thấp,Đóng,Khối lượng
  // N-g-à(224)-y, M-ã(a+222), M-ở(245+210), C-a-o, T-h-ấ(226+236)-p, Đ(208)-ó(244+236)-n-g, K-h-ố(244+236)-i- -l-ư(253+242+245)-...
  // Or simpler: use bytes containing 224 for 'à', 208 for 'Đ', etc.
  const win1258HeaderBytes = [
    0x4e, 0x67, 0xe0, 0x79, 0x2c, // Ngà(224)y,
    0x4d, 0x61, 0x2c,             // Ma,
    0x4d, 0x6f, 0x2c,             // Mo,
    0x43, 0x61, 0x6f, 0x2c,       // Cao,
    0x54, 0x68, 0x61, 0x70, 0x2c, // Thap,
    0xd0, 0xf3, 0x6e, 0x67, 0x2c, // Đ(208)ó(243)ng,
    0x4b, 0x68, 0x6f, 0x69, 0x4c, 0x75, 0x6f, 0x6e, 0x67, 0x0d, 0x0a // KhoiLuong\r\n
  ];
  const win1258DataLines = baseRows.map((r) => `${r.date},${r.symbol},${r.open},${r.high},${r.low},${r.close},${r.volume}`).join('\r\n');
  const win1258DataBytes = Buffer.from(win1258DataLines, 'ascii');
  const finalWin1258Buffer = Buffer.concat([Buffer.from(win1258HeaderBytes), win1258DataBytes]);
  fs.writeFileSync(path.join(TEST_CASES_DIR, 'TC29_file_windows_1258.csv'), finalWin1258Buffer);
  manifest.push({
    id: 'TC29',
    filename: 'TC29_file_windows_1258.csv',
    description: 'Tệp CSV mã hóa theo bảng mã tiếng Việt Windows-1258',
    expected_ok: true,
  });

  // TC30: Semicolon delimited CSV with comma decimals
  const semiRows = ['Ngay;Ma;Mo;Cao;Thap;Dong;KhoiLuong'];
  for (const r of baseRows) {
    const moStr = String(r.open).replace('.', ',');
    const caoStr = String(r.high).replace('.', ',');
    const thapStr = String(r.low).replace('.', ',');
    const dongStr = String(r.close).replace('.', ',');
    semiRows.push(`${r.date};${r.symbol};${moStr};${caoStr};${thapStr};${dongStr};${r.volume}`);
  }
  writeCsv('TC30_file_dau_cham_phay.csv', semiRows);
  manifest.push({
    id: 'TC30',
    filename: 'TC30_file_dau_cham_phay.csv',
    description: 'Tệp CSV phân cách bằng dấu chấm phẩy (;) và dấu phẩy thập phân',
    expected_ok: true,
  });

  // TC31: Tab delimited CSV (TSV)
  const tabRows = ['Ngay\tMa\tMo\tCao\tThap\tDong\tKhoiLuong'];
  for (const r of baseRows) {
    tabRows.push(`${r.date}\t${r.symbol}\t${r.open}\t${r.high}\t${r.low}\t${r.close}\t${r.volume}`);
  }
  writeCsv('TC31_file_dau_tab.csv', tabRows);
  manifest.push({
    id: 'TC31',
    filename: 'TC31_file_dau_tab.csv',
    description: 'Tệp phân cách bằng dấu Tab',
    expected_ok: true,
  });

  // TC32: Excel with formula cells and cached values
  const wbFormula = new ExcelJS.Workbook();
  const wsFormula = wbFormula.addWorksheet('DuLieu');
  wsFormula.columns = [
    { header: 'Ngay', key: 'date' },
    { header: 'Ma', key: 'symbol' },
    { header: 'Mo', key: 'open' },
    { header: 'Cao', key: 'high' },
    { header: 'Thap', key: 'low' },
    { header: 'Dong', key: 'close' },
    { header: 'KhoiLuong', key: 'volume' },
  ];
  for (let i = 0; i < baseRows.length; i++) {
    const r = baseRows[i];
    const rowIdx = i + 2;
    wsFormula.addRow({
      date: r.date,
      symbol: r.symbol,
      open: r.open,
      high: r.high,
      low: r.low,
      close: { formula: `C${rowIdx}*1.01`, result: r.close }, // Excel formula with cached result
      volume: r.volume,
    });
  }
  await wbFormula.xlsx.writeFile(path.join(TEST_CASES_DIR, 'TC32_file_co_cong_thuc_excel.xlsx'));
  manifest.push({
    id: 'TC32',
    filename: 'TC32_file_co_cong_thuc_excel.xlsx',
    description: 'Tệp Excel có chứa công thức tính toán và giá trị đã lưu',
    expected_ok: true,
  });

  // TC33: Accent-stripped lowercase column names
  await writeXlsx(
    'TC33_file_ten_cot_khong_dau.xlsx',
    'DuLieu',
    ['ngay', 'ma', 'mo', 'cao', 'thap', 'dong', 'khoi_luong'],
    baseRows.map((r) => [r.date, r.symbol, r.open, r.high, r.low, r.close, r.volume])
  );
  manifest.push({
    id: 'TC33',
    filename: 'TC33_file_ten_cot_khong_dau.xlsx',
    description: 'Tên cột viết thường không dấu (ngay, ma, mo, cao, thap, dong, khoi_luong)',
    expected_ok: true,
  });

  // TC34: Header on row 5 (first 4 rows are company notes)
  const wbRow5 = new ExcelJS.Workbook();
  const wsRow5 = wbRow5.addWorksheet('DuLieu');
  wsRow5.addRow(['CONG TY CO PHAN CHUNG KHOAN PIXEL']);
  wsRow5.addRow(['Bao cao thong ke giao dich']);
  wsRow5.addRow(['Ngay xuat: 2025-12-31']);
  wsRow5.addRow([]); // Blank row 4
  // Row 5: Headers
  wsRow5.addRow(['Ngay', 'Ma', 'Mo', 'Cao', 'Thap', 'Dong', 'KhoiLuong']);
  for (const r of baseRows) {
    wsRow5.addRow([r.date, r.symbol, r.open, r.high, r.low, r.close, r.volume]);
  }
  await wbRow5.xlsx.writeFile(path.join(TEST_CASES_DIR, 'TC34_file_header_o_dong_5.xlsx'));
  manifest.push({
    id: 'TC34',
    filename: 'TC34_file_header_o_dong_5.xlsx',
    description: 'Dòng tiêu đề bắt đầu ở dòng 5 (4 dòng đầu là ghi chú công ty)',
    expected_ok: true,
  });



  // --- ADDITIONAL SPECIFICATION TEST CASES (TC35 - TC55 for Prompt P3 A2) ---

  // TC35: Password-protected file (OLE2 signature renamed to .xlsx)
  const ole2Bytes = Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1, 0x00, 0x00, 0x00, 0x00]);
  fs.writeFileSync(path.join(TEST_CASES_DIR, 'TC35_reject_password_protected.xlsx'), ole2Bytes);
  manifest.push({
    id: 'TC35',
    filename: 'TC35_reject_password_protected.xlsx',
    description: 'Tệp có mật khẩu hoặc mã hóa OLE2 đổi đuôi .xlsx',
    expected_ok: false,
    expected_code: 'UPLOAD_PASSWORD_PROTECTED',
  });

  // TC36: Legacy Excel .xls file
  fs.writeFileSync(path.join(TEST_CASES_DIR, 'TC36_reject_xls_legacy.xls'), Buffer.from('Legacy XLS binary content'));
  manifest.push({
    id: 'TC36',
    filename: 'TC36_reject_xls_legacy.xls',
    description: 'Tệp định dạng Excel cũ (.xls)',
    expected_ok: false,
    expected_code: 'UPLOAD_XLS_LEGACY',
  });

  // TC37: Word document (.docx)
  fs.writeFileSync(path.join(TEST_CASES_DIR, 'TC37_reject_word.docx'), Buffer.from('Word docx content'));
  manifest.push({
    id: 'TC37',
    filename: 'TC37_reject_word.docx',
    description: 'Tệp văn bản Word (.docx)',
    expected_ok: false,
    expected_code: 'UPLOAD_EXTENSION_UNSUPPORTED',
  });

  // TC38: PDF document (.pdf)
  fs.writeFileSync(path.join(TEST_CASES_DIR, 'TC38_reject_pdf.pdf'), Buffer.from('%PDF-1.4 PDF content'));
  manifest.push({
    id: 'TC38',
    filename: 'TC38_reject_pdf.pdf',
    description: 'Tệp tài liệu PDF (.pdf)',
    expected_ok: false,
    expected_code: 'UPLOAD_EXTENSION_UNSUPPORTED',
  });

  // TC39: Image file (.png)
  fs.writeFileSync(path.join(TEST_CASES_DIR, 'TC39_reject_image.png'), Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]));
  manifest.push({
    id: 'TC39',
    filename: 'TC39_reject_image.png',
    description: 'Tệp hình ảnh (.png)',
    expected_ok: false,
    expected_code: 'UPLOAD_EXTENSION_UNSUPPORTED',
  });

  // TC40: Zip archive (.zip)
  fs.writeFileSync(path.join(TEST_CASES_DIR, 'TC40_reject_archive.zip'), Buffer.from([0x50, 0x4B, 0x05, 0x06, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
  manifest.push({
    id: 'TC40',
    filename: 'TC40_reject_archive.zip',
    description: 'Tệp nén lưu trữ (.zip)',
    expected_ok: false,
    expected_code: 'UPLOAD_EXTENSION_UNSUPPORTED',
  });

  // TC41: File without extension
  fs.writeFileSync(path.join(TEST_CASES_DIR, 'TC41_reject_khong_co_duoi'), Buffer.from('File without any extension'));
  manifest.push({
    id: 'TC41',
    filename: 'TC41_reject_khong_co_duoi',
    description: 'Tệp không có phần mở rộng',
    expected_ok: false,
    expected_code: 'UPLOAD_EXTENSION_UNSUPPORTED',
  });

  // TC42: Truncated / Corrupt ZIP (.xlsx)
  fs.writeFileSync(path.join(TEST_CASES_DIR, 'TC42_reject_zip_cut.xlsx'), Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x0A, 0x00, 0x00, 0x00]));
  manifest.push({
    id: 'TC42',
    filename: 'TC42_reject_zip_cut.xlsx',
    description: 'Tệp ZIP bị cắt cụt hoặc hỏng cấu trúc',
    expected_ok: false,
    expected_code: 'UPLOAD_CORRUPT',
  });

  // TC43: Blank symbol or date cell
  const emptyKeyRowsTC43 = ['Ngay,Ma,Mo,Cao,Thap,Dong,KhoiLuong'];
  for (let i = 0; i < baseRows.length; i++) {
    const r = baseRows[i];
    if (i === 10) {
      emptyKeyRowsTC43.push(`,${r.symbol},${r.open},${r.high},${r.low},${r.close},${r.volume}`);
    } else {
      emptyKeyRowsTC43.push(`${r.date},${r.symbol},${r.open},${r.high},${r.low},${r.close},${r.volume}`);
    }
  }
  writeCsv('TC43_reject_o_ma_ngay_trong.csv', emptyKeyRowsTC43);
  manifest.push({
    id: 'TC43',
    filename: 'TC43_reject_o_ma_ngay_trong.csv',
    description: 'Ô ngày giao dịch bị để trống',
    expected_ok: false,
    expected_code: 'DATA_EMPTY_KEY',
  });

  // TC44: Close column missing 40% (15 / 35 rows)
  const missing40Rows = ['Ngay,Ma,Mo,Cao,Thap,Dong,KhoiLuong'];
  for (let i = 0; i < baseRows.length; i++) {
    const r = baseRows[i];
    const cVal = i < 15 ? '' : r.close;
    missing40Rows.push(`${r.date},${r.symbol},${r.open},${r.high},${r.low},${cVal},${r.volume}`);
  }
  writeCsv('TC44_reject_cot_dong_trong_40_pct.csv', missing40Rows);
  manifest.push({
    id: 'TC44',
    filename: 'TC44_reject_cot_dong_trong_40_pct.csv',
    description: 'Cột Đóng bị để trống quá 40% số dòng',
    expected_ok: false,
    expected_code: 'DATA_TOO_MANY_MISSING',
  });

  // TC45: Price with currency symbol 25.400đ
  const currencyRows = ['Ngay,Ma,Mo,Cao,Thap,Dong,KhoiLuong'];
  for (let i = 0; i < baseRows.length; i++) {
    const r = baseRows[i];
    const cVal = i === 12 ? '25.400đ' : r.close;
    currencyRows.push(`${r.date},${r.symbol},${r.open},${r.high},${r.low},${cVal},${r.volume}`);
  }
  writeCsv('TC45_reject_gia_co_ky_hieu_tien_te.csv', currencyRows);
  manifest.push({
    id: 'TC45',
    filename: 'TC45_reject_gia_co_ky_hieu_tien_te.csv',
    description: 'Giá chứa ký hiệu tiền tệ 25.400đ',
    expected_ok: false,
    expected_code: 'DATA_BAD_NUMBER',
  });

  // TC46: Ambiguous date format (mixing 13/05/2025 and 05/13/2025)
  const ambigDateRows = ['Ngay,Ma,Mo,Cao,Thap,Dong,KhoiLuong'];
  for (let i = 0; i < baseRows.length; i++) {
    const r = baseRows[i];
    let dVal = r.date;
    if (i === 10) dVal = '13/05/2025'; // d/m/y
    else if (i === 11) dVal = '05/13/2025'; // m/d/y
    ambigDateRows.push(`${dVal},${r.symbol},${r.open},${r.high},${r.low},${r.close},${r.volume}`);
  }
  writeCsv('TC46_reject_ngay_nhap_nhang_dinh_dang.csv', ambigDateRows);
  manifest.push({
    id: 'TC46',
    filename: 'TC46_reject_ngay_nhap_nhang_dinh_dang.csv',
    description: 'Định dạng ngày nhập nhằng giữa dd/mm và mm/dd',
    expected_ok: false,
    expected_code: 'DATA_DATE_AMBIGUOUS',
  });

  // TC47: Exactly 29 sessions (threshold is 30)
  const rows29 = baseRows.slice(0, 29);
  const csv29 = ['Ngay,Ma,Mo,Cao,Thap,Dong,KhoiLuong'];
  for (const r of rows29) {
    csv29.push(`${r.date},${r.symbol},${r.open},${r.high},${r.low},${r.close},${r.volume}`);
  }
  writeCsv('TC47_reject_mot_ma_dung_29_phien.csv', csv29);
  manifest.push({
    id: 'TC47',
    filename: 'TC47_reject_mot_ma_dung_29_phien.csv',
    description: 'Một mã chỉ có đúng 29 phiên (dưới ngưỡng 30 phiên)',
    expected_ok: false,
    expected_code: 'DATA_SYMBOL_TOO_FEW_SESSIONS',
  });

  // TC48: 11 symbols (exceeds max_symbols = 10)
  const sym11Dates = generateTradingDates(32);
  const sym11List = [];
  for (let s = 1; s <= 11; s++) {
    sym11List.push({ symbol: `SYM${s}`, basePrice: 20.0 + s });
  }
  const sym11Rows = generateOhlcvRows(sym11List, sym11Dates, 777);
  const csv11 = ['Ngay,Ma,Mo,Cao,Thap,Dong,KhoiLuong'];
  for (const r of sym11Rows) {
    csv11.push(`${r.date},${r.symbol},${r.open},${r.high},${r.low},${r.close},${r.volume}`);
  }
  writeCsv('TC48_reject_11_ma_vuot_nguong.csv', csv11);
  manifest.push({
    id: 'TC48',
    filename: 'TC48_reject_11_ma_vuot_nguong.csv',
    description: 'Tệp chứa 11 mã cổ phiếu (vượt giới hạn tối đa 10 mã)',
    expected_ok: false,
    expected_code: 'DATA_TOO_MANY_SYMBOLS',
  });

  // TC49: Exactly 30 sessions (at threshold -> ACCEPTED)
  const rows30 = baseRows.slice(0, 30);
  const csv30 = ['Ngay,Ma,Mo,Cao,Thap,Dong,KhoiLuong'];
  for (const r of rows30) {
    csv30.push(`${r.date},${r.symbol},${r.open},${r.high},${r.low},${r.close},${r.volume}`);
  }
  writeCsv('TC49_accept_mot_ma_dung_30_phien.csv', csv30);
  manifest.push({
    id: 'TC49',
    filename: 'TC49_accept_mot_ma_dung_30_phien.csv',
    description: 'Một mã có đúng 30 phiên giao dịch (vừa đủ ngưỡng)',
    expected_ok: true,
  });

  // TC50: English column headers (Date, Symbol, Open, High, Low, Close, Volume) -> ACCEPTED
  const csvEn = ['Date,Symbol,Open,High,Low,Close,Volume'];
  for (const r of baseRows) {
    csvEn.push(`${r.date},${r.symbol},${r.open},${r.high},${r.low},${r.close},${r.volume}`);
  }
  writeCsv('TC50_accept_ten_cot_tieng_anh.csv', csvEn);
  manifest.push({
    id: 'TC50',
    filename: 'TC50_accept_ten_cot_tieng_anh.csv',
    description: 'Tên cột bằng tiếng Anh (Date, Symbol, Open, High, Low, Close, Volume)',
    expected_ok: true,
  });

  // TC51: Multiple sheets with DuLieu not first -> ACCEPTED
  const wbMultiDuLieu = new ExcelJS.Workbook();
  const wsGuideFirst = wbMultiDuLieu.addWorksheet('HuongDan');
  wsGuideFirst.addRow(['Trang huong dan su dung']);
  const wsDuLieuSecond = wbMultiDuLieu.addWorksheet('DuLieu');
  wsDuLieuSecond.columns = [
    { header: 'Ngay', key: 'date' },
    { header: 'Ma', key: 'symbol' },
    { header: 'Mo', key: 'open' },
    { header: 'Cao', key: 'high' },
    { header: 'Thap', key: 'low' },
    { header: 'Dong', key: 'close' },
    { header: 'KhoiLuong', key: 'volume' },
  ];
  for (const r of baseRows) {
    wsDuLieuSecond.addRow(r);
  }
  await wbMultiDuLieu.xlsx.writeFile(path.join(TEST_CASES_DIR, 'TC51_accept_nhieu_sheet_DuLieu_sau.xlsx'));
  manifest.push({
    id: 'TC51',
    filename: 'TC51_accept_nhieu_sheet_DuLieu_sau.xlsx',
    description: 'Nhiều sheet với sheet DuLieu nằm ở vị trí thứ hai',
    expected_ok: true,
  });

  // TC52: Multiple sheets without DuLieu -> ACCEPTED with warning SCHEMA_SHEET_FALLBACK
  const wbNoDuLieu = new ExcelJS.Workbook();
  const wsTongHop = wbNoDuLieu.addWorksheet('TongHop');
  wsTongHop.columns = [
    { header: 'Ngay', key: 'date' },
    { header: 'Ma', key: 'symbol' },
    { header: 'Mo', key: 'open' },
    { header: 'Cao', key: 'high' },
    { header: 'Thap', key: 'low' },
    { header: 'Dong', key: 'close' },
    { header: 'KhoiLuong', key: 'volume' },
  ];
  for (const r of baseRows) {
    wsTongHop.addRow(r);
  }
  const wsPhu = wbNoDuLieu.addWorksheet('Phu');
  wsPhu.addRow(['Sheet phu khong dung']);
  await wbNoDuLieu.xlsx.writeFile(path.join(TEST_CASES_DIR, 'TC52_accept_nhieu_sheet_khong_co_DuLieu.xlsx'));
  manifest.push({
    id: 'TC52',
    filename: 'TC52_accept_nhieu_sheet_khong_co_DuLieu.xlsx',
    description: 'Nhiều sheet không có sheet DuLieu (tự động chọn sheet đầu)',
    expected_ok: true,
    expected_warning: 'SCHEMA_SHEET_FALLBACK',
  });

  // TC53: Few missing values (2 missing cells < 30%) -> ACCEPTED with DATA_MISSING_VALUES
  const missingFewRows = ['Ngay,Ma,Mo,Cao,Thap,Dong,KhoiLuong'];
  for (let i = 0; i < baseRows.length; i++) {
    const r = baseRows[i];
    const vVal = (i === 5 || i === 15) ? '' : r.volume;
    missingFewRows.push(`${r.date},${r.symbol},${r.open},${r.high},${r.low},${r.close},${vVal}`);
  }
  writeCsv('TC53_accept_o_trong_it.csv', missingFewRows);
  manifest.push({
    id: 'TC53',
    filename: 'TC53_accept_o_trong_it.csv',
    description: 'Ít ô trống khối lượng (chấp nhận kèm cảnh báo)',
    expected_ok: true,
    expected_warning: 'DATA_MISSING_VALUES',
  });

  // TC54: Blank formatted rows at bottom of sheet -> ACCEPTED
  const wbBlankBottom = new ExcelJS.Workbook();
  const wsBlankBottom = wbBlankBottom.addWorksheet('DuLieu');
  wsBlankBottom.columns = [
    { header: 'Ngay', key: 'date' },
    { header: 'Ma', key: 'symbol' },
    { header: 'Mo', key: 'open' },
    { header: 'Cao', key: 'high' },
    { header: 'Thap', key: 'low' },
    { header: 'Dong', key: 'close' },
    { header: 'KhoiLuong', key: 'volume' },
  ];
  for (const r of baseRows) {
    wsBlankBottom.addRow(r);
  }
  for (let b = 0; b < 10; b++) {
    const blankRow = wsBlankBottom.addRow([]);
    blankRow.height = 20; // Formatted blank row
  }
  await wbBlankBottom.xlsx.writeFile(path.join(TEST_CASES_DIR, 'TC54_accept_dong_trong_cuoi_sheet.xlsx'));
  manifest.push({
    id: 'TC54',
    filename: 'TC54_accept_dong_trong_cuoi_sheet.xlsx',
    description: 'Các dòng trống có định dạng ở cuối sheet (bỏ qua im lặng)',
    expected_ok: true,
  });

  // TC55: Ambiguous number 25.400 -> ACCEPTED with DATA_AMBIGUOUS_NUMBER
  const ambigNumRows = ['Ngay,Ma,Mo,Cao,Thap,Dong,KhoiLuong'];
  for (let i = 0; i < baseRows.length; i++) {
    const r = baseRows[i];
    if (i === 10) {
      ambigNumRows.push(`${r.date},${r.symbol},25.100,25.600,24.900,25.400,${r.volume}`);
    } else {
      ambigNumRows.push(`${r.date},${r.symbol},${r.open},${r.high},${r.low},${r.close},${r.volume}`);
    }
  }
  writeCsv('TC55_accept_so_nhap_nhang_25_400.csv', ambigNumRows);
  manifest.push({
    id: 'TC55',
    filename: 'TC55_accept_so_nhap_nhang_25_400.csv',
    description: 'Số dạng 25.400 có thể hiểu nhầm (cảnh báo)',
    expected_ok: true,
    expected_warning: 'DATA_AMBIGUOUS_NUMBER',
  });

  // Save MANIFEST.json
  const manifestPath = path.join(TEST_CASES_DIR, 'MANIFEST.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  // Also sync to public/samples/test-cases/
  const publicTestCasesDir = path.join(SAMPLES_DIR, 'test-cases');
  fs.mkdirSync(publicTestCasesDir, { recursive: true });
  for (const f of fs.readdirSync(TEST_CASES_DIR)) {
    fs.copyFileSync(path.join(TEST_CASES_DIR, f), path.join(publicTestCasesDir, f));
  }

  console.log(`Generated all ${manifest.length} test cases in ${TEST_CASES_DIR} and synced to ${publicTestCasesDir}`);
}

async function generateCleaningSampleFile() {
  console.log('Generating public/samples/file-co-loi-lam-sach.xlsx and samples/expected-clean.json ...');

  const symbols = [
    { symbol: 'TMA', basePrice: 50.0, sessions: 40 },
    { symbol: 'TMB', basePrice: 80.0, sessions: 35 },
    { symbol: 'TMC', basePrice: 25.0, sessions: 31 },
  ];

  const dates = generateTradingDates(45);

  // Generate base rows
  const baseRows = [];
  for (const { symbol, basePrice, sessions } of symbols) {
    const symDates = dates.slice(0, sessions);
    const symRows = generateOhlcvRows([{ symbol, basePrice }], symDates, 555);
    baseRows.push(...symRows);
  }
  // Total base valid rows = 40 + 35 + 31 = 106 rows.

  // 1. Inject exactly 5 rows missing OHLC (1 missing cell per row = 5 cells total):
  const missingOhlcRows = [
    { date: dates[41], symbol: 'TMA', open: null, high: 26.0, low: 24.5, close: 25.0, volume: 1500 },
    { date: dates[42], symbol: 'TMA', open: 25.0, high: null, low: 24.5, close: 25.0, volume: 1600 },
    { date: dates[36], symbol: 'TMB', open: 80.0, high: 82.5, low: null, close: 81.0, volume: 2000 },
    { date: dates[37], symbol: 'TMB', open: 81.0, high: 83.0, low: 79.5, close: null, volume: 1800 },
    { date: dates[32], symbol: 'TMC', open: null, high: 13.0, low: 11.5, close: 12.0, volume: 2200 },
  ];

  // 2. Inject exactly 4 empty volume cells in baseRows:
  baseRows[5].volume = null;
  baseRows[25].volume = null;
  baseRows[60].volume = null;
  baseRows[90].volume = null;

  // 3. Inject exactly 3 clear outliers across 2 symbols:
  // TMA (40 sessions, index 0..39): at last session (index 39), drop from ~50 to 25.0 (-50%)
  baseRows[39].close = 25.0;
  baseRows[39].low = 24.5;
  baseRows[39].open = 49.0;
  baseRows[39].high = 49.5;

  // TMC (31 sessions, index 75..105):
  // Outlier 1 at index 104 (session 30): jump from ~25 to 50.0 (+100%)
  baseRows[104].close = 50.0;
  baseRows[104].high = 51.0;
  baseRows[104].open = 25.0;
  baseRows[104].low = 24.5;

  // Outlier 2 at index 105 (session 31, last): drop from 50.0 to 12.0 (-76%)
  baseRows[105].close = 12.0;
  baseRows[105].low = 11.5;
  baseRows[105].open = 50.0;
  baseRows[105].high = 50.5;

  // 4. Inject 3 zero-volume sessions in baseRows:
  baseRows[8].volume = 0;
  baseRows[50].volume = 0;
  baseRows[88].volume = 0;

  // 5. Inject exactly 6 exact duplicates from final baseRows:
  const dupTargets = [
    baseRows[2],
    baseRows[15],
    baseRows[45],
    baseRows[55],
    baseRows[80],
    baseRows[82],
  ];
  const exactDupRows = dupTargets.map((r) => ({ ...r }));

  // Combine all rows: 106 + 6 + 5 = 117 rows
  const allRows = [...baseRows, ...exactDupRows, ...missingOhlcRows];

  // Write Excel file
  const wb = new ExcelJS.Workbook();
  const wsData = wb.addWorksheet('DuLieu');
  wsData.columns = [
    { header: 'Ngay', key: 'date' },
    { header: 'Ma', key: 'symbol' },
    { header: 'Mo', key: 'open' },
    { header: 'Cao', key: 'high' },
    { header: 'Thap', key: 'low' },
    { header: 'Dong', key: 'close' },
    { header: 'KhoiLuong', key: 'volume' },
  ];

  for (const r of allRows) {
    wsData.addRow({
      date: r.date,
      symbol: r.symbol,
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      volume: r.volume,
    });
  }

  // Guide sheet with prominent disclaimer
  const wsGuide = wb.addWorksheet('HuongDan');
  wsGuide.addRow(['BẢNG DỮ LIỆU THỬ NGHIỆM LÀM SẠCH (CỔNG DUYỆT 1)']);
  wsGuide.addRow(['LƯU Ý: Dữ liệu mô phỏng, không phải dữ liệu thị trường thật.']);
  wsGuide.addRow(['Tệp này được thiết kế có chủ đích các lỗi:']);
  wsGuide.addRow(['- Đúng 6 dòng trùng lặp hoàn toàn (drop_exact_duplicates: 6 dòng)']);
  wsGuide.addRow(['- Đúng 5 dòng thiếu giá OHLC (drop_rows_missing_ohlc: 5 dòng)']);
  wsGuide.addRow(['- Đúng 4 ô khối lượng để trống (fill_missing_volume_zero: 4 dòng)']);
  wsGuide.addRow(['- Đúng 3 điểm biến động bất thường (flag_outliers: 3 dòng ở TMA và TMC)']);
  wsGuide.addRow(['- 3 phiên có khối lượng bằng 0 (giao dịch bình thường)']);
  wsGuide.addRow(['- Khi bật xóa bất thường (drop_flagged_outliers), mã TMC còn 29 phiên (< 30 phiên tối thiểu)']);

  const cleanFilePath = path.join(SAMPLES_DIR, 'file-co-loi-lam-sach.xlsx');
  await wb.xlsx.writeFile(cleanFilePath);

  // Independent verification counter (pure loops, no production code imported)
  const bySymbolCounter = {};
  for (const sym of ['TMA', 'TMB', 'TMC']) {
    const symRows = allRows.filter((r) => r.symbol === sym);
    const seenRowKeys = new Set();
    let exactDups = 0;
    let missingOhlc = 0;
    let missingVolume = 0;

    for (const r of symRows) {
      const key = `${r.symbol}|${r.date}|${r.open}|${r.high}|${r.low}|${r.close}|${r.volume}`;
      if (seenRowKeys.has(key)) {
        exactDups++;
      } else {
        seenRowKeys.add(key);
      }

      if (
        r.open == null ||
        isNaN(r.open) ||
        r.high == null ||
        isNaN(r.high) ||
        r.low == null ||
        isNaN(r.low) ||
        r.close == null ||
        isNaN(r.close)
      ) {
        missingOhlc++;
      }
      if (r.volume == null || isNaN(r.volume)) {
        missingVolume++;
      }
    }

    const uniqueDates = new Set(symRows.map((r) => r.date)).size;
    const outliersCount = sym === 'TMA' ? 1 : sym === 'TMC' ? 2 : 0;
    const remainingRecommended = symRows.length - exactDups - missingOhlc;
    const remainingDropOutliers = remainingRecommended - outliersCount;

    bySymbolCounter[sym] = {
      raw_rows: symRows.length,
      unique_dates: uniqueDates,
      exact_duplicates: exactDups,
      missing_ohlc: missingOhlc,
      missing_volume: missingVolume,
      outliers_count: outliersCount,
      sessions_after_recommended: remainingRecommended,
      sessions_after_drop_outliers: remainingDropOutliers,
    };
  }

  // Write expected-clean.json
  const expectedClean = {
    filename: 'file-co-loi-lam-sach.xlsx',
    total_raw_rows: allRows.length,
    unique_symbols: ['TMA', 'TMB', 'TMC'],
    by_symbol: bySymbolCounter,
    expected_ops: {
      drop_exact_duplicates: {
        affected_rows: 6,
        default_enabled: true,
      },
      drop_rows_missing_ohlc: {
        affected_rows: 5,
        default_enabled: true,
      },
      fill_missing_volume_zero: {
        affected_rows: 4,
        default_enabled: false,
      },
      flag_outliers: {
        affected_rows: 3,
        default_enabled: true,
        affected_symbols: ['TMA', 'TMC'],
      },
      drop_flagged_outliers: {
        affected_rows: 3,
        default_enabled: false,
        violates_min_sessions: true,
        violating_symbol: 'TMC',
        remaining_sessions: 29,
        required_sessions: 30,
      },
    },
    zero_volume_sessions: 3,
  };

  const expectedPath = path.join(ROOT_DIR, 'samples', 'expected-clean.json');
  fs.writeFileSync(expectedPath, JSON.stringify(expectedClean, null, 2), 'utf8');

  const publicExpectedPath = path.join(SAMPLES_DIR, 'expected-clean.json');
  fs.writeFileSync(publicExpectedPath, JSON.stringify(expectedClean, null, 2), 'utf8');

  console.log(`Generated file-co-loi-lam-sach.xlsx (${allRows.length} rows) and expected-clean.json.`);
}

async function main() {
  try {
    await generateStandardFiles();
    await generateTestCases();
    await generateCleaningSampleFile();
    console.log('Sample generation completed successfully!');
  } catch (err) {
    console.error('Error generating samples:', err);
    process.exit(1);
  }
}

main();
