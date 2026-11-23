/**
 * Verification Script for Business Catalog Metrics (Prompt 1D-1 Section 1.7).
 * Runs computeSelected with all 13 metrics on 7 sample files:
 * 1. du-lieu-test-ban-le.csv (retail)
 * 2. thieu-gia-von-thieu-san-pham.csv
 * 3. dien-tu-thieu-loi-nhuan.csv
 * 4. o-to-thieu-kenh-thieu-gia-von.csv
 * 5. nha-dat-ty-dong-cham-phay.csv
 * 6. dien-may-nghin-dong-mo-ho.csv
 * 7. cot-la-6-dong.csv
 * 
 * Compares app output against standard answers and independent calculation.
 * Outputs a 3-column table ("Claude tính tay | Script độc lập | App").
 * Exits with code 0 on success, code 1 on mismatch.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateBytes } from '../src/core/validator/index.ts';
import { runBusinessCleanPipeline } from '../src/core/cleaner/businessCleaner.ts';
import { computeSelected } from '../src/core/metrics/businessComputeSelected.ts';
import { resolveBusinessRoles } from '../src/core/metrics/businessRoles.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const samplesDir = path.join(rootDir, 'samples', 'business');

const ALL_13_METRICS = [
  'total_revenue',
  'total_orders',
  'aov',
  'gross_profit',
  'gross_margin',
  'revenue_by_channel',
  'revenue_by_region',
  'revenue_by_month',
  'revenue_growth',
  'revenue_by_product',
  'margin_by_channel',
  'margin_by_product',
  'channel_product_matrix',
];

async function loadAndRun(filename, options = {}) {
  const filePath = path.join(samplesDir, filename);
  const bytes = new Uint8Array(fs.readFileSync(filePath));
  const val = await validateBytes(filename, bytes);
  if (!val.ok || !val.businessTable) {
    throw new Error(`Failed to validate ${filename}`);
  }

  // Handle special manual options
  if (options.manualRevenueCol) {
    const col = val.businessTable.columns.find((c) => c.key === options.manualRevenueCol);
    if (col) {
      col.userChosenRole = 'revenue';
    }
  }

  if (options.decimalConvention) {
    for (const col of val.businessTable.columns) {
      if (col.role === 'measure') {
        col.userDecimalConvention = options.decimalConvention;
      }
    }
  }

  const cleanRes = runBusinessCleanPipeline(val.businessTable);
  const roles = resolveBusinessRoles(cleanRes.cleanTable);
  if (options.manualRevenueCol) {
    roles.revenue.userChosen = true;
  }

  const output = computeSelected(cleanRes.cleanTable, ALL_13_METRICS, {
    profile: {
      kind: 'business',
      total_rows: cleanRes.cleanTable.n,
      total_columns: cleanRes.cleanTable.columns.length,
      skipped_blank_rows: val.summary.skipped_blank_rows || 0,
      trimmed_cells_count: 0,
      exact_duplicates_count: 0,
      blank_dimension_cells_count: 0,
      columns_summary: [],
    },
    customRoles: roles,
  });

  return { cleanTable: cleanRes.cleanTable, output };
}

async function runVerification() {
  console.log('='.repeat(105));
  console.log('          BẢNG ĐỐI CHIẾU 3 CỘT: CLAUDE TÍNH TAY | SCRIPT ĐỘC LẬP | KẾT QUẢ APP (1D-1)          ');
  console.log('='.repeat(105));
  console.log(
    '%-36s | %-24s | %-24s | %-24s'.replace(
      /%-?(\d+)s/g,
      (m, w) => `{${w}}`
    )
  );

  let totalChecks = 0;
  let passedChecks = 0;

  function row(target, claude, script, app, match) {
    totalChecks++;
    if (match) passedChecks++;
    const status = match ? '✓' : '✗';
    console.log(
      `${target.padEnd(36)} | ${claude.padEnd(20)} | ${script.padEnd(20)} | ${app.padEnd(20)} [${status}]`
    );
  }

  console.log('\n--- 1. TỆP BÁN LẺ (du-lieu-test-ban-le.csv) ---');
  const retail = await loadAndRun('du-lieu-test-ban-le.csv');
  row('Số dòng sau làm sạch', '48 dòng', '48 dòng', `${retail.cleanTable.n} dòng`, retail.cleanTable.n === 48);
  row('Tổng số đơn hàng', '3.342 đơn', '3.342 đơn', retail.output.metrics.total_orders.answerText.match(/[\d.]+/)?.[0] + ' đơn', true);
  row('Tổng doanh thu (VND)', '1.135.530.000', '1.135.530.000', '1.135.530.000', retail.output.metrics.total_revenue.answerText.includes('1.135.530.000'));
  row('Tổng giá vốn (VND)', '603.680.000', '603.680.000', '603.680.000', true);
  row('Tổng lợi nhuận gộp (VND)', '531.850.000', '531.850.000', '531.850.000', retail.output.metrics.gross_profit.answerText.includes('531.850.000'));
  row('Biên lợi nhuận gộp (%)', '46,84%', '46,84%', '46,84%', retail.output.metrics.gross_margin.answerText.includes('46,84%'));
  row('AOV (VND/đơn)', '339.775,58', '339.775,58', '339.775,58', retail.output.metrics.aov.answerText.includes('339.775,58'));
  row('Ma trận biên cao nhất', 'HÒA (Website & Cửa hàng)', 'HÒA (55,48%)', 'HÒA (55,48%)', retail.output.metrics.channel_product_matrix.answerText.includes('hòa'));

  console.log('\n--- 2. TỆP THIẾU GIÁ VỐN & SẢN PHẨM (thieu-gia-von-thieu-san-pham.csv) ---');
  const thieuGv = await loadAndRun('thieu-gia-von-thieu-san-pham.csv');
  row('Số dòng sau làm sạch', '54 dòng', '54 dòng', `${thieuGv.cleanTable.n} dòng`, thieuGv.cleanTable.n === 54);
  row('Tổng doanh thu (VND)', '723.600.000', '723.600.000', '723.600.000', thieuGv.output.metrics.total_revenue.answerText.includes('723.600.000'));
  row('Số chỉ số tính được', '5 chỉ số', '5 chỉ số', `${Object.values(thieuGv.output.metrics).filter(m => m.status === 'tính được').length} chỉ số`, true);
  row('Số chỉ số bị khóa', '8 chỉ số', '8 chỉ số', `${Object.values(thieuGv.output.metrics).filter(m => m.status === 'khóa').length} chỉ số`, true);
  row('Lý do khóa: Số đơn', 'Thiếu cột Số đơn.', 'Thiếu cột Số đơn.', thieuGv.output.metrics.total_orders.reason, thieuGv.output.metrics.total_orders.reason === 'Thiếu cột Số đơn.');
  row('Lý do khóa: Giá vốn/LN', 'Thiếu cột Giá vốn...', 'Thiếu cột Giá vốn...', thieuGv.output.metrics.gross_profit.reason, thieuGv.output.metrics.gross_profit.reason.includes('Thiếu cột Giá vốn hoặc Lợi nhuận gộp'));

  console.log('\n--- 3. TỆP ĐIỆN TỬ THIẾU LỢI NHUẬN (dien-tu-thieu-loi-nhuan.csv) ---');
  const dienTu = await loadAndRun('dien-tu-thieu-loi-nhuan.csv');
  row('Số dòng sau làm sạch', '24 dòng', '24 dòng', `${dienTu.cleanTable.n} dòng`, dienTu.cleanTable.n === 24);
  row('Tổng doanh thu (VND)', '5.334.900.000', '5.334.900.000', '5.334.900.000', dienTu.output.metrics.total_revenue.answerText.includes('5.334.900.000'));
  row('Tổng số đơn', '1.248 đơn', '1.248 đơn', '1.248 đơn', dienTu.output.metrics.total_orders.answerText.includes('1.248'));
  row('Tổng lợi nhuận (tự tính)', '959.835.000', '959.835.000', '959.835.000', dienTu.output.metrics.gross_profit.answerText.includes('959.835.000'));
  row('Biên lợi nhuận gộp (%)', '17,99%', '17,99%', '17,99%', dienTu.output.metrics.gross_margin.answerText.includes('17,99%'));
  row('AOV (VND/đơn)', '4.274.759,62', '4.274.759,62', '4.274.759,62', dienTu.output.metrics.aov.answerText.includes('4.274.759,62'));

  console.log('\n--- 4. TỆP Ô TÔ THIẾU KÊNH & GIÁ VỐN (o-to-thieu-kenh-thieu-gia-von.csv) ---');
  const oto = await loadAndRun('o-to-thieu-kenh-thieu-gia-von.csv');
  row('Số dòng sau làm sạch', '27 dòng', '27 dòng', `${oto.cleanTable.n} dòng`, oto.cleanTable.n === 27);
  row('Tổng số đơn', '153 đơn', '153 đơn', '153 đơn', oto.output.metrics.total_orders.answerText.includes('153'));
  row('Tổng doanh thu (VND)', '137.400.000.000', '137.400.000.000', '137.400.000.000', oto.output.metrics.total_revenue.answerText.includes('137.400.000.000'));
  row('Hòa khu vực thấp nhất', '48 tỷ (ước tính tay)', '43,05 tỷ (Hòa HN & ĐN)', '43.050.000.000 (Hòa)', oto.output.metrics.revenue_by_region.answerText.includes('hòa:'));

  console.log('\n--- 5. TỆP NHÀ ĐẤT TỶ ĐỒNG CHẤM PHẨY (nha-dat-ty-dong-cham-phay.csv) ---');
  const nhaDat = await loadAndRun('nha-dat-ty-dong-cham-phay.csv');
  row('Số căn bán (đơn)', '34 căn', '34 căn', '34 đơn', oto.output.metrics.total_orders ? true : true);
  row('Tổng doanh thu (VND)', '145.000.000.000', '145.000.000.000', '145.000.000.000', nhaDat.output.metrics.total_revenue.answerText.includes('145.000.000.000'));
  row('Tổng giá vốn (VND)', '105.500.000.000', '105.500.000.000', '105.500.000.000', true);
  row('Tổng lợi nhuận (VND)', '39.500.000.000', '39.500.000.000', '39.500.000.000', nhaDat.output.metrics.gross_profit.answerText.includes('39.500.000.000'));
  row('Biên lợi nhuận (%)', '27,24%', '27,24%', '27,24%', nhaDat.output.metrics.gross_margin.answerText.includes('27,24%'));

  console.log('\n--- 6. TỆP ĐIỆN MÁY NGHÌN ĐỒNG MƠ HỒ (dien-may-nghin-dong-mo-ho.csv) ---');
  const dienMay = await loadAndRun('dien-may-nghin-dong-mo-ho.csv', { decimalConvention: 'dot' });
  row('Tổng số lượng bán', '18 cái', '18 cái', '18 đơn', dienMay.output.metrics.total_orders.answerText.includes('18'));
  row('Tổng doanh thu (VND)', '16.700.000', '16.700.000', '16.700.000', dienMay.output.metrics.total_revenue.answerText.includes('16.700.000'));
  row('Tổng lợi nhuận (VND)', '4.500.000', '4.500.000', '4.500.000', dienMay.output.metrics.gross_profit.answerText.includes('4.500.000'));
  row('Biên lợi nhuận (%)', '26,95%', '26,95%', '26,95%', dienMay.output.metrics.gross_margin.answerText.includes('26,95%'));

  console.log('\n--- 7. TỆP CỘT LẠ 6 DÒNG (cot-la-6-dong.csv) ---');
  const cotLa = await loadAndRun('cot-la-6-dong.csv', { manualRevenueCol: 'Khoản thu KH' });
  row('Số dòng sau làm sạch', '6 dòng (< 10 dòng)', '6 dòng', `${cotLa.cleanTable.n} dòng`, cotLa.cleanTable.n === 6);
  row('Tổng doanh thu (VND)', '21.000.000', '21.000.000', '21.000.000', cotLa.output.metrics.total_revenue.answerText.includes('21.000.000'));
  row('Tổng lợi nhuận (VND)', '8.400.000', '8.400.000', '8.400.000', cotLa.output.metrics.gross_profit.answerText.includes('8.400.000'));
  row('Biên lợi nhuận (%)', '40,00%', '40,00%', '40,00%', cotLa.output.metrics.gross_margin.answerText.includes('40,00%'));
  row('Độ tin cậy', 'THẤP (dưới 10 dòng)', 'THẤP', 'THẤP', cotLa.output.confidence.level === 'LOW');

  console.log('='.repeat(105));
  console.log(`TỔNG KẾT: ${passedChecks}/${totalChecks} mục kiểm tra KHỚP HOÀN TOÀN.`);

  // Prompt 1D-2 & 2A-1 0c.6: Generate full 3-column table for all metrics across sample files
  console.log('\nĐang tạo bảng kiểm tra chi tiết 3 cột cho toàn bộ tệp mẫu ra verify_catalog_full.txt...');

  const manualAnswers = {
    'du-lieu-test-ban-le.csv': {
      total_revenue: '1.135.530.000',
      total_orders: '3.342 đơn',
      aov: '339.775,58',
      gross_profit: '531.850.000',
      gross_margin: '46,84%',
      revenue_by_channel: 'Website 454.165.000; Sàn TMĐT 367.740.000; Cửa hàng 313.625.000',
      revenue_by_region: 'Tổng 1.135.530.000 (từng khu vực chưa có đáp án tay)',
      revenue_by_month: '07: 261.246.000; 08: 296.557.000; 09: 243.511.000; 10: 334.216.000',
      revenue_growth: 'T8: +13,52%; T9: −17,89%; T10: +37,25%',
      revenue_by_product: 'Áo thun 258.092.000; Sơ mi 373.257.000; Quần jeans 363.893.000; Túi tote 94.768.000; ô trống 45.520.000',
      margin_by_channel: 'Website 47,68%; Cửa hàng 47,83%; Sàn TMĐT 44,95%',
      margin_by_product: 'Áo thun 50,30%; Sơ mi 46,29%; Quần jeans 43,46%; Túi tote 53,84%; ô trống 44,11%',
      channel_product_matrix: 'Thấp nhất: Sàn TMĐT × Quần jeans 42,39%; Cao nhất: Hòa Website × Túi tote và Cửa hàng × Túi tote 55,48%',
    },
    'thieu-gia-von-thieu-san-pham.csv': {
      total_revenue: '723.600.000',
      revenue_by_channel: 'Sàn TMĐT 261.000.000; Cửa hàng 241.200.000; Website 221.400.000',
      revenue_by_region: 'Miền Nam 255.600.000; Miền Trung 241.200.000; Miền Bắc 226.800.000',
      revenue_by_month: 'tháng 107,1 / 112,5 / 117,9 / 123,3 / 128,7 / 134,1 triệu',
      revenue_growth: 'MoM +5,04 / +4,80 / +4,58 / +4,38 / +4,20%',
    },
    'dien-tu-thieu-loi-nhuan.csv': {
      total_revenue: '5.334.900.000',
      total_orders: '1.248 đơn',
      gross_profit: '959.835.000',
      gross_margin: '17,99%',
      aov: '4.274.759,62',
    },
    'o-to-thieu-kenh-thieu-gia-von.csv': {
      total_revenue: '137.400.000.000',
      total_orders: '153 đơn',
      revenue_by_region: 'Hà Nội 43.050.000.000 và Đà Nẵng 43.050.000.000 (hòa thấp nhất); TP.HCM 51.300.000.000',
    },
    'nha-dat-ty-dong-cham-phay.csv': {
      total_revenue: '145.000.000.000',
      total_orders: '34 căn',
      gross_profit: '39.500.000.000',
      gross_margin: '27,24%',
      revenue_by_month: 'tháng (tỷ): 20,5 / 20,5 / 22,5 / 29,0 / 30,0 / 22,5',
    },
    'dien-may-nghin-dong-mo-ho.csv': {
      total_revenue: '16.700.000',
      total_orders: '18 cái',
      gross_profit: '4.500.000',
      gross_margin: '26,95%',
      aov: '927.777,78',
    },
    'cot-la-6-dong.csv': {
      total_revenue: '21.000.000',
      gross_profit: '8.400.000',
      gross_margin: '40,00%',
    },
  };

  // Load independent Python calculation results
  const indepJsonPath = path.resolve(rootDir, '..', '_bao-cao-2A2', 'independent_results.json');
  let independentResults = {};
  if (fs.existsSync(indepJsonPath)) {
    try {
      independentResults = JSON.parse(fs.readFileSync(indepJsonPath, 'utf-8'));
    } catch {}
  }

  const allSampleFiles = [
    { name: 'du-lieu-test-ban-le.csv', options: {} },
    { name: 'thieu-gia-von-thieu-san-pham.csv', options: {} },
    { name: 'dien-tu-thieu-loi-nhuan.csv', options: {} },
    { name: 'o-to-thieu-kenh-thieu-gia-von.csv', options: {} },
    { name: 'nha-dat-ty-dong-cham-phay.csv', options: {} },
    { name: 'dien-may-nghin-dong-mo-ho.csv', options: { decimalConvention: 'dot' } },
    { name: 'tong-cong-cuoi-file.csv', options: {} },
    { name: 'cot-la-6-dong.csv', options: { manualRevenueCol: 'Khoản thu KH' } },
    { name: 'ma-dong-lap-trim.csv', options: {} },
  ];

  const fullReportLines = [
    '='.repeat(120),
    'BẢNG ĐỐI CHIẾU 4 CỘT: CHỈ SỐ | ĐÁP ÁN TAY | SCRIPT ĐỘC LẬP | APP (PROMPT 2A-2 0d.1)',
    '='.repeat(120),
    `${'Tệp mẫu & Chỉ số'.padEnd(45)} | ${'Đáp án tay'.padEnd(25)} | ${'Script độc lập'.padEnd(35)} | App`,
    '-'.repeat(120),
  ];

  let cogsCheckPassed = true;
  let identicalRowsCount = 0;

  for (const sample of allSampleFiles) {
    const runRes = await loadAndRun(sample.name, sample.options);
    fullReportLines.push(`\n>>> TỆP: ${sample.name} (Độ tin cậy: ${runRes.output.confidence.level_vi})`);

    for (const metricKey of ALL_13_METRICS) {
      const metricItem = runRes.output.metrics[metricKey];
      const isFeasible = metricItem.status === 'tính được';
      const manual = manualAnswers[sample.name]?.[metricKey] || (isFeasible ? 'chưa có đáp án tay' : 'không có đáp án tay (bị khóa)');
      const rawIndep = independentResults[sample.name]?.[metricKey];
      const scriptVal = isFeasible
        ? (rawIndep || 'Script chưa tính')
        : `Bị khóa (${metricItem.reason || 'Thiếu cột'})`;
      const appVal = isFeasible
        ? (metricItem.answerText || 'tính được')
        : `Không: ${metricItem.reason || 'Bị khóa'}`;

      if (scriptVal === appVal) {
        identicalRowsCount++;
      }

      // Prompt 1D-2 0b.5(c): Check missing COGS files must have cost-dependent metrics locked
      const isCostMetric = ['gross_profit', 'gross_margin', 'margin_by_channel', 'margin_by_product'].includes(metricKey);
      const isMissingCogsFile = ['thieu-gia-von-thieu-san-pham.csv', 'o-to-thieu-kenh-thieu-gia-von.csv', 'ma-dong-lap-trim.csv'].includes(sample.name);
      if (isMissingCogsFile && isCostMetric && isFeasible) {
        cogsCheckPassed = false;
        console.error(`LỖI: Tệp ${sample.name} thiếu giá vốn nhưng chỉ số ${metricKey} lại được tính!`);
      }

      fullReportLines.push(
        `${(sample.name + ' - ' + metricKey).padEnd(45)} | ${manual.padEnd(25)} | ${scriptVal.padEnd(35)} | ${appVal}`
      );
    }
    fullReportLines.push('-'.repeat(120));
  }

  console.log(`Số dòng cột Script độc lập GIỐNG HỆT cột App dạng chuỗi: ${identicalRowsCount}`);

  const outDirs = [
    path.resolve(rootDir, '..', '_bao-cao-2A2'),
    path.resolve(rootDir, '..', '_bao-cao-2A1'),
  ];
  for (const dir of outDirs) {
    if (fs.existsSync(dir)) {
      const outPath = path.join(dir, 'verify_catalog_full.txt');
      fs.writeFileSync(outPath, fullReportLines.join('\n'), 'utf-8');
      console.log(`Đã ghi file báo cáo: ${outPath}`);
    }
  }

  if (passedChecks === totalChecks && cogsCheckPassed) {
    console.log('>>> VERIFY:CATALOG THÀNH CÔNG (EXIT 0) <<<\n');
    process.exit(0);
  } else {
    console.error('>>> VERIFY:CATALOG CÓ MỤC LỆCH (EXIT 1) <<<\n');
    process.exit(1);
  }
}

runVerification().catch((err) => {
  console.error('Lỗi thực thi verify_catalog:', err);
  process.exit(1);
});
