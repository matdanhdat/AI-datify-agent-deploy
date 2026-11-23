import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';

const SAMPLES_DIR = path.resolve('samples/business');
const EVIDENCE_DIR = path.resolve('../1C2b_evidence');

if (!fs.existsSync(SAMPLES_DIR)) {
  fs.mkdirSync(SAMPLES_DIR, { recursive: true });
}
if (!fs.existsSync(EVIDENCE_DIR)) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
}

async function generateC1() {
  const workbook = new ExcelJS.Workbook();

  // Sheet 1: "Ghi chú"
  // Ô A1 "Báo cáo nội bộ", A2 "Lập bởi phòng kinh doanh", A3 "Xem các sheet bên cạnh"
  const sheetNotes = workbook.addWorksheet('Ghi chú');
  sheetNotes.getCell('A1').value = 'Báo cáo nội bộ';
  sheetNotes.getCell('A2').value = 'Lập bởi phòng kinh doanh';
  sheetNotes.getCell('A3').value = 'Xem các sheet bên cạnh';

  // Sheet 2: "Doanh thu 2025" (header + 4 dòng)
  // Tháng | Kênh | Sản phẩm | Số đơn | Doanh thu (VND) | Giá vốn (VND)
  const sheet2025 = workbook.addWorksheet('Doanh thu 2025');
  sheet2025.addRow(['Tháng', 'Kênh', 'Sản phẩm', 'Số đơn', 'Doanh thu (VND)', 'Giá vốn (VND)']);
  sheet2025.addRow(['2025-11', 'Website', 'Áo', 2, 2000000, 1200000]);
  sheet2025.addRow(['2025-11', 'Cửa hàng', 'Áo', 1, 1000000, 600000]);
  sheet2025.addRow(['2025-12', 'Website', 'Quần', 3, 6000000, 3600000]);
  sheet2025.addRow(['2025-12', 'Cửa hàng', 'Quần', 1, 2000000, 1200000]);

  // Sheet 3: "Doanh thu 2026" (cùng header + 8 dòng)
  const sheet2026 = workbook.addWorksheet('Doanh thu 2026');
  sheet2026.addRow(['Tháng', 'Kênh', 'Sản phẩm', 'Số đơn', 'Doanh thu (VND)', 'Giá vốn (VND)']);
  sheet2026.addRow(['2026-01', 'Website', 'Áo', 10, 10000000, 6000000]);
  sheet2026.addRow(['2026-01', 'Cửa hàng', 'Áo', 5, 5000000, 3000000]);
  sheet2026.addRow(['2026-02', 'Website', 'Quần', 8, 16000000, 10000000]);
  sheet2026.addRow(['2026-02', 'Cửa hàng', 'Quần', 4, 8000000, 5000000]);
  sheet2026.addRow(['2026-03', 'Website', 'Áo', 12, 12000000, 7000000]);
  sheet2026.addRow(['2026-03', 'Cửa hàng', 'Áo', 6, 6000000, 3500000]);
  sheet2026.addRow(['2026-04', 'Website', 'Quần', 9, 18000000, 11000000]);
  sheet2026.addRow(['2026-04', 'Cửa hàng', 'Quần', 3, 6000000, 3800000]);

  const filePath = path.join(SAMPLES_DIR, 'nhieu-sheet.xlsx');
  await workbook.xlsx.writeFile(filePath);
  console.log(`Generated C1: ${filePath}`);
}

function generateC2() {
  // C2: ma-dong-lap.csv — mã dòng LẶP nhưng dòng KHÁC nhau (không phải bản trùng)
  // Mã đơn,Tháng,Kênh,Doanh thu (VND)
  // DH-001,2026-01,Website,1000000
  // DH-001,2026-01,Website ,2000000
  // DH-002,2026-02,Cửa hàng,3000000
  // DH-003,2026-02,Website,4000000
  // DH-003,2026-03,Cửa hàng,5000000
  // dòng 3 của file có dấu cách thừa sau "Website "
  const lines = [
    'Mã đơn,Tháng,Kênh,Doanh thu (VND)',
    'DH-001,2026-01,Website,1000000',
    'DH-001,2026-01,Website ,2000000',
    'DH-002,2026-02,Cửa hàng,3000000',
    'DH-003,2026-02,Website,4000000',
    'DH-003,2026-03,Cửa hàng,5000000',
  ];

  const filePath = path.join(SAMPLES_DIR, 'ma-dong-lap.csv');
  fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf8');
  console.log(`Generated C2: ${filePath}`);
}

function generateC3() {
  // C3: cot-la.csv — cột doanh thu có tên app không biết
  // Tháng,Kênh,Khoản thu KH,Giá vốn (VND)
  const lines = [
    'Tháng,Kênh,Khoản thu KH,Giá vốn (VND)',
    '2026-01,Website,1000000,600000',
    '2026-01,Cửa hàng,2000000,1200000',
    '2026-02,Website,3000000,1800000',
    '2026-02,Cửa hàng,4000000,2400000',
    '2026-03,Website,5000000,3000000',
    '2026-03,Cửa hàng,6000000,3600000',
  ];

  const filePath = path.join(SAMPLES_DIR, 'cot-la.csv');
  fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf8');
  console.log(`Generated C3: ${filePath}`);
}

async function main() {
  await generateC1();
  generateC2();
  generateC3();
}

main().catch(console.error);
