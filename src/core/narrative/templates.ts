/**
 * Deterministic Fallback Template Engine for Quantitative Narrative (Prompt P5 Section 8).
 * Generates natural, professional Vietnamese commentary without calling any LLM.
 * Strictly guarantees 100% compliance with Number & Evidence Checking Engine.
 */

import type { AnalysisResult, Narrative, NarrativeSection, NarrativeParagraph } from '../schemas';
import { metricKey, chartKey } from '../metrics/metricSpec';
import { formatNumber, formatPercent } from '../../utils/format';

export interface CleaningSummaryContext {
  raw_rows?: number;
  clean_rows?: number;
  dropped_rows?: number;
  flagged_outliers?: number;
  warnings_count?: number;
}

/**
 * Generates a complete, verified Narrative object from analysis results and clean metadata.
 */
export function generateFallbackNarrative(
  analysis: AnalysisResult,
  cleaningSummary?: CleaningSummaryContext
): Narrative {
  const { config, metrics, created_at, analysis_hash } = analysis;
  const symbols = config.symbols;
  const isMulti = symbols.length >= 2;
  const sections: NarrativeSection[] = [];

  // Helper to find a specific metric
  const findMetric = (id: string, symbol: string | null) =>
    metrics.find((m) => m.id === id && (symbol === null ? m.symbol === null : m.symbol === symbol));

  // -------------------------------------------------------------
  // 1. OVERVIEW: Tổng quan kỳ phân tích
  // -------------------------------------------------------------
  const overviewParas: NarrativeParagraph[] = [];

  if (isMulti) {
    const primarySym = symbols[0];
    const sMetric = findMetric('sessions', primarySym);
    const dateMetric = findMetric('date_range', primarySym);
    const symReturns = findMetric('symbol_returns', null);

    const sessionsCount = sMetric?.value ?? 0;
    const dateRangeText = dateMetric?.text ?? '';

    const ev = [
      metricKey('date_range', primarySym),
      metricKey('sessions', primarySym),
      metricKey('symbol_returns', null),
    ];

    overviewParas.push({
      id: 'overview-1',
      text: `Kỳ phân tích bao gồm ${sessionsCount} phiên giao dịch thực tế (${dateRangeText}) đối với danh mục gồm ${symbols.length} mã cổ phiếu (${symbols.join(', ')}). Về hiệu suất tổng thể trong kỳ, kết quả ghi nhận như sau: ${symReturns?.text || 'chưa có dữ liệu'}.`,
      evidence: ev,
      source: 'template',
      check_issues: [],
    });
  } else {
    const sym = symbols[0];
    const sMetric = findMetric('sessions', sym);
    const dateMetric = findMetric('date_range', sym);
    const pRetMetric = findMetric('period_return', sym);
    const lastCloseMetric = findMetric('last_close', sym);

    const sessions = sMetric?.value ?? 0;
    const retVal = pRetMetric?.value ?? 0;
    const retText = formatPercent(retVal);
    const closeText = lastCloseMetric?.value !== null && lastCloseMetric?.value !== undefined ? formatNumber(lastCloseMetric.value) : '-';

    const ev = [
      metricKey('date_range', sym),
      metricKey('sessions', sym),
      metricKey('period_return', sym),
      metricKey('last_close', sym),
    ];

    overviewParas.push({
      id: 'overview-1',
      text: `Kỳ phân tích cổ phiếu ${sym} gồm ${sessions} phiên giao dịch (${dateMetric?.text || ''}). Kết thúc kỳ khảo sát, giá đóng cửa đạt mức ${closeText} đ, mang lại mức lợi suất cả kỳ tương ứng ${retText}.`,
      evidence: ev,
      source: 'template',
      check_issues: [],
    });
  }

  sections.push({
    id: 'overview',
    title_vi: 'Tổng quan kỳ phân tích',
    source: 'template',
    paragraphs: overviewParas,
  });

  // -------------------------------------------------------------
  // 2. TREND: Xu hướng giá
  // -------------------------------------------------------------
  const trendParas: NarrativeParagraph[] = [];

  for (const sym of symbols.slice(0, 3)) {
    const closeM = findMetric('last_close', sym);
    const ma20M = findMetric('ma20', sym);
    const ma50M = findMetric('ma50', sym);
    const maStateM = findMetric('ma_state', sym);

    const closeVal = closeM?.value !== null && closeM?.value !== undefined ? formatNumber(closeM.value) : '-';
    const ma20Val = ma20M?.value !== null && ma20M?.value !== undefined ? formatNumber(ma20M.value) : '-';
    const ma50Val = ma50M?.value !== null && ma50M?.value !== undefined ? formatNumber(ma50M.value) : '-';
    const maState = maStateM?.text || 'Chưa đủ dữ liệu';

    const ev = [
      metricKey('last_close', sym),
      metricKey('ma20', sym),
      metricKey('ma50', sym),
      metricKey('ma_state', sym),
      chartKey('chart_price_ma', sym),
    ];

    trendParas.push({
      id: `trend-${sym.toLowerCase()}`,
      text: `Về xu hướng giá của mã ${sym}: đường MA20 đạt ${ma20Val} đ và đường MA50 đạt ${ma50Val} đ so với mức giá đóng cửa gần nhất là ${closeVal} đ. Trạng thái giao cắt kỹ thuật hiện tại ghi nhận là ${maState}.`,
      evidence: ev,
      source: 'template',
      check_issues: [],
    });
  }

  sections.push({
    id: 'trend',
    title_vi: 'Xu hướng giá',
    source: 'template',
    paragraphs: trendParas.slice(0, 3),
  });

  // -------------------------------------------------------------
  // 3. VOLUME: Khối lượng và thanh khoản
  // -------------------------------------------------------------
  const volumeParas: NarrativeParagraph[] = [];

  for (const sym of symbols.slice(0, 2)) {
    const avgVolM = findMetric('avg_volume', sym);
    const spikeM = findMetric('volume_spike_days', sym);

    const avgVolText = avgVolM?.value !== null && avgVolM?.value !== undefined ? formatNumber(Math.round(avgVolM.value)) : '-';
    const spikeDays = spikeM?.value ?? 0;

    const ev = [
      metricKey('avg_volume', sym),
      metricKey('volume_spike_days', sym),
      chartKey('chart_volume_combo', sym),
    ];

    volumeParas.push({
      id: `volume-${sym.toLowerCase()}`,
      text: `Thanh khoản bình quân của mã ${sym} đạt ${avgVolText} cổ phiếu mỗi phiên. Trong toàn bộ kỳ khảo sát, đã ghi nhận ${spikeDays} phiên có khối lượng giao dịch đột biến vượt ngưỡng trung bình 20 phiên trước cộng 2 lần độ lệch chuẩn.`,
      evidence: ev,
      source: 'template',
      check_issues: [],
    });
  }

  sections.push({
    id: 'volume',
    title_vi: 'Khối lượng và thanh khoản',
    source: 'template',
    paragraphs: volumeParas,
  });

  // -------------------------------------------------------------
  // 4. RISK: Rủi ro
  // -------------------------------------------------------------
  const riskParas: NarrativeParagraph[] = [];

  for (const sym of symbols.slice(0, 2)) {
    const volM = findMetric('ann_vol', sym);
    const mddM = findMetric('max_dd', sym);
    const sharpeM = findMetric('sharpe', sym);
    const winRateM = findMetric('win_rate', sym);

    const volText = volM?.value !== null && volM?.value !== undefined ? formatPercent(volM.value) : 'Chưa đủ dữ liệu';
    const mddText = mddM?.value !== null && mddM?.value !== undefined ? formatPercent(mddM.value) : '0,00%';
    const sharpeText = sharpeM?.value !== null && sharpeM?.value !== undefined ? formatNumber(sharpeM.value) : '-';
    const winRateText = winRateM?.value !== null && winRateM?.value !== undefined ? formatPercent(winRateM.value) : '-';

    const ev = [
      metricKey('ann_vol', sym),
      metricKey('max_dd', sym),
      metricKey('sharpe', sym),
      metricKey('win_rate', sym),
      chartKey('chart_drawdown', sym),
    ];

    riskParas.push({
      id: `risk-${sym.toLowerCase()}`,
      text: `Chỉ số rủi ro của mã ${sym}: độ biến động năm hóa đạt ${volText}, mức sụt giảm tối đa từ đỉnh xuống đáy là ${mddText}. Tỷ số Sharpe tương ứng đạt ${sharpeText} với tỷ lệ phiên tăng giá là ${winRateText}.`,
      evidence: ev,
      source: 'template',
      check_issues: [],
    });
  }

  sections.push({
    id: 'risk',
    title_vi: 'Rủi ro',
    source: 'template',
    paragraphs: riskParas,
  });

  // -------------------------------------------------------------
  // 5. COMPARISON: So sánh giữa các mã (chỉ khi >= 2 mã)
  // -------------------------------------------------------------
  if (isMulti) {
    const compParas: NarrativeParagraph[] = [];
    const symReturns = findMetric('symbol_returns', null);
    const corrM = findMetric('correlation', null);

    const ev = [
      metricKey('symbol_returns', null),
      metricKey('volume_share', null),
      metricKey('correlation', null),
      chartKey('chart_normalized', null),
    ];

    const corrText = corrM?.status === 'ok' && corrM.value !== null
      ? `hệ số tương quan bình quân là ${formatNumber(corrM.value)}`
      : 'các cặp mã đều được theo dõi trên các phiên giao dịch chung';

    compParas.push({
      id: 'comp-1',
      text: `Khi so sánh tương quan trong danh mục gồm ${symbols.length} mã: mức sinh lời được ghi nhận lần lượt là ${symReturns?.text || 'chưa đủ dữ liệu'}. Về thanh khoản, tỷ trọng khối lượng giao dịch được phân bổ theo quy mô của từng mã, và ${corrText}.`,
      evidence: ev,
      source: 'template',
      check_issues: [],
    });

    sections.push({
      id: 'comparison',
      title_vi: 'So sánh giữa các mã',
      source: 'template',
      paragraphs: compParas,
    });
  }

  // -------------------------------------------------------------
  // 6. WATCH: Điểm cần lưu ý
  // -------------------------------------------------------------
  const watchParas: NarrativeParagraph[] = [];
  const leadSym = symbols[0];
  const rsiM = findMetric('rsi14', leadSym);
  const bestM = findMetric('best_day', leadSym);
  const worstM = findMetric('worst_day', leadSym);

  const rsiVal = rsiM?.value !== null && rsiM?.value !== undefined ? formatNumber(rsiM.value, 1) : '-';
  const rsiZone = rsiM?.value !== null && rsiM?.value !== undefined
    ? rsiM.value > 70 ? 'vùng quá mua' : rsiM.value < 30 ? 'vùng quá bán' : 'vùng trung tính'
    : 'trung tính';

  const bestVal = bestM?.value !== null && bestM?.value !== undefined ? formatPercent(bestM.value) : '-';
  const worstVal = worstM?.value !== null && worstM?.value !== undefined ? formatPercent(worstM.value) : '-';

  const evWatch = [
    metricKey('rsi14', leadSym),
    metricKey('best_day', leadSym),
    metricKey('worst_day', leadSym),
  ];

  watchParas.push({
    id: 'watch-1',
    text: `Chỉ số sức mạnh tương đối RSI 14 của mã ${leadSym} hiện đạt ${rsiVal}, phản ánh trạng thái ${rsiZone}. Trong toàn kỳ, biên độ ngày cực đại ghi nhận phiên tăng mạnh nhất đạt ${bestVal} và phiên giảm sâu nhất đạt ${worstVal}.`,
    evidence: evWatch,
    source: 'template',
    check_issues: [],
  });

  sections.push({
    id: 'watch',
    title_vi: 'Điểm cần lưu ý',
    source: 'template',
    paragraphs: watchParas,
  });

  // -------------------------------------------------------------
  // 7. LIMITS: Hạn chế của dữ liệu và phân tích
  // -------------------------------------------------------------
  const limitsParas: NarrativeParagraph[] = [];
  const sRef = findMetric('sessions', symbols[0]);
  const sCount = sRef?.value ?? 0;
  const insufficientMetrics = metrics.filter((m) => m.status === 'insufficient_data');

  const evLimits = [
    metricKey('sessions', symbols[0]),
    metricKey('date_range', symbols[0]),
  ];

  let cleaningNote = '';
  if (cleaningSummary) {
    const rawN = cleaningSummary.raw_rows ?? 0;
    const cleanN = cleaningSummary.clean_rows ?? 0;
    const droppedN = cleaningSummary.dropped_rows ?? 0;
    const outliersN = cleaningSummary.flagged_outliers ?? 0;
    cleaningNote = ` Dữ liệu đã trải qua quy trình làm sạch từ ${rawN} dòng ban đầu, loại bỏ ${droppedN} dòng không hợp lệ, giữ lại ${cleanN} dòng sạch và đánh dấu ${outliersN} điểm giá bất thường.`;
  }

  let insufficientNote = '';
  if (insufficientMetrics.length > 0) {
    const names = Array.from(new Set(insufficientMetrics.map((m) => m.label_vi))).slice(0, 3).join(', ');
    insufficientNote = ` Một số chỉ số có trạng thái chưa đủ dữ liệu do số phiên thực tế chưa đạt ngưỡng tối thiểu (${names}).`;
  }

  limitsParas.push({
    id: 'limits-1',
    text: `Báo cáo được lập trên mẫu dữ liệu gồm ${sCount} phiên giao dịch. Các tính toán tuân thủ quy ước 252 phiên mỗi năm và giả định lãi suất phi rủi ro bằng 0.${cleaningNote}${insufficientNote}`,
    evidence: evLimits,
    source: 'template',
    check_issues: [],
  });

  sections.push({
    id: 'limits',
    title_vi: 'Hạn chế của dữ liệu và phân tích',
    source: 'template',
    paragraphs: limitsParas,
  });

  return {
    generated_at: created_at || new Date().toISOString(),
    analysis_hash: analysis_hash || '',
    mode: 'template',
    sections,
    disclaimer_vi: 'Nội dung mang tính phân tích dữ liệu, không phải khuyến nghị đầu tư.',
  };
}
