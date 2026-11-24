
import { evaluateInsightRules, toInsightInput } from '../src/core/narrative/insightRules';
import { buildTemplateBusinessInsights, verifyBusinessInsightsOutput } from '../src/core/narrative/businessInsights';

const sampleFactsTable: any = {
  facts: [
    { id: 'F1', category: 'total', label_vi: 'Tổng số dòng dữ liệu sạch và kỳ khảo sát', value: 48, display: '48 dòng', unit: 'dòng', raw_numbers: [48] },
    { id: 'F2', category: 'total', label_vi: 'Tổng doanh thu', value: 100000000, display: '100.000.000 VND', unit: 'VND', raw_numbers: [100000000] },
    { id: 'F3', category: 'total', label_vi: 'Biên lợi nhuận gộp tổng thể', value: 20.0, display: '20.00%', unit: '%', raw_numbers: [20.0] },
    { id: 'F4', category: 'channel', label_vi: 'Kênh [DATA:Bán sỉ]', value: 40000000, display: 'Bán sỉ Doanh thu 40.000.000 VND (40.00%), biên LN 15.00%', unit: 'VND', raw_numbers: [40000000, 15.0] },
    { id: 'F5', category: 'channel', label_vi: 'Kênh [DATA:Bán lẻ]', value: 60000000, display: 'Bán lẻ Doanh thu 60.000.000 VND (60.00%), biên LN 23.33%', unit: 'VND', raw_numbers: [60000000, 23.33] },
  ],
  totalRevenue: 100000000,
  totalProfit: 20000000,
  metrics_result: {
    gross_margin: { id: 'gross_margin', feasible: true, status: 'tính được', events: [{ value: 20.0 }] },
    revenue_by_channel: {
      id: 'revenue_by_channel',
      feasible: true,
      status: 'tính được',
      pivot: {
        rows: [
          { key: 'Bán sỉ', label: 'Bán sỉ', revenue: 40000000, profit: 6000000 },
          { key: 'Bán lẻ', label: 'Bán lẻ', revenue: 60000000, profit: 14000000 },
        ],
      },
    },
    margin_by_channel: {
      id: 'margin_by_channel',
      feasible: true,
      status: 'tính được',
      pivot: {
        rows: [
          { key: 'Bán sỉ', label: 'Bán sỉ', revenue: 40000000, profit: 6000000, margin_pct: 15.0 },
          { key: 'Bán lẻ', label: 'Bán lẻ', revenue: 60000000, profit: 14000000, margin_pct: 23.33 },
        ],
      },
    },
  },
};

const input = toInsightInput(sampleFactsTable);
console.log('toInsightInput:', input);
const report = buildTemplateBusinessInsights(sampleFactsTable);
console.log('findings count:', report.findings.length);
console.log('findings[0]:', report.findings[0]);

const mockFinding = report.findings[0];
const aiPayload = {
  key_takeaways: ['Doanh thu kỳ này phụ thuộc lớn vào kênh bán lẻ.'],
  findings: [
    {
      rule_id: mockFinding.rule_id,
      title: `Ghi nhận kênh Bán sỉ chiếm tỷ trọng lớn nhưng biên lợi nhuận thấp`,
      evidence: mockFinding.evidence,
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
console.log('verified.source:', verified.source);
console.log('rejected_count:', verified.rejected_count);
console.log('rejected_reasons:', verified.rejected_reasons);
