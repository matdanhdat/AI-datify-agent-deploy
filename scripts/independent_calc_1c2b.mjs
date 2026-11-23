import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';

const SAMPLES_DIR = path.resolve('samples/business');
const EVIDENCE_DIR = path.resolve('../1C2b_evidence');

async function calcC1() {
  const filePath = path.join(SAMPLES_DIR, 'nhieu-sheet.xlsx');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  // Sheet "Doanh thu 2026"
  const sheet2026 = workbook.getWorksheet('Doanh thu 2026');
  let rows2026 = 0;
  let orders2026 = 0;
  let rev2026 = 0;
  let cogs2026 = 0;
  const channelRev2026 = {};

  sheet2026.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header
    rows2026++;
    const thang = row.getCell(1).value;
    const kenh = String(row.getCell(2).value).trim();
    const sp = row.getCell(3).value;
    const sodon = Number(row.getCell(4).value);
    const dt = Number(row.getCell(5).value);
    const gv = Number(row.getCell(6).value);

    orders2026 += sodon;
    rev2026 += dt;
    cogs2026 += gv;
    channelRev2026[kenh] = (channelRev2026[kenh] || 0) + dt;
  });

  const profit2026 = rev2026 - cogs2026;
  const margin2026 = (profit2026 / rev2026) * 100;
  const aov2026 = rev2026 / orders2026;

  // Sheet "Doanh thu 2025"
  const sheet2025 = workbook.getWorksheet('Doanh thu 2025');
  let rows2025 = 0;
  let orders2025 = 0;
  let rev2025 = 0;
  let cogs2025 = 0;

  sheet2025.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    rows2025++;
    const sodon = Number(row.getCell(4).value);
    const dt = Number(row.getCell(5).value);
    const gv = Number(row.getCell(6).value);
    orders2025 += sodon;
    rev2025 += dt;
    cogs2025 += gv;
  });

  const profit2025 = rev2025 - cogs2025;
  const margin2025 = (profit2025 / rev2025) * 100;

  return {
    c1_2026: {
      rows: rows2026,
      orders: orders2026,
      rev: rev2026,
      cogs: cogs2026,
      profit: profit2026,
      margin: margin2026,
      aov: aov2026,
      channels: channelRev2026,
    },
    c1_2025: {
      rows: rows2025,
      orders: orders2025,
      rev: rev2025,
      cogs: cogs2025,
      profit: profit2025,
      margin: margin2025,
    },
  };
}

function calcC2() {
  const filePath = path.join(SAMPLES_DIR, 'ma-dong-lap.csv');
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.trim().split('\n');
  const header = lines[0].split(',');
  const rows = lines.slice(1);

  let revTotal = 0;
  const channels = {};
  const rowStatuses = [];

  rows.forEach((line, idx) => {
    const parts = line.split(',');
    const id = parts[0];
    const thang = parts[1];
    const kenhRaw = parts[2];
    const kenhTrimmed = kenhRaw.trim();
    const dt = Number(parts[3]);

    revTotal += dt;
    channels[kenhTrimmed] = (channels[kenhTrimmed] || 0) + dt;

    if (kenhRaw !== kenhTrimmed) {
      rowStatuses.push({ rowNumber: idx + 2, id, status: 'Đã chuẩn hóa' });
    } else {
      rowStatuses.push({ rowNumber: idx + 2, id, status: '-' });
    }
  });

  return {
    rows: rows.length,
    rev: revTotal,
    channels,
    rowStatuses,
  };
}

function calcC3() {
  const filePath = path.join(SAMPLES_DIR, 'cot-la.csv');
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.trim().split('\n');
  const rows = lines.slice(1);

  let revTotal = 0;
  let cogsTotal = 0;
  const channels = {};
  const months = {};

  rows.forEach((line) => {
    const parts = line.split(',');
    const thang = parts[0].trim();
    const kenh = parts[1].trim();
    const dt = Number(parts[2].trim());
    const gv = Number(parts[3].trim());

    revTotal += dt;
    cogsTotal += gv;
    channels[kenh] = (channels[kenh] || 0) + dt;
    months[thang] = (months[thang] || 0) + dt;
  });

  const profit = revTotal - cogsTotal;
  const margin = (profit / revTotal) * 100;

  return {
    rows: rows.length,
    rev: revTotal,
    cogs: cogsTotal,
    profit,
    margin,
    channels,
    months,
  };
}

async function main() {
  const c1 = await calcC1();
  const c2 = calcC2();
  const c3 = calcC3();

  const report = [
    '====================================================================================',
    'BẢNG ĐỐI CHIẾU 3 CỘT: CLAUDE TÍNH TAY | SCRIPT ĐỘC LẬP | KỲ VỌNG APP',
    '====================================================================================\n',
    '--- (C1) nhieu-sheet.xlsx [Sheet Doanh thu 2026] ---',
    `Số dòng:           Claude: 8             | Script: ${c1.c1_2026.rows}             | Khớp: ${c1.c1_2026.rows === 8}`,
    `Số đơn:            Claude: 57            | Script: ${c1.c1_2026.orders}            | Khớp: ${c1.c1_2026.orders === 57}`,
    `Doanh thu:         Claude: 81.000.000    | Script: ${c1.c1_2026.rev.toLocaleString('vi-VN')}    | Khớp: ${c1.c1_2026.rev === 81000000}`,
    `Giá vốn:           Claude: 49.300.000    | Script: ${c1.c1_2026.cogs.toLocaleString('vi-VN')}    | Khớp: ${c1.c1_2026.cogs === 49300000}`,
    `Lợi nhuận:         Claude: 31.700.000    | Script: ${c1.c1_2026.profit.toLocaleString('vi-VN')}    | Khớp: ${c1.c1_2026.profit === 31700000}`,
    `Biên LN:           Claude: 39,14%        | Script: ${c1.c1_2026.margin.toFixed(2).replace('.', ',')}%        | Khớp: ${Math.abs(c1.c1_2026.margin - 39.14) < 0.01}`,
    `AOV:               Claude: 1.421.052,63  | Script: ${c1.c1_2026.aov.toFixed(2)}  | Khớp: ${Math.abs(c1.c1_2026.aov - 1421052.63) < 0.01}`,
    `Website:           Claude: 56.000.000    | Script: ${c1.c1_2026.channels['Website'].toLocaleString('vi-VN')}    | Khớp: ${c1.c1_2026.channels['Website'] === 56000000}`,
    `Cửa hàng:          Claude: 25.000.000    | Script: ${c1.c1_2026.channels['Cửa hàng'].toLocaleString('vi-VN')}    | Khớp: ${c1.c1_2026.channels['Cửa hàng'] === 25000000}`,
    `Kiểm tổng kênh:    56.000.000 + 25.000.000 = ${c1.c1_2026.channels['Website'] + c1.c1_2026.channels['Cửa hàng']} (Khớp doanh thu: ${c1.c1_2026.channels['Website'] + c1.c1_2026.channels['Cửa hàng'] === c1.c1_2026.rev})\n`,

    '--- (C1) nhieu-sheet.xlsx [Sheet Doanh thu 2025] ---',
    `Số dòng:           Claude: 4             | Script: ${c1.c1_2025.rows}             | Khớp: ${c1.c1_2025.rows === 4}`,
    `Số đơn:            Claude: 7             | Script: ${c1.c1_2025.orders}             | Khớp: ${c1.c1_2025.orders === 7}`,
    `Doanh thu:         Claude: 11.000.000    | Script: ${c1.c1_2025.rev.toLocaleString('vi-VN')}    | Khớp: ${c1.c1_2025.rev === 11000000}`,
    `Giá vốn:           Claude: 6.600.000     | Script: ${c1.c1_2025.cogs.toLocaleString('vi-VN')}     | Khớp: ${c1.c1_2025.cogs === 6600000}`,
    `Lợi nhuận:         Claude: 4.400.000     | Script: ${c1.c1_2025.profit.toLocaleString('vi-VN')}     | Khớp: ${c1.c1_2025.profit === 4400000}`,
    `Biên LN:           Claude: 40,00%        | Script: ${c1.c1_2025.margin.toFixed(2).replace('.', ',')}%        | Khớp: ${c1.c1_2025.margin === 40}\n`,

    '--- (C2) ma-dong-lap.csv ---',
    `Số dòng:           Claude: 5             | Script: ${c2.rows}             | Khớp: ${c2.rows === 5}`,
    `Doanh thu:         Claude: 15.000.000    | Script: ${c2.rev.toLocaleString('vi-VN')}    | Khớp: ${c2.rev === 15000000}`,
    `Website:           Claude: 7.000.000     | Script: ${c2.channels['Website'].toLocaleString('vi-VN')}     | Khớp: ${c2.channels['Website'] === 7000000}`,
    `Cửa hàng:          Claude: 8.000.000     | Script: ${c2.channels['Cửa hàng'].toLocaleString('vi-VN')}     | Khớp: ${c2.channels['Cửa hàng'] === 8000000}`,
    `Trạng thái dòng 2 (DH-001): Claude: '-'             | Script: '${c2.rowStatuses[0].status}' | Khớp: ${c2.rowStatuses[0].status === '-'}`,
    `Trạng thái dòng 3 (DH-001): Claude: 'Đã chuẩn hóa'  | Script: '${c2.rowStatuses[1].status}' | Khớp: ${c2.rowStatuses[1].status === 'Đã chuẩn hóa'}`,
    `Kiểm tổng kênh:    7.000.000 + 8.000.000 = ${c2.channels['Website'] + c2.channels['Cửa hàng']} (Khớp doanh thu: ${c2.channels['Website'] + c2.channels['Cửa hàng'] === c2.rev})\n`,

    '--- (C3) cot-la.csv (Sau gán Khoản thu KH -> Doanh thu) ---',
    `Số dòng:           Claude: 6             | Script: ${c3.rows}             | Khớp: ${c3.rows === 6}`,
    `Doanh thu:         Claude: 21.000.000    | Script: ${c3.rev.toLocaleString('vi-VN')}    | Khớp: ${c3.rev === 21000000}`,
    `Giá vốn:           Claude: 12.600.000    | Script: ${c3.cogs.toLocaleString('vi-VN')}    | Khớp: ${c3.cogs === 12600000}`,
    `Lợi nhuận:         Claude: 8.400.000     | Script: ${c3.profit.toLocaleString('vi-VN')}     | Khớp: ${c3.profit === 8400000}`,
    `Biên LN:           Claude: 40,00%        | Script: ${c3.margin.toFixed(2).replace('.', ',')}%        | Khớp: ${c3.margin === 40}`,
    `Website:           Claude: 9.000.000     | Script: ${c3.channels['Website'].toLocaleString('vi-VN')}     | Khớp: ${c3.channels['Website'] === 9000000}`,
    `Cửa hàng:          Claude: 12.000.000    | Script: ${c3.channels['Cửa hàng'].toLocaleString('vi-VN')}    | Khớp: ${c3.channels['Cửa hàng'] === 12000000}`,
    `Tháng 2026-01:     Claude: 3.000.000     | Script: ${c3.months['2026-01'].toLocaleString('vi-VN')}     | Khớp: ${c3.months['2026-01'] === 3000000}`,
    `Tháng 2026-02:     Claude: 7.000.000     | Script: ${c3.months['2026-02'].toLocaleString('vi-VN')}     | Khớp: ${c3.months['2026-02'] === 7000000}`,
    `Tháng 2026-03:     Claude: 11.000.000    | Script: ${c3.months['2026-03'].toLocaleString('vi-VN')}    | Khớp: ${c3.months['2026-03'] === 11000000}`,
    `Kiểm tổng kênh:    9.000.000 + 12.000.000 = ${c3.channels['Website'] + c3.channels['Cửa hàng']} (Khớp doanh thu: ${c3.channels['Website'] + c3.channels['Cửa hàng'] === c3.rev})`,
    `Kiểm tổng tháng:   3M + 7M + 11M = ${c3.months['2026-01'] + c3.months['2026-02'] + c3.months['2026-03']} (Khớp doanh thu: ${c3.months['2026-01'] + c3.months['2026-02'] + c3.months['2026-03'] === c3.rev})`,
  ].join('\n');

  console.log(report);
  const outPath = path.join(EVIDENCE_DIR, 'independent_calc.txt');
  fs.writeFileSync(outPath, report, 'utf8');
  console.log(`Saved calculation report to ${outPath}`);
}

main().catch(console.error);
