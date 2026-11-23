import { describe, it, expect } from 'vitest';
import {
  buildTemplateBusinessInsights,
  verifyBusinessInsightsOutput,
  computeJaccardWordSimilarity,
  hasForbiddenCertaintyWords,
} from '../core/narrative/businessInsights';
import {
  INSIGHT_THRESHOLDS,
  ALLOWED_CHECK_AFTER,
} from '../core/narrative/insightRules';
import type { FactsTable } from '../core/narrative/factsBuilder';

describe('Prompt 5A: 4-Layer Meaningful Insights, Opp/Risk, and Action Verification', () => {
  const sampleFactsTable: FactsTable = {
    hash: 'mockhash123',
    byte_size: 200,
    generated_at: new Date().toISOString(),
    dataset_kind: 'business',
    period: 'Kỳ 1',
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
      {
        id: 'F4',
        category: 'channel',
        label_vi: 'Kênh [DATA:Bán sỉ]',
        value: 40000000,
        display: 'Bán sỉ Doanh thu 40.000.000 VND (40.00%), biên LN 15.00%',
        unit: 'VND',
        raw_numbers: [40000000, 15.0],
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
            { key: 'Bán sỉ', label: 'Bán sỉ', revenue: 40000000, margin_pct: 15.0 },
            { key: 'Bán lẻ', label: 'Bán lẻ', revenue: 60000000, margin_pct: 23.3 },
          ],
        },
      },
    },
  };

  it('buildTemplateBusinessInsights produces structured 4-layer findings and priority actions', () => {
    const report = buildTemplateBusinessInsights(sampleFactsTable);
    expect(report.source).toBe('template');
    expect(report.findings.length).toBeGreaterThan(0);
    expect(report.findings.length).toBeLessThanOrEqual(INSIGHT_THRESHOLDS.MAX_FINDINGS);
    expect(report.priority_actions.length).toBeGreaterThan(0);
    expect(report.priority_actions.length).toBeLessThanOrEqual(INSIGHT_THRESHOLDS.MAX_ACTIONS_PRIORITY);

    for (const f of report.findings) {
      expect(f.rule_id).toBeDefined();
      expect(f.title).toBeDefined();
      expect(f.evidence).toBeDefined();
      expect(f.meaning).toBeDefined();
      expect(f.opportunity_risk).toBeDefined();
      expect(f.action).toBeDefined();
      expect(f.kpi_metric_id).toBeDefined();
      expect(ALLOWED_CHECK_AFTER).toContain(f.check_after);
      expect(f.source_refs.length).toBeGreaterThan(0);
    }
  });

  it('accepts valid AI rewrite preserving numbers and rule_id', () => {
    const templateReport = buildTemplateBusinessInsights(sampleFactsTable);
    const mockFinding = templateReport.findings[0];

    const aiPayload = {
      key_takeaways: ['Doanh thu kỳ này phụ thuộc lớn vào kênh bán sỉ.'],
      findings: [
        {
          rule_id: mockFinding.rule_id,
          title: `Ghi nhận kênh Bán sỉ chiếm tỷ trọng lớn nhưng biên lợi nhuận thấp`,
          evidence: mockFinding.evidence, // Exactly matches evidence numbers
          meaning: `Doanh số bán sỉ tuy cao nhưng việc biên lợi nhuận thấp hơn mức trung bình đang gây sức ép lên toàn bộ dòng tiền của công ty.`,
          opportunity_risk: `Rủi ro biên lợi nhuận tiếp tục thu hẹp; cơ hội điều chỉnh chính sách giá để nâng cao hiệu quả.`,
          action: `Rà soát cơ cấu giá bán cho đối tác bán sỉ.`,
          kpi_metric_id: mockFinding.kpi_metric_id,
          check_after: mockFinding.check_after,
          source_refs: mockFinding.source_refs,
        },
      ],
    };

    const verified = verifyBusinessInsightsOutput(aiPayload, sampleFactsTable, {
      model: 'gemini-3.5-flash-lite',
      latency_ms: 120,
    });

    expect(verified.source).toBe('ai');
    expect(verified.findings[0].title).toContain('Ghi nhận kênh Bán sỉ');
    expect(verified.rejected_count).toBe(0);
  });

  it('rejects AI finding with hallucinated numbers and falls back to template finding for that item alone', () => {
    const templateReport = buildTemplateBusinessInsights(sampleFactsTable);
    const mockFinding = templateReport.findings[0];

    const aiPayload = {
      findings: [
        {
          rule_id: mockFinding.rule_id,
          title: `Kênh bán sỉ đạt doanh thu 999.999.999 VND`, // Hallucinated number
          evidence: `Doanh thu kênh đạt 999.999.999 VND [F4].`,
          meaning: `Ý nghĩa kinh doanh về doanh số.`,
          opportunity_risk: `Rủi ro liên quan đến chi phí.`,
          action: `Rà soát chiết khấu.`,
          kpi_metric_id: mockFinding.kpi_metric_id,
          check_after: mockFinding.check_after,
          source_refs: mockFinding.source_refs,
        },
      ],
    };

    const verified = verifyBusinessInsightsOutput(aiPayload, sampleFactsTable, {
      model: 'gemini-3.5-flash-lite',
      latency_ms: 120,
    });

    expect(verified.rejected_count).toBeGreaterThan(0);
    // Finding fell back to code template version (does not contain 999.999.999)
    expect(verified.findings[0].title).toBe(mockFinding.title);
    expect(verified.findings[0].evidence).toBe(mockFinding.evidence);
  });

  it('rejects AI finding when meaning merely restates numbers (Jaccard similarity >= 0.8)', () => {
    const templateReport = buildTemplateBusinessInsights(sampleFactsTable);
    const mockFinding = templateReport.findings[0];

    const aiPayload = {
      findings: [
        {
          rule_id: mockFinding.rule_id,
          title: mockFinding.title,
          evidence: mockFinding.evidence,
          meaning: mockFinding.evidence, // EXACT REPEAT of evidence in meaning!
          opportunity_risk: `Rủi ro biên lợi nhuận.`,
          action: `Hành động cụ thể.`,
          kpi_metric_id: mockFinding.kpi_metric_id,
          check_after: mockFinding.check_after,
          source_refs: mockFinding.source_refs,
        },
      ],
    };

    const verified = verifyBusinessInsightsOutput(aiPayload, sampleFactsTable, {
      model: 'gemini-3.5-flash-lite',
      latency_ms: 120,
    });

    expect(verified.rejected_count).toBeGreaterThan(0);
    expect(verified.rejected_reasons.some((r) => r.includes('Jaccard'))).toBe(true);
    // Finding fell back to code template
    expect(verified.findings[0].meaning).toBe(mockFinding.meaning);
  });

  it('rejects AI finding with invalid kpi_metric_id or check_after', () => {
    const templateReport = buildTemplateBusinessInsights(sampleFactsTable);
    const mockFinding = templateReport.findings[0];

    const aiPayload = {
      findings: [
        {
          rule_id: mockFinding.rule_id,
          title: mockFinding.title,
          evidence: mockFinding.evidence,
          meaning: `Ý nghĩa kinh doanh hợp lệ.`,
          opportunity_risk: `Rủi ro hợp lệ.`,
          action: `Hành động hợp lệ.`,
          kpi_metric_id: 'non_existent_kpi', // Invalid ID
          check_after: '3 năm', // Invalid check_after
          source_refs: mockFinding.source_refs,
        },
      ],
    };

    const verified = verifyBusinessInsightsOutput(aiPayload, sampleFactsTable, {
      model: 'gemini-3.5-flash-lite',
      latency_ms: 120,
    });

    expect(verified.rejected_count).toBeGreaterThan(0);
    expect(verified.findings[0].kpi_metric_id).toBe(mockFinding.kpi_metric_id);
    expect(ALLOWED_CHECK_AFTER).toContain(verified.findings[0].check_after);
  });

  it('rejects AI finding with forbidden certainty words without numbers', () => {
    const templateReport = buildTemplateBusinessInsights(sampleFactsTable);
    const mockFinding = templateReport.findings[0];

    const aiPayload = {
      findings: [
        {
          rule_id: mockFinding.rule_id,
          title: `Doanh nghiệp hoạt động tuyệt đối hoàn hảo`,
          evidence: mockFinding.evidence,
          meaning: `Tình hình kinh doanh đạt chuẩn xuất sắc 100%.`,
          opportunity_risk: `Không có rủi ro nào.`,
          action: `Duy trì.`,
          kpi_metric_id: mockFinding.kpi_metric_id,
          check_after: mockFinding.check_after,
          source_refs: mockFinding.source_refs,
        },
      ],
    };

    const verified = verifyBusinessInsightsOutput(aiPayload, sampleFactsTable, {
      model: 'gemini-3.5-flash-lite',
      latency_ms: 120,
    });

    expect(verified.rejected_count).toBeGreaterThan(0);
    expect(verified.rejected_reasons.some((r) => r.includes('tuyệt đối'))).toBe(true);
    expect(verified.findings[0].title).toBe(mockFinding.title);
  });

  it('handles computeJaccardWordSimilarity and hasForbiddenCertaintyWords accurately', () => {
    expect(hasForbiddenCertaintyWords('Hệ thống hoạt động hoàn hảo')).toBe(true);
    expect(hasForbiddenCertaintyWords('Doanh nghiệp đạt hiệu quả tuyệt đối')).toBe(true);
    expect(hasForbiddenCertaintyWords('Kênh bán lẻ chiếm tỷ trọng 100% doanh thu')).toBe(false); // Valid numeric share!
    expect(hasForbiddenCertaintyWords('Báo cáo kinh doanh thông thường')).toBe(false);

    const s1 = 'Doanh thu kênh bán sỉ đạt 40.000.000 VND';
    const s2 = 'Doanh thu kênh bán sỉ đạt 40.000.000 VND';
    expect(computeJaccardWordSimilarity(s1, s2)).toBe(1.0);

    const s3 = 'Quy mô thị trường cần mở rộng thêm các kênh phân phối phụ cận';
    expect(computeJaccardWordSimilarity(s1, s3)).toBeLessThan(0.3);
  });
});
