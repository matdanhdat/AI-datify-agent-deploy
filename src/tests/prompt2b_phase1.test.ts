// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { buildBusinessFactsTable } from '../core/narrative/factsBuilder';
import { buildTemplateBusinessInsights } from '../core/narrative/businessInsights';
import type { BusinessAnalysisSummary } from '../core/metrics/businessAnalyzer';
// @ts-ignore
import { isDistStale, determineBuildDecision, handleBuildResult } from '../../scripts/start_local.mjs';

function mockSummary(overrides: Record<string, unknown> = {}): BusinessAnalysisSummary {
  const base = {
    total_rows: 20,
    period: { from: '2026-01-01', to: '2026-03-31' },
    totals: {
      revenue: 100_000_000,
      cogs: 60_000_000,
      profit: 40_000_000,
      orders: 100,
      aov: 1_000_000,
      gross_margin_pct: 40,
    },
    by_channel: [
      { key: 'Online', revenue: 50_000_000, revenue_share_pct: 50, orders: 50, profit: 20_000_000, margin_pct: 40, aov: 1_000_000 },
      { key: 'Offline', revenue: 50_000_000, revenue_share_pct: 50, orders: 50, profit: 20_000_000, margin_pct: 40, aov: 1_000_000 },
    ],
    by_region: [
      { key: 'Hà Nội', revenue: 50_000_000, revenue_share_pct: 50, orders: 50, profit: 20_000_000, margin_pct: 40 },
      { key: 'Đà Nẵng', revenue: 50_000_000, revenue_share_pct: 50, orders: 50, profit: 20_000_000, margin_pct: 40 },
    ],
    by_month: [
      { key: '2026-01', revenue: 30_000_000, revenue_share_pct: 30, orders: 30, profit: 12_000_000, margin_pct: 40 },
      { key: '2026-02', revenue: 30_000_000, revenue_share_pct: 30, orders: 30, profit: 12_000_000, margin_pct: 40 },
      { key: '2026-03', revenue: 40_000_000, revenue_share_pct: 40, orders: 40, profit: 16_000_000, margin_pct: 40, mom_revenue_delta: 10_000_000, mom_revenue_pct: 33.33 },
    ],
    by_product: [
      { key: 'SP A', revenue: 40_000_000, revenue_share_pct: 40, orders: 40, profit: 16_000_000, margin_pct: 40 },
      { key: 'SP B', revenue: 30_000_000, revenue_share_pct: 30, orders: 30, profit: 12_000_000, margin_pct: 40 },
      { key: 'SP C', revenue: 30_000_000, revenue_share_pct: 30, orders: 30, profit: 12_000_000, margin_pct: 40 },
    ],
    trend: {
      best_month: { key: '2026-03', revenue: 40_000_000, revenue_share_pct: 40, orders: 40, profit: 16_000_000, margin_pct: 40 },
      worst_month: { key: '2026-01', revenue: 30_000_000, revenue_share_pct: 30, orders: 30, profit: 12_000_000, margin_pct: 40 },
      latest_month: { key: '2026-03', revenue: 40_000_000, revenue_share_pct: 40, orders: 40, profit: 16_000_000, margin_pct: 40 },
      previous_month: { key: '2026-02', revenue: 30_000_000, revenue_share_pct: 30, orders: 30, profit: 12_000_000, margin_pct: 40 },
      latest_mom_delta: 10_000_000,
      latest_mom_pct: 33.33,
    },
    concentration: {
      top1_product: { key: 'SP A', revenue: 40_000_000, revenue_share_pct: 40, orders: 40, profit: 16_000_000, margin_pct: 40 },
      top3_products_share_pct: 100,
      lowest_margin_product: null,
      lowest_revenue_region: { key: 'Đà Nẵng', revenue: 50_000_000, revenue_share_pct: 50, orders: 50, profit: 20_000_000, margin_pct: 40 },
      unknown_region_revenue: 0,
      unknown_region_share_pct: 0,
      unknown_product_revenue: 0,
      unknown_product_share_pct: 0,
    },
    quality: {
      missing_numeric_cells: 0,
      unknown_dimension_rows: 0,
      negative_profit_rows: 0,
      high_revenue_outlier_rows: 0,
      anomalies: [],
    },
    ...overrides,
  };
  return base as unknown as BusinessAnalysisSummary;
}

describe('PROMPT 2B PHẦN 1: Báo cáo & Sửa lời văn do code sinh', () => {
  it('1. FactsBuilder: Không sinh cảnh báo Top 3 chiếm 100% khi chỉ có 3 sản phẩm', () => {
    const summary = mockSummary(); // exactly 3 products
    const facts = buildBusinessFactsTable(summary);
    const top3Fact = facts.facts.find((f) => f.label_vi.includes('Top 3 sản phẩm dẫn đầu'));
    expect(top3Fact).toBeUndefined();
  });

  it('2. FactsBuilder: Sinh cảnh báo Top 3 dẫn đầu khi công ty có nhiều hơn 3 sản phẩm', () => {
    const summary = mockSummary({
      by_product: [
        { key: 'SP A', revenue: 40_000_000, revenue_share_pct: 40, orders: 40, profit: 16_000_000, margin_pct: 40 },
        { key: 'SP B', revenue: 20_000_000, revenue_share_pct: 20, orders: 20, profit: 8_000_000, margin_pct: 40 },
        { key: 'SP C', revenue: 20_000_000, revenue_share_pct: 20, orders: 20, profit: 8_000_000, margin_pct: 40 },
        { key: 'SP D', revenue: 10_000_000, revenue_share_pct: 10, orders: 10, profit: 4_000_000, margin_pct: 40 },
        { key: 'SP E', revenue: 10_000_000, revenue_share_pct: 10, orders: 10, profit: 4_000_000, margin_pct: 40 },
      ],
      concentration: {
        top1_product: { key: 'SP A', revenue: 40_000_000, revenue_share_pct: 40, orders: 40, profit: 16_000_000, margin_pct: 40 },
        top3_products_share_pct: 80,
        lowest_margin_product: null,
        lowest_revenue_region: null,
        unknown_region_revenue: 0,
        unknown_region_share_pct: 0,
        unknown_product_revenue: 0,
        unknown_product_share_pct: 0,
      },
    });
    const facts = buildBusinessFactsTable(summary);
    const top3Fact = facts.facts.find((f) => f.label_vi.includes('Top 3 sản phẩm dẫn đầu'));
    expect(top3Fact).toBeDefined();
    expect(top3Fact?.display).toContain('80,00%');
  });

  it('3. BusinessInsights: Hai kênh bằng doanh thu thì nêu hòa nhau/đồng hạng, không nói vượt qua', () => {
    const summary = mockSummary(); // Online and Offline equal 50m each
    const facts = buildBusinessFactsTable(summary);
    const report = buildTemplateBusinessInsights(facts);
    const chInsight = report.insights.find((i) => i.title.includes('kênh bán hàng'));
    expect(chInsight).toBeDefined();
    expect(chInsight?.statement).toMatch(/hòa nhau|đồng hạng/);
    expect(chInsight?.statement).not.toContain('vượt qua');
  });

  it('4. BusinessInsights: Khi thiếu cột Giá vốn, không khuyên bảo toàn/tăng biên lợi nhuận gộp', () => {
    const summary = mockSummary({
      totals: {
        revenue: 100_000_000,
        cogs: null,
        profit: null,
        orders: 100,
        aov: 1_000_000,
        gross_margin_pct: null,
      },
    });
    const facts = buildBusinessFactsTable(summary);
    const report = buildTemplateBusinessInsights(facts);
    const chRec = report.recommendations.find((r) => r.action.includes('kênh'));
    if (chRec) {
      expect(chRec.rationale).not.toContain('biên lợi nhuận gộp thực tế');
      expect(chRec.expected_effect_note).not.toContain('bảo toàn biên lợi nhuận gộp');
    }
  });

  it('5. BusinessInsights: Limitations ghi rõ "không có số liệu theo dõi" cho chi phí marketing/vận hành', () => {
    const summary = mockSummary();
    const facts = buildBusinessFactsTable(summary);
    const report = buildTemplateBusinessInsights(facts);
    const limitWithCost = report.limitations.find((l) => l.includes('marketing'));
    expect(limitWithCost).toBeDefined();
    expect(limitWithCost).toContain('không có số liệu theo dõi');
  });

  it('6. start_local: isDistStale returns false when src does not exist, true when dist does not exist', () => {
    expect(isDistStale(1000, 2000, true, false)).toBe(false);
    expect(isDistStale(1000, 2000, false, true)).toBe(true);
    expect(isDistStale(2000, 1000, true, true)).toBe(true);
    expect(isDistStale(1000, 2000, true, true)).toBe(false);
  });

  it('7. start_local case 1: Có cả src và node_modules và code mới hơn dist -> build', () => {
    const decision = determineBuildDecision({
      srcExists: true,
      nodeModulesExists: true,
      distExists: true,
      isStale: true,
    });
    expect(decision.action).toBe('build');
  });

  it('8. start_local case 2: Thiếu node_modules nhưng có dist -> serve dist, không treo', () => {
    const decision = determineBuildDecision({
      srcExists: true,
      nodeModulesExists: false,
      distExists: true,
      isStale: true,
    });
    expect(decision.action).toBe('serve_dist_no_build');
    expect(decision.reason).toBe('missing_node_modules');
  });

  it('9. start_local case 3: Auto-build thất bại nhưng đã có dist -> tiếp tục serve dist', () => {
    const result = handleBuildResult(1, true);
    expect(result).toBe('serve_existing_dist');

    const exitResult = handleBuildResult(1, false);
    expect(exitResult).toBe('exit');
  });
});
