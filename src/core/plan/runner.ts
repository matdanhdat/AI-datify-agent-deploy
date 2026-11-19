/**
 * Plan Execution Engine (Prompt P6 Section 8 & 9)
 * Pure execution runner for custom plans.
 * ZERO eval, ZERO dynamic code execution.
 * Only executes whitelisted operations in src/core/plan/ops/.
 */

import type { CleanDataset, Plan, PlanResult, PlanTable, ChartSpec } from '../schemas';
import { datasetToFrame, type Frame } from './frame';
import {
  filterSymbols,
  filterDateRange,
  resampleOhlcv,
  pctChange,
  cumulativeReturn,
  rollingMean,
  rollingVolatility,
  normalizeBase100,
  drawdown,
  correlation,
  rankTopN,
  comparePeriods,
  groupAggregate,
} from './ops';
import { formatStepText, derivePlanTitle } from './validate';

export function runPlan(
  plan: Plan,
  dataset: CleanDataset,
  onProgress?: (progressPct: number, stepText: string) => void
): PlanResult {
  const planId = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const stepsText: string[] = [];

  let currentFrame: Frame = datasetToFrame(dataset);
  const totalSteps = plan.steps.length;

  let terminalResult: {
    type: 'rank' | 'compare' | 'correlation' | 'aggregate' | 'frame';
    data: any;
  } = { type: 'frame', data: null };

  for (let idx = 0; idx < totalSteps; idx++) {
    const step = plan.steps[idx];
    const stepDesc = formatStepText(step, idx);
    stepsText.push(stepDesc);

    if (onProgress) {
      const pct = Math.round(((idx + 1) / totalSteps) * 100);
      onProgress(pct, stepDesc);
    }

    switch (step.op) {
      case 'filter_symbols': {
        currentFrame = filterSymbols(currentFrame, step.params.symbols || step.params || []);
        break;
      }
      case 'filter_date_range': {
        currentFrame = filterDateRange(currentFrame, step.params as any);
        break;
      }
      case 'resample_ohlcv': {
        currentFrame = resampleOhlcv(currentFrame, step.params as any);
        break;
      }
      case 'pct_change': {
        currentFrame = pctChange(currentFrame, step.params as any);
        break;
      }
      case 'cumulative_return': {
        currentFrame = cumulativeReturn(currentFrame);
        terminalResult = { type: 'frame', data: 'cumulative_return' };
        break;
      }
      case 'rolling_mean': {
        currentFrame = rollingMean(currentFrame, step.params as any);
        terminalResult = { type: 'frame', data: 'rolling_mean' };
        break;
      }
      case 'rolling_volatility': {
        currentFrame = rollingVolatility(currentFrame, step.params as any);
        terminalResult = { type: 'frame', data: 'rolling_volatility' };
        break;
      }
      case 'normalize_base100': {
        currentFrame = normalizeBase100(currentFrame);
        terminalResult = { type: 'frame', data: 'normalize_base100' };
        break;
      }
      case 'drawdown': {
        currentFrame = drawdown(currentFrame);
        terminalResult = { type: 'frame', data: 'drawdown' };
        break;
      }
      case 'correlation': {
        const corrRes = correlation(currentFrame);
        terminalResult = { type: 'correlation', data: corrRes };
        break;
      }
      case 'rank_top_n': {
        const ranked = rankTopN(currentFrame, step.params as any);
        terminalResult = { type: 'rank', data: ranked };
        break;
      }
      case 'compare_periods': {
        const comp = comparePeriods(currentFrame, step.params as any);
        terminalResult = { type: 'compare', data: comp };
        break;
      }
      case 'group_aggregate': {
        const agg = groupAggregate(currentFrame, step.params as any);
        terminalResult = { type: 'aggregate', data: { items: agg, params: step.params } };
        break;
      }
    }
  }

  // Construct Tables, Charts, and Summary Lines based on terminal result
  const tables: PlanTable[] = [];
  const charts: ChartSpec[] = [];
  const summary_lines: string[] = [];

  if (terminalResult.type === 'rank') {
    const items = terminalResult.data as Array<{ rank: number; symbol: string; metric: string; value: number; formatted: string }>;
    const columns = ['Hạng', 'Mã CP', 'Chỉ số', 'Giá trị'];
    const rows = items.map((it) => [it.rank, it.symbol, it.metric, it.formatted]);

    tables.push({
      id: `${planId}_tbl_rank`,
      title_vi: 'Bảng xếp hạng cổ phiếu theo tiêu chí',
      columns,
      rows,
    });

    charts.push({
      id: `${planId}_chart_rank`,
      kind: 'bar',
      title_vi: 'Biểu đồ xếp hạng cổ phiếu',
      subtitle_vi: 'Theo tiêu chí phân tích đã chọn',
      symbols: items.map((it) => it.symbol),
      data: {
        categories: items.map((it) => it.symbol),
        values: items.map((it) => it.value),
      },
      table: {
        columns: ['Mã CP', 'Giá trị'],
        rows: items.map((it) => [it.symbol, it.formatted]),
      },
    });

    if (items.length > 0) {
      const top1 = items[0];
      const summaryText = items.length > 1
        ? `Mã ${top1.symbol} dẫn đầu bảng xếp hạng với ${top1.formatted}, tiếp theo là ${items[1].symbol} với ${items[1].formatted}.`
        : `Mã ${top1.symbol} dẫn đầu bảng xếp hạng với giá trị ${top1.formatted}.`;
      summary_lines.push(summaryText);
    }
  } else if (terminalResult.type === 'compare') {
    const items = (terminalResult.data || []) as Array<{
      symbol: string;
      metric: string;
      val_a: number;
      val_b: number;
      delta: number;
      formatted_a: string;
      formatted_b: string;
      formatted_delta: string;
    }>;

    const columns = ['Mã CP', 'Chỉ số', 'Kỳ A', 'Kỳ B', 'Thay đổi'];
    const rows = items.map((it) => [it.symbol, it.metric, it.formatted_a, it.formatted_b, it.formatted_delta]);

    tables.push({
      id: `${planId}_tbl_compare`,
      title_vi: 'Bảng đối chiếu hiệu suất giữa hai kỳ',
      columns,
      rows,
    });

    const retItems = items.filter((it) => it.metric === 'period_return');
    charts.push({
      id: `${planId}_chart_compare`,
      kind: 'column',
      title_vi: 'So sánh lợi suất giữa hai kỳ',
      symbols: retItems.map((it) => it.symbol),
      data: {
        categories: retItems.map((it) => it.symbol),
        period_a: retItems.map((it) => Number((it.val_a * 100).toFixed(2))),
        period_b: retItems.map((it) => Number((it.val_b * 100).toFixed(2))),
      },
      table: {
        columns: ['Mã CP', 'Kỳ A', 'Kỳ B', 'Thay đổi'],
        rows: retItems.map((it) => [it.symbol, it.formatted_a, it.formatted_b, it.formatted_delta]),
      },
    });

    const improved = retItems.filter((it) => it.delta > 0).length;
    summary_lines.push(
      `Trong kỳ B so với kỳ A, có ${improved}/${retItems.length || items.length} mã cổ phiếu ghi nhận mức tăng trưởng lợi suất cải thiện tích cực.`
    );
  } else if (terminalResult.type === 'correlation') {
    const corr = terminalResult.data;
    const columns = ['Mã CP', ...corr.symbols];
    const rows: (string | number)[][] = [];

    for (let r = 0; r < corr.symbols.length; r++) {
      const sA = corr.symbols[r];
      const rowArr: (string | number)[] = [sA];
      for (let c = 0; c < corr.symbols.length; c++) {
        const sB = corr.symbols[c];
        const val = corr.matrix[sA]?.[sB] ?? 0;
        rowArr.push(val.toFixed(4).replace('.', ','));
      }
      rows.push(rowArr);
    }

    tables.push({
      id: `${planId}_tbl_corr`,
      title_vi: 'Ma trận tương quan lợi suất giữa các mã',
      columns,
      rows,
    });

    charts.push({
      id: `${planId}_chart_corr`,
      kind: 'heatmap',
      title_vi: 'Biểu đồ nhiệt tương quan lợi suất',
      symbols: corr.symbols,
      data: {
        symbols: corr.symbols,
        matrix: corr.matrix,
      },
      table: {
        columns,
        rows,
      },
    });

    const distinctPairs: Array<{ symbol_a: string; symbol_b: string; correlation: number }> = [];
    for (let i = 0; i < corr.symbols.length; i++) {
      for (let j = i + 1; j < corr.symbols.length; j++) {
        const sA = corr.symbols[i];
        const sB = corr.symbols[j];
        distinctPairs.push({ symbol_a: sA, symbol_b: sB, correlation: corr.matrix[sA]?.[sB] ?? 0 });
      }
    }

    if (distinctPairs.length > 0) {
      const sortedPairs = [...distinctPairs].sort((a, b) => b.correlation - a.correlation);
      const maxPair = sortedPairs[0];
      const minPair = sortedPairs[sortedPairs.length - 1];
      summary_lines.push(
        `Cặp mã có tương quan cao nhất là ${maxPair.symbol_a} - ${maxPair.symbol_b} (${maxPair.correlation.toFixed(4).replace('.', ',')}), và thấp nhất là ${minPair.symbol_a} - ${minPair.symbol_b} (${minPair.correlation.toFixed(4).replace('.', ',')}).`
      );
    }
  } else if (terminalResult.type === 'aggregate') {
    const { items, params } = terminalResult.data;
    const aggBy = params?.by || 'nhóm';
    const aggCol = params?.column || 'giá trị';
    const aggFunc = params?.agg || 'tổng';

    const columns = ['Nhóm', 'Số phiên', 'Chỉ số', 'Giá trị'];
    const rows = items.map((r: any) => [String(r.group), r.count, `${aggFunc}(${aggCol})`, r.formatted]);

    tables.push({
      id: `${planId}_tbl_agg`,
      title_vi: `Bảng tổng hợp theo ${aggBy} (${aggFunc} của ${aggCol})`,
      columns,
      rows,
    });

    charts.push({
      id: `${planId}_chart_agg`,
      kind: 'column',
      title_vi: `Tổng hợp theo ${aggBy}`,
      symbols: items.map((it: any) => String(it.group)),
      data: {
        categories: items.map((it: any) => String(it.group)),
        values: items.map((it: any) => Number(it.value.toFixed(4))),
      },
      table: {
        columns: ['Nhóm', 'Giá trị'],
        rows: items.map((it: any) => [String(it.group), it.formatted]),
      },
    });

    if (items.length > 0) {
      const topGroup = [...items].sort((a: any, b: any) => b.value - a.value)[0];
      summary_lines.push(
        `Nhóm ${topGroup.group} ghi nhận giá trị tổng hợp cao nhất đạt ${topGroup.formatted}.`
      );
    }
  } else {
    // Frame-based result (O(N) single pass using integer date_days instead of O(15*S*N) Date.toISOString)
    const uniqueDaySet = new Set<number>();
    for (let i = 0; i < currentFrame.n; i++) {
      uniqueDaySet.add(currentFrame.date_days[i]);
    }
    const sortedDays = Array.from(uniqueDaySet).sort((a, b) => a - b);
    const dates = sortedDays.map((d) => new Date(d * 86400000).toISOString().slice(0, 10));

    const columns = ['Ngày', ...currentFrame.symbols];
    const sampleDayStart = Math.max(0, sortedDays.length - 15);
    const sampleDays = sortedDays.slice(sampleDayStart);
    const sampleDayIdx = new Map<number, number>();
    for (let k = 0; k < sampleDays.length; k++) {
      sampleDayIdx.set(sampleDays[k], k);
    }

    const numSyms = currentFrame.symbols.length;
    const rows: (string | number)[][] = sampleDays.map((d) => {
      const r: (string | number)[] = new Array(numSyms + 1).fill('-');
      r[0] = new Date(d * 86400000).toISOString().slice(0, 10);
      return r;
    });

    for (let i = 0; i < currentFrame.n; i++) {
      const rIdx = sampleDayIdx.get(currentFrame.date_days[i]);
      if (rIdx === undefined) continue;
      const sIdx = currentFrame.symbol_idx[i];
      if (sIdx < numSyms && rows[rIdx][sIdx + 1] === '-') {
        const val = currentFrame.columns.close[i];
        rows[rIdx][sIdx + 1] = Number.isInteger(val) ? val.toLocaleString('vi-VN') : val.toFixed(2).replace('.', ',');
      }
    }

    tables.push({
      id: `${planId}_tbl_frame`,
      title_vi: 'Bảng dữ liệu kết quả chuỗi thời gian',
      columns,
      rows,
    });

    charts.push({
      id: `${planId}_chart_frame`,
      kind: 'line',
      title_vi: derivePlanTitle(plan),
      symbols: currentFrame.symbols,
      data: {
        dates,
      },
      table: {
        columns,
        rows,
      },
    });

    summary_lines.push(
      `Quy trình phân tích chuỗi thời gian hoàn thành thành công với ${currentFrame.symbols.length} mã cổ phiếu và ${dates.length} phiên giao dịch.`
    );
  }

  return {
    id: planId,
    title_vi: derivePlanTitle(plan),
    steps_text: stepsText,
    tables,
    charts,
    summary_lines,
    created_at: new Date().toISOString(),
  };
}
