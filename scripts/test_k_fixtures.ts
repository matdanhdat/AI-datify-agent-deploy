import fs from 'node:fs';
import path from 'node:path';
import { validateBytes } from '../src/core/validator';
import { resolveBusinessRoles } from '../src/core/metrics/businessRoles';
import { buildBusinessFacts, checkFeasibility } from '../src/core/metrics/businessFeasibility';
import { BUSINESS_METRIC_CATALOG } from '../src/core/metrics/businessCatalog';
import type { BusinessTable, BusinessColumn } from '../src/core/businessTable';

const outDir = path.resolve('..', '1W-out');

// 1. Path A: validateBytes directly on the raw 2-row CSV
async function testPathA(name: string) {
  const filePath = path.join(outDir, `${name}.csv`);
  const buf = fs.readFileSync(filePath);
  console.log(`\n======================================================================`);
  console.log(`ĐƯỜNG THẬT 1: validateBytes trên file fixture gốc (${name}.csv)`);
  console.log(`======================================================================`);
  const outcome = await validateBytes(`${name}.csv`, new Uint8Array(buf));
  console.log(`validateBytes ok: ${outcome.ok}`);
  if (!outcome.ok) {
    console.log(`Nguyên văn lý do từ chối:`);
    for (const iss of outcome.issues) {
      console.log(`  Code: ${iss.code} | Mức độ: ${iss.severity} | Thông điệp: "${iss.message_vi}" | Khắc phục: "${iss.fix_vi}"`);
    }
  }
}

// 2. Path B: Internal real pipeline constructing BusinessTable from the exact rows
// using exact same logic as validateBusinessProfile
function makeTableFromK(name: string): BusinessTable {
  const n = 2;
  const source_row = new Int32Array([2, 3]);

  if (name === 'K5') {
    // Tháng,Kênh,Doanh thu,Giá vốn
    // 2026-01,Website,,10
    // 2026-02,Sàn thương mại điện tử,,20
    const col0: BusinessColumn = {
      role: 'time',
      key: 'time_0',
      label: 'Tháng',
      granularity: 'month',
      values: new Int32Array([672, 673]),
      raw_labels: ['2026-01', '2026-02'],
    };
    const col1: BusinessColumn = {
      role: 'dimension',
      key: 'dim_1',
      label: 'Kênh',
      categories: ['Website', 'Sàn thương mại điện tử'],
      codes: new Uint16Array([0, 1]),
    };
    const col2: BusinessColumn = {
      role: 'measure',
      key: 'meas_2',
      label: 'Doanh thu',
      values: new Float64Array([NaN, NaN]),
    };
    const col3: BusinessColumn = {
      role: 'measure',
      key: 'meas_3',
      label: 'Giá vốn',
      values: new Float64Array([10, 20]),
    };
    return { kind: 'business', n, source_row, columns: [col0, col1, col2, col3] };
  } else if (name === 'K9') {
    // Tháng,Kênh,Doanh thu,Giá vốn
    // ,Website,100,40
    // ,Sàn thương mại điện tử,200,80
    const col0: BusinessColumn = {
      role: 'time',
      key: 'time_0',
      label: 'Tháng',
      granularity: 'month',
      values: new Int32Array([0, 0]),
      raw_labels: ['', ''],
    };
    const col1: BusinessColumn = {
      role: 'dimension',
      key: 'dim_1',
      label: 'Kênh',
      categories: ['Website', 'Sàn thương mại điện tử'],
      codes: new Uint16Array([0, 1]),
    };
    const col2: BusinessColumn = {
      role: 'measure',
      key: 'meas_2',
      label: 'Doanh thu',
      values: new Float64Array([100, 200]),
    };
    const col3: BusinessColumn = {
      role: 'measure',
      key: 'meas_3',
      label: 'Giá vốn',
      values: new Float64Array([40, 80]),
    };
    return { kind: 'business', n, source_row, columns: [col0, col1, col2, col3] };
  } else {
    // K10
    // Tháng,Kênh,Doanh thu,Giá vốn
    // 2026-01,,100,40
    // 2026-02,,200,80
    const col0: BusinessColumn = {
      role: 'time',
      key: 'time_0',
      label: 'Tháng',
      granularity: 'month',
      values: new Int32Array([672, 673]),
      raw_labels: ['2026-01', '2026-02'],
    };
    const col1: BusinessColumn = {
      role: 'dimension',
      key: 'dim_1',
      label: 'Kênh',
      categories: [],
      codes: new Uint16Array([0xffff, 0xffff]),
    };
    const col2: BusinessColumn = {
      role: 'measure',
      key: 'meas_2',
      label: 'Doanh thu',
      values: new Float64Array([100, 200]),
    };
    const col3: BusinessColumn = {
      role: 'measure',
      key: 'meas_3',
      label: 'Giá vốn',
      values: new Float64Array([40, 80]),
    };
    return { kind: 'business', n, source_row, columns: [col0, col1, col2, col3] };
  }
}

function testPathB(name: string) {
  console.log(`\n======================================================================`);
  console.log(`ĐƯỜNG THẬT NỘI BỘ (BusinessTable -> resolveBusinessRoles -> buildBusinessFacts -> checkFeasibility) cho ${name}`);
  console.log(`======================================================================`);
  const table = makeTableFromK(name);
  const roles = resolveBusinessRoles(table);

  console.log(`--- Trạng thái từng vai trò (RoleStatus) ---`);
  for (const [rId, st] of Object.entries(roles)) {
    console.log(`  ${rId.padEnd(10)}: status="${(st as any).status}", colIdx=${(st as any).columnIndex}, colName="${(st as any).columnName || ''}", distinct=${(st as any).distinctCount}`);
  }

  const facts = buildBusinessFacts(table, roles);
  console.log(`\nFacts RoleStatus:`);
  for (const [rId, st] of Object.entries(facts.roleStatus)) {
    console.log(`  facts.roleStatus.${rId} = "${st}"`);
  }

  console.log(`\n--- Lý do khả thi của TỪNG trong 13 chỉ số ---`);
  for (const m of BUSINESS_METRIC_CATALOG) {
    const feas = checkFeasibility(m.id as any, facts);
    console.log(`  #${m.id.padEnd(24)} | feasible=${String(feas.feasible).padEnd(5)} | reason="${feas.feasible ? 'OK' : feas.reason}"`);
  }
}

async function run() {
  for (const k of ['K5', 'K9', 'K10']) {
    await testPathA(k);
    testPathB(k);
  }
}

run().catch(console.error);
