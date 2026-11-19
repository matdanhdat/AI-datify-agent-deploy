import { describe, it, expect } from 'vitest';
import { findForbiddenPhrases } from './forbidden';
import {
  extractNumberTokens,
  parseVietnameseNumber,
  checkParagraph,
  checkNarrative,
} from './check';
import { generateFallbackNarrative } from './templates';
import type { AnalysisResult, Metric } from '../schemas';

describe('P5 Narrative - Forbidden Phrases Detector', () => {
  it('detects investment recommendations and buy/sell advice', () => {
    expect(findForbiddenPhrases('Chúng tôi khuyến nghị mua cổ phiếu này').length).toBeGreaterThan(0);
    expect(findForbiddenPhrases('Nhà đầu tư nên cắt lỗ tại ngưỡng này').length).toBeGreaterThan(0);
    expect(findForbiddenPhrases('Mục tiêu giá đạt target 80.000 đ').length).toBeGreaterThan(0);
    expect(findForbiddenPhrases('Chắc chắn tăng mạnh trong tương lai').length).toBeGreaterThan(0);
    expect(findForbiddenPhrases('Theo tin tức vĩ mô gần đây').length).toBeGreaterThan(0);
    expect(findForbiddenPhrases('Dự báo giá sẽ phục hồi').length).toBeGreaterThan(0);
  });

  it('avoids false positives on technical RSI terms and normal words', () => {
    // 'quá mua' and 'quá bán' are valid RSI technical states
    expect(findForbiddenPhrases('RSI 14 vượt 70 rơi vào vùng quá mua')).toEqual([]);
    expect(findForbiddenPhrases('RSI 14 dưới 30 đi vào vùng quá bán')).toEqual([]);
    // 'bán niên' is semi-annual
    expect(findForbiddenPhrases('Báo cáo tài chính bán niên 2025')).toEqual([]);
    // Normal neutral sentences
    expect(findForbiddenPhrases('Độ biến động năm hóa đạt 23,01% với sụt giảm tối đa -12,72%')).toEqual([]);
  });
});

describe('P5 Narrative - Number Token Extractor', () => {
  it('correctly parses Vietnamese formatted numbers', () => {
    expect(parseVietnameseNumber('34,65%')?.value).toBeCloseTo(34.65);
    expect(parseVietnameseNumber('-12,72%')?.value).toBeCloseTo(-12.72);
    expect(parseVietnameseNumber('858.245')?.value).toBe(858245);
    expect(parseVietnameseNumber('70,37')?.value).toBeCloseTo(70.37);
    expect(parseVietnameseNumber('+2,97%')?.value).toBeCloseTo(2.97);
  });

  it('extracts numbers while ignoring identifiers like MA20, RSI14, TMA', () => {
    const text = 'Mã TMA có đường MA20 đạt 69,58 đ và RSI14 đạt 56,88 tại ngày 31/12/2025.';
    const tokens = extractNumberTokens(text);
    const rawList = tokens.map((t) => t.raw);

    // MA20 and RSI14 should NOT be in rawList
    expect(rawList).not.toContain('MA20');
    expect(rawList).not.toContain('RSI14');
    expect(rawList).not.toContain('20'); // from MA20
    expect(rawList).not.toContain('14'); // from RSI14

    // Valid numbers should be present
    expect(rawList).toContain('69,58');
    expect(rawList).toContain('56,88');
    expect(rawList).toContain('2025');
    expect(rawList).toContain('31');
    expect(rawList).toContain('12');
  });
});

describe('P5 Narrative - Number & Evidence Checking Engine', () => {
  const mockMetrics: Metric[] = [
    {
      id: 'period_return',
      label_vi: 'Lợi suất cả kỳ',
      symbol: 'TMA',
      value: 0.3465,
      unit: 'ratio',
      status: 'ok',
      polarity: 'higher_better',
      formula_vi: 'P_end / P_start - 1',
      inputs: ['close'],
      meaning_vi: 'Hiệu suất đầu tư',
      excel_hint: '=(C251-C2)/C2',
    },
    {
      id: 'last_close',
      label_vi: 'Giá đóng cửa gần nhất',
      symbol: 'TMA',
      value: 70.37,
      unit: 'currency',
      status: 'ok',
      polarity: 'neutral',
      formula_vi: 'P_end',
      inputs: ['close'],
      meaning_vi: 'Giá chốt phiên',
      excel_hint: '=F251',
    },
    {
      id: 'max_dd',
      label_vi: 'Sụt giảm tối đa',
      symbol: 'TMA',
      value: -0.1272,
      unit: 'ratio',
      status: 'ok',
      polarity: 'lower_better',
      formula_vi: 'min dd',
      inputs: ['close'],
      meaning_vi: 'Mức giảm sâu nhất',
      excel_hint: '=MIN(dd)',
    },
    {
      id: 'ann_vol',
      label_vi: 'Biến động năm hóa',
      symbol: 'TMB',
      value: 0.2396,
      unit: 'ratio',
      status: 'ok',
      polarity: 'lower_better',
      formula_vi: 'stdev * sqrt(252)',
      inputs: ['returns'],
      meaning_vi: 'Rủi ro dao động',
      excel_hint: '=STDEV.S*SQRT(252)',
    },
  ];

  const context = {
    metrics: mockMetrics,
    symbols: ['TMA', 'TMB'],
    trading_days: 252,
  };

  it('passes when numbers match evidence exactly', () => {
    const issues = checkParagraph(
      {
        id: 'p1',
        text: 'Cổ phiếu TMA có lợi suất cả kỳ đạt 34,65% với giá đóng cửa 70,37 đ.',
        evidence: ['m:period_return:TMA', 'm:last_close:TMA'],
      },
      context
    );
    expect(issues).toEqual([]);
  });

  it('flags NOT_IN_EVIDENCE when number exists in dataset but not in paragraph evidence', () => {
    // 23,96% belongs to TMB's ann_vol, but evidence only declares TMA's period_return
    const issues = checkParagraph(
      {
        id: 'p2',
        text: 'Lợi suất kỳ đạt 34,65% trong khi biến động là 23,96%.',
        evidence: ['m:period_return:TMA'],
      },
      context
    );
    expect(issues.some((i) => i.reason === 'NOT_IN_EVIDENCE')).toBe(true);
  });

  it('flags NOT_IN_DATA when number is completely hallucinated / fabricated', () => {
    const issues = checkParagraph(
      {
        id: 'p3',
        text: 'Lợi suất kỳ đạt 34,65% và dự kiến EPS đạt 999.888 đ.',
        evidence: ['m:period_return:TMA'],
      },
      context
    );
    expect(issues.some((i) => i.reason === 'NOT_IN_DATA' && i.token.includes('999.888'))).toBe(true);
  });

  it('flags BAD_EVIDENCE_KEY when an evidence key does not exist', () => {
    const issues = checkParagraph(
      {
        id: 'p4',
        text: 'Lợi suất đạt 34,65%.',
        evidence: ['m:non_existent_metric:TMA'],
      },
      context
    );
    expect(issues.some((i) => i.reason === 'BAD_EVIDENCE_KEY')).toBe(true);
  });

  it('flags EMPTY when text or evidence is missing', () => {
    const issues1 = checkParagraph({ id: 'p5', text: '   ', evidence: ['m:period_return:TMA'] }, context);
    expect(issues1.some((i) => i.reason === 'EMPTY')).toBe(true);

    const issues2 = checkParagraph({ id: 'p6', text: 'Nội dung có nhưng không căn cứ.', evidence: [] }, context);
    expect(issues2.some((i) => i.reason === 'EMPTY')).toBe(true);
  });
});

describe('P5 Narrative - Fallback Template Engine Verification', () => {
  it('generates 100% compliant narrative for multi-symbol analysis result', () => {
    const mockAnalysis: AnalysisResult = {
      config: {
        symbols: ['TMA', 'TMB'],
        date_from: '2025-01-01',
        date_to: '2025-12-31',
        preset: 'all',
      },
      created_at: '2025-12-31T17:00:00Z',
      clean_hash: 'mock_clean_hash',
      analysis_hash: 'mock_analysis_hash',
      metrics: [
        {
          id: 'sessions',
          label_vi: 'Số phiên giao dịch',
          symbol: 'TMA',
          value: 250,
          unit: 'count',
          status: 'ok',
          polarity: 'neutral',
          formula_vi: 'COUNT',
          inputs: [],
          meaning_vi: 'Số phiên',
          excel_hint: '=COUNT',
        },
        {
          id: 'date_range',
          label_vi: 'Khoảng thời gian',
          symbol: 'TMA',
          value: null,
          text: '02/01/2025 - 31/12/2025',
          unit: 'text',
          status: 'ok',
          polarity: 'neutral',
          formula_vi: 'Range',
          inputs: [],
          meaning_vi: 'Khoảng thời gian',
          excel_hint: '=TEXT',
        },
        {
          id: 'symbol_returns',
          label_vi: 'So sánh lợi suất các mã',
          symbol: null,
          value: 0.3465,
          text: 'TMA (+34,65%), TMB (-27,59%)',
          unit: 'ratio',
          status: 'ok',
          polarity: 'higher_better',
          formula_vi: 'Returns',
          inputs: [],
          meaning_vi: 'Lợi suất danh mục',
          excel_hint: '=Ret',
        },
        // TMB metrics
        {
          id: 'last_close',
          label_vi: 'Giá đóng cửa gần nhất',
          symbol: 'TMB',
          value: 62.22,
          unit: 'currency',
          status: 'ok',
          polarity: 'neutral',
          formula_vi: 'P_end',
          inputs: [],
          meaning_vi: 'Giá đóng cửa',
          excel_hint: '=F',
        },
        {
          id: 'ma20',
          label_vi: 'Đường MA20',
          symbol: 'TMB',
          value: 64.75,
          unit: 'currency',
          status: 'ok',
          polarity: 'neutral',
          formula_vi: 'MA20',
          inputs: [],
          meaning_vi: 'MA20',
          excel_hint: '=MA20',
        },
        {
          id: 'ma50',
          label_vi: 'Đường MA50',
          symbol: 'TMB',
          value: 64.56,
          unit: 'currency',
          status: 'ok',
          polarity: 'neutral',
          formula_vi: 'MA50',
          inputs: [],
          meaning_vi: 'MA50',
          excel_hint: '=MA50',
        },
        {
          id: 'ma_state',
          label_vi: 'Vị thế MA20 / MA50',
          symbol: 'TMB',
          value: null,
          text: 'MA20 trên MA50',
          unit: 'text',
          status: 'ok',
          polarity: 'neutral',
          formula_vi: 'State',
          inputs: [],
          meaning_vi: 'Vị thế',
          excel_hint: '=IF',
        },
        {
          id: 'avg_volume',
          label_vi: 'Khối lượng trung bình',
          symbol: 'TMB',
          value: 864306,
          unit: 'number',
          status: 'ok',
          polarity: 'neutral',
          formula_vi: 'AvgVol',
          inputs: [],
          meaning_vi: 'KL TB',
          excel_hint: '=AVG',
        },
        {
          id: 'volume_spike_days',
          label_vi: 'Số phiên đột biến KL',
          symbol: 'TMB',
          value: 1,
          unit: 'count',
          status: 'ok',
          polarity: 'neutral',
          formula_vi: 'Spikes',
          inputs: [],
          meaning_vi: 'Đột biến',
          excel_hint: '=SPIKE',
        },
        {
          id: 'ann_vol',
          label_vi: 'Biến động năm hóa',
          symbol: 'TMB',
          value: 0.2396,
          unit: 'ratio',
          status: 'ok',
          polarity: 'lower_better',
          formula_vi: 'Vol',
          inputs: [],
          meaning_vi: 'Biến động',
          excel_hint: '=STDEV',
        },
        {
          id: 'max_dd',
          label_vi: 'Sụt giảm tối đa',
          symbol: 'TMB',
          value: -0.3645,
          unit: 'ratio',
          status: 'ok',
          polarity: 'lower_better',
          formula_vi: 'MDD',
          inputs: [],
          meaning_vi: 'Sụt giảm',
          excel_hint: '=MIN',
        },
        {
          id: 'sharpe',
          label_vi: 'Chỉ số Sharpe',
          symbol: 'TMB',
          value: -1.24,
          unit: 'number',
          status: 'ok',
          polarity: 'higher_better',
          formula_vi: 'Sharpe',
          inputs: [],
          meaning_vi: 'Sharpe',
          excel_hint: '=SHARPE',
        },
        {
          id: 'win_rate',
          label_vi: 'Tỷ lệ phiên tăng',
          symbol: 'TMB',
          value: 0.4418,
          unit: 'ratio',
          status: 'ok',
          polarity: 'higher_better',
          formula_vi: 'WinRate',
          inputs: [],
          meaning_vi: 'Tỷ lệ tăng',
          excel_hint: '=COUNTIF',
        },
        {
          id: 'period_return',
          label_vi: 'Lợi suất cả kỳ',
          symbol: 'TMB',
          value: -0.2759,
          unit: 'ratio',
          status: 'ok',
          polarity: 'higher_better',
          formula_vi: 'Ret',
          inputs: [],
          meaning_vi: 'Lợi suất',
          excel_hint: '=Ret',
        },
        {
          id: 'last_close',
          label_vi: 'Giá đóng cửa gần nhất',
          symbol: 'TMA',
          value: 70.37,
          unit: 'currency',
          status: 'ok',
          polarity: 'neutral',
          formula_vi: 'P_end',
          inputs: [],
          meaning_vi: 'Giá đóng cửa',
          excel_hint: '=F',
        },
        {
          id: 'ma20',
          label_vi: 'Đường MA20',
          symbol: 'TMA',
          value: 69.58,
          unit: 'currency',
          status: 'ok',
          polarity: 'neutral',
          formula_vi: 'MA20',
          inputs: [],
          meaning_vi: 'MA20',
          excel_hint: '=MA20',
        },
        {
          id: 'ma50',
          label_vi: 'Đường MA50',
          symbol: 'TMA',
          value: 68.44,
          unit: 'currency',
          status: 'ok',
          polarity: 'neutral',
          formula_vi: 'MA50',
          inputs: [],
          meaning_vi: 'MA50',
          excel_hint: '=MA50',
        },
        {
          id: 'ma_state',
          label_vi: 'Vị thế MA20 / MA50',
          symbol: 'TMA',
          value: null,
          text: 'MA20 trên MA50',
          unit: 'text',
          status: 'ok',
          polarity: 'neutral',
          formula_vi: 'State',
          inputs: [],
          meaning_vi: 'Vị thế',
          excel_hint: '=IF',
        },
        {
          id: 'avg_volume',
          label_vi: 'Khối lượng trung bình',
          symbol: 'TMA',
          value: 858245,
          unit: 'number',
          status: 'ok',
          polarity: 'neutral',
          formula_vi: 'AvgVol',
          inputs: [],
          meaning_vi: 'KL TB',
          excel_hint: '=AVG',
        },
        {
          id: 'volume_spike_days',
          label_vi: 'Số phiên đột biến KL',
          symbol: 'TMA',
          value: 4,
          unit: 'count',
          status: 'ok',
          polarity: 'neutral',
          formula_vi: 'Spikes',
          inputs: [],
          meaning_vi: 'Đột biến',
          excel_hint: '=SPIKE',
        },
        {
          id: 'ann_vol',
          label_vi: 'Biến động năm hóa',
          symbol: 'TMA',
          value: 0.2301,
          unit: 'ratio',
          status: 'ok',
          polarity: 'lower_better',
          formula_vi: 'Vol',
          inputs: [],
          meaning_vi: 'Biến động',
          excel_hint: '=STDEV',
        },
        {
          id: 'max_dd',
          label_vi: 'Sụt giảm tối đa',
          symbol: 'TMA',
          value: -0.1272,
          unit: 'ratio',
          status: 'ok',
          polarity: 'lower_better',
          formula_vi: 'MDD',
          inputs: [],
          meaning_vi: 'Sụt giảm',
          excel_hint: '=MIN',
        },
        {
          id: 'sharpe',
          label_vi: 'Chỉ số Sharpe',
          symbol: 'TMA',
          value: 1.42,
          unit: 'number',
          status: 'ok',
          polarity: 'higher_better',
          formula_vi: 'Sharpe',
          inputs: [],
          meaning_vi: 'Sharpe',
          excel_hint: '=SHARPE',
        },
        {
          id: 'win_rate',
          label_vi: 'Tỷ lệ phiên tăng',
          symbol: 'TMA',
          value: 0.5221,
          unit: 'ratio',
          status: 'ok',
          polarity: 'higher_better',
          formula_vi: 'WinRate',
          inputs: [],
          meaning_vi: 'Tỷ lệ tăng',
          excel_hint: '=COUNTIF',
        },
        {
          id: 'rsi14',
          label_vi: 'Chỉ số RSI (14)',
          symbol: 'TMA',
          value: 56.88,
          unit: 'number',
          status: 'ok',
          polarity: 'neutral',
          formula_vi: 'RSI',
          inputs: [],
          meaning_vi: 'RSI',
          excel_hint: '=RSI',
        },
        {
          id: 'best_day',
          label_vi: 'Phiên tăng mạnh nhất',
          symbol: 'TMA',
          value: 0.0297,
          unit: 'ratio',
          status: 'ok',
          polarity: 'higher_better',
          formula_vi: 'Best',
          inputs: [],
          meaning_vi: 'Tăng mạnh',
          excel_hint: '=MAX',
        },
        {
          id: 'worst_day',
          label_vi: 'Phiên giảm mạnh nhất',
          symbol: 'TMA',
          value: -0.0258,
          unit: 'ratio',
          status: 'ok',
          polarity: 'lower_better',
          formula_vi: 'Worst',
          inputs: [],
          meaning_vi: 'Giảm mạnh',
          excel_hint: '=MIN',
        },
        {
          id: 'volume_share',
          label_vi: 'Tỷ trọng thanh khoản theo khối lượng',
          symbol: null,
          value: 1.0,
          unit: 'ratio',
          status: 'ok',
          polarity: 'neutral',
          formula_vi: 'Share',
          inputs: [],
          meaning_vi: 'Tỷ trọng',
          excel_hint: '=SHARE',
        },
        {
          id: 'correlation',
          label_vi: 'Hệ số tương quan cặp mã',
          symbol: null,
          value: -0.15,
          unit: 'number',
          status: 'ok',
          polarity: 'neutral',
          formula_vi: 'Corr',
          inputs: [],
          meaning_vi: 'Tương quan',
          excel_hint: '=CORREL',
        },
      ],
      charts: [],
      assumptions: {
        trading_days: 252,
        risk_free_rate: 0,
        ma_windows: [20, 50],
        rsi_window: 14,
        volume_spike_rule: 'volume > mean20 + 2*std20',
        return_type: 'simple_close',
      },
      warnings: [],
    };

    const narrative = generateFallbackNarrative(mockAnalysis, {
      raw_rows: 750,
      clean_rows: 750,
      dropped_rows: 0,
      flagged_outliers: 0,
    });

    expect(narrative.mode).toBe('template');
    expect(narrative.sections.length).toBe(7); // includes comparison for 2 symbols

    const issuesMap = checkNarrative(narrative, {
      metrics: mockAnalysis.metrics,
      symbols: mockAnalysis.config.symbols,
      trading_days: 252,
      data_notes: {
        raw_rows: 750,
        clean_rows: 750,
        dropped_rows: 0,
        flagged_outliers: 0,
      },
    });

    // Verify 100% PASS - zero check issues in any paragraph
    let totalIssues = 0;
    for (const [pId, issues] of issuesMap.entries()) {
      if (issues.length > 0) {
        console.log(`[pId: ${pId}] issues:`, JSON.stringify(issues));
      }
      totalIssues += issues.length;
    }
    expect(totalIssues).toBe(0);
  });

  describe('P6 Part A - Tightened Number Matching & Parameter Context (A1 & A2)', () => {
    const testContext = {
      metrics: [
        {
          id: 'period_return',
          label_vi: 'Lợi suất cả kỳ',
          symbol: 'TMA',
          value: 0.3465, // 34.65%
          unit: 'ratio' as const,
          status: 'ok' as const,
          polarity: 'higher_better' as const,
          formula_vi: 'P_end / P_start - 1',
          inputs: ['close'],
          meaning_vi: 'Lợi suất',
          excel_hint: '',
        },
        {
          id: 'avg_volume',
          label_vi: 'Khối lượng trung bình',
          symbol: 'TMA',
          value: 858245, // 858.245
          unit: 'count' as const,
          status: 'ok' as const,
          polarity: 'neutral' as const,
          formula_vi: 'mean(volume)',
          inputs: ['volume'],
          meaning_vi: 'Khối lượng bình quân',
          excel_hint: '',
        },
        {
          id: 'last_close',
          label_vi: 'Giá đóng cửa gần nhất',
          symbol: 'TMA',
          value: 70.37, // 70.37
          unit: 'currency' as const,
          status: 'ok' as const,
          polarity: 'neutral' as const,
          formula_vi: 'close[-1]',
          inputs: ['close'],
          meaning_vi: 'Giá đóng cửa',
          excel_hint: '',
        },
      ],
      symbols: ['TMA'],
      trading_days: 252,
    };

    it('A1: catches tiny deviations (34.80% vs 34.65%, 858.246 vs 858.245, 70.38 vs 70.37)', () => {
      // 34.80% instead of 34.65%
      const res1 = checkParagraph(
        {
          id: 'p1',
          text: 'Lợi suất đạt 34,80% trong cả kỳ.',
          evidence: ['m:period_return:TMA'],
        },
        testContext
      );
      expect(res1.some((i) => i.reason === 'NOT_IN_DATA' && i.token.includes('34,80'))).toBe(true);

      // 858.246 instead of 858.245
      const res2 = checkParagraph(
        {
          id: 'p2',
          text: 'Khối lượng bình quân là 858.246 cổ phiếu.',
          evidence: ['m:avg_volume:TMA'],
        },
        testContext
      );
      expect(res2.some((i) => i.reason === 'NOT_IN_DATA' && i.token.includes('858.246'))).toBe(true);

      // 70.38 instead of 70.37
      const res3 = checkParagraph(
        {
          id: 'p3',
          text: 'Giá chốt phiên dừng tại mức 70,38 đ.',
          evidence: ['m:last_close:TMA'],
        },
        testContext
      );
      expect(res3.some((i) => i.reason === 'NOT_IN_DATA' && i.token.includes('70,38'))).toBe(true);

      // Exact matches pass cleanly
      const passRes = checkParagraph(
        {
          id: 'pass_all',
          text: 'Lợi suất đạt 34,65% với khối lượng 858.245 và giá đóng cửa 70,37 đ.',
          evidence: ['m:period_return:TMA', 'm:avg_volume:TMA', 'm:last_close:TMA'],
        },
        testContext
      );
      expect(passRes.filter((i) => i.reason === 'NOT_IN_DATA')).toEqual([]);
    });

    it('A2: enforces parameter context rules for fixed numbers (14, 20, 50, 252)', () => {
      // Standalone or value instances must be caught as NOT_IN_DATA
      const resFail1 = checkParagraph(
        {
          id: 'p_fail1',
          text: 'Cổ phiếu ghi nhận mức tăng 14% trong tháng.',
          evidence: ['m:period_return:TMA'],
        },
        testContext
      );
      expect(resFail1.some((i) => i.reason === 'NOT_IN_DATA' && i.token.includes('14'))).toBe(true);

      const resFail2 = checkParagraph(
        {
          id: 'p_fail2',
          text: 'Giao dịch đạt khối lượng 50 đơn vị.',
          evidence: ['m:avg_volume:TMA'],
        },
        testContext
      );
      expect(resFail2.some((i) => i.reason === 'NOT_IN_DATA' && i.token.includes('50'))).toBe(true);

      const resFail3 = checkParagraph(
        {
          id: 'p_fail3',
          text: 'Chỉ số tăng 20 điểm so với đầu năm.',
          evidence: ['m:period_return:TMA'],
        },
        testContext
      );
      expect(resFail3.some((i) => i.reason === 'NOT_IN_DATA' && i.token.includes('20'))).toBe(true);

      // Parameter context instances must be exempt
      const resPass = checkParagraph(
        {
          id: 'p_pass',
          text: 'Đường MA20 và chỉ số RSI 14 được tính toán theo trung bình 20 phiên trên chu kỳ 252 phiên mỗi năm.',
          evidence: ['m:period_return:TMA'],
        },
        testContext
      );
      expect(resPass.filter((i) => i.reason === 'NOT_IN_DATA')).toEqual([]);

      // Section numbering exemption at start of paragraph: "1. Tổng quan..."
      const resSection = checkParagraph(
        {
          id: 'p_sec',
          text: '1. Tổng quan về diễn biến lợi suất 34,65% của mã TMA.',
          evidence: ['m:period_return:TMA'],
        },
        testContext
      );
      expect(resSection.filter((i) => i.reason === 'NOT_IN_DATA')).toEqual([]);
    });

    it('P7 Audit (A2): strictly handles context boundaries for numbers 14, 20, 50, 252', () => {
      // 1. "đạt 14 phiên tăng liên tiếp" - 14 next to "phiên" but is consecutive count, NOT RSI parameter!
      const resConsecutive14 = checkParagraph(
        {
          id: 'p_edge1',
          text: 'Cổ phiếu đạt 14 phiên tăng liên tiếp trong quý.',
          evidence: ['m:period_return:TMA'],
        },
        testContext
      );
      expect(resConsecutive14.some((i) => i.reason === 'NOT_IN_DATA' && i.token === '14')).toBe(true);

      // 2. "khối lượng gấp 20 lần" - 20 next to "lần" is a multiplier, NOT MA parameter!
      const resMultiplier20 = checkParagraph(
        {
          id: 'p_edge2',
          text: 'Khối lượng giao dịch đột biến gấp 20 lần mức thông thường.',
          evidence: ['m:avg_volume:TMA'],
        },
        testContext
      );
      expect(resMultiplier20.some((i) => i.reason === 'NOT_IN_DATA' && i.token === '20')).toBe(true);

      // 3. "tăng 20 điểm" - 20 with "điểm"
      const resPoints20 = checkParagraph(
        {
          id: 'p_edge3',
          text: 'Giá cổ phiếu tăng 20 điểm trong phiên.',
          evidence: ['m:period_return:TMA'],
        },
        testContext
      );
      expect(resPoints20.some((i) => i.reason === 'NOT_IN_DATA' && i.token === '20')).toBe(true);

      // 4. "tăng 20%" - percentage value
      const resPercent20 = checkParagraph(
        {
          id: 'p_edge4',
          text: 'Thị trường ghi nhận mức tăng 20% đột biến.',
          evidence: ['m:period_return:TMA'],
        },
        testContext
      );
      expect(resPercent20.some((i) => i.reason === 'NOT_IN_DATA' && i.token.includes('20'))).toBe(true);

      // 5. Valid parameter contexts MUST pass:
      const resValidParams = checkParagraph(
        {
          id: 'p_valid_params',
          text: 'Chỉ số RSI 14 phiên và đường trung bình 20 phiên được tính trên chu kỳ 252 phiên mỗi năm, so sánh với đường MA 50.',
          evidence: ['m:period_return:TMA'],
        },
        testContext
      );
      expect(resValidParams.filter((i) => i.reason === 'NOT_IN_DATA')).toEqual([]);

      // 6. "năm hóa 252 phiên"
      const resAnnualized = checkParagraph(
        {
          id: 'p_ann',
          text: 'Độ biến động được chuẩn hóa năm hóa 252 phiên theo quy chuẩn tài chính.',
          evidence: ['m:period_return:TMA'],
        },
        testContext
      );
      expect(resAnnualized.filter((i) => i.reason === 'NOT_IN_DATA')).toEqual([]);
    });
  });
});
