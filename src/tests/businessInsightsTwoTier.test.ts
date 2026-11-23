import { describe, it, expect } from 'vitest';
import {
  verifyBusinessInsightsOutput,
  buildTemplateBusinessInsights,
  hasForbiddenKeyword,
  sanitizePlainText,
} from '../core/narrative/businessInsights';
import type { FactsTable, FactItem } from '../core/narrative/factsBuilder';
import { BusinessInsightsOutputSchema } from '../core/aiTaskSchemas';

describe('Prompt 3B: Two-Tier Business Insights & Verification Suite', () => {
  // Mock FactsTable with realistic facts
  const mockFacts: FactItem[] = [
    {
      id: 'F1',
      category: 'total',
      label_vi: 'Tổng doanh thu',
      value: 1135530000,
      display: '1.135.530.000 đ',
      unit: 'VNĐ',
      raw_numbers: [1135530000],
    },
    {
      id: 'F2',
      category: 'total',
      label_vi: 'Tổng số đơn',
      value: 3342,
      display: '3.342 đơn',
      unit: 'đơn',
      raw_numbers: [3342],
    },
    {
      id: 'F3',
      category: 'total',
      label_vi: 'Tổng lợi nhuận gộp',
      value: 532150000,
      display: '532.150.000 đ',
      unit: 'VNĐ',
      raw_numbers: [532150000],
    },
    {
      id: 'F4',
      category: 'total',
      label_vi: 'Biên lợi nhuận gộp',
      value: 46.86,
      display: '46.86%',
      unit: '%',
      raw_numbers: [46.86],
    },
    {
      id: 'F5',
      category: 'channel',
      label_vi: 'Kênh Website',
      value: 454165000,
      display: '454.165.000 đ',
      unit: 'VNĐ',
      raw_numbers: [454165000],
    },
    {
      id: 'F6',
      category: 'channel',
      label_vi: 'Kênh Sàn TMĐT',
      value: 454165000,
      display: '454.165.000 đ',
      unit: 'VNĐ',
      raw_numbers: [454165000],
    },
  ];

  const mockFactsTable: FactsTable = {
    hash: 'mock_facts_hash_123',
    byte_size: 1024,
    generated_at: new Date().toISOString(),
    dataset_kind: 'business',
    period: '48 dòng',
    facts: mockFacts,
  };

  const metricEventMap: Record<string, string[]> = {
    total_revenue: ['F1'],
    total_orders: ['F2'],
    gross_profit: ['F3'],
    gross_margin: ['F4'],
    revenue_by_channel: ['F5', 'F6'],
  };

  describe('1. Trình kiểm tra số liệu và refs (Verification)', () => {
    it('(a) Loại bỏ câu ở Tầng 2 khi chứa số lạ không có trong refs', () => {
      const payload = {
        summary: ['Doanh thu đạt 1.135.530.000 đ.'],
        by_metric: {
          total_revenue: [
            // F1 has 1135530000, but text says 999.000.000 (hallucinated number)
            { text: 'Doanh thu đạt 999.000.000 đ kỳ này.', refs: ['F1'] },
          ],
        },
      };

      const result = verifyBusinessInsightsOutput(payload, mockFactsTable, {
        model: 'gemini-test',
        latency_ms: 120,
        metricEventMap,
      });

      // The invalid sentence should be rejected
      expect(result.by_metric.total_revenue).toBeUndefined();
      expect(result.rejected_count).toBeGreaterThan(0);
      expect(result.summary).toHaveLength(1);
    });

    it('(b) Loại bỏ câu khi refs không tồn tại trong factsTable hoặc không thuộc chỉ số', () => {
      const payload = {
        summary: ['Doanh thu đạt 1.135.530.000 đ.'],
        by_metric: {
          total_revenue: [
            // F99 does not exist
            { text: 'Doanh thu đạt 1.135.530.000 đ.', refs: ['F99'] },
            // F5 belongs to channel, not total_revenue
            { text: 'Doanh thu đạt 1.135.530.000 đ.', refs: ['F5'] },
          ],
        },
      };

      const result = verifyBusinessInsightsOutput(payload, mockFactsTable, {
        model: 'gemini-test',
        latency_ms: 120,
        metricEventMap,
      });

      expect(result.by_metric.total_revenue).toBeUndefined();
      expect(result.rejected_count).toBe(2);
    });

    it('(c) Loại bỏ câu khi refs rỗng ở Tầng 2', () => {
      const payload = {
        summary: ['Doanh thu đạt 1.135.530.000 đ.'],
        by_metric: {
          total_revenue: [{ text: 'Doanh thu tăng trưởng mạnh mẽ.', refs: [] }],
        },
      };

      const result = verifyBusinessInsightsOutput(payload, mockFactsTable, {
        model: 'gemini-test',
        latency_ms: 120,
        metricEventMap,
      });

      expect(result.by_metric.total_revenue).toBeUndefined();
      expect(result.rejected_count).toBe(1);
    });
  });

  describe('2. Kiểm soát từ khóa cấm theo cờ (has_* Flags)', () => {
    it('(a) has_margin: false loại bỏ câu chứa "biên", "lợi nhuận", "giá vốn", "lãi"', () => {
      expect(hasForbiddenKeyword('Biên lợi nhuận đạt mức khả quan', { has_margin: false })).toBeTruthy();
      expect(hasForbiddenKeyword('Giá vốn sản phẩm tăng cao', { has_margin: false })).toBeTruthy();
      expect(hasForbiddenKeyword('Lãi gộp ước tính tốt', { has_margin: false })).toBeTruthy();
      expect(hasForbiddenKeyword('Tổng doanh thu đạt 100 tỷ', { has_margin: false })).toBeNull();
    });

    it('(b) has_orders: false loại bỏ câu chứa "đơn", "AOV"', () => {
      expect(hasForbiddenKeyword('Số đơn hàng tăng trưởng 20%', { has_orders: false })).toBeTruthy();
      expect(hasForbiddenKeyword('Chỉ số AOV ghi nhận cao', { has_orders: false })).toBeTruthy();
      expect(hasForbiddenKeyword('Doanh thu theo kênh bán tốt', { has_orders: false })).toBeNull();
    });

    it('(c) has_product: false loại bỏ câu chứa "sản phẩm", "mặt hàng"', () => {
      expect(hasForbiddenKeyword('Sản phẩm A bán chạy nhất', { has_product: false })).toBeTruthy();
      expect(hasForbiddenKeyword('Mặt hàng tiêu dùng đạt chỉ tiêu', { has_product: false })).toBeTruthy();
      expect(hasForbiddenKeyword('Doanh thu theo khu vực ổn định', { has_product: false })).toBeNull();
    });

    it('(d) has_channel: false loại bỏ câu chứa "kênh"', () => {
      expect(hasForbiddenKeyword('Kênh trực tuyến tăng trưởng nhanh', { has_channel: false })).toBeTruthy();
      expect(hasForbiddenKeyword('Tổng doanh thu toàn công ty cao', { has_channel: false })).toBeNull();
    });

    it('(e) has_region: false loại bỏ câu chứa "khu vực", "địa lý", "miền", "tỉnh"', () => {
      expect(hasForbiddenKeyword('Khu vực miền Bắc có doanh số tốt', { has_region: false })).toBeTruthy();
      expect(hasForbiddenKeyword('Thị trường tỉnh lẻ tăng trưởng', { has_region: false })).toBeTruthy();
      expect(hasForbiddenKeyword('Doanh thu toàn quốc đạt kỳ vọng', { has_region: false })).toBeNull();
    });

    it('(f) has_time: false loại bỏ câu chứa "tháng", "tăng trưởng", "xu hướng"', () => {
      expect(hasForbiddenKeyword('Doanh thu tháng 10 dẫn đầu', { has_time: false })).toBeTruthy();
      expect(hasForbiddenKeyword('Xu hướng tăng trưởng tích cực', { has_time: false })).toBeTruthy();
      expect(hasForbiddenKeyword('Quy mô đạt 500 triệu', { has_time: false })).toBeNull();
    });
  });

  describe('3. Cắt gọt độ dài và làm sạch định dạng', () => {
    it('(a) Cắt bớt nếu summary > 3 câu hoặc by_metric > 2 câu', () => {
      const payload = {
        summary: ['Câu 1.', 'Câu 2.', 'Câu 3.', 'Câu 4 thừa.'],
        by_metric: {
          total_revenue: [
            { text: 'Câu A.', refs: ['F1'] },
            { text: 'Câu B.', refs: ['F1'] },
            { text: 'Câu C thừa.', refs: ['F1'] },
          ],
        },
      };

      const result = verifyBusinessInsightsOutput(payload, mockFactsTable, {
        model: 'gemini-test',
        latency_ms: 120,
        metricEventMap,
      });

      expect(result.summary).toHaveLength(3);
      expect(result.by_metric.total_revenue).toHaveLength(2);
    });

    it('(b) Khử sạch thẻ HTML và link markdown trong câu chữ', () => {
      const dirty = 'Doanh thu <script>alert(1)</script> đạt <b>1.135.530.000</b> đ [xem chi tiết](http://example.com)';
      const cleaned = sanitizePlainText(dirty);
      expect(cleaned).toBe('Doanh thu đạt 1.135.530.000 đ xem chi tiết');
      expect(cleaned).not.toContain('<');
      expect(cleaned).not.toContain('(');
    });
  });

  describe('4. Chuyển đổi dự phòng (Fallback Behavior)', () => {
    it('(a) Rỗng cả 2 tầng thì chuyển sang mẫu dự phòng 100%', () => {
      const payload = {
        summary: [],
        by_metric: {},
      };

      const result = verifyBusinessInsightsOutput(payload, mockFactsTable, {
        model: 'gemini-test',
        latency_ms: 120,
        metricEventMap,
      });

      expect(result.source).toBe('template');
      expect(result.summary.length).toBeGreaterThan(0);
      expect(Object.keys(result.by_metric).length).toBeGreaterThan(0);
    });

    it('(b) Rỗng một phần thì giữ câu hợp lệ và ghi chú số câu bị loại', () => {
      const payload = {
        summary: ['Tổng doanh thu kỳ ghi nhận đạt 1.135.530.000 đ.'],
        by_metric: {
          total_revenue: [
            // Valid sentence
            { text: 'Doanh thu đạt 1.135.530.000 đ.', refs: ['F1'] },
            // Invalid sentence with hallucinated number 888.000.000
            { text: 'Dự báo tăng lên 888.000.000 đ.', refs: ['F1'] },
          ],
        },
      };

      const result = verifyBusinessInsightsOutput(payload, mockFactsTable, {
        model: 'gemini-test',
        latency_ms: 120,
        metricEventMap,
      });

      expect(result.source).toBe('ai');
      expect(result.summary).toHaveLength(1);
      expect(result.by_metric.total_revenue).toHaveLength(1);
      expect(result.rejected_count).toBe(1);
      expect(result.rejected_reasons[0]).toContain('Đã loại 1 câu');
    });
  });

  describe('5. Xử lý hòa hạng trong Mẫu dự phòng (Tie Handling)', () => {
    it('(a) Hai kênh bằng nhau thì nêu rõ đồng hạng, không chọn bừa một bên', () => {
      const tpl = buildTemplateBusinessInsights(mockFactsTable);
      // F5 and F6 have the exact same revenue (454.165.000)
      const chSentences = tpl.by_metric['revenue_by_channel'] || [];
      expect(chSentences.length).toBeGreaterThan(0);
      const tieText = chSentences[0].text;
      expect(tieText).toContain('đồng hạng');
      expect(tieText).toContain('Kênh Website');
      expect(tieText).toContain('Kênh Sàn TMĐT');
    });
  });

  describe('6. Tương thích ngược phiên cũ (Backward Compatibility)', () => {
    it('(a) Schema Zod chấp nhận cả cấu trúc hai tầng mới và các trường phiên cũ', () => {
      const validTwoTier = {
        summary: ['Tổng quan doanh thu tốt.'],
        by_metric: {
          total_revenue: [{ text: 'Chi tiết doanh thu.', refs: ['F1'] }],
        },
        followups: ['Theo dõi định kỳ.'],
      };
      expect(() => BusinessInsightsOutputSchema.parse(validTwoTier)).not.toThrow();

      const validLegacy = {
        insights: [
          {
            title: 'Tóm tắt',
            statement: 'Nội dung nhận định.',
            evidence_ids: ['F1'],
            confidence: 'cao' as const,
          },
        ],
        recommendations: [
          {
            action: 'Hành động',
            rationale: 'Căn cứ',
            evidence_ids: ['F1'],
          },
        ],
        limitations: ['Giới hạn.'],
      };
      expect(() => BusinessInsightsOutputSchema.parse(validLegacy)).not.toThrow();
    });
  });
});
