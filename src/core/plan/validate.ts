/**
 * Plan Validation and Step Description Generator (Prompt P6 Section 8.2).
 * Strictly validates that execution plans only contain whitelisted operations
 * with valid parameters and bounded scope.
 * Pure TypeScript - zero external runtime dependencies.
 */

import type { CleanDataset, Plan, PlanStep } from '../schemas';

export const ALLOWED_OPS = [
  'filter_symbols',
  'filter_date_range',
  'resample_ohlcv',
  'pct_change',
  'cumulative_return',
  'rolling_mean',
  'rolling_volatility',
  'normalize_base100',
  'drawdown',
  'correlation',
  'rank_top_n',
  'compare_periods',
  'group_aggregate',
] as const;

export type AllowedOp = (typeof ALLOWED_OPS)[number];

export interface PlanValidationResult {
  valid: boolean;
  errors: string[];
}

export function validatePlan(plan: Plan, dataset: CleanDataset): PlanValidationResult {
  const errors: string[] = [];

  if (!plan) {
    return { valid: false, errors: ['Kế hoạch phân tích rỗng.'] };
  }

  if (!plan.steps || !Array.isArray(plan.steps) || plan.steps.length === 0) {
    return { valid: false, errors: ['Kế hoạch phải có ít nhất 1 bước thao tác.'] };
  }

  if (plan.steps.length > 8) {
    errors.push(`Kế hoạch vượt quá số bước tối đa cho phép (${plan.steps.length}/8 bước).`);
  }

  let activeSymbols = new Set(dataset.symbols);
  const totalBars = 'n' in dataset && typeof dataset.n === 'number'
    ? dataset.n / Math.max(1, dataset.symbols.length)
    : ('rows' in dataset && Array.isArray((dataset as any).rows)
      ? (dataset as any).rows.length / Math.max(1, dataset.symbols.length)
      : 0);

  // Check last step is terminal
  const lastStep = plan.steps[plan.steps.length - 1];
  if (lastStep.op === 'filter_symbols' || lastStep.op === 'filter_date_range') {
    errors.push('Bước cuối cùng phải là thao tác phân tích tạo bảng hoặc biểu đồ (không thể dừng lại ở thao tác lọc dữ liệu).');
  }

  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    const op = step.op;
    const params = step.params || {};

    // Strict security check: reject any mini-language / expression evaluation
    if ('expr' in params || 'expr' in (step as any) || (step as any).expression) {
      errors.push(`Bước ${i + 1}: Biểu thức "expr" bị cấm. Hệ thống chỉ hỗ trợ danh mục thao tác định lượng liệt kê sẵn.`);
      continue;
    }

    if (!ALLOWED_OPS.includes(op as AllowedOp)) {
      errors.push(`Bước ${i + 1}: Thao tác "${op}" không nằm trong danh mục thao tác được phép.`);
      continue;
    }

    if (op === 'filter_symbols') {
      const syms = params.symbols;
      if (!Array.isArray(syms) || syms.length === 0) {
        errors.push(`Bước ${i + 1}: filter_symbols yêu cầu danh sách mã cổ phiếu không rỗng.`);
      } else {
        for (const s of syms) {
          if (!dataset.symbols.includes(s)) {
            errors.push(`Bước ${i + 1}: Mã "${s}" không tồn tại trong tập dữ liệu.`);
          }
        }
        activeSymbols = new Set(syms.filter((s) => dataset.symbols.includes(s)));
      }
    } else if (op === 'filter_date_range') {
      const { from, to } = params;
      if (!from || !to) {
        errors.push(`Bước ${i + 1}: filter_date_range yêu cầu cả ngày bắt đầu (from) và ngày kết thúc (to).`);
      } else {
        const dFrom = Date.parse(from);
        const dTo = Date.parse(to);
        if (isNaN(dFrom) || isNaN(dTo)) {
          errors.push(`Bước ${i + 1}: Định dạng ngày không hợp lệ (${from} - ${to}).`);
        } else if (dFrom > dTo) {
          errors.push(`Bước ${i + 1}: Ngày bắt đầu (${from}) phải trước hoặc bằng ngày kết thúc (${to}).`);
        }
      }
    } else if (op === 'resample_ohlcv') {
      if (params.freq !== 'week' && params.freq !== 'month') {
        errors.push(`Bước ${i + 1}: resample_ohlcv chỉ chấp nhận tần suất "week" hoặc "month".`);
      }
    } else if (op === 'pct_change') {
      if (params.column !== 'close' && params.column !== 'volume') {
        errors.push(`Bước ${i + 1}: pct_change chỉ chấp nhận cột "close" hoặc "volume".`);
      }
      if (![1, 5, 20].includes(params.periods)) {
        errors.push(`Bước ${i + 1}: pct_change chỉ chấp nhận chu kỳ 1, 5 hoặc 20 phiên.`);
      }
    } else if (op === 'rolling_mean') {
      if (params.column !== 'close' && params.column !== 'volume') {
        errors.push(`Bước ${i + 1}: rolling_mean chỉ chấp nhận cột "close" hoặc "volume".`);
      }
      if (![5, 10, 20, 50].includes(params.window)) {
        errors.push(`Bước ${i + 1}: rolling_mean chỉ chấp nhận cửa sổ 5, 10, 20 hoặc 50 phiên.`);
      } else if (totalBars > 0 && params.window > totalBars) {
        errors.push(`Bước ${i + 1}: Kỳ phân tích không đủ số phiên cho cửa sổ yêu cầu (${params.window} phiên > ${Math.round(totalBars)} phiên dữ liệu).`);
      }
    } else if (op === 'rolling_volatility') {
      if (![10, 20, 60].includes(params.window)) {
        errors.push(`Bước ${i + 1}: rolling_volatility chỉ chấp nhận cửa sổ 10, 20 hoặc 60 phiên.`);
      } else if (totalBars > 0 && params.window > totalBars) {
        errors.push(`Bước ${i + 1}: Kỳ phân tích không đủ số phiên cho cửa sổ yêu cầu (${params.window} phiên > ${Math.round(totalBars)} phiên dữ liệu).`);
      }
    } else if (op === 'correlation') {
      if (activeSymbols.size < 2) {
        errors.push(`Bước ${i + 1}: Thao tác tính tương quan yêu cầu tối thiểu 2 mã cổ phiếu trong danh mục.`);
      }
    } else if (op === 'rank_top_n') {
      const allowedMetrics = ['period_return', 'ann_vol', 'max_dd', 'avg_volume', 'win_rate'];
      if (!allowedMetrics.includes(params.metric)) {
        errors.push(`Bước ${i + 1}: rank_top_n không hỗ trợ chỉ số "${params.metric}".`);
      }
      if (typeof params.n !== 'number' || params.n < 1 || params.n > 10) {
        errors.push(`Bước ${i + 1}: rank_top_n chỉ hỗ trợ số lượng n từ 1 đến 10.`);
      }
      if (params.order && params.order !== 'desc' && params.order !== 'asc') {
        errors.push(`Bước ${i + 1}: rank_top_n chỉ chấp nhận thứ tự "desc" hoặc "asc".`);
      }
    } else if (op === 'compare_periods') {
      if (!params.period_a || !params.period_b) {
        errors.push(`Bước ${i + 1}: compare_periods yêu cầu định nghĩa cả hai kỳ period_a và period_b.`);
      }
    } else if (op === 'group_aggregate') {
      if (!['symbol', 'month', 'weekday'].includes(params.by)) {
        errors.push(`Bước ${i + 1}: group_aggregate chỉ hỗ trợ gom nhóm theo "symbol", "month" hoặc "weekday".`);
      }
      if (!['return', 'volume', 'range'].includes(params.column)) {
        errors.push(`Bước ${i + 1}: group_aggregate chỉ hỗ trợ cột "return", "volume" hoặc "range".`);
      }
      if (!['mean', 'sum', 'min', 'max', 'std', 'count'].includes(params.agg)) {
        errors.push(`Bước ${i + 1}: group_aggregate không hỗ trợ hàm tổng hợp "${params.agg}".`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Formats a plan step into user-friendly Vietnamese text for the UI card.
 */
export function formatStepText(step: PlanStep, stepIndex: number): string {
  const num = stepIndex + 1;
  const p = step.params || {};

  switch (step.op) {
    case 'filter_symbols':
      return `Bước ${num}. Lọc danh mục mã: ${(p.symbols || []).join(', ')}`;
    case 'filter_date_range':
      return `Bước ${num}. Lọc khoảng thời gian: từ ${p.from} đến ${p.to}`;
    case 'resample_ohlcv':
      return `Bước ${num}. Gộp dữ liệu theo: ${p.freq === 'month' ? 'tháng' : 'tuần'}`;
    case 'pct_change':
      return `Bước ${num}. Tính tỷ lệ phần trăm thay đổi của cột "${p.column}" theo ${p.periods} phiên`;
    case 'cumulative_return':
      return `Bước ${num}. Tính chuỗi lợi suất tích lũy từ đầu kỳ`;
    case 'rolling_mean':
      return `Bước ${num}. Tính trung bình động (${p.window} phiên) cho cột "${p.column}"`;
    case 'rolling_volatility':
      return `Bước ${num}. Tính độ biến động năm hóa theo cửa sổ trượt ${p.window} phiên`;
    case 'normalize_base100':
      return `Bước ${num}. Chuẩn hóa chuỗi giá về mốc 100 tại ngày giao dịch đầu tiên`;
    case 'drawdown':
      return `Bước ${num}. Tính toán chuỗi mức sụt giảm (drawdown) so với đỉnh lũy kế`;
    case 'correlation':
      return `Bước ${num}. Tính toán ma trận hệ số tương quan lợi suất ngày giữa các mã`;
    case 'rank_top_n':
      return `Bước ${num}. Xếp hạng top ${p.n} mã theo chỉ số "${p.metric}" (${p.order === 'asc' ? 'tăng dần' : 'giảm dần'})`;
    case 'compare_periods':
      return `Bước ${num}. So sánh hiệu suất giữa kỳ A (${p.period_a?.from} đến ${p.period_a?.to}) và kỳ B (${p.period_b?.from} đến ${p.period_b?.to})`;
    case 'group_aggregate':
      return `Bước ${num}. Gom nhóm theo "${p.by}", tính ${p.agg} của cột "${p.column}"`;
    default:
      return `Bước ${num}. Thực hiện thao tác "${step.op}"`;
  }
}

/**
 * Pure code generator for Plan title (Prompt P7 Section A1).
 * Completely eliminates arbitrary AI-generated strings from UI rendering.
 * Derives safe, localized Vietnamese titles solely from approved steps & parameters.
 */
export function derivePlanTitle(plan: Plan): string {
  if (!plan || !plan.steps || plan.steps.length === 0) {
    return 'Quy trình phân tích định lượng riêng';
  }

  // Identify the terminal or primary operational step (typically the last step)
  const lastStep = plan.steps[plan.steps.length - 1];
  const p = lastStep.params || {};

  switch (lastStep.op) {
    case 'rank_top_n': {
      const metricLabel: Record<string, string> = {
        period_return: 'lợi suất kỳ',
        ann_vol: 'độ biến động',
        max_dd: 'mức sụt giảm tối đa',
        avg_volume: 'khối lượng trung bình',
        win_rate: 'tỷ lệ phiên tăng',
      };
      const label = metricLabel[p.metric] || p.metric || 'chỉ số';
      return `Xếp hạng top ${p.n || 5} mã theo ${label}`;
    }
    case 'compare_periods': {
      const fromA = p.period_a?.from || 'Kỳ A';
      const toA = p.period_a?.to || '';
      const fromB = p.period_b?.from || 'Kỳ B';
      const toB = p.period_b?.to || '';
      if (toA && toB) {
        return `So sánh hiệu suất giữa kỳ (${fromA} đến ${toA}) và (${fromB} đến ${toB})`;
      }
      return 'So sánh hiệu suất định lượng giữa hai kỳ giao dịch';
    }
    case 'group_aggregate': {
      const byLabel: Record<string, string> = {
        symbol: 'mã cổ phiếu',
        month: 'tháng giao dịch',
        weekday: 'ngày trong tuần',
      };
      const aggLabel: Record<string, string> = {
        mean: 'trung bình',
        sum: 'tổng',
        min: 'giá trị nhỏ nhất',
        max: 'giá trị lớn nhất',
        std: 'độ lệch chuẩn',
        count: 'số lượng phiên',
      };
      const colLabel: Record<string, string> = {
        return: 'lợi suất',
        volume: 'khối lượng',
        range: 'biên độ dao động',
      };
      return `Gom nhóm theo ${byLabel[p.by] || p.by}: tính ${aggLabel[p.agg] || p.agg} của ${colLabel[p.column] || p.column}`;
    }
    case 'correlation':
      return 'Ma trận hệ số tương quan lợi suất giữa các mã cổ phiếu';
    case 'rolling_volatility':
      return `Độ biến động giá năm hóa (cửa sổ trượt ${p.window || 20} phiên)`;
    case 'rolling_mean':
      return `Đường trung bình động ${p.window || 20} phiên của cột "${p.column === 'volume' ? 'khối lượng' : 'giá đóng cửa'}"`;
    case 'drawdown':
      return 'Phân tích chuỗi mức sụt giảm (Drawdown) so với đỉnh lũy kế';
    case 'cumulative_return':
      return 'Chuỗi lợi suất đầu tư tích lũy từ đầu kỳ';
    case 'pct_change':
      return `Tỷ lệ thay đổi phần trăm (${p.periods || 1} phiên) của cột "${p.column === 'volume' ? 'khối lượng' : 'giá đóng cửa'}"`;
    case 'normalize_base100':
      return 'Chuẩn hóa chuỗi giá về mốc cơ sở 100';
    case 'resample_ohlcv':
      return `Dữ liệu nén theo tần suất ${p.freq === 'month' ? 'tháng' : 'tuần'}`;
    default:
      return 'Quy trình phân tích định lượng riêng';
  }
}
