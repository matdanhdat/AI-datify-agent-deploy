/**
 * Deterministic Business Insight Rule Engine.
 * Pure TypeScript functions - zero external runtime dependencies.
 * Evaluates business facts to produce 4-layered structured findings:
 * Layer 1: Numbers & Source [F#]
 * Layer 2: Meaning (why this matters)
 * Layer 3: Opportunity & Risk
 * Layer 4: Action, KPI metric ID, check-after horizon
 */

import { formatNumber, formatPercent } from '../../utils/format';
import type { FactsTable, FactItem } from './factsBuilder';
import type {
  ComputeSelectedOutput,
  MetricPivotTable,
  MatrixPivotTable,
  MatrixCell,
} from '../metrics/businessComputeSelected';

export const INSIGHT_THRESHOLDS = {
  CONC_WATCH_SHARE: 0.35, // 35%
  CONC_RISK_SHARE: 0.5, // 50%
  MARGIN_HIGH_PP: 3.0, // 3.0 percentage points higher than overall gross margin
  MARGIN_LOW_PP: 2.0, // 2.0 percentage points lower than overall gross margin
  SHARE_SMALL: 0.15, // 15%
  SHARE_LARGE: 0.25, // 25%
  MOM_STRONG: 0.1, // 10% MoM
  MIN_MONTHS_FOR_TREND: 6,
  UNLABELED_SHARE: 0.02, // 2%
  MAX_FINDINGS: 6,
  MAX_ACTIONS_PRIORITY: 3,
} as const;

export type CheckAfterOption = '1 tuần' | '2 tuần' | '4 tuần' | '8 tuần' | '1 quý';

export const ALLOWED_CHECK_AFTER: readonly CheckAfterOption[] = [
  '1 tuần',
  '2 tuần',
  '4 tuần',
  '8 tuần',
  '1 quý',
] as const;

export interface InsightFinding {
  rule_id: string;
  title: string;
  evidence: string;
  meaning: string;
  opportunity_risk: string;
  action: string;
  kpi_metric_id: string;
  check_after: CheckAfterOption;
  source_refs: string[];
  isQuestionRelated?: boolean;
}

export interface InsightActionPriority {
  action: string;
  kpi_metric_id: string;
  check_after: CheckAfterOption;
  source_refs: string[];
  rule_id?: string;
}

export interface InsightEngineOutput {
  findings: InsightFinding[];
  priority_actions: InsightActionPriority[];
  key_takeaways: string[];
}

const UNLABELED_KEYWORDS = [
  'không xác định',
  'chưa rõ',
  '(trống)',
  'trống',
  'n/a',
  'na',
  'null',
  'undefined',
  'chưa phân loại',
  'khác',
];

export function isUnlabeledLabel(label: string): boolean {
  if (!label) return true;
  const l = label.trim().toLowerCase();
  return UNLABELED_KEYWORDS.some((kw) => l === kw || l === `(${kw})`);
}

function findFact(facts: FactItem[], category: string, keyword: string): FactItem | undefined {
  return facts.find(
    (f) =>
      (f.category === category || category === '*') &&
      (f.label_vi.toLowerCase().includes(keyword.toLowerCase()) ||
        f.display.toLowerCase().includes(keyword.toLowerCase()))
  );
}

function getMetricPivot(
  metricsResult: ComputeSelectedOutput['metrics'] | undefined,
  metricId: string
): MetricPivotTable | null {
  const m = metricsResult?.[metricId];
  if (m && m.feasible && m.pivot && 'dimension' in m.pivot) {
    return m.pivot as MetricPivotTable;
  }
  return null;
}

function getMatrixPivot(
  metricsResult: ComputeSelectedOutput['metrics'] | undefined
): MatrixPivotTable | null {
  const m = metricsResult?.['channel_product_matrix'];
  if (m && m.feasible && m.pivot && 'channels' in m.pivot) {
    return m.pivot as MatrixPivotTable;
  }
  return null;
}


/**
 * Formats matrix tie list: "<Kênh> × <Sản phẩm>" without brackets, handling ties with "hòa nhau".
 */
function formatMatrixEntitiesWithTies(cells: MatrixCell[]): string {
  if (cells.length === 0) return '';
  const names = cells.map((c) => `${c.channel} × ${c.product}`);
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} và ${names[1]} hòa nhau`;
  return `${names.slice(0, -1).join(', ')} và ${names[names.length - 1]} hòa nhau`;
}
/**
 * Formats a tie list cleanly: "A, B và C hòa nhau ở mức X"
 */
function formatEntitiesWithTies(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} và ${names[1]} hòa nhau`;
  return `${names.slice(0, -1).join(', ')} và ${names[names.length - 1]} hòa nhau`;
}

/**
 * Evaluates deterministic business insight rules against the facts table and selected metrics.
 */
export function evaluateInsightRules(
  factsTable: FactsTable,
  questionMetricIds?: string[]
): InsightEngineOutput {
  const findingsWithPriority: Array<{ priority: number; finding: InsightFinding }> = [];
  const facts = factsTable.facts || [];
  const metrics = factsTable.metrics_result || {};

  // Find general facts
  const rowCountFact = findFact(facts, 'total', 'dòng dữ liệu');
  const totalRevFact = findFact(facts, 'total', 'Tổng doanh thu');
  const totalMarginFact = findFact(facts, 'total', 'Biên lợi nhuận gộp');
  const totalProfitFact = findFact(facts, 'total', 'Tổng lợi nhuận');
  const totalCogsFact = findFact(facts, 'total', 'Tổng giá vốn');

  const totalRev = typeof totalRevFact?.value === 'number' ? totalRevFact.value : 0;
  const overallMargin =
    typeof totalMarginFact?.value === 'number' ? totalMarginFact.value : null;

  // -------------------------------------------------------------
  // RULE: R-FEW-ROWS (Priority 10)
  // Dưới 10 dòng sạch: cảnh báo độ tin cậy thấp, hành động là tích lũy thêm dữ liệu.
  // -------------------------------------------------------------
  let rowCount = 0;
  if (typeof rowCountFact?.value === 'number') {
    rowCount = rowCountFact.value;
  } else if (factsTable.period) {
    const m = factsTable.period.match(/(\d+)\s*dòng/);
    if (m) rowCount = parseInt(m[1], 10);
  }
  if (!rowCount) {
    const fDòng = facts.find(
      (f) => f.label_vi.toLowerCase().includes('dòng') && typeof f.value === 'number'
    );
    if (fDòng) rowCount = fDòng.value as number;
  }
  if (rowCount > 0 && rowCount < 10) {
    const refs = rowCountFact ? [rowCountFact.id] : [];
    findingsWithPriority.push({
      priority: 10,
      finding: {
        rule_id: 'R-FEW-ROWS',
        title: 'Quy mẫu dữ liệu còn ít, cần tích lũy thêm giao dịch',
        evidence: `Dữ liệu chỉ có ${rowCount} dòng sạch đã được ghi nhận [${refs.join(', ')}].`,
        meaning:
          'Kích thước mẫu dưới 10 dòng có thể chưa phản ánh đầy đủ quy luật kinh doanh, các chỉ số có thể biến động khi có thêm giao dịch mới.',
        opportunity_risk:
          'Cần kiểm tra thêm độ ổn định của số liệu trước khi đưa ra các thay đổi quy mô lớn.',
        action:
          'Tiếp tục ghi nhận dữ liệu bán hàng trong chu kỳ tiếp theo để tích lũy thêm số lượng giao dịch.',
        kpi_metric_id: 'total_orders',
        check_after: '4 tuần',
        source_refs: refs,
      },
    });
  }

  // -------------------------------------------------------------
  // RULE: R-NO-MARGIN (Priority 15)
  // File thiếu cả giá vốn lẫn lợi nhuận: code-only.
  // -------------------------------------------------------------
  const hasCostOrProfit =
    overallMargin !== null ||
    (totalProfitFact && typeof totalProfitFact.value === 'number') ||
    (totalCogsFact && typeof totalCogsFact.value === 'number');

  if (!hasCostOrProfit) {
    const revRef = totalRevFact ? [totalRevFact.id] : [];
    findingsWithPriority.push({
      priority: 15,
      finding: {
        rule_id: 'R-NO-MARGIN',
        title: 'Chưa ghi nhận chi phí giá vốn để đánh giá hiệu quả sinh lời',
        evidence: `Tập dữ liệu ghi nhận tổng doanh thu đạt ${formatNumber(totalRev, 0)} VND nhưng chưa có thông tin giá vốn hàng bán [${revRef.join(', ')}].`,
        meaning:
          'Tập dữ liệu chưa ghi nhận đầy đủ chi phí đầu vào, cần kiểm tra xem doanh nghiệp có thể bổ sung trường giá vốn để theo dõi hiệu quả sinh lời hay không.',
        opportunity_risk:
          'Cần kiểm tra thêm chi phí đầu vào để phòng ngừa nguy cơ biên lợi nhuận thấp ở một số mặt hàng.',
        action:
          'Chuẩn hóa việc ghi nhận trường Giá vốn hàng bán trong kỳ kế toán tiếp theo để tính toán đầy đủ biên lợi nhuận.',
        kpi_metric_id: 'gross_profit',
        check_after: '4 tuần',
        source_refs: revRef,
      },
    });
  }

  // -------------------------------------------------------------
  // RULE: R-UNLABELED (Priority 20)
  // Dữ liệu chưa gán nhãn ("Không xác định" / "(trống)" chiếm >= 2%).
  // -------------------------------------------------------------
  const checkUnlabeledInPivot = (pivot: MetricPivotTable | null, dimNameVi: string) => {
    if (!pivot || !pivot.rows || pivot.rows.length === 0) return null;
    let unlabeledRev = 0;
    for (const r of pivot.rows) {
      if (isUnlabeledLabel(r.label || r.key)) {
        unlabeledRev += r.revenue || 0;
      }
    }
    if (totalRev > 0 && unlabeledRev / totalRev >= INSIGHT_THRESHOLDS.UNLABELED_SHARE) {
      return {
        dimNameVi,
        unlabeledRev,
        share: (unlabeledRev / totalRev) * 100,
      };
    }
    return null;
  };

  const unlabeledChannel = checkUnlabeledInPivot(getMetricPivot(metrics, 'revenue_by_channel'), 'Kênh');
  const unlabeledProduct = checkUnlabeledInPivot(getMetricPivot(metrics, 'revenue_by_product'), 'Sản phẩm');
  const unlabeledRegion = checkUnlabeledInPivot(getMetricPivot(metrics, 'revenue_by_region'), 'Khu vực');
  const targetUnlabeled = unlabeledChannel || unlabeledProduct || unlabeledRegion;

  if (targetUnlabeled) {
    const refs = totalRevFact ? [totalRevFact.id] : [];
    findingsWithPriority.push({
      priority: 20,
      finding: {
        rule_id: 'R-UNLABELED',
        title: `Phát hiện giao dịch chưa định danh rõ ${targetUnlabeled.dimNameVi}`,
        evidence: `Các giao dịch không rõ ${targetUnlabeled.dimNameVi} chiếm ${formatPercent(targetUnlabeled.share / 100)} tổng doanh thu (tương đương ${formatNumber(targetUnlabeled.unlabeledRev, 0)} VND) [${refs.join(', ')}].`,
        meaning:
          'Các giao dịch chưa rõ phân loại có thể làm giảm độ chuẩn xác của số liệu phân bổ, cần kiểm tra quy trình nhập liệu đầu vào.',
        opportunity_risk:
          'Cần kiểm tra thêm để hạn chế tỷ lệ giao dịch thiếu thông tin phân loại.',
        action:
          `Rà soát và hoàn thiện thông tin ${targetUnlabeled.dimNameVi} ở khâu ghi nhận đơn hàng trên hệ thống quản lý.`,
        kpi_metric_id: 'total_revenue',
        check_after: '2 tuần',
        source_refs: refs,
      },
    });
  }

  // -------------------------------------------------------------
  // RULE: R-CONC (Priority 50-55)
  // Mức độ tập trung theo từng chiều (kênh, sản phẩm, khu vực):
  // Nhóm dẫn đầu chiếm >= CONC_WATCH_SHARE (35%) và < 100%, từ >= 2 nhóm.
  // Mức theo dõi (0,35 đến < 0,50): câu "đáng theo dõi", hành động "theo dõi tỷ trọng".
  // Mức rủi ro (>= 0,50): câu "phụ thuộc cao", hành động "giảm phụ thuộc".
  // Tiêu đề: "Kênh <tên> chiếm <x%> doanh thu" / "Sản phẩm <tên> ..." / "Khu vực <tên> ..."
  // -------------------------------------------------------------
  interface ConcCandidate {
    dimKey: 'channel' | 'product' | 'region';
    dimTitlePrefix: string;
    dimLabel: string;
    dimPlural: string;
    kpiId: string;
    names: string[];
    maxShare: number;
    maxRev: number;
    isHighRisk: boolean;
    refs: string[];
  }

  const checkConcentration = (
    pivot: MetricPivotTable | null,
    dimKey: 'channel' | 'product' | 'region',
    dimTitlePrefix: string,
    dimLabel: string,
    dimPlural: string,
    kpiId: string,
    factCat: string
  ): ConcCandidate | null => {
    if (!pivot || !pivot.rows || pivot.rows.length === 0 || totalRev <= 0) return null;
    const validRows = pivot.rows.filter((r) => !isUnlabeledLabel(r.label || r.key));
    if (validRows.length < 2) return null;

    let maxRev = -1;
    for (const r of validRows) {
      const rev = r.revenue || 0;
      if (rev > maxRev) maxRev = rev;
    }
    const tiedRows = validRows.filter((r) => Math.abs((r.revenue || 0) - maxRev) < 1.0);
    const maxShare = maxRev / totalRev;

    if (maxShare >= INSIGHT_THRESHOLDS.CONC_WATCH_SHARE && maxShare < 1.0) {
      const names = tiedRows.map((r) => r.label || r.key);
      const isHighRisk = maxShare >= INSIGHT_THRESHOLDS.CONC_RISK_SHARE;
      const matchingFact = findFact(facts, factCat, names[0]);
      const refs = matchingFact ? [matchingFact.id] : totalRevFact ? [totalRevFact.id] : [];

      return {
        dimKey,
        dimTitlePrefix,
        dimLabel,
        dimPlural,
        kpiId,
        names,
        maxShare,
        maxRev,
        isHighRisk,
        refs,
      };
    }
    return null;
  };

  const concCandidates: ConcCandidate[] = [
    checkConcentration(getMetricPivot(metrics, 'revenue_by_channel'), 'channel', 'Kênh', 'kênh bán', 'kênh', 'revenue_by_channel', 'channel'),
    checkConcentration(getMetricPivot(metrics, 'revenue_by_product'), 'product', 'Sản phẩm', 'sản phẩm', 'sản phẩm', 'revenue_by_product', 'product'),
    checkConcentration(getMetricPivot(metrics, 'revenue_by_region'), 'region', 'Khu vực', 'khu vực', 'khu vực', 'revenue_by_region', 'region'),
  ].filter(Boolean) as ConcCandidate[];

  for (const c of concCandidates) {
    const entText = formatEntitiesWithTies(c.names);
    const title = `${c.dimTitlePrefix} ${entText} chiếm ${formatPercent(c.maxShare)} doanh thu`;
    const evidence = `${entText} đóng góp ${formatNumber(c.maxRev, 0)} VND, tương ứng ${formatPercent(c.maxShare)} doanh thu toàn hệ thống [${c.refs.join(', ')}].`;

    let meaning = '';
    let oppRisk = '';
    let action = '';

    if (c.isHighRisk) {
      meaning = `Doanh nghiệp có mức độ phụ thuộc cao vào ${c.dimLabel} này, cần kiểm tra xem các ${c.dimPlural} khác có khả năng chia sẻ tỷ trọng doanh thu hay không.`;
      oppRisk = `Cần kiểm tra thêm phương án cân đối để giảm thiểu rủi ro biến động doanh thu từ nhóm chủ lực.`;
      if (c.dimKey === 'channel') {
        action = `Lập kế hoạch giảm phụ thuộc và rà soát tỷ trọng các kênh còn lại.`;
      } else if (c.dimKey === 'product') {
        action = `Lập kế hoạch giảm phụ thuộc và rà soát danh mục sản phẩm còn lại.`;
      } else {
        action = `Lập kế hoạch giảm phụ thuộc và rà soát khu vực còn lại.`;
      }
    } else {
      meaning = `Tỷ trọng doanh thu của ${c.dimLabel} này ở mức đáng theo dõi, cần kiểm tra xem mức độ tập trung có xu hướng thay đổi qua các kỳ hay không.`;
      oppRisk = `Cơ hội phát huy thế mạnh của ${c.dimLabel} dẫn đầu, đi kèm việc theo dõi cơ cấu doanh thu.`;
      if (c.dimKey === 'channel') {
        action = `Theo dõi tỷ trọng và rà soát tỷ trọng các kênh còn lại trong kỳ tiếp theo.`;
      } else if (c.dimKey === 'product') {
        action = `Theo dõi tỷ trọng và rà soát danh mục sản phẩm còn lại trong kỳ tiếp theo.`;
      } else {
        action = `Theo dõi tỷ trọng và rà soát khu vực còn lại trong kỳ tiếp theo.`;
      }
    }

    const priority = c.isHighRisk ? 55 + Math.round(c.maxShare * 10) : 50 + Math.round(c.maxShare * 10);

    findingsWithPriority.push({
      priority,
      finding: {
        rule_id: 'R-CONC',
        title,
        evidence,
        meaning,
        opportunity_risk: oppRisk,
        action,
        kpi_metric_id: c.kpiId,
        check_after: '8 tuần',
        source_refs: c.refs,
      },
    });
  }

  // -------------------------------------------------------------
  // RULE: R-MOM (Priority 60)
  // MoM kỳ gần nhất >= +MOM_STRONG hoặc <= -MOM_STRONG (|MoM| >= 10%).
  // Dưới MIN_MONTHS_FOR_TREND (6) tháng thì ý nghĩa nói "chưa đủ kỳ để kết luận xu hướng".
  // -------------------------------------------------------------
  const monthPivot = getMetricPivot(metrics, 'revenue_by_month');
  if (monthPivot && monthPivot.rows && monthPivot.rows.length >= 2) {
    const rows = monthPivot.rows;
    const lastRow = rows[rows.length - 1];
    const prevRow = rows[rows.length - 2];
    const lastRev = lastRow.revenue || 0;
    const prevRev = prevRow.revenue || 0;

    let momPct: number | null = null;
    if (prevRev > 0) {
      momPct = ((lastRev - prevRev) / prevRev) * 100;
    }

    if (momPct !== null && Math.abs(momPct) >= INSIGHT_THRESHOLDS.MOM_STRONG * 100) {
      const matchingFact = findFact(facts, 'month', lastRow.label || lastRow.key);
      const refs = matchingFact ? [matchingFact.id] : totalRevFact ? [totalRevFact.id] : [];
      const isTrendInsufficient = rows.length < INSIGHT_THRESHOLDS.MIN_MONTHS_FOR_TREND;
      const trendNote = isTrendInsufficient
        ? ` Dữ liệu mới có ${rows.length} kỳ, chưa đủ kỳ để kết luận xu hướng.`
        : '';

      const isUp = momPct > 0;
      findingsWithPriority.push({
        priority: 60,
        finding: {
          rule_id: 'R-MOM',
          title: `Doanh thu tháng gần nhất biến động mạnh (${isUp ? '+' : ''}${formatPercent(momPct / 100)})`,
          evidence: `Doanh thu tháng ${lastRow.label || lastRow.key} đạt ${formatNumber(lastRev, 0)} VND, biến động ${isUp ? '+' : ''}${formatPercent(momPct / 100)} so với tháng trước [${refs.join(', ')}].`,
          meaning:
            `Doanh thu có mức biến động lớn giữa hai tháng liên tiếp, cần kiểm tra xem xu hướng này tiếp diễn hay chỉ xuất hiện trong ngắn hạn.${trendNote}`,
          opportunity_risk:
            'Cần kiểm tra thêm diễn biến doanh số các tuần tiếp theo để chủ động kế hoạch kinh doanh.',
          action:
            'Theo dõi sát doanh số theo tuần trong tháng tiếp theo để chủ động kế hoạch kinh doanh.',
          kpi_metric_id: 'revenue_growth',
          check_after: '4 tuần',
          source_refs: refs,
        },
      });
    }
  }

  // -------------------------------------------------------------
  // RULE: R-MATRIX (Priority 70)
  // Tương tác Kênh x Sản phẩm: ô biên thấp nhất và ô biên cao nhất của ma trận kênh × sản phẩm, xử lý hòa, cần channel_product_matrix đã chọn.
  // -------------------------------------------------------------
  const matrixPivot = getMatrixPivot(metrics);
  if (matrixPivot && matrixPivot.cells && matrixPivot.cells.length > 0 && overallMargin !== null) {
    const validCells = matrixPivot.cells.filter(
      (c) =>
        !isUnlabeledLabel(c.channel) &&
        !isUnlabeledLabel(c.product) &&
        typeof c.margin_pct === 'number' &&
        !isNaN(c.margin_pct) &&
        c.revenue > 0
    );
    if (validCells.length > 0) {
      let minMargin = Infinity;
      let maxMargin = -Infinity;
      for (const c of validCells) {
        if (c.margin_pct < minMargin) minMargin = c.margin_pct;
        if (c.margin_pct > maxMargin) maxMargin = c.margin_pct;
      }
      const minCells = validCells.filter((c) => Math.abs(c.margin_pct - minMargin) < 0.05);
      const maxCells = validCells.filter((c) => Math.abs(c.margin_pct - maxMargin) < 0.05);

      const minText = formatMatrixEntitiesWithTies(minCells);
      const maxText = formatMatrixEntitiesWithTies(maxCells);

      const matchingFact = findFact(facts, 'channel', minCells[0].channel);
      const refs = matchingFact ? [matchingFact.id] : totalRevFact ? [totalRevFact.id] : [];

      findingsWithPriority.push({
        priority: 70,
        finding: {
          rule_id: 'R-MATRIX',
          title: `Ma trận Kênh × Sản phẩm: Phân hóa biên lợi nhuận giữa các cặp phân phối`,
          evidence: `Cặp phân phối có biên lợi nhuận thấp nhất là ${minText} (${formatPercent(minMargin / 100)}); cặp có biên cao nhất là ${maxText} (${formatPercent(maxMargin / 100)}) [${refs.join(', ')}].`,
          meaning:
            'Hiệu quả sinh lời có sự phân hóa đáng kể giữa các cặp phân phối, cần kiểm tra xem cơ cấu biên lợi nhuận có thể tối ưu thêm hay không.',
          opportunity_risk:
            'Cơ hội cải thiện biên lợi nhuận tổng thể nếu gia tăng tỷ trọng ở các cặp biên cao.',
          action:
            'Rà soát lại cơ cấu giá bán ở các cặp biên thấp, đồng thời theo dõi tỷ trọng doanh thu của các cặp biên cao.',
          kpi_metric_id: 'channel_product_matrix',
          check_after: '1 quý',
          source_refs: refs,
        },
      });
    }
  }

  // -------------------------------------------------------------
  // RULE: R-HIGH-MARGIN-LOW-SHARE (Priority 80)
  // Ngách lợi nhuận cao nhưng doanh thu nhỏ (biên cao hơn TB >= 3.0 pp, share <= 15%).
  // -------------------------------------------------------------
  if (overallMargin !== null) {
    const checkHighMarginLowShare = (
      pivot: MetricPivotTable | null,
      dimNameVi: string,
      kpiId: string,
      factCat: string
    ) => {
      if (!pivot || !pivot.rows || totalRev <= 0) return null;
      const candidates = pivot.rows.filter(
        (r) =>
          !isUnlabeledLabel(r.label || r.key) &&
          r.margin_pct !== undefined &&
          r.revenue !== undefined &&
          r.margin_pct - overallMargin >= INSIGHT_THRESHOLDS.MARGIN_HIGH_PP &&
          r.revenue / totalRev <= INSIGHT_THRESHOLDS.SHARE_SMALL &&
          r.revenue > 0
      );
      if (candidates.length === 0) return null;

      // Find highest margin candidate
      candidates.sort((a, b) => (b.margin_pct || 0) - (a.margin_pct || 0));
      const best = candidates[0];
      const share = (best.revenue || 0) / totalRev;
      const matchingFact = findFact(facts, factCat, best.label || best.key);
      const refs = matchingFact
        ? totalMarginFact
          ? [matchingFact.id, totalMarginFact.id]
          : [matchingFact.id]
        : totalMarginFact
          ? [totalMarginFact.id]
          : [];

      return {
        dimNameVi,
        kpiId,
        name: best.label || best.key,
        margin: best.margin_pct || 0,
        rev: best.revenue || 0,
        share,
        refs,
      };
    };

    const highP = checkHighMarginLowShare(getMetricPivot(metrics, 'margin_by_product'), 'Sản phẩm', 'margin_by_product', 'product');
    const highC = checkHighMarginLowShare(getMetricPivot(metrics, 'margin_by_channel'), 'Kênh', 'margin_by_channel', 'channel');
    const targetHigh = highP || highC;

    if (targetHigh) {
      findingsWithPriority.push({
        priority: 80,
        finding: {
          rule_id: 'R-HIGH-MARGIN-LOW-SHARE',
          title: `${targetHigh.dimNameVi} ${targetHigh.name} có biên lợi nhuận vượt trội (${formatPercent(targetHigh.margin / 100)})`,
          evidence: `${targetHigh.dimNameVi} ${targetHigh.name} đạt biên lợi nhuận ${formatPercent(targetHigh.margin / 100)} (cao hơn mức bình quân ${formatPercent(overallMargin / 100)}) nhưng chỉ chiếm ${formatPercent(targetHigh.share)} doanh số [${targetHigh.refs.join(', ')}].`,
          meaning:
            'Nhóm này có tỷ suất lợi nhuận cao nhưng tỷ trọng doanh thu còn nhỏ, cần kiểm tra xem có khả năng mở rộng quy mô hay không.',
          opportunity_risk:
            'Cơ hội gia tăng lợi nhuận nếu nâng cao được tỷ trọng doanh thu của nhóm biên cao này.',
          action:
            `Rà soát kế hoạch tiếp cận thị trường và mở rộng độ phủ cho ${targetHigh.dimNameVi} ${targetHigh.name} trong các kỳ tới.`,
          kpi_metric_id: targetHigh.kpiId,
          check_after: '1 quý',
          source_refs: targetHigh.refs,
        },
      });
    }
  }

  // -------------------------------------------------------------
  // RULE: R-LOW-MARGIN-HIGH-SHARE (Priority 90)
  // Doanh thu lớn nhưng biên mỏng (share >= 25%, biên thấp hơn TB >= 2.0 pp).
  // -------------------------------------------------------------
  if (overallMargin !== null) {
    const checkLowMarginHighShare = (
      pivot: MetricPivotTable | null,
      dimNameVi: string,
      kpiId: string,
      factCat: string
    ) => {
      if (!pivot || !pivot.rows || totalRev <= 0) return null;
      const candidates = pivot.rows.filter(
        (r) =>
          !isUnlabeledLabel(r.label || r.key) &&
          r.margin_pct !== undefined &&
          r.revenue !== undefined &&
          r.revenue / totalRev >= INSIGHT_THRESHOLDS.SHARE_LARGE &&
          overallMargin - r.margin_pct >= INSIGHT_THRESHOLDS.MARGIN_LOW_PP
      );
      if (candidates.length === 0) return null;

      // Find lowest margin or largest share
      candidates.sort((a, b) => (a.margin_pct || 0) - (b.margin_pct || 0));
      const worst = candidates[0];
      const share = (worst.revenue || 0) / totalRev;
      const matchingFact = findFact(facts, factCat, worst.label || worst.key);
      const refs = matchingFact
        ? totalMarginFact
          ? [matchingFact.id, totalMarginFact.id]
          : [matchingFact.id]
        : totalMarginFact
          ? [totalMarginFact.id]
          : [];

      return {
        dimNameVi,
        kpiId,
        name: worst.label || worst.key,
        margin: worst.margin_pct || 0,
        rev: worst.revenue || 0,
        share,
        refs,
      };
    };

    const lowC = checkLowMarginHighShare(getMetricPivot(metrics, 'margin_by_channel'), 'Kênh', 'margin_by_channel', 'channel');
    const lowP = checkLowMarginHighShare(getMetricPivot(metrics, 'margin_by_product'), 'Sản phẩm', 'margin_by_product', 'product');
    const targetLow = lowC || lowP;

    if (targetLow) {
      findingsWithPriority.push({
        priority: 90,
        finding: {
          rule_id: 'R-LOW-MARGIN-HIGH-SHARE',
          title: `${targetLow.dimNameVi} ${targetLow.name} chiếm tỷ trọng doanh thu lớn nhưng biên lợi nhuận mỏng`,
          evidence: `${targetLow.dimNameVi} ${targetLow.name} đóng góp ${formatPercent(targetLow.share)} tổng doanh số (${formatNumber(targetLow.rev, 0)} VND) nhưng biên lợi nhuận chỉ đạt ${formatPercent(targetLow.margin / 100)}, thấp hơn mức bình quân ${formatPercent(overallMargin / 100)} [${targetLow.refs.join(', ')}].`,
          meaning:
            'Quy mô doanh thu lớn ở nhóm có tỷ suất lợi nhuận thấp có thể làm ảnh hưởng đến hiệu quả sinh lời chung, cần kiểm tra xem cơ cấu giá đã phù hợp chưa.',
          opportunity_risk:
            'Cần kiểm tra thêm chi phí để tránh nguy cơ tỷ suất sinh lời bị thu hẹp khi doanh thu mở rộng.',
          action:
            `Rà soát lại chính sách giá trên ${targetLow.dimNameVi} ${targetLow.name} để bảo vệ tỷ suất lợi nhuận.`,
          kpi_metric_id: targetLow.kpiId,
          check_after: '1 quý',
          source_refs: targetLow.refs,
        },
      });
    }
  }

  // -------------------------------------------------------------
  // RANKING & SELECTION (Max MAX_FINDINGS = 6)
  // Sort by priority descending (higher priority first)
  // -------------------------------------------------------------
  findingsWithPriority.sort((a, b) => b.priority - a.priority);

  const selectedFindings: InsightFinding[] = [];
  const seenDedupKeys = new Set<string>();

  for (const item of findingsWithPriority) {
    if (selectedFindings.length >= INSIGHT_THRESHOLDS.MAX_FINDINGS) break;
    const dedupKey =
      item.finding.rule_id === 'R-CONC'
        ? `R-CONC:${item.finding.title.split(' ')[0]}`
        : item.finding.rule_id;
    if (!seenDedupKeys.has(dedupKey)) {
      seenDedupKeys.add(dedupKey);
      selectedFindings.push(item.finding);
    }
  }

  // Fallback: If no findings matched at all (e.g. dataset without triggers)
  if (selectedFindings.length === 0) {
    return {
      findings: [],
      priority_actions: [],
      key_takeaways: [
        'Chưa có phát hiện nổi bật với các chỉ số đã chọn; hãy chọn thêm chỉ số theo kênh, sản phẩm hoặc thời gian để có nhận định sâu hơn.',
      ],
    };
  }

  // Prompt 5A-FIX3 1.4: Resolve KPI metric to match chosen & feasible metrics
  const feasibleMetricIds = new Set<string>();
  if (factsTable.metrics_result) {
    for (const [mid, mres] of Object.entries(factsTable.metrics_result)) {
      if (mres && mres.feasible) {
        feasibleMetricIds.add(mid);
      }
    }
  }

  if (feasibleMetricIds.size > 0) {
    for (const f of selectedFindings) {
      const isCodeOnly =
        f.rule_id === 'R-NO-MARGIN' ||
        f.rule_id === 'R-FEW-ROWS' ||
        f.rule_id === 'R-UNLABELED';
      if (!isCodeOnly && !feasibleMetricIds.has(f.kpi_metric_id)) {
        let alternateKpi = '';
        if (f.rule_id.includes('CHANNEL') || f.title.startsWith('Kênh')) {
          const pref = ['revenue_by_channel', 'margin_by_channel', 'total_revenue'];
          alternateKpi = pref.find((id) => feasibleMetricIds.has(id)) || '';
        } else if (f.rule_id.includes('PRODUCT') || f.title.startsWith('Sản phẩm')) {
          const pref = ['revenue_by_product', 'margin_by_product', 'total_revenue'];
          alternateKpi = pref.find((id) => feasibleMetricIds.has(id)) || '';
        } else if (f.title.startsWith('Khu vực')) {
          const pref = ['revenue_by_region', 'total_revenue'];
          alternateKpi = pref.find((id) => feasibleMetricIds.has(id)) || '';
        } else if (f.rule_id === 'R-MOM') {
          const pref = ['revenue_growth', 'revenue_by_month', 'total_revenue'];
          alternateKpi = pref.find((id) => feasibleMetricIds.has(id)) || '';
        } else if (f.rule_id === 'R-MATRIX') {
          const pref = ['channel_product_matrix', 'margin_by_channel', 'margin_by_product', 'total_revenue'];
          alternateKpi = pref.find((id) => feasibleMetricIds.has(id)) || '';
        }
        if (!alternateKpi) {
          alternateKpi = feasibleMetricIds.has('total_revenue')
            ? 'total_revenue'
            : Array.from(feasibleMetricIds)[0] || '';
        }
        f.kpi_metric_id = alternateKpi;
      }
    }
  }

  // Prompt 5B Section 1.E.3: Prioritize findings related to user's questions
  const qMetricIds = new Set(questionMetricIds || factsTable.question_metric_ids || []);
  if (qMetricIds.size > 0) {
    for (const f of selectedFindings) {
      if (qMetricIds.has(f.kpi_metric_id)) {
        f.isQuestionRelated = true;
      }
    }

    const codeOnly: InsightFinding[] = [];
    const questionRelated: InsightFinding[] = [];
    const others: InsightFinding[] = [];

    for (const f of selectedFindings) {
      const isCodeOnly =
        f.rule_id === 'R-NO-MARGIN' ||
        f.rule_id === 'R-FEW-ROWS' ||
        f.rule_id === 'R-UNLABELED';
      if (isCodeOnly) {
        codeOnly.push(f);
      } else if (f.isQuestionRelated) {
        questionRelated.push(f);
      } else {
        others.push(f);
      }
    }

    selectedFindings.length = 0;
    selectedFindings.push(...codeOnly, ...questionRelated, ...others);
  }

  // Extract Key Takeaways (Max 3)
  const key_takeaways: string[] = selectedFindings.slice(0, 3).map((f) => {
    return `${f.title}: ${f.meaning}`;
  });

  // Extract Priority Actions (Max MAX_ACTIONS_PRIORITY = 3, unique kpi_metric_id or action)
  const priority_actions: InsightActionPriority[] = [];
  const seenActionKeys = new Set<string>();

  for (const f of selectedFindings) {
    if (priority_actions.length >= INSIGHT_THRESHOLDS.MAX_ACTIONS_PRIORITY) break;
    const actionKey = f.kpi_metric_id || f.rule_id;
    if (!seenActionKeys.has(actionKey)) {
      seenActionKeys.add(actionKey);
      priority_actions.push({
        action: f.action,
        kpi_metric_id: f.kpi_metric_id,
        check_after: f.check_after,
        source_refs: f.source_refs,
        rule_id: f.rule_id,
      });
    }
  }

  return {
    findings: selectedFindings,
    priority_actions,
    key_takeaways,
  };
}
