import { describe, it, expect } from 'vitest';
import {
  validateMetricSuggestion,
  buildFallbackMetricSuggestion,
  sanitizeTextNoDigits,
  type MetricSuggestionCatalogItem,
} from '../core/metrics/metricSuggestionValidator';
import {
  metricSuggestionTask,
  MetricSuggestionInputSchema,
  MetricSuggestionOutputSchema,
} from '../../api/_lib/tasks';
import { BUSINESS_METRIC_CATALOG } from '../core/metrics/businessCatalog';

describe('Prompt 3A: Metric Suggestion Unit Tests', () => {
  const allFeasibleSet = new Set(BUSINESS_METRIC_CATALOG.map((m) => m.id));
  const sampleFeasibleCatalog: MetricSuggestionCatalogItem[] = BUSINESS_METRIC_CATALOG.map((m) => ({
    id: m.id,
    name: m.name,
    feasible: true,
  }));

  describe('1. Task Definition and Zod Schemas', () => {
    it('validates a correct input payload', () => {
      const payload = {
        clean_row_count: 48,
        confirmed_roles: ['Doanh thu', 'Giá vốn', 'Kênh bán'],
        catalog_metrics: sampleFeasibleCatalog,
        confidence_level: 'CAO',
      };
      const parsed = MetricSuggestionInputSchema.safeParse(payload);
      expect(parsed.success).toBe(true);
    });

    it('rejects negative clean_row_count', () => {
      const payload = {
        clean_row_count: -5,
        confirmed_roles: ['Doanh thu'],
        catalog_metrics: sampleFeasibleCatalog,
        confidence_level: 'CAO',
      };
      const parsed = MetricSuggestionInputSchema.safeParse(payload);
      expect(parsed.success).toBe(false);
    });

    it('validates output schema with notes <= 2', () => {
      const output = {
        suggested_ids: ['total_revenue', 'gross_margin'],
        reasons: {
          total_revenue: 'Phản ánh quy mô bán hàng',
          gross_margin: 'Đo lường hiệu quả sinh lời',
        },
        notes: ['Lưu ý một', 'Lưu ý hai'],
      };
      const parsed = MetricSuggestionOutputSchema.safeParse(output);
      expect(parsed.success).toBe(true);
    });

    it('rejects output schema with more than 2 notes', () => {
      const output = {
        suggested_ids: ['total_revenue'],
        reasons: { total_revenue: 'Lý do hợp lệ' },
        notes: ['Note 1', 'Note 2', 'Note 3'],
      };
      const parsed = MetricSuggestionOutputSchema.safeParse(output);
      expect(parsed.success).toBe(false);
    });

    it('buildPrompt formats prompt without raw data or amounts', () => {
      const prompt = metricSuggestionTask.buildPrompt({
        clean_row_count: 100,
        confirmed_roles: ['Doanh thu', 'Sản phẩm'],
        catalog_metrics: [
          { id: 'total_revenue', name: 'Tổng doanh thu', feasible: true },
          { id: 'gross_profit', name: 'Tổng lợi nhuận gộp', feasible: false, reason: 'Thiếu giá vốn' },
        ],
        confidence_level: 'CAO',
      });

      expect(prompt).toContain('100 dòng');
      expect(prompt).toContain('Doanh thu, Sản phẩm');
      expect(prompt).toContain('total_revenue (Tổng doanh thu)');
      expect(prompt).toContain('gross_profit (Tổng lợi nhuận gộp): Thiếu giá vốn');
      // Must not contain fake currency figures
      expect(prompt).not.toMatch(/\d{3}\.\d{3}\.\d{3}/);
    });
  });

  describe('2. Metric Suggestion Validator (Sanitization & Safety)', () => {
    it('discards unknown metric ID (e.g. foo_metric)', () => {
      const rawAi = {
        suggested_ids: ['total_revenue', 'foo_metric', 'gross_margin'],
        reasons: {
          total_revenue: 'Chỉ số doanh thu',
          foo_metric: 'Chỉ số không tồn tại',
          gross_margin: 'Chỉ số biên lợi nhuận',
        },
        notes: [],
      };

      const validated = validateMetricSuggestion(rawAi, allFeasibleSet);
      expect(validated.suggested_ids).toEqual(['total_revenue', 'gross_margin']);
      expect(validated.suggested_ids).not.toContain('foo_metric');
    });

    it('discards infeasible metric ID (e.g. gross_profit when cost is missing)', () => {
      const restrictedFeasible = new Set(['total_revenue', 'revenue_by_channel']);
      const rawAi = {
        suggested_ids: ['total_revenue', 'gross_profit', 'revenue_by_channel'],
        reasons: {
          total_revenue: 'Doanh thu hợp lệ',
          gross_profit: 'Lợi nhuận bị thiếu cột',
          revenue_by_channel: 'Kênh bán hợp lệ',
        },
        notes: [],
      };

      const validated = validateMetricSuggestion(rawAi, restrictedFeasible);
      expect(validated.suggested_ids).toEqual(['total_revenue', 'revenue_by_channel']);
      expect(validated.suggested_ids).not.toContain('gross_profit');
    });

    it('discards reason containing digits (0-9) to prevent fabricated figures and falls back to metric reason', () => {
      const rawAi = {
        suggested_ids: ['total_revenue', 'gross_margin'],
        reasons: {
          total_revenue: 'Đạt mức tăng trưởng 25% trong quý',
          gross_margin: 'Đo lường biên lợi nhuận lành mạnh',
        },
        notes: [],
      };

      const validated = validateMetricSuggestion(rawAi, allFeasibleSet);
      // Digit reason must be discarded and replaced with specific fallback reason for that metric
      expect(validated.reasons.total_revenue).toBe('Chỉ số cốt lõi phản ánh quy mô bán hàng của doanh nghiệp.');
      expect(validated.reasons.total_revenue).not.toMatch(/\d/);
      // Non-digit reason preserved
      expect(validated.reasons.gross_margin).toBe('Đo lường biên lợi nhuận lành mạnh');
    });

    it('accepts revenue_growth and discards obsolete monthly_growth_rate', () => {
      const rawAi = {
        suggested_ids: ['revenue_growth', 'monthly_growth_rate'],
        reasons: {
          revenue_growth: 'Theo dõi nhịp tăng trưởng doanh thu theo tháng',
          monthly_growth_rate: 'Tên chỉ số cũ không hợp lệ',
        },
        notes: [],
      };

      const validated = validateMetricSuggestion(rawAi, allFeasibleSet);
      expect(validated.suggested_ids).toContain('revenue_growth');
      expect(validated.suggested_ids).not.toContain('monthly_growth_rate');
      expect(validated.reasons.revenue_growth).toBe('Theo dõi nhịp tăng trưởng doanh thu theo tháng');
    });

    it('discards notes containing digits', () => {
      const rawAi = {
        suggested_ids: ['total_revenue'],
        reasons: { total_revenue: 'Hợp lệ' },
        notes: [
          'Ghi chú có số 5 tỷ cần bị loại',
          'Ghi chú chữ thuần túy hợp lệ',
        ],
      };

      const validated = validateMetricSuggestion(rawAi, allFeasibleSet);
      expect(validated.notes.length).toBe(1);
      expect(validated.notes[0]).toBe('Ghi chú chữ thuần túy hợp lệ');
    });

    it('sanitizes HTML and markdown in reasons and notes', () => {
      const rawAi = {
        suggested_ids: ['total_revenue'],
        reasons: {
          total_revenue: '<b>Phản ánh</b> quy mô *kinh doanh* <script>alert(1)</script>',
        },
        notes: ['**Lưu ý quan trọng**: Kiểm tra kỹ <i>thông tin</i>'],
      };

      const validated = validateMetricSuggestion(rawAi, allFeasibleSet);
      expect(validated.reasons.total_revenue).not.toContain('<b>');
      expect(validated.reasons.total_revenue).not.toContain('<script>');
      expect(validated.reasons.total_revenue).not.toContain('*');
      expect(validated.notes[0]).not.toContain('**');
      expect(validated.notes[0]).not.toContain('<i>');
    });

    it('limits notes to maximum 2 items with length <= 160', () => {
      const rawAi = {
        suggested_ids: ['total_revenue'],
        reasons: { total_revenue: 'Hợp lệ' },
        notes: [
          'Ghi chú một',
          'Ghi chú hai',
          'Ghi chú ba bị cắt bỏ',
          'Ghi chú bốn bị cắt bỏ',
        ],
      };

      const validated = validateMetricSuggestion(rawAi, allFeasibleSet);
      expect(validated.notes.length).toBe(2);
      expect(validated.notes[0]).toBe('Ghi chú một');
      expect(validated.notes[1]).toBe('Ghi chú hai');
    });

    it('returns fallback if AI payload is null or completely invalid', () => {
      const validated = validateMetricSuggestion(null, allFeasibleSet);
      expect(validated.suggested_ids.length).toBe(13);
      expect(validated.notes.length).toBe(2);
    });
  });

  describe('3. Fallback Metric Suggestion Builder', () => {
    it('builds fallback with all feasible metrics and no digits in reasons', () => {
      const feasibleList = BUSINESS_METRIC_CATALOG.slice(0, 5);
      const fallback = buildFallbackMetricSuggestion(feasibleList, ['Doanh thu']);

      expect(fallback.suggested_ids).toEqual(feasibleList.map((m) => m.id));
      for (const id of fallback.suggested_ids) {
        expect(fallback.reasons[id]).toBeDefined();
        expect(fallback.reasons[id]).not.toMatch(/\d/);
      }
      expect(fallback.notes.length).toBe(2);
      for (const note of fallback.notes) {
        expect(note.length).toBeLessThanOrEqual(160);
      }
    });
  });

  describe('4. sanitizeTextNoDigits helper', () => {
    it('strips markdown, HTML tags and normalizes whitespace', () => {
      const input = '   # Tiêu đề <span class="badge">nhãn</span> **in đậm** `code`   ';
      const output = sanitizeTextNoDigits(input);
      expect(output).toBe('Tiêu đề nhãn in đậm code');
    });
  });
});
