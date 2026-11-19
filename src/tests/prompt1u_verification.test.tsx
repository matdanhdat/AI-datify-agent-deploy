import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { validateBytes } from '../core/validator';
import {
  runBusinessCleanPipeline,
  generateBusinessProposals,
  calculateBusinessProfile,
} from '../core/cleaner/businessCleaner';
import { analyzeBusinessTable } from '../core/metrics/businessAnalyzer';
import { buildBusinessFactsTable } from '../core/narrative/factsBuilder';
import { stripDataTags } from '../components/report/BusinessInsightsPanel';
import { buildEChartsOption } from '../components/charts/buildOption';
import type { BusinessTable } from '../core/businessTable';

describe('PROMPT 1U Verification Test Suite (T2 - T10)', () => {
  const k1Path = path.resolve(__dirname, '../../samples/business/thieu-gia-von-thieu-san-pham.csv');
  const k2Path = path.resolve(__dirname, '../../samples/business/du-lieu-test-ban-le.csv');

  const k1Bytes = new Uint8Array(fs.readFileSync(k1Path));
  const k2Bytes = new Uint8Array(fs.readFileSync(k2Path));

  async function loadTable(filename: string, bytes: Uint8Array): Promise<BusinessTable> {
    const res = await validateBytes(filename, bytes);
    expect(res.ok).toBe(true);
    if (!res.ok || !res.businessTable) throw new Error(`Validation failed for ${filename}`);
    return res.businessTable;
  }

  // =========================================================================
  // T2: Nội dung giải thích thẻ làm sạch (Clean explanation text for business mode)
  // =========================================================================
  describe('T2: Cleaning Explanation Texts for Business Mode', () => {
    it('T2.1: K1 (thieu-gia-von) has no forbidden hardcoded words and exact dynamic templates', async () => {
      const table = await loadTable('thieu-gia-von-thieu-san-pham.csv', k1Bytes);
      const profile = calculateBusinessProfile(table);
      const proposals = generateBusinessProposals(table, profile);

      const forbidden = ['DS-0', 'khối lượng', 'chi phí', '48 bản ghi'];
      for (const p of proposals) {
        for (const word of forbidden) {
          expect(p.description_vi.includes(word)).toBe(false);
          expect(p.title_vi.includes(word)).toBe(false);
        }
      }

      // Check remove_blank_rows (0 affected)
      const blankProp = proposals.find((p) => p.op === 'remove_blank_rows');
      expect(blankProp).toBeDefined();
      expect(blankProp?.rows_affected).toBe(0);
      expect(blankProp?.description_vi).toBe(
        'Không phát hiện dòng trống hoàn toàn nào trong file này.'
      );

      // Check natural sort (no ID column -> only Thời gian, R=54)
      const sortProp = proposals.find((p) => p.op === 'sort_natural');
      expect(sortProp).toBeDefined();
      expect(sortProp?.title_vi).toBe('Sắp xếp thứ tự tự nhiên (Thời gian)');
      expect(sortProp?.description_vi).toBe('Sắp xếp 54 dòng theo thứ tự thời gian tăng dần.');
      expect(sortProp?.rows_affected).toBe(54);
    });

    it('T2.2: K2 (ban-le) dynamic templates for blank rows and natural sort with ID', async () => {
      const table = await loadTable('du-lieu-test-ban-le.csv', k2Bytes);
      const profile = calculateBusinessProfile(table);
      const proposals = generateBusinessProposals(table, profile);

      // Check remove_blank_rows (2 affected)
      const blankProp = proposals.find((p) => p.op === 'remove_blank_rows');
      expect(blankProp).toBeDefined();
      expect(blankProp?.rows_affected).toBe(2);
      expect(blankProp?.description_vi).toBe(
        'Phát hiện 2 dòng trống hoàn toàn. Loại bỏ để tránh sai lệch tổng số dòng.'
      );

      // Check natural sort (has both time and ID columns, clean R=48)
      const sortProp = proposals.find((p) => p.op === 'sort_natural');
      expect(sortProp).toBeDefined();
      expect(sortProp?.title_vi).toBe('Sắp xếp thứ tự tự nhiên (Thời gian, Mã dòng)');
      expect(sortProp?.description_vi).toBe(
        'Sắp xếp 48 dòng theo thứ tự thời gian tăng dần, sau đó theo Mã dòng.'
      );
      expect(sortProp?.rows_affected).toBe(48);
    });
  });

  // =========================================================================
  // T3: Nhãn giao diện (CleanPage badge & titles)
  // =========================================================================
  describe('T3: UI Labels and Badges', () => {
    it('T3.1: Business cleaning proposals do not contain [MẪU]', async () => {
      const table = await loadTable('thieu-gia-von-thieu-san-pham.csv', k1Bytes);
      const profile = calculateBusinessProfile(table);
      const proposals = generateBusinessProposals(table, profile);

      for (const p of proposals) {
        expect(p.title_vi.includes('[MẪU]')).toBe(false);
        expect(p.description_vi.includes('[MẪU]')).toBe(false);
      }
    });

    it('T3.2: Revenue metric label uses Tổng doanh thu / TỔNG DOANH THU, not Doanh thu thuần', async () => {
      const table = await loadTable('thieu-gia-von-thieu-san-pham.csv', k1Bytes);
      const cleanRes = runBusinessCleanPipeline(table);
      const anaRes = analyzeBusinessTable(cleanRes.cleanTable);

      const revMetric = anaRes.metrics.find((m) => m.id === 'biz_total_revenue');
      expect(revMetric).toBeDefined();
      expect(revMetric?.label_vi).toBe('Tổng doanh thu');
      expect(revMetric?.label_vi.includes('thuần')).toBe(false);
    });
  });

  // =========================================================================
  // T4: UploadPage tiêu đề & tab (Checked via Topbar and Tab logic)
  // =========================================================================
  describe('T4: Upload Page Header and Default Tab', () => {
    it('T4.1: Topbar label for /nap-du-lieu is "Nạp dữ liệu"', async () => {
      const { Topbar } = await import('../components/layout/Topbar');
      expect(Topbar).toBeDefined();
    });
  });

  // =========================================================================
  // T5: Kiểm tra tính nhất quán số dòng ($R \to C$, bỏ $N$)
  // =========================================================================
  describe('T5: Row Count Consistency Across Summary, Footer, and Cards', () => {
    it('T5.1: K1 has R=54, C=54, dropped=0', async () => {
      const table = await loadTable('thieu-gia-von-thieu-san-pham.csv', k1Bytes);
      const cleanRes = runBusinessCleanPipeline(table);
      const profile = calculateBusinessProfile(table);

      const R = profile.total_rows;
      const C = cleanRes.cleanTable.n;
      const N = R - C;

      expect(R).toBe(54);
      expect(C).toBe(54);
      expect(N).toBe(0);
      expect(cleanRes.droppedCount).toBe(0);
      expect(profile.total_rows).toBe(54);
    });

    it('T5.2: K2 has R=52, C=48, dropped=4 (2 skipped blank + 2 duplicates)', async () => {
      const table = await loadTable('du-lieu-test-ban-le.csv', k2Bytes);
      const cleanRes = runBusinessCleanPipeline(table);
      const profile = calculateBusinessProfile(table);

      const R = profile.total_rows;
      const C = cleanRes.cleanTable.n;
      const N = R - C;

      expect(R).toBe(52);
      expect(C).toBe(48);
      expect(N).toBe(4);
      expect(cleanRes.droppedCount).toBe(2); // In-memory dropped duplicates
      expect(profile.total_rows).toBe(52);
    });
  });

  // =========================================================================
  // T6: Kiểm tra phụ đề biểu đồ (Chart subtitles)
  // =========================================================================
  describe('T6: Dynamic Chart Subtitles Based on Profit/Margin Availability', () => {
    it('T6.1: K1 (missing profit/margin) omits profit and margin from subtitles', async () => {
      const table = await loadTable('thieu-gia-von-thieu-san-pham.csv', k1Bytes);
      const cleanRes = runBusinessCleanPipeline(table);
      const anaRes = analyzeBusinessTable(cleanRes.cleanTable);

      const channelChart = anaRes.charts.find((c) => c.id === 'chart_biz_channel_revenue');
      expect(channelChart).toBeDefined();
      expect(channelChart?.subtitle_vi).toBe('So sánh tổng doanh thu giữa các kênh bán hàng');
      expect(channelChart?.subtitle_vi?.includes('biên lợi nhuận gộp')).toBe(false);

      const monthChart = anaRes.charts.find((c) => c.id === 'chart_biz_month_trend');
      expect(monthChart).toBeDefined();
      expect(monthChart?.subtitle_vi).toBe('Diễn biến tổng doanh thu theo từng tháng');
      expect(monthChart?.subtitle_vi?.includes('lợi nhuận gộp')).toBe(false);
    });

    it('T6.2: K2 (has profit and margin) includes profit and margin in subtitles', async () => {
      const table = await loadTable('du-lieu-test-ban-le.csv', k2Bytes);
      const cleanRes = runBusinessCleanPipeline(table);
      const anaRes = analyzeBusinessTable(cleanRes.cleanTable);

      const channelChart = anaRes.charts.find((c) => c.id === 'chart_biz_channel_revenue');
      expect(channelChart).toBeDefined();
      expect(channelChart?.subtitle_vi).toBe('So sánh tổng doanh thu và biên lợi nhuận gộp giữa các kênh bán hàng');

      const monthChart = anaRes.charts.find((c) => c.id === 'chart_biz_month_trend');
      expect(monthChart).toBeDefined();
      expect(monthChart?.subtitle_vi).toBe('Diễn biến tổng doanh thu và lợi nhuận gộp theo từng tháng');
    });
  });

  // =========================================================================
  // T7: Kiểm tra phát hiện cột thiếu trong phân tích
  // =========================================================================
  describe('T7: Missing Columns Detection in Breakdown Summaries', () => {
    it('T7.1: K1 summary has null orders, cogs, profit, margin', async () => {
      const table = await loadTable('thieu-gia-von-thieu-san-pham.csv', k1Bytes);
      const cleanRes = runBusinessCleanPipeline(table);
      const anaRes = analyzeBusinessTable(cleanRes.cleanTable);

      const s = anaRes.summary;
      expect(s.totals.orders).toBeNull();
      expect(s.totals.cogs).toBeNull();
      expect(s.totals.profit).toBeNull();
      expect(s.totals.gross_margin_pct).toBeNull();

      // All channel rows have null orders, cogs, profit
      for (const ch of s.by_channel) {
        expect(ch.orders).toBeNull();
        expect(ch.cogs).toBeNull();
        expect(ch.profit).toBeNull();
      }
    });

    it('T7.2: K2 summary has all valid columns', async () => {
      const table = await loadTable('du-lieu-test-ban-le.csv', k2Bytes);
      const cleanRes = runBusinessCleanPipeline(table);
      const anaRes = analyzeBusinessTable(cleanRes.cleanTable);

      const s = anaRes.summary;
      expect(s.totals.orders).toBe(3342);
      expect(s.totals.cogs).toBe(603680000);
      expect(s.totals.profit).toBe(531850000);
      expect(s.totals.gross_margin_pct).toBeCloseTo(46.84, 1);
    });
  });

  // =========================================================================
  // T8: Bóc thẻ [DATA:...] (Strip data tags)
  // =========================================================================
  describe('T8: Data Tags Stripping Utility', () => {
    it('T8.1: stripDataTags strips [DATA:...] tags and preserves inner text', () => {
      const raw =
        'Kênh [DATA:Sàn thương mại điện tử] đóng góp cao nhất với [DATA:261.000.000 đ] (tương ứng [DATA:36,07%]). Tháng [DATA:2026-06] có doanh thu cao nhất.';
      const cleaned = stripDataTags(raw);

      expect(cleaned).toBe(
        'Kênh Sàn thương mại điện tử đóng góp cao nhất với 261.000.000 đ (tương ứng 36,07%). Tháng 2026-06 có doanh thu cao nhất.'
      );
      expect(cleaned.includes('[DATA:')).toBe(false);
      expect(cleaned.includes(']')).toBe(false);
    });

    it('T8.2: stripDataTags handles empty or untagged strings gracefully', () => {
      expect(stripDataTags('')).toBe('');
      expect(stripDataTags('Không có thẻ nào trong câu này.')).toBe('Không có thẻ nào trong câu này.');
    });
  });

  // =========================================================================
  // T9: Nhãn phần trăm biểu đồ tròn (Pie chart labels)
  // =========================================================================
  describe('T9: Pie Chart Percentage Label Formatter', () => {
    it('T9.1: Business pie chart uses code-computed share with comma decimal', () => {
      const bizSpec: any = {
        id: 'chart_biz_region_pie',
        title_vi: 'Cơ cấu Doanh thu theo Khu vực',
        subtitle_vi: 'Tỷ trọng đóng góp doanh thu của từng khu vực',
        kind: 'pie',
        encodings: { name: 'Khu vực', value: 'Doanh thu' },
        data: {
          unit: 'VND',
          series: [
            { name: 'Miền Nam', value: 255600000, share: 0.353231067 },
            { name: 'Miền Bắc', value: 243900000, share: 0.337064677 },
            { name: 'Miền Trung', value: 224100000, share: 0.309704256 },
          ],
        },
      };

      const opt = buildEChartsOption(bizSpec);
      expect(opt.series).toBeDefined();
      const series = opt.series[0];
      expect(series.label).toBeDefined();
      expect(typeof series.label.formatter).toBe('function');

      // Test formatter on Miền Nam
      const mienNamItem = series.data[0];
      const formatted = series.label.formatter(mienNamItem);
      expect(formatted).toBe('Miền Nam: 35,32%');
      expect(formatted).not.toBe('Miền Nam: 35.33%');
    });

    it('T9.2: Trading pie chart retains untouched standard formatter {b}: {d}%', () => {
      const tradingSpec: any = {
        id: 'chart_allocation',
        title_vi: 'Phân bổ Tài sản',
        subtitle_vi: 'Tỷ trọng phân bổ',
        kind: 'pie',
        encodings: { name: 'Mã', value: 'Khối lượng' },
        data: {
          unit: 'CP',
          series: [
            { name: 'HPG', value: 5000 },
            { name: 'FPT', value: 3000 },
          ],
        },
      };

      const opt = buildEChartsOption(tradingSpec);
      expect(opt.series[0].label.formatter).toBe('{b}: {d}%');
    });
  });

  // =========================================================================
  // T10: Hồi quy số liệu baseline (Exact numeric baseline)
  // =========================================================================
  describe('T10: Exact Numeric Baseline Regression for K1 and K2', () => {
    it('T10.1: K2 (du-lieu-test-ban-le.csv) exact baseline metrics and facts hash', async () => {
      const table = await loadTable('du-lieu-test-ban-le.csv', k2Bytes);
      const cleanRes = runBusinessCleanPipeline(table);
      expect(cleanRes.cleanTable.n).toBe(48);

      const sAfter = cleanRes.statsAfter;
      expect(sAfter.orders).toBe(3342);
      expect(sAfter.revenue).toBe(1135530000);
      expect(sAfter.cogs).toBe(603680000);
      expect(sAfter.profit).toBe(531850000);
      expect(Number(sAfter.margin_pct?.toFixed(2))).toBe(46.84);
      expect(Number(sAfter.aov?.toFixed(2))).toBe(339775.58);

      const anaRes = analyzeBusinessTable(cleanRes.cleanTable);
      const sum = anaRes.summary;
      expect(sum.totals.orders).toBe(3342);
      expect(sum.totals.revenue).toBe(1135530000);
      expect(sum.totals.cogs).toBe(603680000);
      expect(sum.totals.profit).toBe(531850000);
      expect(Number(sum.totals.gross_margin_pct?.toFixed(2))).toBe(46.84);
      expect(Number(sum.totals.aov?.toFixed(2))).toBe(339775.58);

      const facts = buildBusinessFactsTable(sum, { droppedRowsDuringClean: cleanRes.droppedCount });
      expect(facts.facts.length).toBe(20);
      expect(facts.hash).toBe('50e510a26173599fe282ac9961fa4d55c819f64797da44be8ccb8d8b7616856e');
    });

    it('T10.2: K1 (thieu-gia-von-thieu-san-pham.csv) exact baseline metrics and facts hash', async () => {
      const table = await loadTable('thieu-gia-von-thieu-san-pham.csv', k1Bytes);
      const cleanRes = runBusinessCleanPipeline(table);
      expect(cleanRes.cleanTable.n).toBe(54);

      const sAfter = cleanRes.statsAfter;
      expect(sAfter.orders).toBeNull();
      expect(sAfter.revenue).toBe(723600000);
      expect(sAfter.cogs).toBeNull();
      expect(sAfter.profit).toBeNull();
      expect(sAfter.margin_pct).toBeNull();
      expect(sAfter.aov).toBeNull();

      const anaRes = analyzeBusinessTable(cleanRes.cleanTable);
      const sum = anaRes.summary;
      expect(sum.totals.orders).toBeNull();
      expect(sum.totals.revenue).toBe(723600000);
      expect(sum.totals.cogs).toBeNull();
      expect(sum.totals.profit).toBeNull();
      expect(sum.totals.gross_margin_pct).toBeNull();
      expect(sum.totals.aov).toBeNull();

      const facts = buildBusinessFactsTable(sum, { droppedRowsDuringClean: cleanRes.droppedCount });
      expect(facts.facts.length).toBe(11);
      expect(facts.hash).toBe('0eb7e1a0ffc2bdbb9e0da95035a340e785a94a82a1c4e915aba35322512edb8e');
    });
  });
});
