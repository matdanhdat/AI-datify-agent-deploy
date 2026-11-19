/**
 * Quantitative Chart Specifications Generator.
 * Generates all 12 Excel-standard chart specs with full raw data tables.
 * Optimized for high-throughput multi-symbol datasets (pre-extracted series,
 * cached per-symbol formatted columns, integer date keys, symmetric correlation).
 * Pure TypeScript - zero external dependencies. Zero AI calls.
 */

import type { CleanArtifact, ChartSpec, AnalysisConfig, Metric } from '../schemas';
import { chartKey } from './metricSpec';
import {
  computeDailyReturns,
  computeMaxDrawdown,
  computeSma,
  computeFreedmanDiaconisHistogram,
  computeCorrelation,
} from './math';
import { formatDate, formatNumber, formatPercent } from '../../utils/format';
import {
  extractSymbolSeries,
  daysToIsoDate,
  type SymbolSeries,
} from './calculator';

export function generateCharts(
  cleanArtifact: CleanArtifact,
  config: AnalysisConfig,
  metrics: Metric[],
  preExtractedSeries?: Map<string, SymbolSeries>,
  onSymbolProgress?: (completed: number, total: number, symbol: string) => void
): ChartSpec[] {
  const charts: ChartSpec[] = [];
  if (!preExtractedSeries && !cleanArtifact.dataset) return charts;

  // 1. Reuse pre-extracted series or extract in a single O(N) pass
  const symbolDataMap = preExtractedSeries || extractSymbolSeries(cleanArtifact, config).seriesBySymbol;

  // Pre-index metrics for O(1) lookup
  const metricLookup = new Map<string, Metric>();
  for (let i = 0; i < metrics.length; i++) {
    const m = metrics[i];
    metricLookup.set(`${m.id}::${m.symbol ?? ''}`, m);
  }

  // 2. Generate per-symbol charts (Charts 1-7)
  const totalSymbols = config.symbols.length;
  for (let symIdx = 0; symIdx < totalSymbols; symIdx++) {
    const symbol = config.symbols[symIdx];
    if (onSymbolProgress) {
      onSymbolProgress(symIdx, totalSymbols, symbol);
    }

    const sData = symbolDataMap.get(symbol);
    const n = sData ? sData.close.length : 0;

    if (!sData || n === 0) {
      charts.push({
        id: chartKey('chart_price_ma', symbol),
        title_vi: `Đường giá & Trung bình động (${symbol})`,
        kind: 'line',
        symbols: [symbol],
        data: {},
        table: { columns: ['Ngày', 'Giá đóng cửa', 'MA20', 'MA50'], rows: [] },
        empty_reason_vi: `Không có dữ liệu cho mã ${symbol} trong kỳ được chọn.`,
      });
      continue;
    }

    // Precompute formatted columns ONCE per symbol (reused across Charts 1, 2, 5, 6)
    const formattedDates: string[] = new Array(n);
    const formattedClose: string[] = new Array(n);
    const formattedVolume: string[] = new Array(n);
    for (let i = 0; i < n; i++) {
      formattedDates[i] = formatDate(sData.dates[i]);
      formattedClose[i] = formatNumber(sData.close[i]);
      formattedVolume[i] = formatNumber(sData.volume[i], 0);
    }

    const ma20Series = computeSma(sData.close, 20);
    const ma50Series = computeSma(sData.close, 50);

    // Chart 1: chart_price_ma
    const priceMaRows: any[][] = new Array(n);
    for (let i = 0; i < n; i++) {
      const m20 = ma20Series[i];
      const m50 = ma50Series[i];
      priceMaRows[i] = [
        formattedDates[i],
        formattedClose[i],
        m20 !== null ? formatNumber(m20) : '-',
        m50 !== null ? formatNumber(m50) : '-',
      ];
    }

    charts.push({
      id: chartKey('chart_price_ma', symbol),
      title_vi: `Đường giá & Trung bình động (${symbol})`,
      subtitle_vi: 'Giá đóng cửa kết hợp đường MA20 và MA50',
      kind: 'line',
      symbols: [symbol],
      data: {
        dates: sData.dates,
        close: sData.close,
        ma20: ma20Series,
        ma50: ma50Series,
      },
      table: {
        columns: ['Ngày', 'Giá đóng cửa', 'MA20', 'MA50'],
        rows: priceMaRows,
      },
      aria_vi: `Biểu đồ đường giá đóng cửa, MA20 và MA50 của mã ${symbol} qua ${n} phiên giao dịch.`,
    });

    // Chart 2: chart_candle_volume
    const candleRows: any[][] = new Array(n);
    const ohlcData: number[][] = new Array(n);
    for (let i = 0; i < n; i++) {
      // ECharts candlestick format: [open, close, lowest, highest]
      ohlcData[i] = [sData.open[i], sData.close[i], sData.low[i], sData.high[i]];
      candleRows[i] = [
        formattedDates[i],
        formatNumber(sData.open[i]),
        formatNumber(sData.high[i]),
        formatNumber(sData.low[i]),
        formattedClose[i],
        formattedVolume[i],
      ];
    }

    charts.push({
      id: chartKey('chart_candle_volume', symbol),
      title_vi: `Biểu đồ Nến & Khối lượng (${symbol})`,
      subtitle_vi: 'Biểu đồ nến Nhật kèm thanh khối lượng giao dịch bên dưới',
      kind: 'candlestick_volume',
      symbols: [symbol],
      data: {
        dates: sData.dates,
        ohlc: ohlcData,
        volume: sData.volume,
      },
      table: {
        columns: ['Ngày', 'Mở cửa', 'Cao nhất', 'Thấp nhất', 'Đóng cửa', 'Khối lượng'],
        rows: candleRows,
      },
      aria_vi: `Biểu đồ nến Nhật kèm khối lượng của mã ${symbol} qua ${n} phiên giao dịch.`,
    });

    // Chart 3: chart_monthly_returns
    const monthMap = new Map<string, { firstClose: number; lastClose: number }>();
    for (let i = 0; i < n; i++) {
      const mKey = sData.dates[i].slice(0, 7); // 'YYYY-MM'
      const c = sData.close[i];
      const entry = monthMap.get(mKey);
      if (!entry) {
        monthMap.set(mKey, { firstClose: c, lastClose: c });
      } else {
        entry.lastClose = c;
      }
    }

    const months: string[] = [];
    const monthlyReturns: number[] = [];
    const monthlyRows: any[][] = [];
    for (const [mKey, closes] of monthMap.entries()) {
      const ret = closes.firstClose > 0 ? closes.lastClose / closes.firstClose - 1 : 0;
      const label = `${mKey.slice(5, 7)}/${mKey.slice(0, 4)}`;
      months.push(label);
      monthlyReturns.push(ret);
      monthlyRows.push([label, formatPercent(ret)]);
    }

    charts.push({
      id: chartKey('chart_monthly_returns', symbol),
      title_vi: `Lợi suất theo Tháng (${symbol})`,
      subtitle_vi: 'Hiệu suất giá biến động theo từng tháng dương lịch',
      kind: 'column',
      symbols: [symbol],
      data: {
        categories: months,
        values: monthlyReturns,
      },
      table: {
        columns: ['Tháng', 'Lợi suất'],
        rows: monthlyRows,
      },
      aria_vi: `Biểu đồ cột lợi suất theo tháng của mã ${symbol}.`,
    });

    // Chart 4: chart_return_hist
    const returns = computeDailyReturns(sData.close);
    const histResult = computeFreedmanDiaconisHistogram(returns);
    const histBins: string[] = new Array(histResult.counts.length);
    const histRows: any[][] = new Array(histResult.counts.length);
    for (let i = 0; i < histResult.counts.length; i++) {
      const left = histResult.edges[i];
      const right = histResult.edges[i + 1];
      const binLabel = `${formatPercent(left, 1)} .. ${formatPercent(right, 1)}`;
      histBins[i] = binLabel;
      histRows[i] = [binLabel, histResult.counts[i]];
    }

    charts.push({
      id: chartKey('chart_return_hist', symbol),
      title_vi: `Phân phối Lợi suất Ngày (${symbol})`,
      subtitle_vi: 'Biểu đồ tần suất lợi suất ngày (chia đôi tại mốc 0%)',
      kind: 'histogram',
      symbols: [symbol],
      data: {
        categories: histBins,
        values: histResult.counts,
        edges: histResult.edges,
      },
      table: {
        columns: ['Khoảng lợi suất', 'Số phiên'],
        rows: histRows,
      },
      aria_vi: `Biểu đồ phân phối lợi suất ngày của mã ${symbol} với ${returns.length} phiên.`,
    });

    // Chart 5: chart_drawdown
    const ddResult = computeMaxDrawdown(sData.close);
    const ddSeriesArray = Array.from(ddResult.drawdownSeries);
    const ddRows: any[][] = new Array(n);
    for (let i = 0; i < n; i++) {
      ddRows[i] = [formattedDates[i], formatPercent(ddSeriesArray[i])];
    }

    charts.push({
      id: chartKey('chart_drawdown', symbol),
      title_vi: `Biểu đồ Sụt giảm Tối đa - Drawdown (${symbol})`,
      subtitle_vi: 'Mức sụt giảm từ đỉnh giá tích lũy theo thời gian',
      kind: 'area',
      symbols: [symbol],
      data: {
        dates: sData.dates,
        drawdown: ddSeriesArray,
        maxDrawdown: ddResult.maxDrawdown,
      },
      table: {
        columns: ['Ngày', 'Mức sụt giảm'],
        rows: ddRows,
      },
      aria_vi: `Biểu đồ diện tích mức sụt giảm giá của mã ${symbol}. Sụt giảm sâu nhất: ${formatPercent(ddResult.maxDrawdown)}.`,
    });

    // Chart 6: chart_volume_combo
    const volMa20 = computeSma(sData.volume, 20);
    const volComboRows: any[][] = new Array(n);
    for (let i = 0; i < n; i++) {
      const vm = volMa20[i];
      volComboRows[i] = [
        formattedDates[i],
        formattedVolume[i],
        vm !== null ? formatNumber(vm, 0) : '-',
      ];
    }

    charts.push({
      id: chartKey('chart_volume_combo', symbol),
      title_vi: `Khối lượng & Trung bình 20 phiên (${symbol})`,
      subtitle_vi: 'Thanh khối lượng kết hợp đường trung bình khối lượng 20 phiên',
      kind: 'combo',
      symbols: [symbol],
      data: {
        dates: sData.dates,
        volume: sData.volume,
        volumeMa20: volMa20,
      },
      table: {
        columns: ['Ngày', 'Khối lượng', 'TB 20 phiên'],
        rows: volComboRows,
      },
      aria_vi: `Biểu đồ kết hợp khối lượng giao dịch và MA20 khối lượng của ${symbol}.`,
    });

    // Chart 7: chart_top_days
    interface DayReturn {
      date: string;
      ret: number;
    }
    const dayReturns: DayReturn[] = new Array(returns.length);
    for (let i = 0; i < returns.length; i++) {
      dayReturns[i] = { date: sData.dates[i + 1], ret: returns[i] };
    }

    dayReturns.sort((a, b) => b.ret - a.ret);
    const topGains = dayReturns.slice(0, 5);
    const topLosses = dayReturns.slice(-5).reverse();

    const topDaysLabels: string[] = [];
    const topDaysValues: number[] = [];
    const topDaysRows: any[][] = [];

    for (const g of topGains) {
      const fmtDate = formatDate(g.date);
      topDaysLabels.push(`+ ${fmtDate}`);
      topDaysValues.push(g.ret);
      topDaysRows.push([fmtDate, 'Tăng mạnh', formatPercent(g.ret)]);
    }
    for (const l of topLosses) {
      const fmtDate = formatDate(l.date);
      topDaysLabels.push(`- ${fmtDate}`);
      topDaysValues.push(l.ret);
      topDaysRows.push([fmtDate, 'Giảm mạnh', formatPercent(l.ret)]);
    }

    charts.push({
      id: chartKey('chart_top_days', symbol),
      title_vi: `Top 5 Phiên Tăng & Giảm Mạnh Nhất (${symbol})`,
      subtitle_vi: '5 phiên sinh lời cao nhất và 5 phiên thua lỗ sâu nhất',
      kind: 'bar',
      symbols: [symbol],
      data: {
        categories: topDaysLabels,
        values: topDaysValues,
      },
      table: {
        columns: ['Ngày', 'Loại', 'Lợi suất'],
        rows: topDaysRows,
      },
      aria_vi: `Biểu đồ top phiên tăng và giảm mạnh nhất của mã ${symbol}.`,
    });
  }

  // 3. Multi-Symbol Charts (Charts 8-12) when >= 2 symbols
  if (config.symbols.length >= 2) {
    // Build integer dateDays -> close maps ONCE per symbol
    const priceMapBySymbol = new Map<string, Map<number, number>>();
    for (const s of config.symbols) {
      const sData = symbolDataMap.get(s);
      const pMap = new Map<number, number>();
      if (sData) {
        const dArr = sData.dateDays;
        const cArr = sData.close;
        for (let i = 0; i < dArr.length; i++) {
          pMap.set(dArr[i], cArr[i]);
        }
      }
      priceMapBySymbol.set(s, pMap);
    }

    // Fast integer intersection for common dates
    const firstMap = priceMapBySymbol.get(config.symbols[0])!;
    const otherMaps = config.symbols.slice(1).map((s) => priceMapBySymbol.get(s)!);
    const commonDays: number[] = [];
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

    const commonDates: string[] = new Array(commonDays.length);
    const commonFormattedDates: string[] = new Array(commonDays.length);
    for (let i = 0; i < commonDays.length; i++) {
      const iso = daysToIsoDate(commonDays[i]);
      commonDates[i] = iso;
      commonFormattedDates[i] = formatDate(iso);
    }

    // Chart 8: chart_normalized (base 100 on common start date)
    if (commonDays.length >= 2) {
      const normSeries: Record<string, number[]> = {};
      const cLen = commonDays.length;

      for (const s of config.symbols) {
        const pMap = priceMapBySymbol.get(s)!;
        const basePrice = pMap.get(commonDays[0]) || 1;
        const invBase = 100 / basePrice;
        const arr = new Array<number>(cLen);
        for (let i = 0; i < cLen; i++) {
          arr[i] = (pMap.get(commonDays[i]) || basePrice) * invBase;
        }
        normSeries[s] = arr;
      }

      const normTableRows: any[][] = new Array(cLen);
      for (let i = 0; i < cLen; i++) {
        const row: any[] = new Array(config.symbols.length + 1);
        row[0] = commonFormattedDates[i];
        for (let sIdx = 0; sIdx < config.symbols.length; sIdx++) {
          row[sIdx + 1] = formatNumber(normSeries[config.symbols[sIdx]][i], 2);
        }
        normTableRows[i] = row;
      }

      charts.push({
        id: 'chart_normalized',
        title_vi: 'So sánh Tăng trưởng Chuẩn hóa (Gốc 100)',
        subtitle_vi: `Chuẩn hóa giá về mốc 100 tại ngày bắt đầu chung ${commonFormattedDates[0]}`,
        kind: 'line',
        symbols: config.symbols,
        data: {
          dates: commonDates,
          series: normSeries,
        },
        table: {
          columns: ['Ngày', ...config.symbols],
          rows: normTableRows,
        },
        aria_vi: `Biểu đồ so sánh tăng trưởng chuẩn hóa gốc 100 cho ${config.symbols.join(', ')}.`,
      });
    }

    // Chart 9: chart_symbol_returns
    const symRetList: { symbol: string; ret: number }[] = [];
    const symRetRows: any[][] = [];
    for (const s of config.symbols) {
      const m = metricLookup.get(`period_return::${s}`);
      const val = m?.value ?? 0;
      symRetList.push({ symbol: s, ret: val });
      symRetRows.push([s, formatPercent(val)]);
    }

    charts.push({
      id: 'chart_symbol_returns',
      title_vi: 'So sánh Lợi suất Cả kỳ Giữa các Mã',
      subtitle_vi: 'Tỷ lệ sinh lời trong kỳ phân tích của từng cổ phiếu',
      kind: 'bar',
      symbols: config.symbols,
      data: {
        categories: symRetList.map((x) => x.symbol),
        values: symRetList.map((x) => x.ret),
      },
      table: {
        columns: ['Mã', 'Lợi suất cả kỳ'],
        rows: symRetRows,
      },
      aria_vi: `Biểu đồ so sánh lợi suất cả kỳ giữa các mã ${config.symbols.join(', ')}.`,
    });

    // Chart 10: chart_risk_return
    const scatterPoints: { symbol: string; vol: number; ret: number }[] = [];
    const scatterRows: any[][] = [];
    for (const s of config.symbols) {
      const volM = metricLookup.get(`ann_vol::${s}`);
      const retM = metricLookup.get(`period_return::${s}`);
      const volVal = volM?.value ?? 0;
      const retVal = retM?.value ?? 0;
      scatterPoints.push({ symbol: s, vol: volVal, ret: retVal });
      scatterRows.push([s, formatPercent(volVal), formatPercent(retVal)]);
    }

    charts.push({
      id: 'chart_risk_return',
      title_vi: 'Tương quan Rủi ro & Lợi nhuận (Risk / Return)',
      subtitle_vi: 'Trục hoành: Biến động năm hóa | Trục tung: Lợi suất cả kỳ',
      kind: 'scatter',
      symbols: config.symbols,
      data: {
        points: scatterPoints,
      },
      table: {
        columns: ['Mã', 'Biến động năm hóa (Rủi ro)', 'Lợi suất cả kỳ (Lợi nhuận)'],
        rows: scatterRows,
      },
      aria_vi: `Biểu đồ phân tán rủi ro và lợi nhuận của các mã ${config.symbols.join(', ')}.`,
    });

    // Chart 11: chart_trade_share
    let totalAllVolume = 0;
    const volPerSymbol: { symbol: string; volume: number }[] = [];
    for (const s of config.symbols) {
      const sData = symbolDataMap.get(s);
      let sumVol = 0;
      if (sData) {
        const vArr = sData.volume;
        for (let i = 0; i < vArr.length; i++) {
          const v = vArr[i];
          if (!isNaN(v)) sumVol += v;
        }
      }
      volPerSymbol.push({ symbol: s, volume: sumVol });
      totalAllVolume += sumVol;
    }

    const shareRows: any[][] = [];
    const shareData = volPerSymbol.map((item) => {
      const share = totalAllVolume > 0 ? item.volume / totalAllVolume : 0;
      shareRows.push([item.symbol, formatNumber(item.volume, 0), formatPercent(share)]);
      return {
        name: item.symbol,
        value: item.volume,
        share,
      };
    });

    charts.push({
      id: 'chart_trade_share',
      title_vi: 'Cơ cấu Khối lượng Giao dịch (Tỷ trọng)',
      subtitle_vi: 'Tỷ trọng đóng góp vào tổng thanh khoản của các mã trong danh mục',
      kind: 'pie',
      symbols: config.symbols,
      data: {
        series: shareData,
      },
      table: {
        columns: ['Mã', 'Tổng khối lượng', 'Tỷ trọng'],
        rows: shareRows,
      },
      aria_vi: `Biểu đồ tròn cơ cấu thanh khoản giữa các mã ${config.symbols.join(', ')}.`,
    });

    // Chart 12: chart_correlation (precomputed aligned returns + symmetric upper triangle)
    const numSyms = config.symbols.length;
    const alignedReturnsByIdx: Float64Array[] = new Array(numSyms);
    if (commonDays.length >= 20) {
      for (let sIdx = 0; sIdx < numSyms; sIdx++) {
        const pMap = priceMapBySymbol.get(config.symbols[sIdx])!;
        const prices = new Float64Array(commonDays.length);
        for (let i = 0; i < commonDays.length; i++) {
          prices[i] = pMap.get(commonDays[i]) ?? NaN;
        }
        alignedReturnsByIdx[sIdx] = computeDailyReturns(prices);
      }
    }

    const corrMatrix: (number | null)[][] = Array.from({ length: numSyms }, () => new Array(numSyms).fill(null));
    for (let r = 0; r < numSyms; r++) {
      corrMatrix[r][r] = 1.0;
      for (let c = r + 1; c < numSyms; c++) {
        const corr =
          commonDays.length >= 20
            ? computeCorrelation(alignedReturnsByIdx[r], alignedReturnsByIdx[c])
            : null;
        corrMatrix[r][c] = corr;
        corrMatrix[c][r] = corr;
      }
    }

    const corrRows: any[][] = new Array(numSyms);
    for (let r = 0; r < numSyms; r++) {
      const rowDisplay: any[] = new Array(numSyms + 1);
      rowDisplay[0] = config.symbols[r];
      for (let c = 0; c < numSyms; c++) {
        if (r === c) {
          rowDisplay[c + 1] = '1,00';
        } else {
          const val = corrMatrix[r][c];
          rowDisplay[c + 1] = val !== null ? formatNumber(val, 2) : '-';
        }
      }
      corrRows[r] = rowDisplay;
    }

    charts.push({
      id: 'chart_correlation',
      title_vi: 'Ma trận Hệ số Tương quan Giá (Correlation)',
      subtitle_vi: 'Hệ số tương quan Pearson giữa chuỗi lợi suất ngày của các cặp mã',
      kind: 'heatmap',
      symbols: config.symbols,
      data: {
        symbols: config.symbols,
        matrix: corrMatrix,
        commonDatesCount: commonDays.length,
      },
      table: {
        columns: ['Mã', ...config.symbols],
        rows: corrRows,
      },
      aria_vi: `Ma trận hệ số tương quan lợi suất ngày giữa các mã ${config.symbols.join(', ')}.`,
    });
  }

  return charts;
}
