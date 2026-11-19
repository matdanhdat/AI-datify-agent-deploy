/**
 * Metric Specification - Single Source of Truth for Quantitative Metrics.
 * Adheres strictly to CONTRACT.md and Prompt P4 Section 5 & 8.3.
 * Pure TypeScript - zero external dependencies.
 */

import type { Metric, MetricPolarity, MetricUnit } from '../schemas';

export interface MetricDefinition {
  id: string;
  label_vi: string;
  unit: MetricUnit;
  polarity: MetricPolarity;
  formula_vi: string;
  excel_hint: string;
  meaning_vi: string;
  min_points: number;
  decimals: number;
}

export const METRIC_DEFINITIONS: Record<string, MetricDefinition> = {
  sessions: {
    id: 'sessions',
    label_vi: 'Số phiên giao dịch',
    unit: 'count',
    polarity: 'neutral',
    formula_vi: 'Tổng số phiên có giá đóng cửa hợp lệ trong kỳ được chọn',
    excel_hint: '=COUNT(C2:C252)',
    meaning_vi: 'Tổng số ngày có diễn ra giao dịch thực tế trên sàn của cổ phiếu trong khoảng thời gian phân tích.',
    min_points: 1,
    decimals: 0,
  },
  last_close: {
    id: 'last_close',
    label_vi: 'Giá đóng cửa gần nhất',
    unit: 'currency',
    polarity: 'neutral',
    formula_vi: 'Giá đóng cửa phiên cuối kỳ; mức thay đổi so với phiên liền trước',
    excel_hint: '=LOOKUP(2, 1/(C2:C252<>""), C2:C252)',
    meaning_vi: 'Mức giá khớp lệnh cuối cùng tại phiên giao dịch kết thúc kỳ phân tích.',
    min_points: 2,
    decimals: 2,
  },
  period_return: {
    id: 'period_return',
    label_vi: 'Lợi suất cả kỳ',
    unit: 'ratio',
    polarity: 'higher_better',
    formula_vi: '(Giá đóng cuối kỳ / Giá đóng đầu kỳ) - 1',
    excel_hint: '=(C252-C2)/C2 hoặc =C252/C2 - 1',
    meaning_vi: 'Tỷ lệ sinh lời (hoặc thua lỗ) khi mua tại phiên đầu kỳ và nắm giữ đến hết phiên cuối kỳ.',
    min_points: 2,
    decimals: 2,
  },
  ann_vol: {
    id: 'ann_vol',
    label_vi: 'Biến động (năm hóa)',
    unit: 'ratio',
    polarity: 'lower_better',
    formula_vi: 'Độ lệch chuẩn mẫu của lợi suất ngày * căn bậc hai(252)',
    excel_hint: '=STDEV.S(D3:D252)*SQRT(252)',
    meaning_vi: 'Mức độ dao động lên xuống của giá quy đổi theo năm. Số càng cao thể hiện rủi ro giá giật mạnh càng lớn.',
    min_points: 20,
    decimals: 2,
  },
  sharpe: {
    id: 'sharpe',
    label_vi: 'Chỉ số Sharpe',
    unit: 'number',
    polarity: 'higher_better',
    formula_vi: '(Trung bình lợi suất ngày / Độ lệch chuẩn lợi suất ngày) * căn bậc hai(252)',
    excel_hint: '=(AVERAGE(D3:D252)/STDEV.S(D3:D252))*SQRT(252)',
    meaning_vi: 'Hiệu quả đầu tư trên mỗi đơn vị rủi ro chấp nhận. Chỉ số dương càng lớn thì lợi nhuận bù đắp rủi ro càng tốt.',
    min_points: 20,
    decimals: 2,
  },
  max_dd: {
    id: 'max_dd',
    label_vi: 'Sụt giảm tối đa',
    unit: 'ratio',
    polarity: 'lower_better',
    formula_vi: 'Mức giảm phần trăm lớn nhất từ đỉnh giá xuống đáy sau đó: min(close_t / max(close_1..t) - 1)',
    excel_hint: 'Tại cột phụ E2 =C2/MAX($C$2:C2)-1, sau đó =MIN(E2:E252)',
    meaning_vi: 'Khoản lỗ lớn nhất nếu nhà đầu tư kém may mắn mua trúng đỉnh cao nhất và bán đúng đáy thấp nhất trong kỳ.',
    min_points: 2,
    decimals: 2,
  },
  win_rate: {
    id: 'win_rate',
    label_vi: 'Tỷ lệ phiên tăng',
    unit: 'ratio',
    polarity: 'higher_better',
    formula_vi: 'Số phiên giá đóng cửa cao hơn phiên trước / Tổng số phiên có tính được lợi suất',
    excel_hint: '=COUNTIF(D3:D252, ">0")/COUNT(D3:D252)',
    meaning_vi: 'Tỷ lệ phần trăm số ngày cổ phiếu tăng giá so với tổng số ngày giao dịch.',
    min_points: 10,
    decimals: 1,
  },
  avg_range: {
    id: 'avg_range',
    label_vi: 'Biên độ dao động TB',
    unit: 'ratio',
    polarity: 'lower_better',
    formula_vi: 'Trung bình của (Giá cao - Giá thấp) / Giá đóng cửa mỗi phiên',
    excel_hint: '=AVERAGE((High - Low)/Close)',
    meaning_vi: 'Độ giãn chênh lệch trung bình giữa giá cao nhất và thấp nhất trong một ngày.',
    min_points: 5,
    decimals: 2,
  },
  avg_volume: {
    id: 'avg_volume',
    label_vi: 'Khối lượng trung bình',
    unit: 'number',
    polarity: 'neutral',
    formula_vi: 'Trung bình cộng khối lượng giao dịch các phiên (loại bỏ ô trống)',
    excel_hint: '=AVERAGE(G2:G252)',
    meaning_vi: 'Số lượng cổ phiếu được mua bán trao tay trung bình mỗi ngày.',
    min_points: 1,
    decimals: 0,
  },
  volume_spike_days: {
    id: 'volume_spike_days',
    label_vi: 'Số phiên đột biến KL',
    unit: 'count',
    polarity: 'neutral',
    formula_vi: 'Số phiên có khối lượng > (Trung bình 20 phiên trước + 2 * Độ lệch chuẩn 20 phiên trước)',
    excel_hint: '=IF(G22 > AVERAGE(G2:G21) + 2*STDEV.S(G2:G21), 1, 0)',
    meaning_vi: 'Số ngày khối lượng giao dịch tăng vọt bất thường so với mức trung bình 20 ngày trước đó.',
    min_points: 21,
    decimals: 0,
  },
  ma20: {
    id: 'ma20',
    label_vi: 'Đường MA20',
    unit: 'currency',
    polarity: 'neutral',
    formula_vi: 'Trung bình cộng giá đóng cửa 20 phiên gần nhất',
    excel_hint: '=AVERAGE(C233:C252)',
    meaning_vi: 'Mức giá bình quân trong 20 ngày giao dịch gần nhất (xu hướng ngắn hạn).',
    min_points: 20,
    decimals: 2,
  },
  ma50: {
    id: 'ma50',
    label_vi: 'Đường MA50',
    unit: 'currency',
    polarity: 'neutral',
    formula_vi: 'Trung bình cộng giá đóng cửa 50 phiên gần nhất',
    excel_hint: '=AVERAGE(C203:C252)',
    meaning_vi: 'Mức giá bình quân trong 50 ngày giao dịch gần nhất (xu hướng trung hạn).',
    min_points: 50,
    decimals: 2,
  },
  ma_state: {
    id: 'ma_state',
    label_vi: 'Vị thế MA20 / MA50',
    unit: 'text',
    polarity: 'neutral',
    formula_vi: 'So sánh giá trị MA20 và MA50 tại phiên cuối kỳ',
    excel_hint: '=IF(MA20>MA50, "MA20 trên MA50", IF(MA20<MA50, "MA20 dưới MA50", "MA20 bằng MA50"))',
    meaning_vi: 'Tương quan xu hướng ngắn hạn và trung hạn. MA20 nằm trên MA50 là dấu hiệu xu hướng tăng tích cực.',
    min_points: 50,
    decimals: 0,
  },
  rsi14: {
    id: 'rsi14',
    label_vi: 'Chỉ số RSI (14)',
    unit: 'number',
    polarity: 'neutral',
    formula_vi: 'Chỉ số sức mạnh tương đối 14 phiên theo công thức làm mượt J. Welles Wilder',
    excel_hint: '=100 - (100 / (1 + AvgGain/AvgLoss))',
    meaning_vi: 'Đo lường tốc độ biến động giá để nhận biết vùng quá mua (>70) hoặc vùng quá bán (<30).',
    min_points: 15,
    decimals: 1,
  },
  best_day: {
    id: 'best_day',
    label_vi: 'Phiên tăng mạnh nhất',
    unit: 'ratio',
    polarity: 'higher_better',
    formula_vi: 'Lợi suất ngày lớn nhất trong kỳ',
    excel_hint: '=MAX(D3:D252)',
    meaning_vi: 'Mức tăng giá mạnh nhất trong một ngày kèm thời điểm diễn ra.',
    min_points: 2,
    decimals: 2,
  },
  worst_day: {
    id: 'worst_day',
    label_vi: 'Phiên giảm mạnh nhất',
    unit: 'ratio',
    polarity: 'lower_better',
    formula_vi: 'Lợi suất ngày nhỏ nhất trong kỳ',
    excel_hint: '=MIN(D3:D252)',
    meaning_vi: 'Mức giảm giá sâu nhất trong một ngày kèm thời điểm diễn ra.',
    min_points: 2,
    decimals: 2,
  },
  date_range: {
    id: 'date_range',
    label_vi: 'Khoảng thời gian',
    unit: 'text',
    polarity: 'neutral',
    formula_vi: 'Ngày đầu tiên và ngày cuối cùng của chuỗi dữ liệu trong kỳ',
    excel_hint: '=TEXT(MIN(A2:A252),"dd/mm/yyyy") & " - " & TEXT(MAX(A2:A252),"dd/mm/yyyy")',
    meaning_vi: 'Khung thời gian giao dịch thực tế được đưa vào tính toán.',
    min_points: 1,
    decimals: 0,
  },
  // Multi-symbol metrics (symbol = null, Prompt P4/P5 Section 5.3 & A6)
  symbol_returns: {
    id: 'symbol_returns',
    label_vi: 'So sánh lợi suất các mã',
    unit: 'ratio',
    polarity: 'higher_better',
    formula_vi: 'Tổng hợp lợi suất cả kỳ của tất cả các mã trong danh mục',
    excel_hint: '=(Close_End - Close_Start) / Close_Start cho từng mã',
    meaning_vi: 'Bảng xếp hạng mức sinh lời của các cổ phiếu được theo dõi trong kỳ.',
    min_points: 2,
    decimals: 2,
  },
  correlation: {
    id: 'correlation',
    label_vi: 'Hệ số tương quan cặp mã',
    unit: 'number',
    polarity: 'neutral',
    formula_vi: 'Hệ số tương quan Pearson lợi suất ngày trên các phiên chung (tối thiểu 20 phiên chung)',
    excel_hint: '=CORREL(Returns_A, Returns_B)',
    meaning_vi: 'Đo lường mức độ đồng pha dao động giá giữa các cặp cổ phiếu. Hệ số thấp giúp đa dạng hóa rủi ro tốt hơn.',
    min_points: 20,
    decimals: 2,
  },
  normalized_base: {
    id: 'normalized_base',
    label_vi: 'Chuẩn hóa hiệu suất về mốc 100',
    unit: 'number',
    polarity: 'higher_better',
    formula_vi: 'Quy đổi giá đóng cửa của tất cả các mã về mốc 100 tại ngày chung đầu tiên',
    excel_hint: '=Close_t / Close_Base * 100',
    meaning_vi: 'Cho phép so sánh trực quan tốc độ tăng trưởng giữa các cổ phiếu có thị giá chênh lệch nhau.',
    min_points: 2,
    decimals: 1,
  },
  volume_share: {
    id: 'volume_share',
    label_vi: 'Tỷ trọng thanh khoản theo khối lượng',
    unit: 'ratio',
    polarity: 'neutral',
    formula_vi: 'Khối lượng giao dịch của từng mã / Tổng khối lượng giao dịch cả danh mục',
    excel_hint: '=SUM(Volume_Symbol) / SUM(Volume_All)',
    meaning_vi: 'Tỷ lệ đóng góp vào tổng khối lượng cổ phiếu khớp lệnh trong toàn bộ danh mục.',
    min_points: 1,
    decimals: 2,
  },
  risk_return: {
    id: 'risk_return',
    label_vi: 'Tương quan Lợi nhuận / Rủi ro danh mục',
    unit: 'ratio',
    polarity: 'higher_better',
    formula_vi: 'Tập hợp tọa độ (Biến động năm hóa, Lợi suất kỳ) của các mã',
    excel_hint: 'Scatter plot X=STDEV.S*SQRT(252), Y=Period_Return',
    meaning_vi: 'Định vị vị thế của từng mã trên biểu đồ rủi ro - lợi nhuận.',
    min_points: 20,
    decimals: 2,
  },
  // Supplementary multi-symbol metrics
  top_performer: {
    id: 'top_performer',
    label_vi: 'Mã sinh lời cao nhất',
    unit: 'text',
    polarity: 'higher_better',
    formula_vi: 'Mã đạt lợi suất cả kỳ cao nhất danh mục',
    excel_hint: '=INDEX(Symbols, MATCH(MAX(Returns), Returns, 0))',
    meaning_vi: 'Cổ phiếu dẫn đầu về mức tăng trưởng lợi nhuận trong kỳ khảo sát.',
    min_points: 2,
    decimals: 0,
  },
  highest_volatility: {
    id: 'highest_volatility',
    label_vi: 'Mã rủi ro cao nhất',
    unit: 'text',
    polarity: 'lower_better',
    formula_vi: 'Mã có độ biến động năm hóa lớn nhất',
    excel_hint: '=INDEX(Symbols, MATCH(MAX(Volatilities), Volatilities, 0))',
    meaning_vi: 'Cổ phiếu có mức độ rung lắc giá mạnh nhất trong danh mục.',
    min_points: 20,
    decimals: 0,
  },
  lowest_drawdown: {
    id: 'lowest_drawdown',
    label_vi: 'Mã phòng thủ tốt nhất',
    unit: 'text',
    polarity: 'higher_better',
    formula_vi: 'Mã có mức sụt giảm tối đa ít tiêu cực nhất',
    excel_hint: '=INDEX(Symbols, MATCH(MAX(Drawdowns), Drawdowns, 0))',
    meaning_vi: 'Cổ phiếu giữ giá tốt nhất khi thị trường điều chỉnh giảm.',
    min_points: 2,
    decimals: 0,
  },
};

/**
 * Unique identifier composite key for metrics across symbols.
 * Format: "m:" + id + ":" + (symbol ?? "*")
 * Example: "m:period_return:TMA", "m:correlation:*"
 */
export function metricKey(id: string, symbol: string | null | undefined): string {
  const s = symbol && symbol.trim() !== '' ? symbol : '*';
  return `m:${id}:${s}`;
}

/**
 * Unique identifier composite key for charts across symbols.
 * Format: "c:" + id + ":" + (symbol ?? "*")
 * Example: "c:chart_price_ma:TMA", "c:chart_correlation:*"
 */
export function chartKey(id: string, symbol: string | null | undefined): string {
  const s = symbol && symbol.trim() !== '' ? symbol : '*';
  return `c:${id}:${s}`;
}

/**
 * Inverse function to parse evidence keys back to their components.
 */
export function parseEvidenceKey(key: string): { type: 'm' | 'c'; id: string; symbol: string | null } {
  const parts = key.split(':');
  if (parts.length >= 3) {
    const type = parts[0] === 'c' ? 'c' : 'm';
    const id = parts[1];
    const sym = parts.slice(2).join(':');
    return {
      type,
      id,
      symbol: sym === '*' || !sym ? null : sym,
    };
  }
  // Fallback for legacy keys if any
  return {
    type: key.startsWith('c:') ? 'c' : 'm',
    id: key.replace(/^[mc]:/, ''),
    symbol: null,
  };
}

/**
 * Mapping of each chart key to the metric IDs it illustrates.
 * Strictly conforms to Section A7 of Prompt P5.
 */
export const chartBackingMetrics: Record<string, string[]> = {
  chart_price_ma: ['last_close', 'ma20', 'ma50', 'ma_state'],
  chart_candle_volume: ['last_close', 'avg_volume'],
  chart_monthly_returns: ['period_return'],
  chart_return_hist: ['ann_vol', 'win_rate', 'best_day', 'worst_day'],
  chart_drawdown: ['max_dd'],
  chart_volume_combo: ['avg_volume', 'volume_spike_days'],
  chart_top_days: ['best_day', 'worst_day'],
  chart_normalized: ['symbol_returns', 'normalized_base'],
  chart_symbol_returns: ['symbol_returns'],
  chart_risk_return: ['risk_return', 'ann_vol', 'period_return'],
  chart_trade_share: ['volume_share'],
  chart_correlation: ['correlation'],
};

export type KpiTone = 'good' | 'bad' | 'neutral';

export interface KpiTileToneResult {
  valueTone: KpiTone;
  deltaTone: KpiTone;
  tagText?: string;
  tagTone?: KpiTone;
}

/**
 * Determines exact display color tones for KPI Tile according to Section 8.3 rules.
 * Pure function - testable line-by-line.
 */
export function kpiTone(metric: Metric): KpiTileToneResult {
  const { id, value, delta, status } = metric;

  if (status === 'insufficient_data' || value === null || value === undefined) {
    return { valueTone: 'neutral', deltaTone: 'neutral' };
  }

  const deltaVal = delta?.value;
  const deltaTone: KpiTone =
    deltaVal === null || deltaVal === undefined || deltaVal === 0
      ? 'neutral'
      : deltaVal > 0
      ? 'good'
      : 'bad';

  switch (id) {
    case 'last_close':
      return { valueTone: 'neutral', deltaTone };

    case 'period_return':
      return {
        valueTone: value > 0 ? 'good' : value < 0 ? 'bad' : 'neutral',
        deltaTone,
      };

    case 'ann_vol':
      // Higher volatility is worse; lower volatility is better
      const volDeltaTone: KpiTone =
        deltaVal === null || deltaVal === undefined || deltaVal === 0
          ? 'neutral'
          : deltaVal > 0
          ? 'bad'
          : 'good';
      return { valueTone: 'neutral', deltaTone: volDeltaTone };

    case 'sharpe':
      return {
        valueTone: value > 0 ? 'good' : value < 0 ? 'bad' : 'neutral',
        deltaTone,
      };

    case 'max_dd':
      // Max drawdown is always bad if non-zero
      return {
        valueTone: value < 0 ? 'bad' : 'neutral',
        deltaTone: 'neutral',
      };

    case 'win_rate':
      // Win rate >= 50% is good, < 50% is bad
      return {
        valueTone: value >= 0.5 ? 'good' : 'bad',
        deltaTone: 'neutral',
      };

    case 'avg_range':
      return { valueTone: 'neutral', deltaTone: 'neutral' };

    case 'avg_volume':
      // Volume delta is neutral/gray per Section 8.3
      return { valueTone: 'neutral', deltaTone: 'neutral' };

    case 'rsi14': {
      let tagText = 'Trung tính';
      let tagTone: KpiTone = 'neutral';
      if (value > 70) {
        tagText = 'Quá mua';
        tagTone = 'bad';
      } else if (value < 30) {
        tagText = 'Quá bán';
        tagTone = 'good';
      }
      return { valueTone: 'neutral', deltaTone: 'neutral', tagText, tagTone };
    }

    case 'best_day':
      return { valueTone: 'good', deltaTone: 'neutral' };

    case 'worst_day':
      return { valueTone: 'bad', deltaTone: 'neutral' };

    case 'volume_spike_days':
    case 'sessions':
    case 'ma20':
    case 'ma50':
    case 'ma_state':
    default:
      return { valueTone: 'neutral', deltaTone: 'neutral' };
  }
}

/**
 * Top 8 default KPI Tile IDs displayed in the dashboard header in exact order.
 */
export const DEFAULT_KPI_IDS = [
  'last_close',
  'period_return',
  'ann_vol',
  'max_dd',
  'sharpe',
  'win_rate',
  'avg_volume',
  'rsi14',
] as const;

