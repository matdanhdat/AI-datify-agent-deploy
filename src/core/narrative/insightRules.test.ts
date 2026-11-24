import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  runInsightRules,
  isUnlabeled,
  INSIGHT_THRESHOLDS,
  CHECK_AFTER_VALUES,
  INSIGHT_EMPTY_MESSAGE,
  type InsightInput,
} from './insightEngine';
import {
  evaluateInsightRules,
  toInsightInput,
  ALLOWED_CHECK_AFTER,
} from './insightRules';

const RETAIL_FIXTURE: InsightInput = {
  rowCount: 48,
  totalRevenue: 1135530000,
  totalProfit: 531850000,
  selectedMetricIds: [
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
  ],
  channels: [
    { name: 'Website', revenue: 454165000, profit: 216547000 },
    { name: 'Sàn thương mại điện tử', revenue: 367740000, profit: 165300000 },
    { name: 'Cửa hàng', revenue: 313625000, profit: 150003000 },
  ],
  products: [
    { name: 'Sơ mi', revenue: 373257000, profit: 172791000 },
    { name: 'Quần jeans', revenue: 363893000, profit: 158147000 },
    { name: 'Áo thun', revenue: 258092000, profit: 129810000 },
    { name: 'Túi tote', revenue: 94768000, profit: 51022000 },
    { name: 'Không xác định', revenue: 45520000, profit: 20080000 },
  ],
  regions: [
    { name: 'Miền Trung', revenue: 380718000 },
    { name: 'Miền Bắc', revenue: 372836000 },
    { name: 'Miền Nam', revenue: 355558000 },
    { name: 'Không xác định', revenue: 26418000 },
  ],
  months: [
    { label: '2026-07', revenue: 261246000 },
    { label: '2026-08', revenue: 296557000 },
    { label: '2026-09', revenue: 243511000 },
    { label: '2026-10', revenue: 334216000 },
  ],
  matrix: [
    { channel: 'Website', product: 'Áo thun', revenue: 99960000, profit: 51408000 },
    { channel: 'Website', product: 'Sơ mi', revenue: 148326000, profit: 69738000 },
    { channel: 'Website', product: 'Quần jeans', revenue: 120059000, profit: 52961000 },
    { channel: 'Website', product: 'Túi tote', revenue: 40300000, profit: 22360000 },
    { channel: 'Website', product: 'Không xác định', revenue: 45520000, profit: 20080000 },
    { channel: 'Cửa hàng', product: 'Áo thun', revenue: 77420000, profit: 39816000 },
    { channel: 'Cửa hàng', product: 'Sơ mi', revenue: 104331000, profit: 49053000 },
    { channel: 'Cửa hàng', product: 'Quần jeans', revenue: 105834000, profit: 46686000 },
    { channel: 'Cửa hàng', product: 'Túi tote', revenue: 26040000, profit: 14448000 },
    { channel: 'Sàn thương mại điện tử', product: 'Áo thun', revenue: 80712000, profit: 38586000 },
    { channel: 'Sàn thương mại điện tử', product: 'Sơ mi', revenue: 120600000, profit: 54000000 },
    { channel: 'Sàn thương mại điện tử', product: 'Quần jeans', revenue: 138000000, profit: 58500000 },
    { channel: 'Sàn thương mại điện tử', product: 'Túi tote', revenue: 28428000, profit: 14214000 },
  ],
};

describe('Prompt 5B-FIX 1.4: Bộ kiểm thử luật insight mới', () => {
  // Test 1: Retail 6 findings theo đúng thứ tự
  it('1. retail ra đúng 6 finding và thứ tự; mỗi finding có action KPI hợp lệ và checkAfter 5 giá trị', () => {
    const res = runInsightRules(RETAIL_FIXTURE);
    expect(res.findings.length).toBe(6);
    expect(res.findings.map((f) => f.ruleId)).toEqual([
      'R-LOW-MARGIN-HIGH-SHARE',
      'R-HIGH-MARGIN-LOW-SHARE',
      'R-MATRIX',
      'R-MOM',
      'R-CONC',
      'R-UNLABELED',
    ]);

    expect(res.findings[0].dimension).toBe('sản phẩm');
    expect(res.findings[0].headline).toContain('Quần jeans');
    expect(res.findings[1].dimension).toBe('sản phẩm');
    expect(res.findings[1].headline).toContain('Túi tote');
    expect(res.findings[2].headline).toContain('Website × Túi tote');
    expect(res.findings[2].headline).toContain('Cửa hàng × Túi tote (hòa)');
    expect(res.findings[2].headline).toContain('Sàn thương mại điện tử × Quần jeans');
    expect(res.findings[3].meaning).toContain('chưa đủ kỳ để kết luận xu hướng');
    expect(res.findings[4].dimension).toBe('kênh');
    expect(res.findings[4].kind).toBe('theo dõi');
    expect(res.findings[4].headline).toContain('Website');
    expect(res.findings[5].headline).toContain('sản phẩm và khu vực');

    // Không có finding R-CONC cho sản phẩm/khu vực (do dưới 35%)
    const concDims = res.findings.filter((f) => f.ruleId === 'R-CONC').map((f) => f.dimension);
    expect(concDims).toEqual(['kênh']);
    expect(res.findings.some((f) => f.ruleId === 'R-NO-MARGIN')).toBe(false);
    expect(res.findings.some((f) => f.ruleId === 'R-FEW-ROWS')).toBe(false);

    // Kiểm tra hành động
    for (const f of res.findings) {
      if (f.kind !== 'dữ liệu') {
        expect(f.actions.length).toBeGreaterThan(0);
        for (const a of f.actions) {
          expect(RETAIL_FIXTURE.selectedMetricIds).toContain(a.kpiMetricId);
          expect(CHECK_AFTER_VALUES).toContain(a.checkAfter);
        }
      }
    }
  });

  // Test 2: Thieu-gia-von
  it('2. thieu-gia-von: không totalProfit -> đúng R-CONC kênh, R-CONC khu vực, R-NO-MARGIN; không R-MOM', () => {
    const input: InsightInput = {
      rowCount: 54,
      totalRevenue: 723600000,
      totalProfit: null,
      channels: [
        { name: 'Sàn thương mại điện tử', revenue: 261000000 },
        { name: 'Cửa hàng', revenue: 241200000 },
        { name: 'Website', revenue: 221400000 },
      ],
      regions: [
        { name: 'Miền Nam', revenue: 255600000 },
        { name: 'Miền Trung', revenue: 241200000 },
        { name: 'Miền Bắc', revenue: 226800000 },
      ],
      months: [
        { label: '2026-05', revenue: 107100000 },
        { label: '2026-06', revenue: 112500000 },
        { label: '2026-07', revenue: 117900000 },
        { label: '2026-08', revenue: 123300000 },
        { label: '2026-09', revenue: 128700000 },
        { label: '2026-10', revenue: 134100000 },
      ],
      selectedMetricIds: [
        'total_revenue',
        'revenue_by_channel',
        'revenue_by_region',
        'revenue_by_month',
        'revenue_growth',
      ],
    };

    const res = runInsightRules(input);
    const ruleIds = res.findings.map((f) => f.ruleId);
    expect(ruleIds).toContain('R-CONC');
    expect(ruleIds).toContain('R-NO-MARGIN');
    expect(ruleIds).not.toContain('R-MOM');

    const concFindings = res.findings.filter((f) => f.ruleId === 'R-CONC');
    expect(concFindings.length).toBe(2);
    expect(concFindings[0].evidence[0].text).toContain('36,07%');
    expect(concFindings[1].evidence[0].text).toContain('35,32%');

    // Kiểm tra không chứa từ "biên" ngoài NO_MARGIN_SENTENCE
    for (const f of res.findings) {
      if (f.ruleId !== 'R-NO-MARGIN') {
        expect(f.headline.toLowerCase()).not.toContain('biên');
        expect(f.meaning.toLowerCase()).not.toContain('biên');
      }
    }
  });

  // Test 3: o-to
  it('3. o-to: TP.HCM 37,34% -> R-CONC khu vực + R-NO-MARGIN', () => {
    const input: InsightInput = {
      rowCount: 45,
      totalRevenue: 137400000000,
      totalProfit: null,
      regions: [
        { name: 'TP.HCM', revenue: 51300000000 },
        { name: 'Hà Nội', revenue: 43050000000 },
        { name: 'Đà Nẵng', revenue: 43050000000 },
      ],
      selectedMetricIds: ['total_revenue', 'revenue_by_region'],
    };

    const res = runInsightRules(input);
    expect(res.findings.map((f) => f.ruleId)).toEqual(['R-CONC', 'R-NO-MARGIN']);
    expect(res.findings[0].evidence[0].text).toContain('37,34%');
    expect(res.findings[0].dimension).toBe('khu vực');
  });

  // Test 4: Hòa hạng đầu
  it('4. hòa hạng đầu: A và B cùng 50.000.000 -> R-CONC kèm "(hòa)", không có câu "vượt qua"', () => {
    const input: InsightInput = {
      rowCount: 20,
      totalRevenue: 120000000,
      totalProfit: 50000000,
      regions: [
        { name: 'A', revenue: 50000000 },
        { name: 'B', revenue: 50000000 },
        { name: 'C', revenue: 20000000 },
      ],
      selectedMetricIds: ['total_revenue', 'revenue_by_region'],
    };

    const res = runInsightRules(input);
    const conc = res.findings.find((f) => f.ruleId === 'R-CONC');
    expect(conc).toBeDefined();
    expect(conc!.headline).toContain('(hòa)');
    expect(conc!.headline).toContain('A và B');
    expect(conc!.headline).not.toContain('vượt qua');
  });

  // Test 5: Không finding
  it('5. không finding: chỉ chọn total_revenue -> findings rỗng, emptyMessage đúng câu INSIGHT_EMPTY_MESSAGE', () => {
    const input: InsightInput = {
      ...RETAIL_FIXTURE,
      selectedMetricIds: ['total_revenue'],
    };
    const res = runInsightRules(input);
    expect(res.findings.length).toBe(0);
    expect(res.emptyMessage).toBe(INSIGHT_EMPTY_MESSAGE);
  });

  // Test 6: R-FEW-ROWS
  it('6. R-FEW-ROWS: rowCount 6 có R-FEW-ROWS chứa "(6 dòng)", rowCount 10 không có', () => {
    const inputFew: InsightInput = {
      rowCount: 6,
      totalRevenue: 100000000,
      totalProfit: 50000000,
      selectedMetricIds: ['total_revenue'],
    };
    const resFew = runInsightRules(inputFew);
    const few = resFew.findings.find((f) => f.ruleId === 'R-FEW-ROWS');
    expect(few).toBeDefined();
    expect(few!.headline).toContain('(6 dòng)');

    const inputTen: InsightInput = {
      ...inputFew,
      rowCount: 10,
    };
    const resTen = runInsightRules(inputTen);
    expect(resTen.findings.some((f) => f.ruleId === 'R-FEW-ROWS')).toBe(false);
  });

  // Test 7: Ngưỡng biên
  it('7. ngưỡng biên: R-LOW (share 0.25, -2.00 pp) & R-HIGH (share 0.15, +3.00 pp)', () => {
    const base: InsightInput = {
      rowCount: 20,
      totalRevenue: 100000000,
      totalProfit: 50000000, // overall 50%
      selectedMetricIds: ['gross_margin', 'revenue_by_channel', 'margin_by_channel'],
      channels: [
        { name: 'Ch1', revenue: 25000000, profit: 12000000 }, // share 25%, margin 48% (diff -2.00 pp) -> phát R-LOW
        { name: 'Ch2', revenue: 75000000, profit: 38000000 },
      ],
    };
    const resLowHit = runInsightRules(base);
    expect(resLowHit.findings.some((f) => f.ruleId === 'R-LOW-MARGIN-HIGH-SHARE')).toBe(true);

    const baseLowMiss: InsightInput = {
      ...base,
      channels: [
        { name: 'Ch1', revenue: 24990000, profit: 11995200 }, // share 24.99% -> không phát
        { name: 'Ch2', revenue: 75010000, profit: 38004800 },
      ],
    };
    expect(runInsightRules(baseLowMiss).findings.some((f) => f.ruleId === 'R-LOW-MARGIN-HIGH-SHARE')).toBe(false);

    // R-HIGH test
    const baseHighHit: InsightInput = {
      ...base,
      channels: [
        { name: 'Ch1', revenue: 15000000, profit: 7950000 }, // share 15%, margin 53% (+3.00 pp) -> phát R-HIGH
        { name: 'Ch2', revenue: 85000000, profit: 42050000 },
      ],
    };
    expect(runInsightRules(baseHighHit).findings.some((f) => f.ruleId === 'R-HIGH-MARGIN-LOW-SHARE')).toBe(true);

    const baseHighMiss: InsightInput = {
      ...base,
      channels: [
        { name: 'Ch1', revenue: 15010000, profit: 7955300 }, // share 15.01% -> không phát
        { name: 'Ch2', revenue: 84990000, profit: 42044700 },
      ],
    };
    expect(runInsightRules(baseHighMiss).findings.some((f) => f.ruleId === 'R-HIGH-MARGIN-LOW-SHARE')).toBe(false);
  });

  // Test 8: CONC
  it('8. CONC: share 0.35 phát theo dõi, 0.3499 không, 0.50 rủi ro, 1 nhóm không phát', () => {
    const inputWatch: InsightInput = {
      rowCount: 20,
      totalRevenue: 100000000,
      totalProfit: 50000000,
      selectedMetricIds: ['revenue_by_channel'],
      channels: [
        { name: 'A', revenue: 35000000 }, // 35%
        { name: 'B', revenue: 65000000 },
      ],
    };
    const resWatch = runInsightRules(inputWatch);
    const concWatch = resWatch.findings.find((f) => f.ruleId === 'R-CONC');
    expect(concWatch).toBeDefined();

    const inputRisk: InsightInput = {
      ...inputWatch,
      channels: [
        { name: 'A', revenue: 50000000 }, // 50%
        { name: 'B', revenue: 50000000 },
      ],
    };
    const resRisk = runInsightRules(inputRisk);
    const concRisk = resRisk.findings.find((f) => f.ruleId === 'R-CONC');
    expect(concRisk?.kind).toBe('rủi ro');

    const inputSingle: InsightInput = {
      ...inputWatch,
      channels: [{ name: 'A', revenue: 100000000 }],
    };
    expect(runInsightRules(inputSingle).findings.some((f) => f.ruleId === 'R-CONC')).toBe(false);
  });

  // Test 9: MOM
  it('9. MOM: +10.00% phát, +9.99% không; 3 tháng có "chưa đủ kỳ", 6 tháng không có', () => {
    const inputMomHit: InsightInput = {
      rowCount: 20,
      totalRevenue: 210000000,
      totalProfit: 100000000,
      selectedMetricIds: ['revenue_growth', 'revenue_by_month'],
      months: [
        { label: '2026-01', revenue: 100000000 },
        { label: '2026-02', revenue: 100000000 },
        { label: '2026-03', revenue: 110000000 }, // +10%
      ],
    };
    const resHit = runInsightRules(inputMomHit);
    const momHit = resHit.findings.find((f) => f.ruleId === 'R-MOM');
    expect(momHit).toBeDefined();
    expect(momHit?.meaning).toContain('chưa đủ kỳ để kết luận xu hướng');

    const inputMomMiss: InsightInput = {
      ...inputMomHit,
      months: [
        { label: '2026-01', revenue: 100000000 },
        { label: '2026-02', revenue: 100000000 },
        { label: '2026-03', revenue: 109990000 }, // +9.99%
      ],
    };
    expect(runInsightRules(inputMomMiss).findings.some((f) => f.ruleId === 'R-MOM')).toBe(false);

    const inputMom6M: InsightInput = {
      ...inputMomHit,
      months: [
        { label: '2026-01', revenue: 100000000 },
        { label: '2026-02', revenue: 100000000 },
        { label: '2026-03', revenue: 100000000 },
        { label: '2026-04', revenue: 100000000 },
        { label: '2026-05', revenue: 100000000 },
        { label: '2026-06', revenue: 110000000 },
      ],
    };
    const res6M = runInsightRules(inputMom6M);
    const mom6M = res6M.findings.find((f) => f.ruleId === 'R-MOM');
    expect(mom6M?.meaning).not.toContain('chưa đủ kỳ để kết luận xu hướng');
  });

  // Test 10: "Không xác định"
  it('10. nhóm "Không xác định" bị loại khỏi R-LOW/HIGH/MATRIX/CONC nhưng phát R-UNLABELED khi >= 2%', () => {
    const inputUnlabeled: InsightInput = {
      rowCount: 20,
      totalRevenue: 100000000,
      totalProfit: 50000000,
      selectedMetricIds: ['revenue_by_channel'],
      channels: [
        { name: 'Kênh 1', revenue: 60000000 },
        { name: 'Kênh 2', revenue: 38000000 },
        { name: 'Không xác định', revenue: 2000000 }, // 2%
      ],
    };
    const res = runInsightRules(inputUnlabeled);
    const un = res.findings.find((f) => f.ruleId === 'R-UNLABELED');
    expect(un).toBeDefined();

    const inputUnlabeledMiss: InsightInput = {
      ...inputUnlabeled,
      channels: [
        { name: 'Kênh 1', revenue: 60000000 },
        { name: 'Kênh 2', revenue: 38010000 },
        { name: 'Không xác định', revenue: 1990000 }, // 1.99%
      ],
    };
    expect(runInsightRules(inputUnlabeledMiss).findings.some((f) => f.ruleId === 'R-UNLABELED')).toBe(false);
  });

  // Test 11: MAX_FINDINGS = 6
  it('11. MAX_FINDINGS: giới hạn tối đa 6 finding theo đúng thứ tự priority', () => {
    const res = runInsightRules(RETAIL_FIXTURE);
    expect(res.findings.length).toBeLessThanOrEqual(INSIGHT_THRESHOLDS.MAX_FINDINGS);
    for (let i = 0; i < res.findings.length - 1; i++) {
      expect(res.findings[i].priority).toBeGreaterThanOrEqual(res.findings[i + 1].priority);
    }
  });

  // Test 12: kpiMetricId thuộc selectedMetricIds
  it('12. kpi không nằm trong selectedMetricIds thì hành động bị loại, không bịa id', () => {
    const input: InsightInput = {
      ...RETAIL_FIXTURE,
      selectedMetricIds: ['channel_product_matrix'], // không có margin_by_channel
    };
    const res = runInsightRules(input);
    const matrixFinding = res.findings.find((f) => f.ruleId === 'R-MATRIX');
    expect(matrixFinding).toBeDefined();
    for (const a of matrixFinding!.actions) {
      expect(input.selectedMetricIds).toContain(a.kpiMetricId);
    }
  });

  // Test 13: zero tên mẫu trong insightEngine.ts
  it('13. không có chuỗi nào trong engine chứa tên nhóm của file mẫu', () => {
    const enginePath = path.resolve(__dirname, 'insightEngine.ts');
    const content = fs.readFileSync(enginePath, 'utf-8');
    const pattern = /Website|Cửa hàng|Sàn|Áo thun|Túi tote|Quần jeans|Sơ mi|Miền/i;
    expect(pattern.test(content)).toBe(false);
  });

  // Test 14: check_after thuộc 5 giá trị và zero chuỗi cũ trong src/api
  it('14. check_after: mọi action ở mọi test thuộc 5 giá trị; zero chuỗi cũ trong src/api', () => {
    const res = runInsightRules(RETAIL_FIXTURE);
    for (const f of res.findings) {
      for (const a of f.actions) {
        expect(CHECK_AFTER_VALUES).toContain(a.checkAfter);
      }
    }
    for (const a of res.priorityActions) {
      expect(CHECK_AFTER_VALUES).toContain(a.checkAfter);
    }

    // Kiểm tra không còn mốc cũ
    expect(CHECK_AFTER_VALUES).toEqual(['1 tuần', '2 tuần', '4 tuần', '8 tuần', '1 quý']);
    expect(ALLOWED_CHECK_AFTER).toEqual(CHECK_AFTER_VALUES);
  });

  // Test ánh xạ từ bộ test cũ
  it('15. has correct constant thresholds', () => {
    expect(INSIGHT_THRESHOLDS.CONC_WATCH_SHARE).toBe(0.35);
    expect(INSIGHT_THRESHOLDS.CONC_RISK_SHARE).toBe(0.5);
    expect(INSIGHT_THRESHOLDS.MARGIN_HIGH_PP).toBe(3.0);
    expect(INSIGHT_THRESHOLDS.MARGIN_LOW_PP).toBe(2.0);
    expect(INSIGHT_THRESHOLDS.SHARE_SMALL).toBe(0.15);
    expect(INSIGHT_THRESHOLDS.SHARE_LARGE).toBe(0.25);
    expect(INSIGHT_THRESHOLDS.MOM_STRONG).toBe(0.1);
    expect(INSIGHT_THRESHOLDS.MIN_MONTHS_FOR_TREND).toBe(6);
    expect(INSIGHT_THRESHOLDS.UNLABELED_SHARE).toBe(0.02);
    expect(INSIGHT_THRESHOLDS.MAX_FINDINGS).toBe(6);
    expect(INSIGHT_THRESHOLDS.MAX_ACTIONS_PRIORITY).toBe(3);
  });

  it('16. filters unlabeled labels correctly with isUnlabeled helper', () => {
    expect(isUnlabeled('không xác định')).toBe(true);
    expect(isUnlabeled('trống')).toBe(true);
    expect(isUnlabeled('(trống)')).toBe(true);
    expect(isUnlabeled('chưa phân loại')).toBe(true);
    expect(isUnlabeled('unknown')).toBe(true);
    expect(isUnlabeled('N/A')).toBe(true);
    expect(isUnlabeled('Website')).toBe(false);
  });

  it('17. toInsightInput converts FactsTable / ComputeSelectedOutput seamlessly', () => {
    const input = toInsightInput(RETAIL_FIXTURE);
    expect(input.rowCount).toBe(48);
    expect(input.totalRevenue).toBe(1135530000);
    expect(input.totalProfit).toBe(531850000);
  });

  it('18. evaluateInsightRules generates findings with chips and prioritizes questions', () => {
    const factsTable: any = {
      facts: [
        { id: 'F1', label_vi: 'Tổng số dòng dữ liệu sạch', value: 48, display: '48 dòng', unit: 'dòng', raw_numbers: [48] },
        { id: 'F2', label_vi: 'Tổng doanh thu', value: 1135530000, display: '1.135.530.000 VND', unit: 'VND', raw_numbers: [1135530000] },
      ],
      period: '48 dòng',
      question_metric_ids: ['revenue_by_channel', 'margin_by_channel'],
    };

    const out = evaluateInsightRules(factsTable, ['revenue_by_channel', 'margin_by_channel']);
    expect(out).toBeDefined();
    expect(Array.isArray(out.findings)).toBe(true);
    expect(Array.isArray(out.priority_actions)).toBe(true);
  });
});
