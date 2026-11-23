import { describe, it, expect } from 'vitest';
import {
  INSIGHT_THRESHOLDS,
  ALLOWED_CHECK_AFTER,
  evaluateInsightRules,
  isUnlabeledLabel,
} from './insightRules';
import type { FactsTable } from './factsBuilder';

describe('Deterministic Insight Rule Engine (Prompt 5A)', () => {
  it('has correct constant thresholds', () => {
    expect(INSIGHT_THRESHOLDS.CONC_WATCH_SHARE).toBe(0.35);
    expect(INSIGHT_THRESHOLDS.CONC_RISK_SHARE).toBe(0.5);
    expect(INSIGHT_THRESHOLDS.MARGIN_HIGH_PP).toBe(3.0);
    expect(INSIGHT_THRESHOLDS.MARGIN_LOW_PP).toBe(2.0);
    expect(INSIGHT_THRESHOLDS.SHARE_SMALL).toBe(0.15);
    expect(INSIGHT_THRESHOLDS.SHARE_LARGE).toBe(0.25);
    expect(INSIGHT_THRESHOLDS.MOM_STRONG).toBe(0.1);
    expect(INSIGHT_THRESHOLDS.UNLABELED_SHARE).toBe(0.02);
    expect(INSIGHT_THRESHOLDS.MAX_FINDINGS).toBe(6);
    expect(INSIGHT_THRESHOLDS.MAX_ACTIONS_PRIORITY).toBe(3);
  });

  it('filters unlabeled labels correctly', () => {
    expect(isUnlabeledLabel('Không xác định')).toBe(true);
    expect(isUnlabeledLabel('(trống)')).toBe(true);
    expect(isUnlabeledLabel('N/A')).toBe(true);
    expect(isUnlabeledLabel('Chưa rõ')).toBe(true);
    expect(isUnlabeledLabel('Shopee')).toBe(false);
    expect(isUnlabeledLabel('Miền Nam')).toBe(false);
  });

  it('triggers R-FEW-ROWS when dataset has < 10 rows', () => {
    const mockFactsTable: FactsTable = {
      hash: 'testhash',
      byte_size: 100,
      generated_at: new Date().toISOString(),
      dataset_kind: 'business',
      period: '1 kỳ',
      facts: [
        {
          id: 'F1',
          category: 'total',
          label_vi: 'Tổng số dòng dữ liệu sạch và kỳ khảo sát',
          value: 6,
          display: '6 dòng (1 kỳ)',
          unit: 'dòng',
          raw_numbers: [6],
        },
        {
          id: 'F2',
          category: 'total',
          label_vi: 'Tổng doanh thu',
          value: 50000000,
          display: '50.000.000 VND',
          unit: 'VND',
          raw_numbers: [50000000],
        },
      ],
      metrics_result: {},
    };

    const out = evaluateInsightRules(mockFactsTable);
    const ruleIds = out.findings.map((f) => f.rule_id);
    expect(ruleIds).toContain('R-FEW-ROWS');
    const finding = out.findings.find((f) => f.rule_id === 'R-FEW-ROWS')!;
    expect(finding.source_refs).toContain('F1');
    expect(ALLOWED_CHECK_AFTER).toContain(finding.check_after);
  });

  it('triggers R-NO-MARGIN when margin and cost are missing', () => {
    const mockFactsTable: FactsTable = {
      hash: 'testhash',
      byte_size: 100,
      generated_at: new Date().toISOString(),
      dataset_kind: 'business',
      period: '1 kỳ',
      facts: [
        {
          id: 'F1',
          category: 'total',
          label_vi: 'Tổng số dòng dữ liệu sạch và kỳ khảo sát',
          value: 48,
          display: '48 dòng (1 kỳ)',
          unit: 'dòng',
          raw_numbers: [48],
        },
        {
          id: 'F2',
          category: 'total',
          label_vi: 'Tổng doanh thu',
          value: 100000000,
          display: '100.000.000 VND',
          unit: 'VND',
          raw_numbers: [100000000],
        },
      ],
      metrics_result: {},
    };

    const out = evaluateInsightRules(mockFactsTable);
    const ruleIds = out.findings.map((f) => f.rule_id);
    expect(ruleIds).toContain('R-NO-MARGIN');
    const finding = out.findings.find((f) => f.rule_id === 'R-NO-MARGIN')!;
    expect(finding.kpi_metric_id).toBe('gross_profit');
  });

  it('triggers R-CONC and handles ties with proper naming', () => {
    const mockFactsTable: FactsTable = {
      hash: 'testhash',
      byte_size: 100,
      generated_at: new Date().toISOString(),
      dataset_kind: 'business',
      period: '1 kỳ',
      facts: [
        {
          id: 'F1',
          category: 'total',
          label_vi: 'Tổng số dòng dữ liệu sạch và kỳ khảo sát',
          value: 20,
          display: '20 dòng',
          unit: 'dòng',
          raw_numbers: [20],
        },
        {
          id: 'F2',
          category: 'total',
          label_vi: 'Tổng doanh thu',
          value: 100000000,
          display: '100.000.000 VND',
          unit: 'VND',
          raw_numbers: [100000000],
        },
        {
          id: 'F3',
          category: 'total',
          label_vi: 'Biên lợi nhuận gộp tổng thể',
          value: 20.0,
          display: '20.00%',
          unit: '%',
          raw_numbers: [20.0],
        },
      ],
      metrics_result: {
        revenue_by_region: {
          id: 'revenue_by_region',
          name: 'Doanh thu theo khu vực',
          status: 'tính được',
          feasible: true,
          answerText: '',
          events: [],
          pivot: {
            dimension: 'Khu vực',
            headers: ['Khu vực', 'Doanh thu'],
            rows: [
              { key: 'Miền Bắc', label: 'Miền Bắc', revenue: 40000000 },
              { key: 'Miền Nam', label: 'Miền Nam', revenue: 40000000 },
              { key: 'Miền Trung', label: 'Miền Trung', revenue: 20000000 },
            ],
          },
        },
      },
    };

    const out = evaluateInsightRules(mockFactsTable);
    const concFinding = out.findings.find((f) => f.rule_id === 'R-CONC');
    expect(concFinding).toBeDefined();
    expect(concFinding!.title).toContain('hòa nhau');
    expect(concFinding!.title).toContain('Miền Bắc');
    expect(concFinding!.title).toContain('Miền Nam');
  });

  it('triggers R-LOW-MARGIN-HIGH-SHARE when share >= 25% and margin < overall - 2 pp', () => {
    const mockFactsTable: FactsTable = {
      hash: 'testhash',
      byte_size: 100,
      generated_at: new Date().toISOString(),
      dataset_kind: 'business',
      period: '1 kỳ',
      facts: [
        {
          id: 'F1',
          category: 'total',
          label_vi: 'Tổng số dòng dữ liệu sạch và kỳ khảo sát',
          value: 48,
          display: '48 dòng',
          unit: 'dòng',
          raw_numbers: [48],
        },
        {
          id: 'F2',
          category: 'total',
          label_vi: 'Tổng doanh thu',
          value: 100000000,
          display: '100.000.000 VND',
          unit: 'VND',
          raw_numbers: [100000000],
        },
        {
          id: 'F3',
          category: 'total',
          label_vi: 'Biên lợi nhuận gộp tổng thể',
          value: 25.0,
          display: '25.00%',
          unit: '%',
          raw_numbers: [25.0],
        },
        {
          id: 'F4',
          category: 'channel',
          label_vi: 'Kênh [DATA:Bán sỉ]',
          value: 40000000,
          display: 'Bán sỉ Doanh thu 40.000.000 VND (40.00%), biên LN 20.00%',
          unit: 'VND',
          raw_numbers: [40000000, 20.0],
        },
      ],
      metrics_result: {
        margin_by_channel: {
          id: 'margin_by_channel',
          name: 'Biên lợi nhuận theo kênh',
          status: 'tính được',
          feasible: true,
          answerText: '',
          events: [],
          pivot: {
            dimension: 'Kênh',
            headers: ['Kênh', 'Doanh thu', 'Biên LN (%)'],
            rows: [
              { key: 'Bán sỉ', label: 'Bán sỉ', revenue: 40000000, margin_pct: 20.0 },
              { key: 'Bán lẻ', label: 'Bán lẻ', revenue: 60000000, margin_pct: 28.3 },
            ],
          },
        },
      },
    };

    const out = evaluateInsightRules(mockFactsTable);
    const lowMarginFinding = out.findings.find((f) => f.rule_id === 'R-LOW-MARGIN-HIGH-SHARE');
    expect(lowMarginFinding).toBeDefined();
    expect(lowMarginFinding!.title).toContain('Bán sỉ');
    expect(lowMarginFinding!.meaning).toContain('ảnh hưởng');
  });

  it('triggers R-HIGH-MARGIN-LOW-SHARE when share <= 15% and margin >= overall + 3 pp', () => {
    const mockFactsTable: FactsTable = {
      hash: 'testhash',
      byte_size: 100,
      generated_at: new Date().toISOString(),
      dataset_kind: 'business',
      period: '1 kỳ',
      facts: [
        {
          id: 'F1',
          category: 'total',
          label_vi: 'Tổng số dòng dữ liệu sạch và kỳ khảo sát',
          value: 48,
          display: '48 dòng',
          unit: 'dòng',
          raw_numbers: [48],
        },
        {
          id: 'F2',
          category: 'total',
          label_vi: 'Tổng doanh thu',
          value: 100000000,
          display: '100.000.000 VND',
          unit: 'VND',
          raw_numbers: [100000000],
        },
        {
          id: 'F3',
          category: 'total',
          label_vi: 'Biên lợi nhuận gộp tổng thể',
          value: 20.0,
          display: '20.00%',
          unit: '%',
          raw_numbers: [20.0],
        },
      ],
      metrics_result: {
        margin_by_product: {
          id: 'margin_by_product',
          name: 'Biên lợi nhuận theo sản phẩm',
          status: 'tính được',
          feasible: true,
          answerText: '',
          events: [],
          pivot: {
            dimension: 'Sản phẩm',
            headers: ['Sản phẩm', 'Doanh thu', 'Biên LN (%)'],
            rows: [
              { key: 'Phụ kiện cao cấp', label: 'Phụ kiện cao cấp', revenue: 10000000, margin_pct: 35.0 },
              { key: 'Thiết bị chính', label: 'Thiết bị chính', revenue: 90000000, margin_pct: 18.3 },
            ],
          },
        },
      },
    };

    const out = evaluateInsightRules(mockFactsTable);
    const highMarginFinding = out.findings.find((f) => f.rule_id === 'R-HIGH-MARGIN-LOW-SHARE');
    expect(highMarginFinding).toBeDefined();
    expect(highMarginFinding!.title).toContain('Phụ kiện cao cấp');
  });

  it('limits findings to max 6 and actions to max 3 with unique KPI metrics', () => {
    const mockFactsTable: FactsTable = {
      hash: 'testhash',
      byte_size: 100,
      generated_at: new Date().toISOString(),
      dataset_kind: 'business',
      period: '1 kỳ',
      facts: [
        {
          id: 'F1',
          category: 'total',
          label_vi: 'Tổng số dòng dữ liệu sạch và kỳ khảo sát',
          value: 5, // Triggers R-FEW-ROWS
          display: '5 dòng',
          unit: 'dòng',
          raw_numbers: [5],
        },
        {
          id: 'F2',
          category: 'total',
          label_vi: 'Tổng doanh thu',
          value: 100000000,
          display: '100.000.000 VND',
          unit: 'VND',
          raw_numbers: [100000000],
        },
      ],
      metrics_result: {},
    };

    const out = evaluateInsightRules(mockFactsTable);
    expect(out.findings.length).toBeLessThanOrEqual(6);
    expect(out.priority_actions.length).toBeLessThanOrEqual(3);
    expect(out.key_takeaways.length).toBeLessThanOrEqual(3);

    const kpiIds = out.priority_actions.map((a) => a.kpi_metric_id);
    const uniqueKpiIds = new Set(kpiIds);
    expect(kpiIds.length).toBe(uniqueKpiIds.size);
  });

  it('triggers R-MATRIX identifying min and max margin cells with tie handling', () => {
    const mockFactsTable: FactsTable = {
      hash: 'testhash',
      byte_size: 100,
      generated_at: new Date().toISOString(),
      dataset_kind: 'business',
      period: '1 kỳ',
      facts: [
        {
          id: 'F1',
          category: 'total',
          label_vi: 'Tổng số dòng dữ liệu sạch và kỳ khảo sát',
          value: 20,
          display: '20 dòng',
          unit: 'dòng',
          raw_numbers: [20],
        },
        {
          id: 'F2',
          category: 'total',
          label_vi: 'Tổng doanh thu',
          value: 100000000,
          display: '100.000.000 VND',
          unit: 'VND',
          raw_numbers: [100000000],
        },
        {
          id: 'F3',
          category: 'total',
          label_vi: 'Biên lợi nhuận gộp tổng thể',
          value: 25.0,
          display: '25.00%',
          unit: '%',
          raw_numbers: [25.0],
        },
      ],
      metrics_result: {
        channel_product_matrix: {
          id: 'channel_product_matrix',
          name: 'Ma trận Kênh x Sản phẩm',
          status: 'tính được',
          feasible: true,
          answerText: '',
          events: [],
          pivot: {
            channels: ['Kênh A', 'Kênh B'],
            products: ['SP X', 'SP Y'],
            cells: [
              { channel: 'Kênh A', product: 'SP X', revenue: 30000000, cogs: 24000000, profit: 6000000, margin_pct: 20.0 },
              { channel: 'Kênh A', product: 'SP Y', revenue: 20000000, cogs: 10000000, profit: 10000000, margin_pct: 50.0 },
              { channel: 'Kênh B', product: 'SP X', revenue: 25000000, cogs: 12500000, profit: 12500000, margin_pct: 50.0 },
              { channel: 'Kênh B', product: 'SP Y', revenue: 25000000, cogs: 17500000, profit: 7500000, margin_pct: 30.0 },
            ],
          },
        },
      },
    };

    const out = evaluateInsightRules(mockFactsTable);
    const matrixFinding = out.findings.find((f) => f.rule_id === 'R-MATRIX');
    expect(matrixFinding).toBeDefined();
    expect(matrixFinding!.evidence).toContain('Kênh A × SP X');
    expect(matrixFinding!.evidence).toContain('20');
    expect(matrixFinding!.evidence).toContain('hòa nhau');
    expect(matrixFinding!.evidence).toContain('50');
    expect(matrixFinding!.check_after).toBe('1 quý');
  });

  it('triggers R-MOM and appends trend note when dataset has fewer than 6 months', () => {
    const mockFactsTable: FactsTable = {
      hash: 'testhash',
      byte_size: 100,
      generated_at: new Date().toISOString(),
      dataset_kind: 'business',
      period: '1 kỳ',
      facts: [
        {
          id: 'F1',
          category: 'total',
          label_vi: 'Tổng số dòng dữ liệu sạch và kỳ khảo sát',
          value: 20,
          display: '20 dòng',
          unit: 'dòng',
          raw_numbers: [20],
        },
        {
          id: 'F2',
          category: 'total',
          label_vi: 'Tổng doanh thu',
          value: 100000000,
          display: '100.000.000 VND',
          unit: 'VND',
          raw_numbers: [100000000],
        },
        {
          id: 'F3',
          category: 'total',
          label_vi: 'Biên lợi nhuận gộp tổng thể',
          value: 25.0,
          display: '25.00%',
          unit: '%',
          raw_numbers: [25.0],
        },
      ],
      metrics_result: {
        revenue_by_month: {
          id: 'revenue_by_month',
          name: 'Doanh thu theo tháng',
          status: 'tính được',
          feasible: true,
          answerText: '',
          events: [],
          pivot: {
            dimension: 'Tháng',
            headers: ['Tháng', 'Doanh thu'],
            rows: [
              { key: '2026-01', label: '2026-01', revenue: 40000000 },
              { key: '2026-02', label: '2026-02', revenue: 60000000 },
            ],
          },
        },
      },
    };

    const out = evaluateInsightRules(mockFactsTable);
    const momFinding = out.findings.find((f) => f.rule_id === 'R-MOM');
    expect(momFinding).toBeDefined();
    expect(momFinding!.meaning).toContain('chưa đủ kỳ để kết luận xu hướng');
    expect(momFinding!.check_after).toBe('4 tuần');
  });

  it('returns fallback message when zero rules match and never outputs R-GENERAL-OVERVIEW', () => {
    const mockFactsTable: FactsTable = {
      hash: 'testhash',
      byte_size: 100,
      generated_at: new Date().toISOString(),
      dataset_kind: 'business',
      period: '1 kỳ',
      facts: [
        {
          id: 'F1',
          category: 'total',
          label_vi: 'Tổng số dòng dữ liệu sạch và kỳ khảo sát',
          value: 50,
          display: '50 dòng',
          unit: 'dòng',
          raw_numbers: [50],
        },
        {
          id: 'F2',
          category: 'total',
          label_vi: 'Tổng doanh thu',
          value: 100000000,
          display: '100.000.000 VND',
          unit: 'VND',
          raw_numbers: [100000000],
        },
        {
          id: 'F3',
          category: 'total',
          label_vi: 'Biên lợi nhuận gộp tổng thể',
          value: 20.0,
          display: '20.00%',
          unit: '%',
          raw_numbers: [20.0],
        },
      ],
      metrics_result: {}, // Zero selected breakdown metrics
    };

    const out = evaluateInsightRules(mockFactsTable);
    expect(out.findings.length).toBe(0);
    expect(out.findings.some((f) => f.rule_id === 'R-GENERAL-OVERVIEW')).toBe(false);
    expect(out.key_takeaways[0]).toBe(
      'Chưa có phát hiện nổi bật với các chỉ số đã chọn; hãy chọn thêm chỉ số theo kênh, sản phẩm hoặc thời gian để có nhận định sâu hơn.'
    );
  });

  describe('Boundary tests (+/- edge cases) for all insight rules (Prompt 5A-FIX2)', () => {
    const baseTable: FactsTable = {
      hash: 'basehash',
      byte_size: 100,
      generated_at: new Date().toISOString(),
      dataset_kind: 'business',
      period: '20 dòng',
      facts: [
        { id: 'F1', category: 'total', label_vi: 'Tổng số dòng dữ liệu sạch và kỳ khảo sát', value: 20, display: '20 dòng', unit: 'dòng', raw_numbers: [20] },
        { id: 'F2', category: 'total', label_vi: 'Tổng doanh thu', value: 100000000, display: '100.000.000 VND', unit: 'VND', raw_numbers: [100000000] },
        { id: 'F3', category: 'total', label_vi: 'Biên lợi nhuận gộp tổng thể', value: 20.0, display: '20.00%', unit: '%', raw_numbers: [20.0] },
      ],
      metrics_result: {},
    };

    it('R-FEW-ROWS boundary: 9 rows triggers, 10 rows does not trigger', () => {
      const t9: FactsTable = {
        ...baseTable,
        facts: baseTable.facts.map((f) => (f.id === 'F1' ? { ...f, value: 9 } : f)),
        period: '9 dòng',
      };
      expect(evaluateInsightRules(t9).findings.some((f) => f.rule_id === 'R-FEW-ROWS')).toBe(true);

      const t10: FactsTable = {
        ...baseTable,
        facts: baseTable.facts.map((f) => (f.id === 'F1' ? { ...f, value: 10 } : f)),
        period: '10 dòng',
      };
      expect(evaluateInsightRules(t10).findings.some((f) => f.rule_id === 'R-FEW-ROWS')).toBe(false);
    });

    it('R-MOM boundary: |MoM| < 10% does not trigger, >= 10% triggers', () => {
      // 9.9% MoM: 50M -> 54.95M
      const t99: FactsTable = {
        ...baseTable,
        metrics_result: {
          revenue_by_month: {
            id: 'revenue_by_month',
            name: 'Doanh thu theo tháng',
            status: 'tính được',
            feasible: true,
            answerText: '',
            events: [],
            pivot: {
              dimension: 'Tháng',
              headers: ['Tháng', 'Doanh thu'],
              rows: [
                { key: '2026-01', label: '2026-01', revenue: 50000000 },
                { key: '2026-02', label: '2026-02', revenue: 54950000 },
              ],
            },
          },
        },
      };
      expect(evaluateInsightRules(t99).findings.some((f) => f.rule_id === 'R-MOM')).toBe(false);

      // 10.0% MoM: 50M -> 55M
      const t100: FactsTable = {
        ...baseTable,
        metrics_result: {
          revenue_by_month: {
            id: 'revenue_by_month',
            name: 'Doanh thu theo tháng',
            status: 'tính được',
            feasible: true,
            answerText: '',
            events: [],
            pivot: {
              dimension: 'Tháng',
              headers: ['Tháng', 'Doanh thu'],
              rows: [
                { key: '2026-01', label: '2026-01', revenue: 50000000 },
                { key: '2026-02', label: '2026-02', revenue: 55000000 },
              ],
            },
          },
        },
      };
      expect(evaluateInsightRules(t100).findings.some((f) => f.rule_id === 'R-MOM')).toBe(true);

      // -9.9% MoM: 50M -> 45.05M (does not trigger)
      const tNeg99: FactsTable = {
        ...baseTable,
        metrics_result: {
          revenue_by_month: {
            id: 'revenue_by_month',
            name: 'Doanh thu theo tháng',
            status: 'tính được',
            feasible: true,
            answerText: '',
            events: [],
            pivot: {
              dimension: 'Tháng',
              headers: ['Tháng', 'Doanh thu'],
              rows: [
                { key: '2026-01', label: '2026-01', revenue: 50000000 },
                { key: '2026-02', label: '2026-02', revenue: 45050000 },
              ],
            },
          },
        },
      };
      expect(evaluateInsightRules(tNeg99).findings.some((f) => f.rule_id === 'R-MOM')).toBe(false);

      // -10.0% MoM: 50M -> 45M (triggers)
      const tNeg100: FactsTable = {
        ...baseTable,
        metrics_result: {
          revenue_by_month: {
            id: 'revenue_by_month',
            name: 'Doanh thu theo tháng',
            status: 'tính được',
            feasible: true,
            answerText: '',
            events: [],
            pivot: {
              dimension: 'Tháng',
              headers: ['Tháng', 'Doanh thu'],
              rows: [
                { key: '2026-01', label: '2026-01', revenue: 50000000 },
                { key: '2026-02', label: '2026-02', revenue: 45000000 },
              ],
            },
          },
        },
      };
      expect(evaluateInsightRules(tNeg100).findings.some((f) => f.rule_id === 'R-MOM')).toBe(true);
    });

    it('R-CONC boundary: 34.0% does not trigger, 35.0% triggers (watch), 50.0% triggers (risk), 100% does not trigger', () => {
      // All < 35%:
      const tNoConc: FactsTable = {
        ...baseTable,
        metrics_result: {
          revenue_by_channel: {
            id: 'revenue_by_channel',
            name: 'Doanh thu theo kênh',
            status: 'tính được',
            feasible: true,
            answerText: '',
            events: [],
            pivot: {
              dimension: 'Kênh',
              headers: ['Kênh', 'Doanh thu'],
              rows: [
                { key: 'Kênh A', label: 'Kênh A', revenue: 34000000 },
                { key: 'Kênh B', label: 'Kênh B', revenue: 33000000 },
                { key: 'Kênh C', label: 'Kênh C', revenue: 33000000 },
              ],
            },
          },
        },
      };
      expect(evaluateInsightRules(tNoConc).findings.some((f) => f.rule_id === 'R-CONC')).toBe(false);

      // Exactly 35% (35M / 100M)
      const t35: FactsTable = {
        ...baseTable,
        metrics_result: {
          revenue_by_channel: {
            id: 'revenue_by_channel',
            name: 'Doanh thu theo kênh',
            status: 'tính được',
            feasible: true,
            answerText: '',
            events: [],
            pivot: {
              dimension: 'Kênh',
              headers: ['Kênh', 'Doanh thu'],
              rows: [
                { key: 'Kênh A', label: 'Kênh A', revenue: 35000000 },
                { key: 'Kênh B', label: 'Kênh B', revenue: 33000000 },
                { key: 'Kênh C', label: 'Kênh C', revenue: 32000000 },
              ],
            },
          },
        },
      };
      const f35 = evaluateInsightRules(t35).findings.find((f) => f.rule_id === 'R-CONC');
      expect(f35).toBeDefined();
      expect(f35!.meaning).toContain('đáng theo dõi');
      expect(f35!.action).toContain('Theo dõi tỷ trọng');

      // Exactly 50% (risk)
      const t50: FactsTable = {
        ...baseTable,
        metrics_result: {
          revenue_by_channel: {
            id: 'revenue_by_channel',
            name: 'Doanh thu theo kênh',
            status: 'tính được',
            feasible: true,
            answerText: '',
            events: [],
            pivot: {
              dimension: 'Kênh',
              headers: ['Kênh', 'Doanh thu'],
              rows: [
                { key: 'Kênh A', label: 'Kênh A', revenue: 50000000 },
                { key: 'Kênh B', label: 'Kênh B', revenue: 50000000 },
              ],
            },
          },
        },
      };
      const f50 = evaluateInsightRules(t50).findings.find((f) => f.rule_id === 'R-CONC');
      expect(f50).toBeDefined();
      expect(f50!.meaning).toContain('phụ thuộc cao');
      expect(f50!.action).toContain('giảm phụ thuộc');

      // 100% single group (does not trigger R-CONC because validRows.length < 2 or maxShare >= 1.0)
      const t100Single: FactsTable = {
        ...baseTable,
        metrics_result: {
          revenue_by_channel: {
            id: 'revenue_by_channel',
            name: 'Doanh thu theo kênh',
            status: 'tính được',
            feasible: true,
            answerText: '',
            events: [],
            pivot: {
              dimension: 'Kênh',
              headers: ['Kênh', 'Doanh thu'],
              rows: [{ key: 'Kênh Duy Nhất', label: 'Kênh Duy Nhất', revenue: 100000000 }],
            },
          },
        },
      };
      expect(evaluateInsightRules(t100Single).findings.some((f) => f.rule_id === 'R-CONC')).toBe(false);
    });

    it('R-UNLABELED boundary: 1.9% does not trigger, 2.0% triggers', () => {
      const t19: FactsTable = {
        ...baseTable,
        metrics_result: {
          revenue_by_channel: {
            id: 'revenue_by_channel',
            name: 'Doanh thu theo kênh',
            status: 'tính được',
            feasible: true,
            answerText: '',
            events: [],
            pivot: {
              dimension: 'Kênh',
              headers: ['Kênh', 'Doanh thu'],
              rows: [
                { key: 'Không xác định', label: 'Không xác định', revenue: 1900000 },
                { key: 'Kênh A', label: 'Kênh A', revenue: 98100000 },
              ],
            },
          },
        },
      };
      expect(evaluateInsightRules(t19).findings.some((f) => f.rule_id === 'R-UNLABELED')).toBe(false);

      const t20: FactsTable = {
        ...baseTable,
        metrics_result: {
          revenue_by_channel: {
            id: 'revenue_by_channel',
            name: 'Doanh thu theo kênh',
            status: 'tính được',
            feasible: true,
            answerText: '',
            events: [],
            pivot: {
              dimension: 'Kênh',
              headers: ['Kênh', 'Doanh thu'],
              rows: [
                { key: 'Không xác định', label: 'Không xác định', revenue: 2000000 },
                { key: 'Kênh A', label: 'Kênh A', revenue: 98000000 },
              ],
            },
          },
        },
      };
      expect(evaluateInsightRules(t20).findings.some((f) => f.rule_id === 'R-UNLABELED')).toBe(true);
    });

    it('R-HIGH-MARGIN-LOW-SHARE boundary: margin diff 2.9 pp vs 3.0 pp and share 15.0% vs 15.1%', () => {
      // Overall margin is 20.0%. Target needs >= 23.0% and share <= 15.0%
      // Case 1: margin 22.9% (< +3.0 pp) -> does not trigger
      const t229: FactsTable = {
        ...baseTable,
        metrics_result: {
          margin_by_product: {
            id: 'margin_by_product',
            name: 'Biên lợi nhuận theo sản phẩm',
            status: 'tính được',
            feasible: true,
            answerText: '',
            events: [],
            pivot: {
              dimension: 'Sản phẩm',
              headers: ['Sản phẩm', 'Doanh thu', 'Biên LN (%)'],
              rows: [
                { key: 'SP Ngách', label: 'SP Ngách', revenue: 10000000, margin_pct: 22.9 },
                { key: 'SP Chính', label: 'SP Chính', revenue: 90000000, margin_pct: 19.6 },
              ],
            },
          },
        },
      };
      expect(evaluateInsightRules(t229).findings.some((f) => f.rule_id === 'R-HIGH-MARGIN-LOW-SHARE')).toBe(false);

      // Case 2: margin 23.0% (>= +3.0 pp) and share 15.0% (15M / 100M) -> triggers
      const t230: FactsTable = {
        ...baseTable,
        metrics_result: {
          margin_by_product: {
            id: 'margin_by_product',
            name: 'Biên lợi nhuận theo sản phẩm',
            status: 'tính được',
            feasible: true,
            answerText: '',
            events: [],
            pivot: {
              dimension: 'Sản phẩm',
              headers: ['Sản phẩm', 'Doanh thu', 'Biên LN (%)'],
              rows: [
                { key: 'SP Ngách', label: 'SP Ngách', revenue: 15000000, margin_pct: 23.0 },
                { key: 'SP Chính', label: 'SP Chính', revenue: 85000000, margin_pct: 19.4 },
              ],
            },
          },
        },
      };
      expect(evaluateInsightRules(t230).findings.some((f) => f.rule_id === 'R-HIGH-MARGIN-LOW-SHARE')).toBe(true);

      // Case 3: margin 25.0% but share 15.1% (15.1M / 100M) -> does not trigger
      const t151: FactsTable = {
        ...baseTable,
        metrics_result: {
          margin_by_product: {
            id: 'margin_by_product',
            name: 'Biên lợi nhuận theo sản phẩm',
            status: 'tính được',
            feasible: true,
            answerText: '',
            events: [],
            pivot: {
              dimension: 'Sản phẩm',
              headers: ['Sản phẩm', 'Doanh thu', 'Biên LN (%)'],
              rows: [
                { key: 'SP Ngách', label: 'SP Ngách', revenue: 15100000, margin_pct: 25.0 },
                { key: 'SP Chính', label: 'SP Chính', revenue: 84900000, margin_pct: 19.0 },
              ],
            },
          },
        },
      };
      expect(evaluateInsightRules(t151).findings.some((f) => f.rule_id === 'R-HIGH-MARGIN-LOW-SHARE')).toBe(false);
    });

    it('R-LOW-MARGIN-HIGH-SHARE boundary: margin diff 1.9 pp vs 2.0 pp and share 24.9% vs 25.0%', () => {
      // Overall margin is 20.0%. Target needs <= 18.0% and share >= 25.0%
      // Case 1: margin 18.1% (diff 1.9 pp < 2.0 pp) -> does not trigger
      const t181: FactsTable = {
        ...baseTable,
        metrics_result: {
          margin_by_channel: {
            id: 'margin_by_channel',
            name: 'Biên lợi nhuận theo kênh',
            status: 'tính được',
            feasible: true,
            answerText: '',
            events: [],
            pivot: {
              dimension: 'Kênh',
              headers: ['Kênh', 'Doanh thu', 'Biên LN (%)'],
              rows: [
                { key: 'Kênh Lớn', label: 'Kênh Lớn', revenue: 30000000, margin_pct: 18.1 },
                { key: 'Kênh Khác', label: 'Kênh Khác', revenue: 70000000, margin_pct: 20.8 },
              ],
            },
          },
        },
      };
      expect(evaluateInsightRules(t181).findings.some((f) => f.rule_id === 'R-LOW-MARGIN-HIGH-SHARE')).toBe(false);

      // Case 2: margin 18.0% (diff 2.0 pp >= 2.0 pp) and share 25.0% (25M / 100M) -> triggers
      const t180: FactsTable = {
        ...baseTable,
        metrics_result: {
          margin_by_channel: {
            id: 'margin_by_channel',
            name: 'Biên lợi nhuận theo kênh',
            status: 'tính được',
            feasible: true,
            answerText: '',
            events: [],
            pivot: {
              dimension: 'Kênh',
              headers: ['Kênh', 'Doanh thu', 'Biên LN (%)'],
              rows: [
                { key: 'Kênh Lớn', label: 'Kênh Lớn', revenue: 25000000, margin_pct: 18.0 },
                { key: 'Kênh Khác', label: 'Kênh Khác', revenue: 75000000, margin_pct: 20.6 },
              ],
            },
          },
        },
      };
      expect(evaluateInsightRules(t180).findings.some((f) => f.rule_id === 'R-LOW-MARGIN-HIGH-SHARE')).toBe(true);

      // Case 3: margin 15.0% but share 24.9% (24.9M / 100M) -> does not trigger
      const t249: FactsTable = {
        ...baseTable,
        metrics_result: {
          margin_by_channel: {
            id: 'margin_by_channel',
            name: 'Biên lợi nhuận theo kênh',
            status: 'tính được',
            feasible: true,
            answerText: '',
            events: [],
            pivot: {
              dimension: 'Kênh',
              headers: ['Kênh', 'Doanh thu', 'Biên LN (%)'],
              rows: [
                { key: 'Kênh Lớn', label: 'Kênh Lớn', revenue: 24900000, margin_pct: 15.0 },
                { key: 'Kênh Khác', label: 'Kênh Khác', revenue: 75100000, margin_pct: 21.6 },
              ],
            },
          },
        },
      };
      expect(evaluateInsightRules(t249).findings.some((f) => f.rule_id === 'R-LOW-MARGIN-HIGH-SHARE')).toBe(false);
    });
  });

  describe('Prompt 5A-FIX3 Verification Test Suite', () => {
  const baseTable: FactsTable = {
    hash: 'testhash',
    byte_size: 100,
    generated_at: new Date().toISOString(),
    dataset_kind: 'business',
    period: '1 kỳ',
    facts: [
      { id: 'F1', category: 'total', label_vi: 'Dòng', value: 20, display: '20 dòng', unit: 'dòng', raw_numbers: [20] },
      { id: 'F2', category: 'total', label_vi: 'Tổng doanh thu', value: 100000000, display: '100.000.000 VND', unit: 'VND', raw_numbers: [100000000] },
      { id: 'F3', category: 'total', label_vi: 'Biên lợi nhuận gộp', value: 20.0, display: '20,00%', unit: '%', raw_numbers: [20.0] },
    ],
    metrics_result: {},
  };

    // 1.1d: Gom toàn bộ chữ hiển thị từ mọi rule, assert không chứa chữ cấm nào
    it('1.1d: Ensures zero forbidden causal words in any generated insight text', () => {
      const FORBIDDEN_WORDS = [
        'chi phí hoa hồng',
        'ngân sách tiếp thị',
        'chưa được phân bổ đủ nguồn lực',
        'tập khách hàng trung thành',
        'bão hòa',
        'tính thời vụ',
        'khuyến mại',
        'chuỗi cung ứng',
        'tồn kho',
        'chiết khấu',
        'chi phí vận hành',
        'chi phí phân phối',
        'ngay lập tức',
        'bền chặt',
        'chắc chắn',
        'nguyên nhân là',
        'do vì',
      ];

      // Build rich factsTable triggering multiple rules
      const richFactsTable: FactsTable = {
        ...baseTable,
        facts: [
          {
            id: 'F1',
            category: 'total',
            label_vi: 'Tổng số dòng dữ liệu sạch',
            value: 8,
            display: '8 dòng',
            unit: 'dòng',
            raw_numbers: [8],
          },
          {
            id: 'F2',
            category: 'total',
            label_vi: 'Tổng doanh thu',
            value: 100000000,
            display: '100.000.000 VND',
            unit: 'VND',
            raw_numbers: [100000000],
          },
        ],
        metrics_result: {
          revenue_by_channel: {
            id: 'revenue_by_channel',
            name: 'Doanh thu theo kênh',
            status: 'tính được',
            feasible: true,
            answerText: '',
            events: [],
            pivot: {
              dimension: 'Kênh',
              headers: ['Kênh', 'Doanh thu'],
              rows: [
                { key: 'Kênh A', label: 'Kênh A', revenue: 60000000 },
                { key: 'Kênh B', label: 'Kênh B', revenue: 40000000 },
              ],
            },
          },
          revenue_by_month: {
            id: 'revenue_by_month',
            name: 'Doanh thu theo tháng',
            status: 'tính được',
            feasible: true,
            answerText: '',
            events: [],
            pivot: {
              dimension: 'Tháng',
              headers: ['Tháng', 'Doanh thu'],
              rows: [
                { key: '2026-01', label: '2026-01', revenue: 40000000 },
                { key: '2026-02', label: '2026-02', revenue: 60000000 },
              ],
            },
          },
          channel_product_matrix: {
            id: 'channel_product_matrix',
            name: 'Ma trận kênh × sản phẩm',
            status: 'tính được',
            feasible: true,
            answerText: '',
            events: [],
            pivot: {
              channels: ['Kênh A', 'Kênh B'],
              products: ['SP 1', 'SP 2'],
              cells: [
                { channel: 'Kênh A', product: 'SP 1', revenue: 30000000, cogs: 15000000, profit: 15000000, margin_pct: 50.0 },
                { channel: 'Kênh B', product: 'SP 2', revenue: 30000000, cogs: 18000000, profit: 12000000, margin_pct: 40.0 },
              ],
            },
          },
        },
      };

      const out = evaluateInsightRules(richFactsTable);
      expect(out.findings.length).toBeGreaterThan(0);

      const allTexts: string[] = [
        ...out.key_takeaways,
        ...out.priority_actions.map((a) => a.action),
        ...out.findings.flatMap((f) => [f.title, f.evidence, f.meaning, f.opportunity_risk, f.action]),
      ];

      for (const text of allTexts) {
        const lower = text.toLowerCase();
        for (const forbidden of FORBIDDEN_WORDS) {
          expect(lower.includes(forbidden), `Text "${text}" contains forbidden word "${forbidden}"`).toBe(false);
        }
      }
    });

    // 1.2d: R-CONC hai mức, từng chiều, ngưỡng biên 0.35 và 0.3499, mức 0.50, 1.0 không phát
    it('1.2d: R-CONC boundary checks (0.3499 no, 0.35 watch, 0.50 risk, 1.0 no)', () => {
      // 0.3499 does not trigger
      const t3499: FactsTable = {
        ...baseTable,
        metrics_result: {
          revenue_by_channel: {
            id: 'revenue_by_channel',
            name: 'Doanh thu theo kênh',
            status: 'tính được',
            feasible: true,
            answerText: '',
            events: [],
            pivot: {
              dimension: 'Kênh',
              headers: ['Kênh', 'Doanh thu'],
              rows: [
                { key: 'Kênh A', label: 'Kênh A', revenue: 34990000 },
                { key: 'Kênh B', label: 'Kênh B', revenue: 65010000 },
              ],
            },
          },
        },
      };
      // Note: Kênh B has 65% so it triggers risk, but Kênh A at 34.99% does not trigger watch
      const f3499 = evaluateInsightRules(t3499).findings.find((f) => f.rule_id === 'R-CONC');
      expect(f3499).toBeDefined();
      expect(f3499!.title).toContain('Kênh Kênh B');
      expect(f3499!.title).not.toContain('Kênh Kênh A');

      // Exact 0.3499 max share among 3 equal-ish groups (none >= 0.35)
      const tNoConc: FactsTable = {
        ...baseTable,
        metrics_result: {
          revenue_by_channel: {
            id: 'revenue_by_channel',
            name: 'Doanh thu theo kênh',
            status: 'tính được',
            feasible: true,
            answerText: '',
            events: [],
            pivot: {
              dimension: 'Kênh',
              headers: ['Kênh', 'Doanh thu'],
              rows: [
                { key: 'Kênh A', label: 'Kênh A', revenue: 34990000 },
                { key: 'Kênh B', label: 'Kênh B', revenue: 33000000 },
                { key: 'Kênh C', label: 'Kênh C', revenue: 32010000 },
              ],
            },
          },
        },
      };
      expect(evaluateInsightRules(tNoConc).findings.some((f) => f.rule_id === 'R-CONC')).toBe(false);

      // Exactly 0.35 triggers watch tier
      const t35: FactsTable = {
        ...baseTable,
        metrics_result: {
          revenue_by_channel: {
            id: 'revenue_by_channel',
            name: 'Doanh thu theo kênh',
            status: 'tính được',
            feasible: true,
            answerText: '',
            events: [],
            pivot: {
              dimension: 'Kênh',
              headers: ['Kênh', 'Doanh thu'],
              rows: [
                { key: 'Kênh A', label: 'Kênh A', revenue: 35000000 },
                { key: 'Kênh B', label: 'Kênh B', revenue: 33000000 },
                { key: 'Kênh C', label: 'Kênh C', revenue: 32000000 },
              ],
            },
          },
        },
      };
      const f35 = evaluateInsightRules(t35).findings.find((f) => f.rule_id === 'R-CONC');
      expect(f35).toBeDefined();
      expect(f35!.title).toBe('Kênh Kênh A chiếm 35,00% doanh thu');
      expect(f35!.meaning).toContain('đáng theo dõi');
      expect(f35!.action).toContain('Theo dõi tỷ trọng');

      // Exactly 0.50 triggers risk tier
      const t50: FactsTable = {
        ...baseTable,
        metrics_result: {
          revenue_by_channel: {
            id: 'revenue_by_channel',
            name: 'Doanh thu theo kênh',
            status: 'tính được',
            feasible: true,
            answerText: '',
            events: [],
            pivot: {
              dimension: 'Kênh',
              headers: ['Kênh', 'Doanh thu'],
              rows: [
                { key: 'Kênh A', label: 'Kênh A', revenue: 50000000 },
                { key: 'Kênh B', label: 'Kênh B', revenue: 50000000 },
              ],
            },
          },
        },
      };
      const f50 = evaluateInsightRules(t50).findings.find((f) => f.rule_id === 'R-CONC');
      expect(f50).toBeDefined();
      expect(f50!.meaning).toContain('phụ thuộc cao');
      expect(f50!.action).toContain('giảm phụ thuộc');

      // Exactly 1.0 (100% single group) does not trigger R-CONC
      const t100Single: FactsTable = {
        ...baseTable,
        metrics_result: {
          revenue_by_channel: {
            id: 'revenue_by_channel',
            name: 'Doanh thu theo kênh',
            status: 'tính được',
            feasible: true,
            answerText: '',
            events: [],
            pivot: {
              dimension: 'Kênh',
              headers: ['Kênh', 'Doanh thu'],
              rows: [{ key: 'Kênh Duy Nhất', label: 'Kênh Duy Nhất', revenue: 100000000 }],
            },
          },
        },
      };
      expect(evaluateInsightRules(t100Single).findings.some((f) => f.rule_id === 'R-CONC')).toBe(false);
    });

    // 1.2d (tiếp): thieu-gia-von phát cho kênh Sàn và khu vực Miền Nam (cả hai >= 0,35)
    it('1.2d: thieu-gia-von triggers R-CONC for both Kênh Sàn (36.07%) and Khu vực Miền Nam (35.32%)', () => {
      const tThieuGiaVon: FactsTable = {
        ...baseTable,
        facts: [
          { id: 'F1', category: 'total', label_vi: 'Dòng', value: 54, display: '54 dòng', unit: 'dòng', raw_numbers: [54] },
          { id: 'F2', category: 'total', label_vi: 'Tổng doanh thu', value: 723600000, display: '723.600.000 VND', unit: 'VND', raw_numbers: [723600000] },
          { id: 'F3', category: 'channel', label_vi: 'Sàn thương mại điện tử', value: 261000000, display: '261.000.000 VND', unit: 'VND', raw_numbers: [261000000] },
          { id: 'F4', category: 'region', label_vi: 'Miền Nam', value: 255600000, display: '255.600.000 VND', unit: 'VND', raw_numbers: [255600000] },
        ],
        metrics_result: {
          revenue_by_channel: {
            id: 'revenue_by_channel',
            name: 'Doanh thu theo kênh',
            status: 'tính được',
            feasible: true,
            answerText: '',
            events: [],
            pivot: {
              dimension: 'Kênh',
              headers: ['Kênh', 'Doanh thu'],
              rows: [
                { key: 'Sàn thương mại điện tử', label: 'Sàn thương mại điện tử', revenue: 261000000 },
                { key: 'Cửa hàng', label: 'Cửa hàng', revenue: 241200000 },
                { key: 'Website', label: 'Website', revenue: 221400000 },
              ],
            },
          },
          revenue_by_region: {
            id: 'revenue_by_region',
            name: 'Doanh thu theo khu vực',
            status: 'tính được',
            feasible: true,
            answerText: '',
            events: [],
            pivot: {
              dimension: 'Khu vực',
              headers: ['Khu vực', 'Doanh thu'],
              rows: [
                { key: 'Miền Nam', label: 'Miền Nam', revenue: 255600000 },
                { key: 'Miền Trung', label: 'Miền Trung', revenue: 241200000 },
                { key: 'Miền Bắc', label: 'Miền Bắc', revenue: 226800000 },
              ],
            },
          },
        },
      };

      const out = evaluateInsightRules(tThieuGiaVon);
      const concFindings = out.findings.filter((f) => f.rule_id === 'R-CONC');
      expect(concFindings.length).toBe(2);

      const channelConc = concFindings.find((f) => f.title.startsWith('Kênh'));
      const regionConc = concFindings.find((f) => f.title.startsWith('Khu vực'));

      expect(channelConc).toBeDefined();
      expect(channelConc!.title).toBe('Kênh Sàn thương mại điện tử chiếm 36,07% doanh thu');
      expect(channelConc!.action).toContain('các kênh còn lại');

      expect(regionConc).toBeDefined();
      expect(regionConc!.title).toBe('Khu vực Miền Nam chiếm 35,32% doanh thu');
      expect(regionConc!.action).toContain('khu vực còn lại');
    });

    // 1.3: R-MATRIX nêu tên ô và hòa không có ngoặc vuông
    it('1.3: R-MATRIX formats cell names cleanly and handles ties with "hòa nhau"', () => {
      const tMatrixTie: FactsTable = {
        ...baseTable,
        facts: [
          { id: 'F1', category: 'total', label_vi: 'Tổng doanh thu', value: 100000000, display: '100.000.000 VND', unit: 'VND', raw_numbers: [100000000] },
          { id: 'F2', category: 'total', label_vi: 'Biên lợi nhuận gộp', value: 45.0, display: '45,00%', unit: '%', raw_numbers: [45.0] },
        ],
        metrics_result: {
          channel_product_matrix: {
            id: 'channel_product_matrix',
            name: 'Ma trận kênh × sản phẩm',
            status: 'tính được',
            feasible: true,
            answerText: '',
            events: [],
            pivot: {
              channels: ['Website', 'Cửa hàng', 'Sàn thương mại điện tử'],
              products: ['Quần jeans', 'Túi tote'],
              cells: [
                { channel: 'Sàn thương mại điện tử', product: 'Quần jeans', revenue: 20000000, cogs: 11522000, profit: 8478000, margin_pct: 42.39 },
                { channel: 'Website', product: 'Túi tote', revenue: 30000000, cogs: 13356000, profit: 16644000, margin_pct: 55.48 },
                { channel: 'Cửa hàng', product: 'Túi tote', revenue: 30000000, cogs: 13356000, profit: 16644000, margin_pct: 55.48 },
              ],
            },
          },
        },
      };

      const out = evaluateInsightRules(tMatrixTie);
      const matrixFinding = out.findings.find((f) => f.rule_id === 'R-MATRIX');
      expect(matrixFinding).toBeDefined();
      expect(matrixFinding!.evidence).toContain('Sàn thương mại điện tử × Quần jeans (42,39%)');
      expect(matrixFinding!.evidence).toContain('Website × Túi tote và Cửa hàng × Túi tote hòa nhau (55,48%)');
      expect(matrixFinding!.evidence).not.toContain('[Sàn');
      expect(matrixFinding!.evidence).not.toContain('[Website');
    });

    // 1.4: KPI phải thuộc tập chỉ số đã chọn & tính được
    it('1.4: Adjusts KPI to feasible metric in selection or omits if none', () => {
      // User only selected total_revenue and revenue_by_month
      const tKpiChoice: FactsTable = {
        ...baseTable,
        facts: [
          { id: 'F1', category: 'total', label_vi: 'Tổng doanh thu', value: 100000000, display: '100.000.000 VND', unit: 'VND', raw_numbers: [100000000] },
        ],
        metrics_result: {
          total_revenue: {
            id: 'total_revenue',
            name: 'Tổng doanh thu',
            status: 'tính được',
            feasible: true,
            answerText: '',
            events: [],
          },
          revenue_by_channel: {
            id: 'revenue_by_channel',
            name: 'Doanh thu theo kênh',
            status: 'tính được',
            feasible: true,
            answerText: '',
            events: [],
            pivot: {
              dimension: 'Kênh',
              headers: ['Kênh', 'Doanh thu'],
              rows: [
                { key: 'Kênh A', label: 'Kênh A', revenue: 60000000 },
                { key: 'Kênh B', label: 'Kênh B', revenue: 40000000 },
              ],
            },
          },
        },
      };

      const out = evaluateInsightRules(tKpiChoice);
      const concF = out.findings.find((f) => f.rule_id === 'R-CONC');
      expect(concF).toBeDefined();
      expect(concF!.kpi_metric_id).toBe('revenue_by_channel');
    });

    // 2.1: Test biên MIN_MONTHS_FOR_TREND (5 tháng vs 6 tháng)
    it('2.1: MIN_MONTHS_FOR_TREND boundary (5 months notes lack of trend, 6 months does not)', () => {
      // 5 months (< 6) -> has note
      const t5: FactsTable = {
        ...baseTable,
        metrics_result: {
          revenue_by_month: {
            id: 'revenue_by_month',
            name: 'Doanh thu theo tháng',
            status: 'tính được',
            feasible: true,
            answerText: '',
            events: [],
            pivot: {
              dimension: 'Tháng',
              headers: ['Tháng', 'Doanh thu'],
              rows: [
                { key: '2026-01', label: '2026-01', revenue: 10000000 },
                { key: '2026-02', label: '2026-02', revenue: 10000000 },
                { key: '2026-03', label: '2026-03', revenue: 10000000 },
                { key: '2026-04', label: '2026-04', revenue: 10000000 },
                { key: '2026-05', label: '2026-05', revenue: 20000000 },
              ],
            },
          },
        },
      };
      const f5 = evaluateInsightRules(t5).findings.find((f) => f.rule_id === 'R-MOM');
      expect(f5).toBeDefined();
      expect(f5!.meaning).toContain('Dữ liệu mới có 5 kỳ, chưa đủ kỳ để kết luận xu hướng.');

      // 6 months (>= 6) -> does NOT have note
      const t6: FactsTable = {
        ...baseTable,
        metrics_result: {
          revenue_by_month: {
            id: 'revenue_by_month',
            name: 'Doanh thu theo tháng',
            status: 'tính được',
            feasible: true,
            answerText: '',
            events: [],
            pivot: {
              dimension: 'Tháng',
              headers: ['Tháng', 'Doanh thu'],
              rows: [
                { key: '2026-01', label: '2026-01', revenue: 10000000 },
                { key: '2026-02', label: '2026-02', revenue: 10000000 },
                { key: '2026-03', label: '2026-03', revenue: 10000000 },
                { key: '2026-04', label: '2026-04', revenue: 10000000 },
                { key: '2026-05', label: '2026-05', revenue: 10000000 },
                { key: '2026-06', label: '2026-06', revenue: 20000000 },
              ],
            },
          },
        },
      };
      const f6 = evaluateInsightRules(t6).findings.find((f) => f.rule_id === 'R-MOM');
      expect(f6).toBeDefined();
      expect(f6!.meaning).not.toContain('chưa đủ kỳ để kết luận xu hướng');
    });

    // 2.1: Test biên MARGIN_HIGH_PP (3.0 pp) và SHARE_SMALL (15%)
    it('2.1: MARGIN_HIGH_PP and SHARE_SMALL boundary (+3.0 pp and <=15% triggers, below does not)', () => {
      // Overall margin: 20%. Candidate A: margin 22.9% (+2.9 pp), share 10% -> NO trigger
      const tNo: FactsTable = {
        ...baseTable,
        metrics_result: {
          margin_by_product: {
            id: 'margin_by_product',
            name: 'Biên lợi nhuận theo sản phẩm',
            status: 'tính được',
            feasible: true,
            answerText: '',
            events: [],
            pivot: {
              dimension: 'Sản phẩm',
              headers: ['Sản phẩm', 'Doanh thu', 'Biên lợi nhuận'],
              rows: [
                { key: 'P1', label: 'P1', revenue: 10000000, margin_pct: 22.9 },
                { key: 'P2', label: 'P2', revenue: 90000000, margin_pct: 19.68 },
              ],
            },
          },
        },
      };
      expect(evaluateInsightRules(tNo).findings.find((f) => f.rule_id === 'R-HIGH-MARGIN-LOW-SHARE')).toBeUndefined();

      // Candidate B: margin 23.0% (+3.0 pp), share 15.0% (15M / 100M) -> TRIGGERS
      const tYes: FactsTable = {
        ...baseTable,
        metrics_result: {
          margin_by_product: {
            id: 'margin_by_product',
            name: 'Biên lợi nhuận theo sản phẩm',
            status: 'tính được',
            feasible: true,
            answerText: '',
            events: [],
            pivot: {
              dimension: 'Sản phẩm',
              headers: ['Sản phẩm', 'Doanh thu', 'Biên lợi nhuận'],
              rows: [
                { key: 'P1', label: 'P1', revenue: 15000000, margin_pct: 23.0 },
                { key: 'P2', label: 'P2', revenue: 85000000, margin_pct: 19.47 },
              ],
            },
          },
        },
      };
      expect(evaluateInsightRules(tYes).findings.find((f) => f.rule_id === 'R-HIGH-MARGIN-LOW-SHARE')).toBeDefined();

      // Candidate C: margin 25.0% (+5.0 pp), but share 15.1% (>15%) -> NO trigger
      const tOverShare: FactsTable = {
        ...baseTable,
        metrics_result: {
          margin_by_product: {
            id: 'margin_by_product',
            name: 'Biên lợi nhuận theo sản phẩm',
            status: 'tính được',
            feasible: true,
            answerText: '',
            events: [],
            pivot: {
              dimension: 'Sản phẩm',
              headers: ['Sản phẩm', 'Doanh thu', 'Biên lợi nhuận'],
              rows: [
                { key: 'P1', label: 'P1', revenue: 15100000, margin_pct: 25.0 },
                { key: 'P2', label: 'P2', revenue: 84900000, margin_pct: 19.11 },
              ],
            },
          },
        },
      };
      expect(evaluateInsightRules(tOverShare).findings.find((f) => f.rule_id === 'R-HIGH-MARGIN-LOW-SHARE')).toBeUndefined();
    });

    // 2.1: Test biên MARGIN_LOW_PP (2.0 pp) và SHARE_LARGE (25%)
    it('2.1: MARGIN_LOW_PP and SHARE_LARGE boundary (-2.0 pp and >=25% triggers, below does not)', () => {
      // Overall margin: 20%. Candidate A: margin 18.1% (-1.9 pp), share 30% -> NO trigger
      const tNo: FactsTable = {
        ...baseTable,
        metrics_result: {
          margin_by_product: {
            id: 'margin_by_product',
            name: 'Biên lợi nhuận theo sản phẩm',
            status: 'tính được',
            feasible: true,
            answerText: '',
            events: [],
            pivot: {
              dimension: 'Sản phẩm',
              headers: ['Sản phẩm', 'Doanh thu', 'Biên lợi nhuận'],
              rows: [
                { key: 'P1', label: 'P1', revenue: 30000000, margin_pct: 18.1 },
                { key: 'P2', label: 'P2', revenue: 70000000, margin_pct: 20.81 },
              ],
            },
          },
        },
      };
      expect(evaluateInsightRules(tNo).findings.find((f) => f.rule_id === 'R-LOW-MARGIN-HIGH-SHARE')).toBeUndefined();

      // Candidate B: margin 18.0% (-2.0 pp), share 25.0% (25M / 100M) -> TRIGGERS
      const tYes: FactsTable = {
        ...baseTable,
        metrics_result: {
          margin_by_product: {
            id: 'margin_by_product',
            name: 'Biên lợi nhuận theo sản phẩm',
            status: 'tính được',
            feasible: true,
            answerText: '',
            events: [],
            pivot: {
              dimension: 'Sản phẩm',
              headers: ['Sản phẩm', 'Doanh thu', 'Biên lợi nhuận'],
              rows: [
                { key: 'P1', label: 'P1', revenue: 25000000, margin_pct: 18.0 },
                { key: 'P2', label: 'P2', revenue: 75000000, margin_pct: 20.67 },
              ],
            },
          },
        },
      };
      expect(evaluateInsightRules(tYes).findings.find((f) => f.rule_id === 'R-LOW-MARGIN-HIGH-SHARE')).toBeDefined();

      // Candidate C: margin 15.0% (-5.0 pp), but share 24.9% (<25%) -> NO trigger
      const tUnderShare: FactsTable = {
        ...baseTable,
        metrics_result: {
          margin_by_product: {
            id: 'margin_by_product',
            name: 'Biên lợi nhuận theo sản phẩm',
            status: 'tính được',
            feasible: true,
            answerText: '',
            events: [],
            pivot: {
              dimension: 'Sản phẩm',
              headers: ['Sản phẩm', 'Doanh thu', 'Biên lợi nhuận'],
              rows: [
                { key: 'P1', label: 'P1', revenue: 24900000, margin_pct: 15.0 },
                { key: 'P2', label: 'P2', revenue: 75100000, margin_pct: 21.66 },
              ],
            },
          },
        },
      };
      expect(evaluateInsightRules(tUnderShare).findings.find((f) => f.rule_id === 'R-LOW-MARGIN-HIGH-SHARE')).toBeUndefined();
    });

    // 2.1: Test biên UNLABELED_SHARE (2%)
    it('2.1: UNLABELED_SHARE boundary (>=2% triggers, <2% does not)', () => {
      // Candidate A: 1.99% unlabeled -> NO trigger
      const tNo: FactsTable = {
        ...baseTable,
        metrics_result: {
          revenue_by_product: {
            id: 'revenue_by_product',
            name: 'Doanh thu theo sản phẩm',
            status: 'tính được',
            feasible: true,
            answerText: '',
            events: [],
            pivot: {
              dimension: 'Sản phẩm',
              headers: ['Sản phẩm', 'Doanh thu'],
              rows: [
                { key: 'Không xác định', label: 'Không xác định', revenue: 1990000 },
                { key: 'P1', label: 'P1', revenue: 98010000 },
              ],
            },
          },
        },
      };
      expect(evaluateInsightRules(tNo).findings.find((f) => f.rule_id === 'R-UNLABELED')).toBeUndefined();

      // Candidate B: 2.0% unlabeled -> TRIGGERS
      const tYes: FactsTable = {
        ...baseTable,
        metrics_result: {
          revenue_by_product: {
            id: 'revenue_by_product',
            name: 'Doanh thu theo sản phẩm',
            status: 'tính được',
            feasible: true,
            answerText: '',
            events: [],
            pivot: {
              dimension: 'Sản phẩm',
              headers: ['Sản phẩm', 'Doanh thu'],
              rows: [
                { key: 'Không xác định', label: 'Không xác định', revenue: 2000000 },
                { key: 'P1', label: 'P1', revenue: 98000000 },
              ],
            },
          },
        },
      };
      expect(evaluateInsightRules(tYes).findings.find((f) => f.rule_id === 'R-UNLABELED')).toBeDefined();
    });
  });

});
