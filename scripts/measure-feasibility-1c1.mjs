/**
 * Independent Measurement Script for Prompt 1C-1.
 * ZERO imports from src/ or app code. Pure node:fs + node:crypto.
 * Evaluates feasibility and produces baseline verification metrics independently.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('=== ĐO KHẢ THI ĐỘC LẬP (SCRIPT MEASURE-FEASIBILITY-1C1) ===');
console.log('GIẢ ĐỊNH: Script coi mọi cột có mặt là ok, KHÔNG mô phỏng trạng thái "không đáng tin" của resolver.');

// 1. Fixed Catalog Definition (Independent)
const CATALOG = [
  {
    id: 'total_revenue',
    name: 'Tổng doanh thu',
    requiredRoles: ['revenue'],
    requiredAnyOf: [],
    constraints: [{ type: 'positive_sum', role: 'revenue' }],
  },
  {
    id: 'total_orders',
    name: 'Tổng số đơn',
    requiredRoles: ['orders'],
    requiredAnyOf: [],
    constraints: [{ type: 'positive_sum', role: 'orders' }],
  },
  {
    id: 'aov',
    name: 'Giá trị trung bình mỗi đơn',
    requiredRoles: ['revenue', 'orders'],
    requiredAnyOf: [],
    constraints: [
      { type: 'positive_sum', role: 'revenue' },
      { type: 'positive_sum', role: 'orders' },
    ],
  },
  {
    id: 'gross_profit',
    name: 'Lợi nhuận gộp',
    requiredRoles: ['revenue'],
    requiredAnyOf: [['cost', 'profit']],
    constraints: [
      { type: 'positive_sum', role: 'revenue' },
      { type: 'positive_sum', role: 'margin_source' },
    ],
  },
  {
    id: 'gross_margin',
    name: 'Biên lợi nhuận gộp',
    requiredRoles: ['revenue'],
    requiredAnyOf: [['cost', 'profit']],
    constraints: [
      { type: 'positive_sum', role: 'revenue' },
      { type: 'positive_sum', role: 'margin_source' },
    ],
  },
  {
    id: 'revenue_by_channel',
    name: 'Doanh thu theo kênh',
    requiredRoles: ['revenue', 'channel'],
    requiredAnyOf: [],
    constraints: [
      { type: 'positive_sum', role: 'revenue' },
      { type: 'min_distinct', role: 'channel', n: 2 },
    ],
  },
  {
    id: 'revenue_by_region',
    name: 'Doanh thu theo khu vực',
    requiredRoles: ['revenue', 'region'],
    requiredAnyOf: [],
    constraints: [
      { type: 'positive_sum', role: 'revenue' },
      { type: 'min_distinct', role: 'region', n: 2 },
    ],
  },
  {
    id: 'revenue_by_month',
    name: 'Doanh thu theo tháng',
    requiredRoles: ['revenue', 'period'],
    requiredAnyOf: [],
    constraints: [
      { type: 'positive_sum', role: 'revenue' },
      { type: 'min_months', n: 2 },
    ],
  },
  {
    id: 'revenue_growth',
    name: 'Tăng trưởng doanh thu theo tháng',
    requiredRoles: ['revenue', 'period'],
    requiredAnyOf: [],
    constraints: [
      { type: 'positive_sum', role: 'revenue' },
      { type: 'min_months', n: 2 },
    ],
  },
  {
    id: 'revenue_by_product',
    name: 'Doanh thu theo sản phẩm',
    requiredRoles: ['revenue', 'product'],
    requiredAnyOf: [],
    constraints: [
      { type: 'positive_sum', role: 'revenue' },
      { type: 'min_distinct', role: 'product', n: 2 },
    ],
  },
  {
    id: 'margin_by_channel',
    name: 'Biên lợi nhuận theo kênh',
    requiredRoles: ['revenue', 'channel'],
    requiredAnyOf: [['cost', 'profit']],
    constraints: [
      { type: 'positive_sum', role: 'revenue' },
      { type: 'positive_sum', role: 'margin_source' },
      { type: 'min_distinct', role: 'channel', n: 2 },
    ],
  },
  {
    id: 'margin_by_product',
    name: 'Biên lợi nhuận theo sản phẩm',
    requiredRoles: ['revenue', 'product'],
    requiredAnyOf: [['cost', 'profit']],
    constraints: [
      { type: 'positive_sum', role: 'revenue' },
      { type: 'positive_sum', role: 'margin_source' },
      { type: 'min_distinct', role: 'product', n: 2 },
    ],
  },
  {
    id: 'channel_product_matrix',
    name: 'Biên lợi nhuận theo kênh và sản phẩm',
    requiredRoles: ['revenue', 'channel', 'product'],
    requiredAnyOf: [['cost', 'profit']],
    constraints: [
      { type: 'positive_sum', role: 'revenue' },
      { type: 'positive_sum', role: 'margin_source' },
      { type: 'min_distinct', role: 'channel', n: 2 },
      { type: 'min_distinct', role: 'product', n: 2 },
    ],
  },
];

// Helper: parse CSV string with quotes & BOM strip
function parseCsv(content) {
  let text = content;
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  function parseLine(line) {
    const res = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === ',' && !inQuotes) {
        res.push(cur.trim());
        cur = '';
      } else {
        cur += c;
      }
    }
    res.push(cur.trim());
    return res;
  }

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows };
}

function parseMonth(val) {
  if (!val) return null;
  const s = String(val).trim();
  const m1 = s.match(/^([12]\d{3})-(0[1-9]|1[0-2])/);
  if (m1) {
    const y = parseInt(m1[1], 10);
    if (y >= 1900 && y <= 2100) return `${m1[1]}-${m1[2]}`;
  }
  const m2 = s.match(/^([12]\d{3})\/(0[1-9]|1[0-2])/);
  if (m2) {
    const y = parseInt(m2[1], 10);
    if (y >= 1900 && y <= 2100) return `${m2[1]}-${m2[2]}`;
  }
  return null;
}

// 2. File Specifications and Mappings
const FILES = [
  {
    name: 'du-lieu-test-ban-le.csv',
    relPath: '../samples/business/du-lieu-test-ban-le.csv',
    mapping: {
      revenue: 'Doanh thu (VND)',
      orders: 'Số đơn',
      cost: 'Chi phí giá vốn (VND)',
      profit: 'Lợi nhuận gộp (VND)',
      product: 'Sản phẩm',
      channel: 'Kênh bán',
      region: 'Khu vực',
      period: 'Tháng',
    },
  },
  {
    name: 'thieu-gia-von-thieu-san-pham.csv',
    relPath: '../samples/business/thieu-gia-von-thieu-san-pham.csv',
    mapping: {
      revenue: 'Doanh thu (VND)',
      orders: null,
      cost: null,
      profit: null,
      product: null,
      channel: 'Kênh',
      region: 'Khu vực',
      period: 'Tháng',
    },
  },
];

for (const f of FILES) {
  const fullPath = path.resolve(__dirname, f.relPath);
  const rawText = fs.readFileSync(fullPath, 'utf8');
  const { headers, rows } = parseCsv(rawText);

  console.log(`\n======================================================`);
  console.log(`TỆP: ${f.name}`);
  console.log(`Số dòng dữ liệu: ${rows.length}`);
  console.log(`Các cột: ${headers.join(', ')}`);

  // a) Column statistics
  const colStats = {};
  for (const [role, colName] of Object.entries(f.mapping)) {
    if (!colName) {
      colStats[role] = { present: false };
      continue;
    }
    const idx = headers.indexOf(colName);
    if (idx === -1) {
      colStats[role] = { present: false };
      continue;
    }

    const nonBlankVals = [];
    const distinctSet = new Set();
    let sum = 0;
    let isNumeric = false;

    for (const r of rows) {
      const v = r[idx];
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        const strVal = String(v).trim();
        nonBlankVals.push(strVal);
        distinctSet.add(strVal);
        const num = parseFloat(strVal.replace(/,/g, ''));
        if (!isNaN(num)) {
          sum += num;
          isNumeric = true;
        }
      }
    }

    colStats[role] = {
      present: true,
      colName,
      nonBlankCount: nonBlankVals.length,
      distinctCount: distinctSet.size,
      sum: isNumeric ? sum : null,
    };
  }

  console.log('\n--- Thống kê các cột đã ánh xạ ---');
  for (const [role, s] of Object.entries(colStats)) {
    if (!s.present) {
      console.log(`  - [${role}]: (Không có cột)`);
    } else {
      console.log(
        `  - [${role} -> "${s.colName}"]: ${s.nonBlankCount} ô không trống, ${s.distinctCount} giá trị khác nhau, Tổng = ${s.sum !== null ? s.sum.toLocaleString('vi-VN') : 'N/A'}`
      );
    }
  }

  // Margin Source decision
  let marginSource = 'none';
  if (colStats.cost?.present && colStats.profit?.present) {
    console.log('CẢNH BÁO: File có cả cột Giá vốn và Lợi nhuận gộp. Script chọn nguồn biên: cost.');
    marginSource = 'cost';
  } else if (colStats.cost?.present) {
    marginSource = 'cost';
  } else if (colStats.profit?.present) {
    marginSource = 'profit';
  }
  console.log(`Nguồn biên được chọn: ${marginSource}`);

  // Build facts
  const monthsSet = new Set();
  const periodIdx = f.mapping.period ? headers.indexOf(f.mapping.period) : -1;
  if (periodIdx !== -1) {
    for (const r of rows) {
      const parsed = parseMonth(r[periodIdx]);
      if (parsed) monthsSet.add(parsed);
    }
  }

  const roleStatus = {
    revenue: colStats.revenue?.present ? 'ok' : 'missing',
    orders: colStats.orders?.present ? 'ok' : 'missing',
    cost: colStats.cost?.present ? 'ok' : 'missing',
    profit: colStats.profit?.present ? 'ok' : 'missing',
    product: colStats.product?.present ? 'ok' : 'missing',
    channel: colStats.channel?.present ? 'ok' : 'missing',
    region: colStats.region?.present ? 'ok' : 'missing',
    period: colStats.period?.present ? 'ok' : 'missing',
  };

  const sums = {
    revenue: colStats.revenue?.sum || 0,
    orders: colStats.orders?.sum || 0,
    margin_source: marginSource === 'cost' ? colStats.cost?.sum : marginSource === 'profit' ? colStats.profit?.sum : null,
  };

  const distinct = {
    channel: colStats.channel?.distinctCount || 0,
    region: colStats.region?.distinctCount || 0,
    product: colStats.product?.distinctCount || 0,
  };

  // b) Evaluate 13 metrics
  console.log('\n--- Bảng kết quả khả thi độc lập (FEAS|) ---');
  for (const m of CATALOG) {
    let feasible = true;
    let reason = '';

    // Check (1) missing
    const missingRoles = m.requiredRoles.filter((r) => roleStatus[r] === 'missing');
    let anyOfMissing = false;
    for (const group of m.requiredAnyOf) {
      if (group.every((r) => roleStatus[r] === 'missing')) {
        anyOfMissing = true;
        break;
      }
    }

    if (missingRoles.length > 0 || anyOfMissing) {
      feasible = false;
      const labels = [];
      if (missingRoles.includes('revenue')) labels.push('Doanh thu');
      if (missingRoles.includes('orders')) labels.push('Số đơn');
      if (anyOfMissing) labels.push('Giá vốn hoặc Lợi nhuận gộp');
      else {
        if (missingRoles.includes('cost')) labels.push('Giá vốn');
        if (missingRoles.includes('profit')) labels.push('Lợi nhuận gộp');
      }
      if (missingRoles.includes('product')) labels.push('Sản phẩm');
      if (missingRoles.includes('channel')) labels.push('Kênh');
      if (missingRoles.includes('region')) labels.push('Khu vực');
      if (missingRoles.includes('period')) labels.push('Tháng');

      reason = `Thiếu cột ${labels.join(', ')}.`;
    }

    // Check (2) constraints
    if (feasible) {
      for (const c of m.constraints) {
        if (c.type === 'positive_sum') {
          if (c.role === 'revenue' && sums.revenue <= 0) {
            feasible = false;
            reason = 'Cột Doanh thu không có giá trị dương.';
            break;
          }
          if (c.role === 'orders' && sums.orders <= 0) {
            feasible = false;
            reason = 'Cột Số đơn không có giá trị dương.';
            break;
          }
          if (c.role === 'margin_source' && (sums.margin_source === null || sums.margin_source <= 0)) {
            const roleLabel = marginSource === 'profit' ? 'Lợi nhuận gộp' : 'Giá vốn';
            feasible = false;
            reason = `Cột ${roleLabel} không có giá trị dương.`;
            break;
          }
        } else if (c.type === 'min_distinct') {
          const count = distinct[c.role] || 0;
          const roleLabel = c.role === 'channel' ? 'Kênh' : c.role === 'region' ? 'Khu vực' : 'Sản phẩm';
          if (count === 0) {
            feasible = false;
            reason = `Cột ${roleLabel} không có giá trị nào.`;
            break;
          }
          if (count === 1) {
            feasible = false;
            reason = `Cột ${roleLabel} chỉ có 1 giá trị, không có gì để so sánh.`;
            break;
          }
        } else if (c.type === 'min_months') {
          const mCount = monthsSet.size;
          if (mCount === 0) {
            feasible = false;
            reason = 'Không dòng nào có tháng hợp lệ.';
            break;
          }
          if (mCount === 1) {
            feasible = false;
            reason = 'Chỉ có 1 tháng hợp lệ, không đủ để so sánh theo thời gian.';
            break;
          }
        }
      }
    }

    console.log(`FEAS|${f.name}|${m.id}|${feasible}|${reason}`);
  }

  // c) Channel x Product matrix ONLY for du-lieu-test-ban-le.csv
  if (f.name === 'du-lieu-test-ban-le.csv') {
    console.log('\n--- Ma trận Kênh x Sản phẩm (Độc lập) ---');
    const chIdx = headers.indexOf(f.mapping.channel);
    const prIdx = headers.indexOf(f.mapping.product);
    const revIdx = headers.indexOf(f.mapping.revenue);
    const costIdx = headers.indexOf(f.mapping.cost);

    const cellMap = new Map();
    const chTotals = new Map();
    const prTotals = new Map();

    for (const r of rows) {
      const chRaw = r[chIdx]?.trim() || 'Không xác định';
      const prRaw = r[prIdx]?.trim() || 'Không xác định';
      const rev = parseFloat(r[revIdx]?.replace(/,/g, '') || '0') || 0;
      const cost = parseFloat(r[costIdx]?.replace(/,/g, '') || '0') || 0;

      const cellKey = `${chRaw} | ${prRaw}`;
      let cAcc = cellMap.get(cellKey);
      if (!cAcc) {
        cAcc = { channel: chRaw, product: prRaw, rows: 0, revenue: 0, cost: 0 };
        cellMap.set(cellKey, cAcc);
      }
      cAcc.rows++;
      cAcc.revenue += rev;
      cAcc.cost += cost;

      let chAcc = chTotals.get(chRaw);
      if (!chAcc) {
        chAcc = { rows: 0, revenue: 0, cost: 0 };
        chTotals.set(chRaw, chAcc);
      }
      chAcc.rows++;
      chAcc.revenue += rev;
      chAcc.cost += cost;

      let prAcc = prTotals.get(prRaw);
      if (!prAcc) {
        prAcc = { rows: 0, revenue: 0, cost: 0 };
        prTotals.set(prRaw, prAcc);
      }
      prAcc.rows++;
      prAcc.revenue += rev;
      prAcc.cost += cost;
    }

    console.log('Kênh | Sản phẩm | Số dòng | Doanh thu | Giá vốn | Lợi nhuận | Biên %');
    let totalCellRev = 0;
    let totalCellCost = 0;
    let totalCellRows = 0;

    for (const [k, c] of cellMap.entries()) {
      const profit = c.revenue - c.cost;
      const margin = c.revenue > 0 ? (profit / c.revenue) * 100 : 0;
      totalCellRev += c.revenue;
      totalCellCost += c.cost;
      totalCellRows += c.rows;

      console.log(
        `${c.channel} | ${c.product} | ${c.rows} | ${c.revenue.toLocaleString('vi-VN')} | ${c.cost.toLocaleString('vi-VN')} | ${profit.toLocaleString('vi-VN')} | ${margin.toFixed(2)}%`
      );
    }

    console.log('\n--- Kiểm tra cộng ma trận ---');
    const colRevTotal = colStats.revenue.sum;
    const colCostTotal = colStats.cost.sum;

    const revCheck = totalCellRev === colRevTotal ? 'OK' : 'FAIL';
    const costCheck = totalCellCost === colCostTotal ? 'OK' : 'FAIL';
    const profitCheck = totalCellRev - totalCellCost === colRevTotal - colCostTotal ? 'OK' : 'FAIL';
    const rowCheck = totalCellRows === rows.length ? 'OK' : 'FAIL';

    console.log(`1. Tổng doanh thu các ô (${totalCellRev.toLocaleString('vi-VN')}) = Tổng cột (${colRevTotal.toLocaleString('vi-VN')}): ${revCheck}`);
    console.log(`2. Tổng giá vốn các ô (${totalCellCost.toLocaleString('vi-VN')}) = Tổng cột (${colCostTotal.toLocaleString('vi-VN')}): ${costCheck}`);
    console.log(`3. Tổng lợi nhuận các ô (${(totalCellRev - totalCellCost).toLocaleString('vi-VN')}) = Doanh thu - Giá vốn: ${profitCheck}`);
    console.log(`4. Tổng số dòng các ô (${totalCellRows}) = rowCount (${rows.length}): ${rowCheck}`);

    // Channel check
    let chCrossRev = 0;
    for (const [ch, acc] of chTotals.entries()) {
      chCrossRev += acc.revenue;
    }
    console.log(`5. Tổng theo từng kênh khớp cộng ngang/dọc (${chCrossRev.toLocaleString('vi-VN')}): ${chCrossRev === colRevTotal ? 'OK' : 'FAIL'}`);

    // Product check
    let prCrossRev = 0;
    for (const [pr, acc] of prTotals.entries()) {
      prCrossRev += acc.revenue;
    }
    console.log(`6. Tổng theo từng sản phẩm khớp cộng ngang/dọc (${prCrossRev.toLocaleString('vi-VN')}): ${prCrossRev === colRevTotal ? 'OK' : 'FAIL'}`);
  }
}
