/**
 * Quantitative Metric Calculator.
 * Computes all 17 per-symbol metrics + multi-symbol metrics in pure TypeScript.
 * Zero external dependencies. Zero AI calls.
 */

import type { CleanArtifact, Metric, AnalysisConfig } from '../schemas';
import { METRIC_DEFINITIONS } from './metricSpec';
import {
  welfordStats,
  computeDailyReturns,
  computeMaxDrawdown,
  computeWilderRsi,
  computeCorrelation,
} from './math';
import { formatDate, formatPercent } from '../../utils/format';

export interface CalculateMetricsResult {
  metrics: Metric[];
  warnings: string[];
}

export interface SymbolSeries {
  symbol: string;
  indices: number[];
  dates: string[];
  dateDays: number[];
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume: number[];
}

export interface ExtractedSeries {
  seriesBySymbol: Map<string, SymbolSeries>;
  allDatesBySymbol: Map<string, SymbolSeries>;
}

export function parseDateToDays(dateStr: string): number {
  return Math.floor(Date.parse(`${dateStr}T00:00:00Z`) / 86400000);
}

/**
 * Pure integer Gregorian civil-from-days algorithm (Howard Hinnant).
 * Zero Date allocation, bit-for-bit identical to `new Date(days * 86400000).toISOString().slice(0, 10)`.
 */
export function daysToIsoDate(days: number): string {
  const z = Math.floor(days) + 719468;
  const era = Math.floor((z >= 0 ? z : z - 146096) / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  const year = y + (m <= 2 ? 1 : 0);
  const yStr = year >= 1000 ? String(year) : String(year).padStart(4, '0');
  const mStr = m < 10 ? `0${m}` : String(m);
  const dStr = d < 10 ? `0${d}` : String(d);
  return `${yStr}-${mStr}-${dStr}`;
}

/**
 * Extracts and filters series per symbol from columnar RawDataset in a single O(N) pass.
 * Uses direct integer symbol-index lookup and date-string caching.
 */
export function extractSymbolSeries(
  cleanArtifact: CleanArtifact,
  config: AnalysisConfig
): ExtractedSeries {
  const dataset = cleanArtifact.dataset;
  const fromDays = parseDateToDays(config.date_from);
  const toDays = parseDateToDays(config.date_to);

  const seriesBySymbol = new Map<string, SymbolSeries>();
  const allDatesBySymbol = new Map<string, SymbolSeries>();

  // Initialize containers for requested symbols
  for (const s of config.symbols) {
    seriesBySymbol.set(s, {
      symbol: s,
      indices: [],
      dates: [],
      dateDays: [],
      open: [],
      high: [],
      low: [],
      close: [],
      volume: [],
    });
    allDatesBySymbol.set(s, {
      symbol: s,
      indices: [],
      dates: [],
      dateDays: [],
      open: [],
      high: [],
      low: [],
      close: [],
      volume: [],
    });
  }

  if (!dataset) return { seriesBySymbol, allDatesBySymbol };

  // Direct O(1) array lookup by integer symbol_idx
  const numSyms = dataset.symbols.length;
  const filteredByIdx: (SymbolSeries | undefined)[] = new Array(numSyms);
  const allByIdx: (SymbolSeries | undefined)[] = new Array(numSyms);
  for (let sIdx = 0; sIdx < numSyms; sIdx++) {
    const sName = dataset.symbols[sIdx];
    filteredByIdx[sIdx] = seriesBySymbol.get(sName);
    allByIdx[sIdx] = allDatesBySymbol.get(sName);
  }

  const isoCache = new Map<number, string>();
  const n = dataset.n;
  const symIdxArr = dataset.symbol_idx;
  const dateDaysArr = dataset.date_days;
  const openArr = dataset.open;
  const highArr = dataset.high;
  const lowArr = dataset.low;
  const closeArr = dataset.close;
  const volArr = dataset.volume;

  for (let i = 0; i < n; i++) {
    const sIdx = symIdxArr[i];
    const allCont = allByIdx[sIdx];
    if (!allCont) continue;

    const dDays = dateDaysArr[i];
    let isoDate = isoCache.get(dDays);
    if (isoDate === undefined) {
      isoDate = daysToIsoDate(dDays);
      isoCache.set(dDays, isoDate);
    }

    const o = openArr[i];
    const h = highArr[i];
    const l = lowArr[i];
    const c = closeArr[i];
    const v = volArr[i];

    // Always record in allDatesBySymbol (for prior-period delta calculations)
    allCont.indices.push(i);
    allCont.dateDays.push(dDays);
    allCont.dates.push(isoDate);
    allCont.open.push(o);
    allCont.high.push(h);
    allCont.low.push(l);
    allCont.close.push(c);
    allCont.volume.push(v);

    // Record in filtered series if within selected date range
    if (dDays >= fromDays && dDays <= toDays) {
      const cont = filteredByIdx[sIdx]!;
      cont.indices.push(i);
      cont.dateDays.push(dDays);
      cont.dates.push(isoDate);
      cont.open.push(o);
      cont.high.push(h);
      cont.low.push(l);
      cont.close.push(c);
      cont.volume.push(v);
    }
  }

  return { seriesBySymbol, allDatesBySymbol };
}

/**
 * Main calculation function.
 * Accepts optional pre-extracted series and progress callback to avoid duplicate dataset scans.
 */
export function calculateMetrics(
  cleanArtifact: CleanArtifact,
  config: AnalysisConfig,
  preExtracted?: ExtractedSeries,
  onSymbolProgress?: (completed: number, total: number, symbol: string) => void
): CalculateMetricsResult {
  const metrics: Metric[] = [];
  const warnings: string[] = [];

  const { seriesBySymbol, allDatesBySymbol } = preExtracted || extractSymbolSeries(cleanArtifact, config);
  const totalSymbols = config.symbols.length;

  for (let symIdx = 0; symIdx < totalSymbols; symIdx++) {
    const symbol = config.symbols[symIdx];
    if (onSymbolProgress) {
      onSymbolProgress(symIdx, totalSymbols, symbol);
    }
    const series = seriesBySymbol.get(symbol);
    const allSeries = allDatesBySymbol.get(symbol);

    if (!series || series.close.length === 0) {
      warnings.push(`Mã ${symbol} không có dữ liệu giao dịch trong khoảng thời gian đã chọn.`);
      // Add placeholder metrics with insufficient_data
      for (const [id, def] of Object.entries(METRIC_DEFINITIONS)) {
        metrics.push({
          id,
          label_vi: def.label_vi,
          symbol,
          value: null,
          unit: def.unit,
          status: 'insufficient_data',
          polarity: def.polarity,
          formula_vi: def.formula_vi,
          inputs: [],
          reason_vi: 'Không có dữ liệu trong khoảng thời gian đã chọn',
          meaning_vi: def.meaning_vi,
          excel_hint: def.excel_hint,
        });
      }
      continue;
    }

    const n = series.close.length;
    if (n < 5) {
      warnings.push(`Mã ${symbol} chỉ có ${n} phiên trong kỳ (khuyến nghị tối thiểu 30 phiên).`);
    }

    const prices = series.close;
    const volumes = series.volume;
    const highs = series.high;
    const lows = series.low;
    const dates = series.dates;
    const returns = computeDailyReturns(prices);
    const returnStats = welfordStats(returns);

    // Find prior period in allSeries for deltas
    // Selected period starts at series.dateDays[0]
    let priorReturn: number | null = null;
    let priorAnnVol: number | null = null;
    let priorSharpe: number | null = null;
    if (allSeries) {
      const firstSelectedDateDays = series.dateDays[0];
      const selectedIdxInAll = allSeries.dateDays.indexOf(firstSelectedDateDays);
      if (selectedIdxInAll >= n) {
        // We have at least n sessions before the selected range
        const priorPrices = allSeries.close.slice(selectedIdxInAll - n, selectedIdxInAll);
        if (priorPrices.length >= 2) {
          priorReturn = priorPrices[priorPrices.length - 1] / priorPrices[0] - 1;
        }
        if (priorPrices.length >= 20) {
          const priorReturns = computeDailyReturns(priorPrices);
          const priorStats = welfordStats(priorReturns);
          priorAnnVol = priorStats.stdev * Math.sqrt(252);
          priorSharpe = priorStats.stdev > 0 ? (priorStats.mean / priorStats.stdev) * Math.sqrt(252) : null;
        }
      }
    }

    // 1. sessions
    metrics.push({
      id: 'sessions',
      label_vi: METRIC_DEFINITIONS.sessions.label_vi,
      symbol,
      value: n,
      unit: 'count',
      status: 'ok',
      polarity: 'neutral',
      formula_vi: METRIC_DEFINITIONS.sessions.formula_vi,
      inputs: ['close'],
      period: { from: dates[0], to: dates[n - 1] },
      calc: [{ label_vi: 'Tổng số phiên có giá đóng cửa', value: n, unit: 'phiên' }],
      meaning_vi: METRIC_DEFINITIONS.sessions.meaning_vi,
      excel_hint: METRIC_DEFINITIONS.sessions.excel_hint,
    });

    // 2. last_close
    const lastClose = prices[n - 1];
    const prevClose = n >= 2 ? prices[n - 2] : null;
    const closeDeltaVal = prevClose !== null ? lastClose - prevClose : null;
    metrics.push({
      id: 'last_close',
      label_vi: METRIC_DEFINITIONS.last_close.label_vi,
      symbol,
      value: lastClose,
      unit: 'currency',
      status: n >= 1 ? 'ok' : 'insufficient_data',
      polarity: 'neutral',
      formula_vi: METRIC_DEFINITIONS.last_close.formula_vi,
      inputs: ['close_last', 'close_prev'],
      delta:
        prevClose !== null
          ? {
              value: closeDeltaVal,
              label_vi: 'so với phiên trước',
              status: 'ok',
            }
          : { value: null, label_vi: 'so với phiên trước', status: 'insufficient_data' },
      period: { from: dates[0], to: dates[n - 1] },
      calc: [
        { label_vi: 'Giá đóng cửa phiên cuối', value: lastClose, unit: 'đ' },
        ...(prevClose !== null
          ? [
              { label_vi: 'Giá đóng cửa phiên liền trước', value: prevClose, unit: 'đ' },
              { label_vi: 'Chênh lệch', value: (closeDeltaVal ?? 0), unit: 'đ' },
            ]
          : []),
      ],
      meaning_vi: METRIC_DEFINITIONS.last_close.meaning_vi,
      excel_hint: METRIC_DEFINITIONS.last_close.excel_hint,
    });

    // 3. period_return
    if (n >= 2) {
      const pRet = lastClose / prices[0] - 1.0;
      metrics.push({
        id: 'period_return',
        label_vi: METRIC_DEFINITIONS.period_return.label_vi,
        symbol,
        value: pRet,
        unit: 'ratio',
        status: 'ok',
        polarity: 'higher_better',
        formula_vi: METRIC_DEFINITIONS.period_return.formula_vi,
        inputs: ['close_start', 'close_end'],
        delta:
          priorReturn !== null
            ? {
                value: pRet - priorReturn,
                label_vi: 'so với kỳ trước',
                status: 'ok',
              }
            : { value: null, label_vi: 'so với kỳ trước', status: 'insufficient_data' },
        period: { from: dates[0], to: dates[n - 1] },
        calc: [
          { label_vi: 'Giá đóng đầu kỳ', value: prices[0], unit: 'đ' },
          { label_vi: 'Giá đóng cuối kỳ', value: lastClose, unit: 'đ' },
          { label_vi: 'Lợi suất cả kỳ', value: pRet, unit: 'ratio' },
        ],
        meaning_vi: METRIC_DEFINITIONS.period_return.meaning_vi,
        excel_hint: METRIC_DEFINITIONS.period_return.excel_hint,
      });
    } else {
      metrics.push({
        id: 'period_return',
        label_vi: METRIC_DEFINITIONS.period_return.label_vi,
        symbol,
        value: null,
        unit: 'ratio',
        status: 'insufficient_data',
        polarity: 'higher_better',
        formula_vi: METRIC_DEFINITIONS.period_return.formula_vi,
        inputs: [],
        reason_vi: 'Cần tối thiểu 2 phiên để tính lợi suất',
        meaning_vi: METRIC_DEFINITIONS.period_return.meaning_vi,
        excel_hint: METRIC_DEFINITIONS.period_return.excel_hint,
      });
    }

    // 4. ann_vol
    if (returns.length >= 20) {
      const annVol = returnStats.stdev * Math.sqrt(252);
      metrics.push({
        id: 'ann_vol',
        label_vi: METRIC_DEFINITIONS.ann_vol.label_vi,
        symbol,
        value: annVol,
        unit: 'ratio',
        status: 'ok',
        polarity: 'lower_better',
        formula_vi: METRIC_DEFINITIONS.ann_vol.formula_vi,
        inputs: ['daily_returns'],
        delta:
          priorAnnVol !== null
            ? {
                value: annVol - priorAnnVol,
                label_vi: 'so với kỳ trước',
                status: 'ok',
              }
            : { value: null, label_vi: 'so với kỳ trước', status: 'insufficient_data' },
        period: { from: dates[0], to: dates[n - 1] },
        calc: [
          { label_vi: 'Độ lệch chuẩn mẫu ngày (STDEV.S)', value: returnStats.stdev },
          { label_vi: 'Hệ số năm hóa', value: Math.sqrt(252) },
          { label_vi: 'Biến động năm hóa', value: annVol, unit: 'ratio' },
        ],
        meaning_vi: METRIC_DEFINITIONS.ann_vol.meaning_vi,
        excel_hint: METRIC_DEFINITIONS.ann_vol.excel_hint,
      });
    } else {
      metrics.push({
        id: 'ann_vol',
        label_vi: METRIC_DEFINITIONS.ann_vol.label_vi,
        symbol,
        value: null,
        unit: 'ratio',
        status: 'insufficient_data',
        polarity: 'lower_better',
        formula_vi: METRIC_DEFINITIONS.ann_vol.formula_vi,
        inputs: [],
        reason_vi: `Chưa đủ dữ liệu (cần tối thiểu 20 phiên có lợi suất, hiện có ${returns.length} phiên)`,
        meaning_vi: METRIC_DEFINITIONS.ann_vol.meaning_vi,
        excel_hint: METRIC_DEFINITIONS.ann_vol.excel_hint,
      });
    }

    // 5. sharpe
    if (returns.length >= 20 && returnStats.stdev > 0) {
      const sharpe = (returnStats.mean / returnStats.stdev) * Math.sqrt(252);
      metrics.push({
        id: 'sharpe',
        label_vi: METRIC_DEFINITIONS.sharpe.label_vi,
        symbol,
        value: sharpe,
        unit: 'number',
        status: 'ok',
        polarity: 'higher_better',
        formula_vi: METRIC_DEFINITIONS.sharpe.formula_vi,
        inputs: ['daily_returns'],
        delta:
          priorSharpe !== null
            ? {
                value: sharpe - priorSharpe,
                label_vi: 'so với kỳ trước',
                status: 'ok',
              }
            : { value: null, label_vi: 'so với kỳ trước', status: 'insufficient_data' },
        period: { from: dates[0], to: dates[n - 1] },
        calc: [
          { label_vi: 'Trung bình lợi suất ngày (AVERAGE)', value: returnStats.mean },
          { label_vi: 'Độ lệch chuẩn lợi suất ngày (STDEV.S)', value: returnStats.stdev },
          { label_vi: 'Lãi suất phi rủi ro giả định', value: 0 },
          { label_vi: 'Chỉ số Sharpe', value: sharpe },
        ],
        meaning_vi: METRIC_DEFINITIONS.sharpe.meaning_vi,
        excel_hint: METRIC_DEFINITIONS.sharpe.excel_hint,
      });
    } else {
      metrics.push({
        id: 'sharpe',
        label_vi: METRIC_DEFINITIONS.sharpe.label_vi,
        symbol,
        value: null,
        unit: 'number',
        status: 'insufficient_data',
        polarity: 'higher_better',
        formula_vi: METRIC_DEFINITIONS.sharpe.formula_vi,
        inputs: [],
        reason_vi:
          returns.length < 20
            ? `Chưa đủ dữ liệu (cần tối thiểu 20 phiên, hiện có ${returns.length} phiên)`
            : 'Độ lệch chuẩn bằng 0 (giá không thay đổi)',
        meaning_vi: METRIC_DEFINITIONS.sharpe.meaning_vi,
        excel_hint: METRIC_DEFINITIONS.sharpe.excel_hint,
      });
    }

    // 6. max_dd
    const ddRes = computeMaxDrawdown(prices);
    metrics.push({
      id: 'max_dd',
      label_vi: METRIC_DEFINITIONS.max_dd.label_vi,
      symbol,
      value: ddRes.maxDrawdown,
      unit: 'ratio',
      status: n >= 2 ? 'ok' : 'insufficient_data',
      polarity: 'lower_better',
      formula_vi: METRIC_DEFINITIONS.max_dd.formula_vi,
      inputs: ['close'],
      period: { from: dates[0], to: dates[n - 1] },
      calc: [
        { label_vi: 'Đỉnh cao nhất trước đáy', value: prices[ddRes.peakIdx], unit: 'đ' },
        { label_vi: 'Ngày tạo đỉnh', value: dates[ddRes.peakIdx] },
        { label_vi: 'Đáy sâu nhất', value: prices[ddRes.troughIdx], unit: 'đ' },
        { label_vi: 'Ngày tạo đáy', value: dates[ddRes.troughIdx] },
        { label_vi: 'Mức sụt giảm tối đa', value: ddRes.maxDrawdown, unit: 'ratio' },
      ],
      meaning_vi: METRIC_DEFINITIONS.max_dd.meaning_vi,
      excel_hint: METRIC_DEFINITIONS.max_dd.excel_hint,
    });

    // 7. win_rate
    if (returns.length >= 10) {
      let winCount = 0;
      for (let i = 0; i < returns.length; i++) {
        if (returns[i] > 0) winCount++;
      }
      const winRate = winCount / returns.length;
      metrics.push({
        id: 'win_rate',
        label_vi: METRIC_DEFINITIONS.win_rate.label_vi,
        symbol,
        value: winRate,
        unit: 'ratio',
        status: 'ok',
        polarity: 'higher_better',
        formula_vi: METRIC_DEFINITIONS.win_rate.formula_vi,
        inputs: ['daily_returns'],
        period: { from: dates[0], to: dates[n - 1] },
        calc: [
          { label_vi: 'Số phiên tăng giá', value: winCount, unit: 'phiên' },
          { label_vi: 'Tổng số phiên tính lợi suất', value: returns.length, unit: 'phiên' },
          { label_vi: 'Tỷ lệ phiên tăng', value: winRate, unit: 'ratio' },
        ],
        meaning_vi: METRIC_DEFINITIONS.win_rate.meaning_vi,
        excel_hint: METRIC_DEFINITIONS.win_rate.excel_hint,
      });
    } else {
      metrics.push({
        id: 'win_rate',
        label_vi: METRIC_DEFINITIONS.win_rate.label_vi,
        symbol,
        value: null,
        unit: 'ratio',
        status: 'insufficient_data',
        polarity: 'higher_better',
        formula_vi: METRIC_DEFINITIONS.win_rate.formula_vi,
        inputs: [],
        reason_vi: `Chưa đủ dữ liệu (cần tối thiểu 10 phiên, hiện có ${returns.length} phiên)`,
        meaning_vi: METRIC_DEFINITIONS.win_rate.meaning_vi,
        excel_hint: METRIC_DEFINITIONS.win_rate.excel_hint,
      });
    }

    // 8. avg_range
    const rangeRatios: number[] = [];
    for (let i = 0; i < n; i++) {
      const h = highs[i];
      const l = lows[i];
      const c = prices[i];
      if (!isNaN(h) && !isNaN(l) && !isNaN(c) && c > 0) {
        rangeRatios.push((h - l) / c);
      }
    }
    if (rangeRatios.length >= 5) {
      const rangeStats = welfordStats(rangeRatios);
      metrics.push({
        id: 'avg_range',
        label_vi: METRIC_DEFINITIONS.avg_range.label_vi,
        symbol,
        value: rangeStats.mean,
        unit: 'ratio',
        status: 'ok',
        polarity: 'lower_better',
        formula_vi: METRIC_DEFINITIONS.avg_range.formula_vi,
        inputs: ['high', 'low', 'close'],
        period: { from: dates[0], to: dates[n - 1] },
        calc: [
          { label_vi: 'Số phiên hợp lệ có High/Low/Close', value: rangeRatios.length, unit: 'phiên' },
          { label_vi: 'Biên độ dao động trung bình', value: rangeStats.mean, unit: 'ratio' },
        ],
        meaning_vi: METRIC_DEFINITIONS.avg_range.meaning_vi,
        excel_hint: METRIC_DEFINITIONS.avg_range.excel_hint,
      });
    } else {
      metrics.push({
        id: 'avg_range',
        label_vi: METRIC_DEFINITIONS.avg_range.label_vi,
        symbol,
        value: null,
        unit: 'ratio',
        status: 'insufficient_data',
        polarity: 'lower_better',
        formula_vi: METRIC_DEFINITIONS.avg_range.formula_vi,
        inputs: [],
        reason_vi: `Chưa đủ dữ liệu (cần tối thiểu 5 phiên có High/Low/Close, hiện có ${rangeRatios.length} phiên)`,
        meaning_vi: METRIC_DEFINITIONS.avg_range.meaning_vi,
        excel_hint: METRIC_DEFINITIONS.avg_range.excel_hint,
      });
    }

    // 9. avg_volume
    const volStats = welfordStats(volumes);
    metrics.push({
      id: 'avg_volume',
      label_vi: METRIC_DEFINITIONS.avg_volume.label_vi,
      symbol,
      value: volStats.count > 0 ? volStats.mean : null,
      unit: 'number',
      status: volStats.count > 0 ? 'ok' : 'insufficient_data',
      polarity: 'neutral',
      formula_vi: METRIC_DEFINITIONS.avg_volume.formula_vi,
      inputs: ['volume'],
      period: { from: dates[0], to: dates[n - 1] },
      calc: [
        { label_vi: 'Số phiên có khối lượng', value: volStats.count, unit: 'phiên' },
        { label_vi: 'Khối lượng trung bình', value: volStats.mean, unit: 'CP' },
      ],
      meaning_vi: METRIC_DEFINITIONS.avg_volume.meaning_vi,
      excel_hint: METRIC_DEFINITIONS.avg_volume.excel_hint,
    });

    // 10. volume_spike_days (zero-allocation exact Welford over 20-bar window)
    if (n >= 21) {
      let spikeCount = 0;
      for (let i = 20; i < n; i++) {
        let wCount = 0;
        let wMean = 0;
        let wM2 = 0;
        for (let j = i - 20; j < i; j++) {
          const x = volumes[j];
          if (isNaN(x) || !isFinite(x)) continue;
          wCount++;
          const d1 = x - wMean;
          wMean += d1 / wCount;
          const d2 = x - wMean;
          wM2 += d1 * d2;
        }
        const wStdev = wCount >= 2 ? Math.sqrt(Math.max(0, wM2 / (wCount - 1))) : 0;
        const threshold = (wCount >= 1 ? wMean : 0) + 2 * wStdev;
        if (volumes[i] > threshold) {
          spikeCount++;
        }
      }
      metrics.push({
        id: 'volume_spike_days',
        label_vi: METRIC_DEFINITIONS.volume_spike_days.label_vi,
        symbol,
        value: spikeCount,
        unit: 'count',
        status: 'ok',
        polarity: 'neutral',
        formula_vi: METRIC_DEFINITIONS.volume_spike_days.formula_vi,
        inputs: ['volume'],
        period: { from: dates[0], to: dates[n - 1] },
        calc: [
          { label_vi: 'Ngưỡng đột biến', value: 'Khối lượng > TB 20 phiên + 2*ĐLC' },
          { label_vi: 'Số phiên vượt ngưỡng', value: spikeCount, unit: 'phiên' },
        ],
        meaning_vi: METRIC_DEFINITIONS.volume_spike_days.meaning_vi,
        excel_hint: METRIC_DEFINITIONS.volume_spike_days.excel_hint,
      });
    } else {
      metrics.push({
        id: 'volume_spike_days',
        label_vi: METRIC_DEFINITIONS.volume_spike_days.label_vi,
        symbol,
        value: null,
        unit: 'count',
        status: 'insufficient_data',
        polarity: 'neutral',
        formula_vi: METRIC_DEFINITIONS.volume_spike_days.formula_vi,
        inputs: [],
        reason_vi: `Chưa đủ dữ liệu (cần tối thiểu 21 phiên để tính đột biến so với 20 phiên trước, hiện có ${n} phiên)`,
        meaning_vi: METRIC_DEFINITIONS.volume_spike_days.meaning_vi,
        excel_hint: METRIC_DEFINITIONS.volume_spike_days.excel_hint,
      });
    }

    // 11. ma20
    let ma20Val: number | null = null;
    if (n >= 20) {
      let sum = 0;
      for (let i = n - 20; i < n; i++) sum += prices[i];
      ma20Val = sum / 20;
      metrics.push({
        id: 'ma20',
        label_vi: METRIC_DEFINITIONS.ma20.label_vi,
        symbol,
        value: ma20Val,
        unit: 'currency',
        status: 'ok',
        polarity: 'neutral',
        formula_vi: METRIC_DEFINITIONS.ma20.formula_vi,
        inputs: ['close'],
        period: { from: dates[n - 20], to: dates[n - 1] },
        calc: [
          { label_vi: 'Số phiên lấy bình quân', value: 20, unit: 'phiên' },
          { label_vi: 'Giá trị MA20', value: ma20Val, unit: 'đ' },
        ],
        meaning_vi: METRIC_DEFINITIONS.ma20.meaning_vi,
        excel_hint: METRIC_DEFINITIONS.ma20.excel_hint,
      });
    } else {
      metrics.push({
        id: 'ma20',
        label_vi: METRIC_DEFINITIONS.ma20.label_vi,
        symbol,
        value: null,
        unit: 'currency',
        status: 'insufficient_data',
        polarity: 'neutral',
        formula_vi: METRIC_DEFINITIONS.ma20.formula_vi,
        inputs: [],
        reason_vi: `Chưa đủ dữ liệu (cần tối thiểu 20 phiên, hiện có ${n} phiên)`,
        meaning_vi: METRIC_DEFINITIONS.ma20.meaning_vi,
        excel_hint: METRIC_DEFINITIONS.ma20.excel_hint,
      });
    }

    // 12. ma50
    let ma50Val: number | null = null;
    if (n >= 50) {
      let sum = 0;
      for (let i = n - 50; i < n; i++) sum += prices[i];
      ma50Val = sum / 50;
      metrics.push({
        id: 'ma50',
        label_vi: METRIC_DEFINITIONS.ma50.label_vi,
        symbol,
        value: ma50Val,
        unit: 'currency',
        status: 'ok',
        polarity: 'neutral',
        formula_vi: METRIC_DEFINITIONS.ma50.formula_vi,
        inputs: ['close'],
        period: { from: dates[n - 50], to: dates[n - 1] },
        calc: [
          { label_vi: 'Số phiên lấy bình quân', value: 50, unit: 'phiên' },
          { label_vi: 'Giá trị MA50', value: ma50Val, unit: 'đ' },
        ],
        meaning_vi: METRIC_DEFINITIONS.ma50.meaning_vi,
        excel_hint: METRIC_DEFINITIONS.ma50.excel_hint,
      });
    } else {
      metrics.push({
        id: 'ma50',
        label_vi: METRIC_DEFINITIONS.ma50.label_vi,
        symbol,
        value: null,
        unit: 'currency',
        status: 'insufficient_data',
        polarity: 'neutral',
        formula_vi: METRIC_DEFINITIONS.ma50.formula_vi,
        inputs: [],
        reason_vi: `Chưa đủ dữ liệu (cần tối thiểu 50 phiên, hiện có ${n} phiên)`,
        meaning_vi: METRIC_DEFINITIONS.ma50.meaning_vi,
        excel_hint: METRIC_DEFINITIONS.ma50.excel_hint,
      });
    }

    // 13. ma_state
    if (ma20Val !== null && ma50Val !== null) {
      const stateText =
        ma20Val > ma50Val
          ? 'MA20 trên MA50'
          : ma20Val < ma50Val
          ? 'MA20 dưới MA50'
          : 'MA20 bằng MA50';
      metrics.push({
        id: 'ma_state',
        label_vi: METRIC_DEFINITIONS.ma_state.label_vi,
        symbol,
        value: null,
        text: stateText,
        unit: 'text',
        status: 'ok',
        polarity: 'neutral',
        formula_vi: METRIC_DEFINITIONS.ma_state.formula_vi,
        inputs: ['ma20', 'ma50'],
        calc: [
          { label_vi: 'MA20 phiên cuối', value: ma20Val, unit: 'đ' },
          { label_vi: 'MA50 phiên cuối', value: ma50Val, unit: 'đ' },
          { label_vi: 'Kết luận vị thế', value: stateText },
        ],
        meaning_vi: METRIC_DEFINITIONS.ma_state.meaning_vi,
        excel_hint: METRIC_DEFINITIONS.ma_state.excel_hint,
      });
    } else {
      metrics.push({
        id: 'ma_state',
        label_vi: METRIC_DEFINITIONS.ma_state.label_vi,
        symbol,
        value: null,
        text: 'Chưa đủ dữ liệu (cần 50 phiên)',
        unit: 'text',
        status: 'insufficient_data',
        polarity: 'neutral',
        formula_vi: METRIC_DEFINITIONS.ma_state.formula_vi,
        inputs: [],
        reason_vi: `Chưa đủ dữ liệu (cần tối thiểu 50 phiên để so sánh MA20 và MA50, hiện có ${n} phiên)`,
        meaning_vi: METRIC_DEFINITIONS.ma_state.meaning_vi,
        excel_hint: METRIC_DEFINITIONS.ma_state.excel_hint,
      });
    }

    // 14. rsi14
    const rsiResult = computeWilderRsi(prices, 14);
    if (rsiResult.lastRsi !== null) {
      metrics.push({
        id: 'rsi14',
        label_vi: METRIC_DEFINITIONS.rsi14.label_vi,
        symbol,
        value: rsiResult.lastRsi,
        unit: 'number',
        status: 'ok',
        polarity: 'neutral',
        formula_vi: METRIC_DEFINITIONS.rsi14.formula_vi,
        inputs: ['close'],
        period: { from: dates[0], to: dates[n - 1] },
        calc: [
          { label_vi: 'Chu kỳ RSI', value: 14, unit: 'phiên' },
          { label_vi: 'Giá trị RSI phiên cuối', value: rsiResult.lastRsi },
        ],
        meaning_vi: METRIC_DEFINITIONS.rsi14.meaning_vi,
        excel_hint: METRIC_DEFINITIONS.rsi14.excel_hint,
      });
    } else {
      metrics.push({
        id: 'rsi14',
        label_vi: METRIC_DEFINITIONS.rsi14.label_vi,
        symbol,
        value: null,
        unit: 'number',
        status: 'insufficient_data',
        polarity: 'neutral',
        formula_vi: METRIC_DEFINITIONS.rsi14.formula_vi,
        inputs: [],
        reason_vi: `Chưa đủ dữ liệu (cần tối thiểu 15 phiên, hiện có ${n} phiên)`,
        meaning_vi: METRIC_DEFINITIONS.rsi14.meaning_vi,
        excel_hint: METRIC_DEFINITIONS.rsi14.excel_hint,
      });
    }

    // 15. best_day
    if (returns.length >= 1) {
      let bestIdx = 0;
      let maxRet = returns[0];
      for (let i = 1; i < returns.length; i++) {
        if (returns[i] > maxRet) {
          maxRet = returns[i];
          bestIdx = i;
        }
      }
      // Return index i corresponds to price change between day i and day i+1
      const bestDate = dates[bestIdx + 1];
      metrics.push({
        id: 'best_day',
        label_vi: METRIC_DEFINITIONS.best_day.label_vi,
        symbol,
        value: maxRet,
        unit: 'ratio',
        status: 'ok',
        polarity: 'higher_better',
        formula_vi: METRIC_DEFINITIONS.best_day.formula_vi,
        inputs: ['daily_returns'],
        period: { from: dates[0], to: dates[n - 1] },
        calc: [
          { label_vi: 'Ngày diễn ra', value: formatDate(bestDate) },
          { label_vi: 'Giá phiên trước', value: prices[bestIdx], unit: 'đ' },
          { label_vi: 'Giá ngày tăng mạnh nhất', value: prices[bestIdx + 1], unit: 'đ' },
          { label_vi: 'Lợi suất ngày', value: maxRet, unit: 'ratio' },
        ],
        meaning_vi: METRIC_DEFINITIONS.best_day.meaning_vi,
        excel_hint: METRIC_DEFINITIONS.best_day.excel_hint,
      });
    } else {
      metrics.push({
        id: 'best_day',
        label_vi: METRIC_DEFINITIONS.best_day.label_vi,
        symbol,
        value: null,
        unit: 'ratio',
        status: 'insufficient_data',
        polarity: 'higher_better',
        formula_vi: METRIC_DEFINITIONS.best_day.formula_vi,
        inputs: [],
        reason_vi: 'Cần tối thiểu 2 phiên để xác định ngày tăng mạnh nhất',
        meaning_vi: METRIC_DEFINITIONS.best_day.meaning_vi,
        excel_hint: METRIC_DEFINITIONS.best_day.excel_hint,
      });
    }

    // 16. worst_day
    if (returns.length >= 1) {
      let worstIdx = 0;
      let minRet = returns[0];
      for (let i = 1; i < returns.length; i++) {
        if (returns[i] < minRet) {
          minRet = returns[i];
          worstIdx = i;
        }
      }
      const worstDate = dates[worstIdx + 1];
      metrics.push({
        id: 'worst_day',
        label_vi: METRIC_DEFINITIONS.worst_day.label_vi,
        symbol,
        value: minRet,
        unit: 'ratio',
        status: 'ok',
        polarity: 'lower_better',
        formula_vi: METRIC_DEFINITIONS.worst_day.formula_vi,
        inputs: ['daily_returns'],
        period: { from: dates[0], to: dates[n - 1] },
        calc: [
          { label_vi: 'Ngày diễn ra', value: formatDate(worstDate) },
          { label_vi: 'Giá phiên trước', value: prices[worstIdx], unit: 'đ' },
          { label_vi: 'Giá ngày giảm mạnh nhất', value: prices[worstIdx + 1], unit: 'đ' },
          { label_vi: 'Lợi suất ngày', value: minRet, unit: 'ratio' },
        ],
        meaning_vi: METRIC_DEFINITIONS.worst_day.meaning_vi,
        excel_hint: METRIC_DEFINITIONS.worst_day.excel_hint,
      });
    } else {
      metrics.push({
        id: 'worst_day',
        label_vi: METRIC_DEFINITIONS.worst_day.label_vi,
        symbol,
        value: null,
        unit: 'ratio',
        status: 'insufficient_data',
        polarity: 'lower_better',
        formula_vi: METRIC_DEFINITIONS.worst_day.formula_vi,
        inputs: [],
        reason_vi: 'Cần tối thiểu 2 phiên để xác định ngày giảm mạnh nhất',
        meaning_vi: METRIC_DEFINITIONS.worst_day.meaning_vi,
        excel_hint: METRIC_DEFINITIONS.worst_day.excel_hint,
      });
    }

    // 17. date_range
    const rangeText = `${formatDate(dates[0])} - ${formatDate(dates[n - 1])}`;
    metrics.push({
      id: 'date_range',
      label_vi: METRIC_DEFINITIONS.date_range.label_vi,
      symbol,
      value: null,
      text: rangeText,
      unit: 'text',
      status: 'ok',
      polarity: 'neutral',
      formula_vi: METRIC_DEFINITIONS.date_range.formula_vi,
      inputs: ['date'],
      calc: [
        { label_vi: 'Phiên đầu tiên', value: formatDate(dates[0]) },
        { label_vi: 'Phiên cuối cùng', value: formatDate(dates[n - 1]) },
        { label_vi: 'Khoảng thời gian', value: rangeText },
      ],
      meaning_vi: METRIC_DEFINITIONS.date_range.meaning_vi,
      excel_hint: METRIC_DEFINITIONS.date_range.excel_hint,
    });
  }

  // -------------------------------------------------------------
  // Multi-Symbol Metrics (symbol = null, Prompt P4/P5 Section 5.3 & A6)
  // Computed whenever 2 or more symbols are being analyzed together.
  // -------------------------------------------------------------
  if (config.symbols.length >= 2) {
    const symbolReturnsList: Array<{ symbol: string; ret: number | null }> = [];
    const symbolVolsList: Array<{ symbol: string; vol: number | null }> = [];
    const symbolDdList: Array<{ symbol: string; dd: number | null }> = [];
    const symbolVolumesList: Array<{ symbol: string; totalVol: number }> = [];

    // Collect individual metrics
    for (const s of config.symbols) {
      const pRet = metrics.find((m) => m.symbol === s && m.id === 'period_return')?.value ?? null;
      const aVol = metrics.find((m) => m.symbol === s && m.id === 'ann_vol')?.value ?? null;
      const mDd = metrics.find((m) => m.symbol === s && m.id === 'max_dd')?.value ?? null;
      symbolReturnsList.push({ symbol: s, ret: pRet });
      symbolVolsList.push({ symbol: s, vol: aVol });
      symbolDdList.push({ symbol: s, dd: mDd });

      const sSeries = seriesBySymbol.get(s);
      let sumVol = 0;
      if (sSeries) {
        for (let i = 0; i < sSeries.volume.length; i++) {
          const v = sSeries.volume[i];
          if (!isNaN(v) && isFinite(v)) sumVol += v;
        }
      }
      symbolVolumesList.push({ symbol: s, totalVol: sumVol });
    }

    // 1. symbol_returns (symbol = null)
    const validReturns = symbolReturnsList.filter((item) => item.ret !== null) as Array<{ symbol: string; ret: number }>;
    const returnsSummary = validReturns
      .map((item) => `${item.symbol} (${item.ret > 0 ? '+' : ''}${formatPercent(item.ret)})`)
      .join(', ');

    metrics.push({
      id: 'symbol_returns',
      label_vi: METRIC_DEFINITIONS.symbol_returns.label_vi,
      symbol: null,
      value: validReturns.length > 0 ? validReturns[0].ret : null,
      text: returnsSummary || 'Chưa đủ dữ liệu',
      unit: 'ratio',
      status: validReturns.length >= 2 ? 'ok' : 'insufficient_data',
      polarity: 'higher_better',
      formula_vi: METRIC_DEFINITIONS.symbol_returns.formula_vi,
      inputs: ['period_return'],
      calc: symbolReturnsList.map((item) => ({
        label_vi: `Lợi suất ${item.symbol}`,
        value: item.ret !== null ? item.ret : 'Chưa đủ dữ liệu',
        unit: 'ratio',
      })),
      meaning_vi: METRIC_DEFINITIONS.symbol_returns.meaning_vi,
      excel_hint: METRIC_DEFINITIONS.symbol_returns.excel_hint,
    });

    // 2. correlation (symbol = null)
    // Pre-build integer dateDays -> close maps ONCE per symbol (O(N) instead of O(S^2 * N))
    const priceMapBySymbol = new Map<string, Map<number, number>>();
    for (const s of config.symbols) {
      const sSeries = seriesBySymbol.get(s);
      const pMap = new Map<number, number>();
      if (sSeries) {
        const dArr = sSeries.dateDays;
        const cArr = sSeries.close;
        for (let idx = 0; idx < dArr.length; idx++) {
          pMap.set(dArr[idx], cArr[idx]);
        }
      }
      priceMapBySymbol.set(s, pMap);
    }

    const correlationCalc: Array<{ label_vi: string; value: number | string; unit?: string }> = [];
    let pairCount = 0;
    let sumCorrelation = 0;
    let anyPairSufficient = false;

    for (let i = 0; i < config.symbols.length; i++) {
      const sA = config.symbols[i];
      const mapA = priceMapBySymbol.get(sA);
      if (!mapA || mapA.size === 0) continue;

      for (let j = i + 1; j < config.symbols.length; j++) {
        const sB = config.symbols[j];
        const seriesB = seriesBySymbol.get(sB);
        if (!seriesB) continue;

        const commonPricesA: number[] = [];
        const commonPricesB: number[] = [];
        const dArrB = seriesB.dateDays;
        const cArrB = seriesB.close;

        for (let idx = 0; idx < dArrB.length; idx++) {
          const pA = mapA.get(dArrB[idx]);
          if (pA !== undefined) {
            commonPricesA.push(pA);
            commonPricesB.push(cArrB[idx]);
          }
        }

        // Daily returns on common dates
        if (commonPricesA.length >= 21) {
          const retA = computeDailyReturns(commonPricesA);
          const retB = computeDailyReturns(commonPricesB);
          const r = computeCorrelation(retA, retB);

          if (r !== null) {
            correlationCalc.push({
              label_vi: `${sA} - ${sB} (${commonPricesA.length} phiên chung)`,
              value: r,
              unit: 'number',
            });
            sumCorrelation += r;
            pairCount++;
            anyPairSufficient = true;
            continue;
          }
        }

        correlationCalc.push({
          label_vi: `${sA} - ${sB}`,
          value: `Chưa đủ dữ liệu (cần ≥ 20 phiên chung, hiện có ${commonPricesA.length} phiên)`,
        });
      }
    }

    const avgCorr = pairCount > 0 ? sumCorrelation / pairCount : null;
    metrics.push({
      id: 'correlation',
      label_vi: METRIC_DEFINITIONS.correlation.label_vi,
      symbol: null,
      value: avgCorr,
      unit: 'number',
      status: anyPairSufficient ? 'ok' : 'insufficient_data',
      polarity: 'neutral',
      formula_vi: METRIC_DEFINITIONS.correlation.formula_vi,
      inputs: ['daily_returns'],
      calc: correlationCalc,
      reason_vi: anyPairSufficient ? undefined : 'Chưa có cặp mã nào đủ 20 phiên giao dịch chung trong kỳ',
      meaning_vi: METRIC_DEFINITIONS.correlation.meaning_vi,
      excel_hint: METRIC_DEFINITIONS.correlation.excel_hint,
    });

    // 3. normalized_base (symbol = null)
    // Integer dateDays intersection & numeric sort (10x faster than string Set/sort)
    const firstMap = priceMapBySymbol.get(config.symbols[0]);
    const otherMaps = config.symbols.slice(1).map((s) => priceMapBySymbol.get(s)!);
    const commonDays: number[] = [];
    if (firstMap) {
      for (const day of firstMap.keys()) {
        let inAll = true;
        for (let mIdx = 0; mIdx < otherMaps.length; mIdx++) {
          if (!otherMaps[mIdx].has(day)) {
            inAll = false;
            break;
          }
        }
        if (inAll) commonDays.push(day);
      }
      commonDays.sort((a, b) => a - b);
    }

    if (commonDays.length >= 2) {
      const baseDay = commonDays[0];
      const endDay = commonDays[commonDays.length - 1];
      const baseDate = daysToIsoDate(baseDay);
      const endDate = daysToIsoDate(endDay);
      const normCalc: Array<{ label_vi: string; value: number | string; unit?: string }> = [
        { label_vi: 'Ngày gốc chuẩn hóa (mốc 100)', value: formatDate(baseDate) },
        { label_vi: 'Ngày kết thúc so sánh', value: formatDate(endDate) },
      ];

      for (const s of config.symbols) {
        const pMap = priceMapBySymbol.get(s)!;
        const baseClose = pMap.get(baseDay);
        const endClose = pMap.get(endDay);
        if (baseClose !== undefined && endClose !== undefined && baseClose > 0) {
          const normEnd = (endClose / baseClose) * 100;
          normCalc.push({
            label_vi: `Giá trị cuối mã ${s}`,
            value: normEnd,
            unit: 'number',
          });
        }
      }

      metrics.push({
        id: 'normalized_base',
        label_vi: METRIC_DEFINITIONS.normalized_base.label_vi,
        symbol: null,
        value: 100,
        text: `Mốc 100 tại ngày ${formatDate(baseDate)}`,
        unit: 'number',
        status: 'ok',
        polarity: 'higher_better',
        formula_vi: METRIC_DEFINITIONS.normalized_base.formula_vi,
        inputs: ['close'],
        calc: normCalc,
        meaning_vi: METRIC_DEFINITIONS.normalized_base.meaning_vi,
        excel_hint: METRIC_DEFINITIONS.normalized_base.excel_hint,
      });
    } else {
      metrics.push({
        id: 'normalized_base',
        label_vi: METRIC_DEFINITIONS.normalized_base.label_vi,
        symbol: null,
        value: null,
        unit: 'number',
        status: 'insufficient_data',
        polarity: 'higher_better',
        formula_vi: METRIC_DEFINITIONS.normalized_base.formula_vi,
        inputs: [],
        reason_vi: 'Không tìm thấy ngày giao dịch chung để làm mốc 100',
        meaning_vi: METRIC_DEFINITIONS.normalized_base.meaning_vi,
        excel_hint: METRIC_DEFINITIONS.normalized_base.excel_hint,
      });
    }

    // 4. volume_share (symbol = null, calculated strictly by trading volume)
    const grandTotalVolume = symbolVolumesList.reduce((acc, item) => acc + item.totalVol, 0);
    const volShareCalc: Array<{ label_vi: string; value: number | string; unit?: string }> = [
      { label_vi: 'Tổng khối lượng toàn danh mục', value: grandTotalVolume, unit: 'CP' },
    ];

    for (const item of symbolVolumesList) {
      const share = grandTotalVolume > 0 ? item.totalVol / grandTotalVolume : 0;
      volShareCalc.push({
        label_vi: `Tỷ trọng ${item.symbol} (theo khối lượng)`,
        value: share,
        unit: 'ratio',
      });
    }

    metrics.push({
      id: 'volume_share',
      label_vi: METRIC_DEFINITIONS.volume_share.label_vi,
      symbol: null,
      value: grandTotalVolume > 0 ? 1.0 : null,
      unit: 'ratio',
      status: grandTotalVolume > 0 ? 'ok' : 'insufficient_data',
      polarity: 'neutral',
      formula_vi: METRIC_DEFINITIONS.volume_share.formula_vi,
      inputs: ['volume'],
      calc: volShareCalc,
      meaning_vi: METRIC_DEFINITIONS.volume_share.meaning_vi,
      excel_hint: METRIC_DEFINITIONS.volume_share.excel_hint,
    });

    // 5. risk_return (symbol = null)
    const riskReturnCalc: Array<{ label_vi: string; value: string }> = [];
    for (const s of config.symbols) {
      const rObj = symbolReturnsList.find((i) => i.symbol === s);
      const vObj = symbolVolsList.find((i) => i.symbol === s);
      const rText = rObj?.ret !== null && rObj?.ret !== undefined ? formatPercent(rObj.ret) : 'N/A';
      const vText = vObj?.vol !== null && vObj?.vol !== undefined ? formatPercent(vObj.vol) : 'N/A';
      riskReturnCalc.push({
        label_vi: `${s} (Biến động / Lợi suất)`,
        value: `${vText} / ${rText}`,
      });
    }

    metrics.push({
      id: 'risk_return',
      label_vi: METRIC_DEFINITIONS.risk_return.label_vi,
      symbol: null,
      value: null,
      unit: 'ratio',
      status: 'ok',
      polarity: 'higher_better',
      formula_vi: METRIC_DEFINITIONS.risk_return.formula_vi,
      inputs: ['ann_vol', 'period_return'],
      calc: riskReturnCalc,
      meaning_vi: METRIC_DEFINITIONS.risk_return.meaning_vi,
      excel_hint: METRIC_DEFINITIONS.risk_return.excel_hint,
    });

    // Supplementary metrics: top_performer, highest_volatility, lowest_drawdown
    if (validReturns.length > 0) {
      const sortedByReturn = [...validReturns].sort((a, b) => b.ret - a.ret);
      const topP = sortedByReturn[0];
      metrics.push({
        id: 'top_performer',
        label_vi: METRIC_DEFINITIONS.top_performer.label_vi,
        symbol: null,
        value: topP.ret,
        text: `${topP.symbol} (${topP.ret > 0 ? '+' : ''}${formatPercent(topP.ret)})`,
        unit: 'text',
        status: 'ok',
        polarity: 'higher_better',
        formula_vi: METRIC_DEFINITIONS.top_performer.formula_vi,
        inputs: ['period_return'],
        calc: [{ label_vi: 'Mã tăng trưởng mạnh nhất', value: `${topP.symbol} (+${formatPercent(topP.ret)})` }],
        meaning_vi: METRIC_DEFINITIONS.top_performer.meaning_vi,
        excel_hint: METRIC_DEFINITIONS.top_performer.excel_hint,
      });
    }

    const validVols = symbolVolsList.filter((i) => i.vol !== null) as Array<{ symbol: string; vol: number }>;
    if (validVols.length > 0) {
      const sortedByVol = [...validVols].sort((a, b) => b.vol - a.vol);
      const topVol = sortedByVol[0];
      metrics.push({
        id: 'highest_volatility',
        label_vi: METRIC_DEFINITIONS.highest_volatility.label_vi,
        symbol: null,
        value: topVol.vol,
        text: `${topVol.symbol} (${formatPercent(topVol.vol)})`,
        unit: 'text',
        status: 'ok',
        polarity: 'lower_better',
        formula_vi: METRIC_DEFINITIONS.highest_volatility.formula_vi,
        inputs: ['ann_vol'],
        calc: [{ label_vi: 'Mã có biến động năm hóa cao nhất', value: `${topVol.symbol} (${formatPercent(topVol.vol)})` }],
        meaning_vi: METRIC_DEFINITIONS.highest_volatility.meaning_vi,
        excel_hint: METRIC_DEFINITIONS.highest_volatility.excel_hint,
      });
    }

    const validDds = symbolDdList.filter((i) => i.dd !== null) as Array<{ symbol: string; dd: number }>;
    if (validDds.length > 0) {
      // Least negative drawdown is best
      const sortedByDd = [...validDds].sort((a, b) => b.dd - a.dd);
      const safeDd = sortedByDd[0];
      metrics.push({
        id: 'lowest_drawdown',
        label_vi: METRIC_DEFINITIONS.lowest_drawdown.label_vi,
        symbol: null,
        value: safeDd.dd,
        text: `${safeDd.symbol} (${formatPercent(safeDd.dd)})`,
        unit: 'text',
        status: 'ok',
        polarity: 'higher_better',
        formula_vi: METRIC_DEFINITIONS.lowest_drawdown.formula_vi,
        inputs: ['max_dd'],
        calc: [{ label_vi: 'Mã có mức sụt giảm tối đa nhẹ nhất', value: `${safeDd.symbol} (${formatPercent(safeDd.dd)})` }],
        meaning_vi: METRIC_DEFINITIONS.lowest_drawdown.meaning_vi,
        excel_hint: METRIC_DEFINITIONS.lowest_drawdown.excel_hint,
      });
    }
  }

  return { metrics, warnings };
}

/**
 * Returns a flat list of all computed Metric entities conforming strictly to the contract.
 */
export function toMetricList(result: { metrics: Metric[] }): Metric[] {
  return result.metrics;
}
