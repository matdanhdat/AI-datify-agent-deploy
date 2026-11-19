import type { AnalysisResult } from '../core/schemas';

export function createDemoAnalysisResult(): AnalysisResult {
  const dates = Array.from({ length: 250 }, (_, i) => {
    const d = new Date(2025, 0, 2);
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });

  const tmaCloses = dates.map((_, i) => 50 + i * 0.08 + Math.sin(i / 5) * 2);
  const tmbCloses = dates.map((_, i) => 80 - i * 0.07 + Math.cos(i / 6) * 3);

  const tmaMa20 = tmaCloses.map((_, i, arr) => {
    if (i < 19) return tmaCloses[i];
    const slice = arr.slice(i - 19, i + 1);
    return slice.reduce((a, b) => a + b, 0) / 20;
  });

  return {
    config: {
      symbols: ['TMA', 'TMB'],
      date_from: '2025-01-02',
      date_to: '2025-12-31',
      preset: 'all',
    },
    created_at: new Date().toISOString(),
    clean_hash: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    analysis_hash: '3a7bd3e2360a3d29eea436fcfb7e44c735d117c42d1c1835420b6b9942dd4f1b',
    assumptions: {
      trading_days: 252,
      risk_free_rate: 0,
      ma_windows: [20, 50],
      rsi_window: 14,
      volume_spike_rule: 'volume > mean20 + 2*std20',
      return_type: 'simple_close',
    },
    warnings: ['Lưu ý: Mã TMB có 1 phiên biến động thanh khoản cao hơn 2 độ lệch chuẩn.'],
    metrics: [
      // TMA Metrics
      { id: 'sessions', label_vi: 'Số phiên', symbol: 'TMA', value: 250, text: '250', unit: 'count', polarity: 'neutral', status: 'ok', formula_vi: 'COUNT', inputs: [] },
      { id: 'last_close', label_vi: 'Giá đóng cửa gần nhất', symbol: 'TMA', value: 70370, text: '70.370 đ', unit: 'currency', polarity: 'neutral', status: 'ok', formula_vi: 'CLOSE', inputs: [] },
      { id: 'period_return', label_vi: 'Lợi suất cả kỳ', symbol: 'TMA', value: 0.3465, text: '34,65%', unit: 'ratio', polarity: 'higher_better', status: 'ok', formula_vi: 'RETURN', inputs: [] },
      { id: 'ann_vol', label_vi: 'Biến động năm hóa', symbol: 'TMA', value: 0.2301, text: '23,01%', unit: 'ratio', polarity: 'lower_better', status: 'ok', formula_vi: 'VOLATILITY', inputs: [] },
      { id: 'sharpe', label_vi: 'Chỉ số Sharpe', symbol: 'TMA', value: 1.42, text: '1,42', unit: 'number', polarity: 'higher_better', status: 'ok', formula_vi: 'SHARPE', inputs: [] },
      { id: 'max_dd', label_vi: 'Mức sụt giảm tối đa', symbol: 'TMA', value: -0.1272, text: '-12,72%', unit: 'ratio', polarity: 'lower_better', status: 'ok', formula_vi: 'MAX_DD', inputs: [] },
      { id: 'win_rate', label_vi: 'Tỷ lệ phiên tăng', symbol: 'TMA', value: 0.5221, text: '52,21%', unit: 'ratio', polarity: 'higher_better', status: 'ok', formula_vi: 'WIN_RATE', inputs: [] },
      { id: 'avg_range', label_vi: 'Biên độ dao động TB', symbol: 'TMA', value: 0.0271, text: '2,71%', unit: 'ratio', polarity: 'neutral', status: 'ok', formula_vi: 'AVG_RANGE', inputs: [] },
      { id: 'avg_volume', label_vi: 'Khối lượng TB', symbol: 'TMA', value: 858245, text: '858.245', unit: 'count', polarity: 'neutral', status: 'ok', formula_vi: 'AVG_VOL', inputs: [] },
      { id: 'volume_spike_days', label_vi: 'Số phiên đột biến KL', symbol: 'TMA', value: 4, text: '4', unit: 'count', polarity: 'neutral', status: 'ok', formula_vi: 'SPIKES', inputs: [] },
      { id: 'ma20', label_vi: 'Đường MA20', symbol: 'TMA', value: 69580, text: '69.580 đ', unit: 'currency', polarity: 'neutral', status: 'ok', formula_vi: 'MA20', inputs: [] },
      { id: 'ma50', label_vi: 'Đường MA50', symbol: 'TMA', value: 68440, text: '68.440 đ', unit: 'currency', polarity: 'neutral', status: 'ok', formula_vi: 'MA50', inputs: [] },
      { id: 'ma_state', label_vi: 'Vị thế MA', symbol: 'TMA', value: null, text: 'MA20 trên MA50', unit: 'text', polarity: 'neutral', status: 'ok', formula_vi: 'STATE', inputs: [] },
      { id: 'rsi14', label_vi: 'Chỉ số RSI (14)', symbol: 'TMA', value: 56.88, text: '56,88', unit: 'number', polarity: 'neutral', status: 'ok', formula_vi: 'RSI', inputs: [] },
      { id: 'best_day', label_vi: 'Phiên tăng mạnh nhất', symbol: 'TMA', value: 0.0297, text: '2,97%', unit: 'ratio', polarity: 'higher_better', status: 'ok', formula_vi: 'MAX_DAY', inputs: [] },
      { id: 'worst_day', label_vi: 'Phiên giảm mạnh nhất', symbol: 'TMA', value: -0.0258, text: '-2,58%', unit: 'ratio', polarity: 'lower_better', status: 'ok', formula_vi: 'MIN_DAY', inputs: [] },

      // TMB Metrics
      { id: 'sessions', label_vi: 'Số phiên', symbol: 'TMB', value: 250, text: '250', unit: 'count', polarity: 'neutral', status: 'ok', formula_vi: 'COUNT', inputs: [] },
      { id: 'last_close', label_vi: 'Giá đóng cửa gần nhất', symbol: 'TMB', value: 62220, text: '62.220 đ', unit: 'currency', polarity: 'neutral', status: 'ok', formula_vi: 'CLOSE', inputs: [] },
      { id: 'period_return', label_vi: 'Lợi suất cả kỳ', symbol: 'TMB', value: -0.2759, text: '-27,59%', unit: 'ratio', polarity: 'higher_better', status: 'ok', formula_vi: 'RETURN', inputs: [] },
      { id: 'ann_vol', label_vi: 'Biến động năm hóa', symbol: 'TMB', value: 0.2396, text: '23,96%', unit: 'ratio', polarity: 'lower_better', status: 'ok', formula_vi: 'VOLATILITY', inputs: [] },
      { id: 'sharpe', label_vi: 'Chỉ số Sharpe', symbol: 'TMB', value: -1.24, text: '-1,24', unit: 'number', polarity: 'higher_better', status: 'ok', formula_vi: 'SHARPE', inputs: [] },
      { id: 'max_dd', label_vi: 'Mức sụt giảm tối đa', symbol: 'TMB', value: -0.3645, text: '-36,45%', unit: 'ratio', polarity: 'lower_better', status: 'ok', formula_vi: 'MAX_DD', inputs: [] },
      { id: 'win_rate', label_vi: 'Tỷ lệ phiên tăng', symbol: 'TMB', value: 0.4418, text: '44,18%', unit: 'ratio', polarity: 'higher_better', status: 'ok', formula_vi: 'WIN_RATE', inputs: [] },
      { id: 'avg_range', label_vi: 'Biên độ dao động TB', symbol: 'TMB', value: 0.0278, text: '2,78%', unit: 'ratio', polarity: 'neutral', status: 'ok', formula_vi: 'AVG_RANGE', inputs: [] },
      { id: 'avg_volume', label_vi: 'Khối lượng TB', symbol: 'TMB', value: 864306, text: '864.306', unit: 'count', polarity: 'neutral', status: 'ok', formula_vi: 'AVG_VOL', inputs: [] },
      { id: 'volume_spike_days', label_vi: 'Số phiên đột biến KL', symbol: 'TMB', value: 1, text: '1', unit: 'count', polarity: 'neutral', status: 'ok', formula_vi: 'SPIKES', inputs: [] },
      { id: 'ma20', label_vi: 'Đường MA20', symbol: 'TMB', value: 64750, text: '64.750 đ', unit: 'currency', polarity: 'neutral', status: 'ok', formula_vi: 'MA20', inputs: [] },
      { id: 'ma50', label_vi: 'Đường MA50', symbol: 'TMB', value: 64560, text: '64.560 đ', unit: 'currency', polarity: 'neutral', status: 'ok', formula_vi: 'MA50', inputs: [] },
      { id: 'ma_state', label_vi: 'Vị thế MA', symbol: 'TMB', value: null, text: 'MA20 trên MA50', unit: 'text', polarity: 'neutral', status: 'ok', formula_vi: 'STATE', inputs: [] },
      { id: 'rsi14', label_vi: 'Chỉ số RSI (14)', symbol: 'TMB', value: 40.30, text: '40,30', unit: 'number', polarity: 'neutral', status: 'ok', formula_vi: 'RSI', inputs: [] },
      { id: 'best_day', label_vi: 'Phiên tăng mạnh nhất', symbol: 'TMB', value: 0.0285, text: '2,85%', unit: 'ratio', polarity: 'higher_better', status: 'ok', formula_vi: 'MAX_DAY', inputs: [] },
      { id: 'worst_day', label_vi: 'Phiên giảm mạnh nhất', symbol: 'TMB', value: -0.0266, text: '-2,66%', unit: 'ratio', polarity: 'lower_better', status: 'ok', formula_vi: 'MIN_DAY', inputs: [] },

      // Cross-Symbol Metrics
      { id: 'symbol_returns', label_vi: 'Lợi suất các mã', symbol: null, value: null, text: 'TMA: 34,65%; TMB: -27,59%', unit: 'text', polarity: 'neutral', status: 'ok', formula_vi: 'CROSS_RETURN', inputs: [] },
      { id: 'correlation', label_vi: 'Tương quan cặp', symbol: null, value: 0.85, text: '0,85', unit: 'number', polarity: 'neutral', status: 'ok', formula_vi: 'CORREL', inputs: [] },
      { id: 'normalized_base', label_vi: 'Điểm số chuẩn hóa', symbol: null, value: null, text: 'Mốc gốc 100', unit: 'text', polarity: 'neutral', status: 'ok', formula_vi: 'NORM', inputs: [] },
      { id: 'volume_share', label_vi: 'Tỷ trọng khối lượng', symbol: null, value: null, text: 'TMA: 49,82%; TMB: 50,18%', unit: 'text', polarity: 'neutral', status: 'ok', formula_vi: 'VOL_SHARE', inputs: [] },
      { id: 'risk_return', label_vi: 'Rủi ro - Sinh lời', symbol: null, value: null, text: 'TMA (23,01% | 34,65%), TMB (23,96% | -27,59%)', unit: 'text', polarity: 'neutral', status: 'ok', formula_vi: 'RISK_RET', inputs: [] },
    ],
    charts: [
      {
        id: 'chart_price_ma',
        title_vi: 'Biểu đồ Giá và Đường trung bình MA (TMA)',
        kind: 'line',
        symbols: ['TMA'],
        data: {
          dates,
          series: [
            { name: 'Giá đóng cửa', values: tmaCloses },
            { name: 'MA20', values: tmaMa20 },
          ],
        },
        table: {
          columns: ['Ngày', 'Giá đóng cửa', 'Đường MA20'],
          rows: dates.map((d, idx) => [d, tmaCloses[idx], tmaMa20[idx]]),
        },
      },
      {
        id: 'chart_normalized',
        title_vi: 'Biểu đồ Hiệu suất tương đối quy chuẩn về mốc 100',
        kind: 'line',
        symbols: ['TMA', 'TMB'],
        data: {
          dates,
          series: [
            { name: 'TMA', values: tmaCloses.map((c) => (c / tmaCloses[0]) * 100) },
            { name: 'TMB', values: tmbCloses.map((c) => (c / tmbCloses[0]) * 100) },
          ],
        },
        table: {
          columns: ['Ngày', 'TMA', 'TMB'],
          rows: dates.map((d, idx) => [d, (tmaCloses[idx] / tmaCloses[0]) * 100, (tmbCloses[idx] / tmbCloses[0]) * 100]),
        },
      },
    ],
  };
}
