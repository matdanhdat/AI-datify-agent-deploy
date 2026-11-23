/**
 * High-Performance Business Data Analysis Engine (Prompt M3-A & 1B-1).
 * Pure TypeScript, single-pass O(n) aggregation using Map + TypedArrays + cached Intl.Collator('vi').
 * ZERO AI calls. ZERO raw-data mutation. 100% deterministic.
 * Strictly avoids silent fallbacks by delegating to `resolveBusinessRoles`.
 */

import type { BusinessColumn, BusinessTable } from '../businessTable';
import type { ChartSpec, Metric } from '../schemas';
import { formatNumber, formatPercent } from '../../utils/format';
import { resolveBusinessRoles, BUSINESS_ROLE_WARNINGS, type BusinessResolvedRoles } from './businessRoles';
import { applyManualBusinessRoles } from '../validator/business';

// Single reusable Vietnamese numeric collator (never recreated inside loops)
const VI_COLLATOR = new Intl.Collator('vi', { numeric: true, sensitivity: 'base' });

export interface DimensionBreakdownItem {
  key: string;
  rows: number;
  orders: number | null;
  revenue: number;
  cogs: number | null;
  profit: number | null;
  margin_pct: number | null;
  aov: number | null;
  revenue_share_pct: number;
  /** Month-over-month absolute revenue delta (populated for by_month) */
  mom_revenue_delta?: number | null;
  /** Month-over-month percentage revenue change (populated for by_month) */
  mom_revenue_pct?: number | null;
}

export interface BusinessAnomalyItem {
  row_index: number;
  row_id: string;
  reason_vi: string;
  revenue: number;
  profit: number | null;
}

export interface UnavailableMetricOrDimension {
  id: string;
  label_vi: string;
  reason_vi: string;
}

export interface BusinessAnalysisSummary {
  kind: 'business';
  total_rows: number;
  total_columns: number;
  date_from: string;
  date_to: string;
  months_count: number;
  rows_without_period?: number;
  totals: {
    orders: number | null;
    revenue: number;
    cogs: number | null;
    profit: number | null;
    gross_margin_pct: number | null;
    aov: number | null;
  };
  by_channel: DimensionBreakdownItem[];
  by_month: DimensionBreakdownItem[];
  by_region: DimensionBreakdownItem[];
  by_product: DimensionBreakdownItem[];
  concentration: {
    top1_channel: DimensionBreakdownItem | null;
    top1_product: DimensionBreakdownItem | null;
    top3_products_share_pct: number | null;
    lowest_margin_product: DimensionBreakdownItem | null;
    lowest_revenue_region: DimensionBreakdownItem | null;
    unknown_region_revenue: number;
    unknown_region_share_pct: number;
    unknown_product_revenue: number;
    unknown_product_share_pct: number;
  };
  trend: {
    best_month: DimensionBreakdownItem | null;
    worst_month: DimensionBreakdownItem | null;
    latest_month: DimensionBreakdownItem | null;
    previous_month: DimensionBreakdownItem | null;
    latest_mom_delta: number | null;
    latest_mom_pct: number | null;
  };
  quality: {
    missing_numeric_cells: number;
    unknown_dimension_rows: number;
    negative_profit_rows: number;
    high_revenue_outlier_rows: number;
    anomalies: BusinessAnomalyItem[];
  };
  measure_labels: {
    orders: string;
    revenue: string;
    cogs: string;
    profit: string;
  };
  dimension_labels: {
    channel: string;
    month: string;
    region: string;
    product: string;
  };
  role_resolution?: BusinessResolvedRoles;
  unavailable?: UnavailableMetricOrDimension[];
}

export interface BusinessAnalysisOutput {
  summary: BusinessAnalysisSummary;
  metrics: Metric[];
  charts: ChartSpec[];
  warnings: string[];
  rows_without_period?: number;
  role_resolution?: BusinessResolvedRoles;
  unavailable?: UnavailableMetricOrDimension[];
}

interface RawGroupAcc {
  rows: number;
  orders: number;
  revenue: number;
  cogs: number;
  profit: number;
}

import { daysToIsoDate } from './calculator';

export function formatTimeMonth(col: Extract<BusinessColumn, { role: 'time' }>, i: number): string | null {
  if (col.raw_labels) {
    const rawLbl = col.raw_labels[i];
    if (!rawLbl || !rawLbl.trim()) return null;
    const key = extractMonthKey(rawLbl);
    if (key && /^([12]\d{3})-(0[1-9]|1[0-2])$/.test(key)) {
      const year = parseInt(key.slice(0, 4), 10);
      if (year >= 1900 && year <= 2100) {
        return key;
      }
    }
    return null;
  }
  const v = col.values[i];
  if (v < 0 || !Number.isFinite(v)) return null;
  if (col.granularity === 'month') {
    const year = 1970 + Math.floor(v / 12);
    const month = (v % 12) + 1;
    const key = `${year}-${month < 10 ? '0' : ''}${month}`;
    if (/^([12]\d{3})-(0[1-9]|1[0-2])$/.test(key) && year >= 1900 && year <= 2100) {
      return key;
    }
    return null;
  }
  const iso = daysToIsoDate(v);
  const key = iso.slice(0, 7);
  if (/^([12]\d{3})-(0[1-9]|1[0-2])$/.test(key)) {
    const year = parseInt(key.slice(0, 4), 10);
    if (year >= 1900 && year <= 2100) {
      return key;
    }
  }
  return null;
}

function getStringCell(col: BusinessColumn | undefined, i: number): string {
  if (!col) return '';
  if (col.role === 'dimension') {
    const code = col.codes[i];
    if (code === 0xffff) return '';
    return col.categories[code] ?? '';
  }
  if (col.role === 'id') {
    return col.values[i] ?? '';
  }
  if (col.role === 'time') {
    return formatTimeMonth(col, i) || 'Không xác định';
  }
  return '';
}

function extractMonthKey(rawTime: string): string | null {
  const s = rawTime.trim();
  if (!s || s === '0') return null;
  // Match YYYY-MM or YYYY/MM at start (e.g. '2026-10', '2026-10-15')
  if (s.length >= 7 && (s[4] === '-' || s[4] === '/')) {
    const key = `${s.slice(0, 4)}-${s.slice(5, 7)}`;
    if (/^[12]\d{3}-(0[1-9]|1[0-2])$/.test(key)) {
      const year = parseInt(key.slice(0, 4), 10);
      if (year >= 1900 && year <= 2100) return key;
    }
  }
  // Match MM/YYYY or DD/MM/YYYY
  const parts = s.split(/[/-]/);
  if (parts.length === 3 && parts[2].length === 4) {
    const key = `${parts[2]}-${parts[1].padStart(2, '0')}`;
    if (/^[12]\d{3}-(0[1-9]|1[0-2])$/.test(key)) {
      const year = parseInt(parts[2], 10);
      if (year >= 1900 && year <= 2100) return key;
    }
  }
  if (parts.length === 2 && parts[1].length === 4) {
    const key = `${parts[1]}-${parts[0].padStart(2, '0')}`;
    if (/^[12]\d{3}-(0[1-9]|1[0-2])$/.test(key)) {
      const year = parseInt(parts[1], 10);
      if (year >= 1900 && year <= 2100) return key;
    }
  }
  return null;
}

function finalizeGroupMap(
  map: Map<string, RawGroupAcc>,
  totalRevenue: number,
  sortMode: 'revenue_desc' | 'key_asc',
  options: { hasOrders: boolean; hasCogs: boolean; hasProfit: boolean }
): DimensionBreakdownItem[] {
  const items: DimensionBreakdownItem[] = [];
  const { hasOrders, hasCogs, hasProfit } = options;

  for (const [key, acc] of map.entries()) {
    const margin_pct =
      hasProfit && acc.revenue > 0 ? (acc.profit / acc.revenue) * 100 : null;
    const aov = hasOrders && acc.orders > 0 ? acc.revenue / acc.orders : null;
    const revenue_share_pct = totalRevenue > 0 ? (acc.revenue / totalRevenue) * 100 : 0;

    items.push({
      key,
      rows: acc.rows,
      orders: hasOrders ? acc.orders : null,
      revenue: acc.revenue,
      cogs: hasCogs ? acc.cogs : null,
      profit: hasProfit ? acc.profit : null,
      margin_pct,
      aov,
      revenue_share_pct,
    });
  }

  if (sortMode === 'revenue_desc') {
    items.sort((a, b) => {
      if (b.revenue !== a.revenue) return b.revenue - a.revenue;
      return VI_COLLATOR.compare(a.key, b.key);
    });
  } else {
    items.sort((a, b) => VI_COLLATOR.compare(a.key, b.key));
  }

  return items;
}

/**
 * Single-pass O(n) business analysis engine.
 * Computes all totals, 4-dimension breakdowns, MoM trends, concentration, quality anomalies,
 * KPI metrics, and ECharts specs in one pass over TypedArrays.
 * Emits null and explicit unavailable reasons when columns are missing.
 */
export function analyzeBusinessTable(
  table: BusinessTable,
  onProgress?: (percent: number, message: string) => void
): BusinessAnalysisOutput {
  const n = table.n;
  let roles = resolveBusinessRoles(table);
  roles = applyManualBusinessRoles(roles, table);

  const hasRevenue =
    (roles.revenue.status === 'tìm thấy' || roles.revenue.status === 'suy luận') &&
    roles.revenue.col !== null;
  const hasOrders = roles.orders.status === 'tìm thấy' && roles.orders.col !== null;

  const hasCogsDirect = roles.cogs.status === 'tìm thấy' && roles.cogs.col !== null;
  const hasCogsComputed = roles.cogs.status === 'tính ra';
  const hasCogs = hasCogsDirect || hasCogsComputed;

  const hasProfitDirect =
    (roles.profit.status === 'tìm thấy' || roles.profit.status === 'suy luận') &&
    roles.profit.col !== null;
  const hasProfitComputed = roles.profit.status === 'tính ra';
  const hasProfit = hasProfitDirect || hasProfitComputed;

  const hasChannel = roles.channel.status === 'tìm thấy' && roles.channel.col !== null;
  const hasRegion = roles.region.status === 'tìm thấy' && roles.region.col !== null;
  const hasProduct = roles.product.status === 'tìm thấy' && roles.product.col !== null;
  const hasTime = roles.time.status === 'tìm thấy' && roles.time.col !== null;

  const revArr = hasRevenue ? (roles.revenue.col as Extract<BusinessColumn, { role: 'measure' }>).values : null;
  const ordersArr = hasOrders ? (roles.orders.col as Extract<BusinessColumn, { role: 'measure' }>).values : null;
  const cogsArr = hasCogsDirect ? (roles.cogs.col as Extract<BusinessColumn, { role: 'measure' }>).values : null;
  const profitArr = hasProfitDirect ? (roles.profit.col as Extract<BusinessColumn, { role: 'measure' }>).values : null;

  const channelMap = new Map<string, RawGroupAcc>();
  const monthMap = new Map<string, RawGroupAcc>();
  const regionMap = new Map<string, RawGroupAcc>();
  const productMap = new Map<string, RawGroupAcc>();

  let totalOrdersAccum = 0;
  let totalRevenueAccum = 0;
  let totalCogsAccum = 0;
  let totalProfitAccum = 0;

  let missingNumericCells = 0;
  let unknownDimensionRows = 0;
  let negativeProfitRows = 0;
  let rowsWithoutPeriod = 0;
  let revenueWithoutPeriod = 0;

  // Welford running stats on row revenue for outlier detection in single pass
  let revMean = 0;
  let revM2 = 0;
  let revCount = 0;

  // Dimension lookup caches
  const channelCol = hasChannel ? roles.channel.col : null;
  const channelDictTrimmed =
    channelCol?.role === 'dimension'
      ? channelCol.categories.map((s) => (s.trim() ? s.trim() : 'Không xác định'))
      : null;
  const channelCodes = channelCol?.role === 'dimension' ? channelCol.codes : null;

  const regionCol = hasRegion ? roles.region.col : null;
  const regionDictTrimmed =
    regionCol?.role === 'dimension'
      ? regionCol.categories.map((s) => (s.trim() ? s.trim() : 'Không xác định'))
      : null;
  const regionCodes = regionCol?.role === 'dimension' ? regionCol.codes : null;

  const productCol = hasProduct ? roles.product.col : null;
  const productDictTrimmed =
    productCol?.role === 'dimension'
      ? productCol.categories.map((s) => (s.trim() ? s.trim() : 'Không xác định'))
      : null;
  const productCodes = productCol?.role === 'dimension' ? productCol.codes : null;

  const timeCol = hasTime ? roles.time.col : null;
  const timeColTyped = timeCol?.role === 'time' ? timeCol : null;

  const idCol = table.columns.find((c) => c.role === 'id');

  const monthValCache = new Map<number, string>();
  const monthStringCache = new Map<string, string>();
  const progressStep = n >= 10000 ? Math.floor(n / 4) : 0;

  const accumulate = (
    map: Map<string, RawGroupAcc>,
    key: string,
    o: number,
    r: number,
    c: number,
    p: number
  ) => {
    let acc = map.get(key);
    if (!acc) {
      acc = { rows: 0, orders: 0, revenue: 0, cogs: 0, profit: 0 };
      map.set(key, acc);
    }
    acc.rows++;
    acc.orders += o;
    acc.revenue += r;
    acc.cogs += c;
    acc.profit += p;
  };

  for (let i = 0; i < n; i++) {
    if (progressStep > 0 && i > 0 && i % progressStep === 0 && onProgress) {
      const pct = 15 + Math.round((i / n) * 45);
      onProgress(
        pct,
        `Đang tổng hợp dữ liệu kinh doanh (${i.toLocaleString('vi-VN')}/${n.toLocaleString('vi-VN')} dòng)...`
      );
    }

    const rawR = revArr ? revArr[i] : 0;
    if (revArr && isNaN(rawR)) missingNumericCells++;
    const r = isNaN(rawR) ? 0 : rawR;
    totalRevenueAccum += r;

    let rawO = 0;
    let o = 0;
    if (hasOrders && ordersArr) {
      rawO = ordersArr[i];
      if (isNaN(rawO)) missingNumericCells++;
      o = isNaN(rawO) ? 0 : rawO;
      totalOrdersAccum += o;
    }

    let rawC = 0;
    let c = 0;
    let rawP = 0;
    let p = 0;

    if (hasCogsDirect && cogsArr) {
      rawC = cogsArr[i];
      if (isNaN(rawC)) missingNumericCells++;
      c = isNaN(rawC) ? 0 : rawC;
    }

    if (hasProfitDirect && profitArr) {
      rawP = profitArr[i];
      if (isNaN(rawP)) missingNumericCells++;
      p = isNaN(rawP) ? 0 : rawP;
      if (hasCogsComputed) {
        c = r - p;
      }
    } else if (hasProfitComputed) {
      p = r - c;
    }

    if (hasCogs) totalCogsAccum += c;
    if (hasProfit) {
      totalProfitAccum += p;
      if (p < 0) negativeProfitRows++;
    }

    if (!isNaN(rawR) && isFinite(rawR)) {
      revCount++;
      const d1 = rawR - revMean;
      revMean += d1 / revCount;
      const d2 = rawR - revMean;
      revM2 += d1 * d2;
    }

    let hasUnknownDim = false;

    if (hasChannel && channelDictTrimmed && channelCodes) {
      const code = channelCodes[i];
      const k = code === 0xffff ? 'Không xác định' : channelDictTrimmed[code] || 'Không xác định';
      if (k === 'Không xác định') hasUnknownDim = true;
      accumulate(channelMap, k, o, r, c, p);
    }

    if (hasRegion && regionDictTrimmed && regionCodes) {
      const code = regionCodes[i];
      const k = code === 0xffff ? 'Không xác định' : regionDictTrimmed[code] || 'Không xác định';
      if (k === 'Không xác định') hasUnknownDim = true;
      accumulate(regionMap, k, o, r, c, p);
    }

    if (hasProduct && productDictTrimmed && productCodes) {
      const code = productCodes[i];
      const k = code === 0xffff ? 'Không xác định' : productDictTrimmed[code] || 'Không xác định';
      if (k === 'Không xác định') hasUnknownDim = true;
      accumulate(productMap, k, o, r, c, p);
    }

    if (hasTime && timeColTyped) {
      let mKey: string | null = null;
      const rawLbl = timeColTyped.raw_labels?.[i];
      if (rawLbl && rawLbl.trim()) {
        mKey = monthStringCache.get(rawLbl) ?? null;
        if (mKey === null && !monthStringCache.has(rawLbl)) {
          mKey = extractMonthKey(rawLbl);
          if (mKey && /^\d{4}-(0[1-9]|1[0-2])$/.test(mKey)) {
            monthStringCache.set(rawLbl, mKey);
          } else {
            mKey = null;
            monthStringCache.set(rawLbl, '');
          }
        }
      } else {
        const tv = timeColTyped.values[i];
        mKey = monthValCache.get(tv) ?? null;
        if (mKey === null && !monthValCache.has(tv)) {
          mKey = formatTimeMonth(timeColTyped, i);
          if (mKey && /^\d{4}-(0[1-9]|1[0-2])$/.test(mKey)) {
            monthValCache.set(tv, mKey);
          } else {
            mKey = null;
            monthValCache.set(tv, '');
          }
        }
      }

      if (mKey && /^\d{4}-(0[1-9]|1[0-2])$/.test(mKey)) {
        accumulate(monthMap, mKey, o, r, c, p);
      } else {
        rowsWithoutPeriod++;
        revenueWithoutPeriod += r;
      }
    } else {
      rowsWithoutPeriod++;
      revenueWithoutPeriod += r;
    }

    if (hasUnknownDim) unknownDimensionRows++;
  }

  if (onProgress) {
    onProgress(65, 'Đang tính toán tỷ trọng, xu hướng theo tháng và phát hiện bất thường...');
  }

  let isFakeZeroRevenue = false;
  if (hasRevenue && roles.revenue.col && roles.revenue.col.role === 'measure') {
    const revMeasure = roles.revenue.col;
    let sourceHasNonZero = false;
    if (revMeasure.raw_values) {
      for (let i = 0; i < n; i++) {
        if (!isNaN(revMeasure.raw_values[i]) && revMeasure.raw_values[i] !== 0) {
          sourceHasNonZero = true;
          break;
        }
      }
    }
    if (!sourceHasNonZero && revMeasure.raw_strings) {
      for (let i = 0; i < n; i++) {
        const s = revMeasure.raw_strings[i];
        if (s && s.trim() && s.trim() !== '0') {
          sourceHasNonZero = true;
          break;
        }
      }
    }
    if (!sourceHasNonZero && revArr) {
      for (let i = 0; i < n; i++) {
        if (!isNaN(revArr[i]) && revArr[i] !== 0) {
          sourceHasNonZero = true;
          break;
        }
      }
    }
    if (sourceHasNonZero && totalRevenueAccum === 0) {
      isFakeZeroRevenue = true;
    }
  }

  const totalOrders = hasOrders ? totalOrdersAccum : null;
  const totalRevenue = isFakeZeroRevenue ? (null as any) : totalRevenueAccum;
  const totalCogs = hasCogs ? totalCogsAccum : null;
  const totalProfit = isFakeZeroRevenue ? null : (hasProfit ? totalProfitAccum : null);
  const grossMarginPct =
    !isFakeZeroRevenue && hasProfit && totalProfit !== null && totalRevenue > 0
      ? (totalProfit / totalRevenue) * 100
      : null;
  const aov =
    !isFakeZeroRevenue && hasOrders && totalOrders !== null && totalOrders > 0 && totalRevenue !== null
      ? totalRevenue / totalOrders
      : null;

  const groupOpts = { hasOrders, hasCogs, hasProfit };
  const byChannel = hasChannel ? finalizeGroupMap(channelMap, totalRevenue, 'revenue_desc', groupOpts) : [];
  const byRegion = hasRegion ? finalizeGroupMap(regionMap, totalRevenue, 'revenue_desc', groupOpts) : [];
  const byProduct = hasProduct ? finalizeGroupMap(productMap, totalRevenue, 'revenue_desc', groupOpts) : [];
  const byMonth =
    hasTime && rowsWithoutPeriod < n
      ? finalizeGroupMap(monthMap, totalRevenue, 'key_asc', groupOpts)
      : [];

  // Compute MoM delta & pct
  for (let i = 0; i < byMonth.length; i++) {
    if (i === 0) {
      byMonth[i].mom_revenue_delta = null;
      byMonth[i].mom_revenue_pct = null;
    } else {
      const prevRev = byMonth[i - 1].revenue;
      const delta = byMonth[i].revenue - prevRev;
      byMonth[i].mom_revenue_delta = delta;
      byMonth[i].mom_revenue_pct = prevRev > 0 ? (delta / prevRev) * 100 : null;
    }
  }

  // Outlier & anomaly scan
  const revStdev = revCount >= 2 ? Math.sqrt(Math.max(0, revM2 / (revCount - 1))) : 0;
  const outlierThreshold = revCount >= 10 && revStdev > 0 ? revMean + 2.5 * revStdev : Infinity;
  let highRevenueOutlierRows = 0;
  const anomalies: BusinessAnomalyItem[] = [];

  for (let i = 0; i < n; i++) {
    const r = revArr && !isNaN(revArr[i]) ? revArr[i] : 0;
    let p: number | null = null;
    if (hasProfit) {
      if (hasProfitDirect && profitArr) {
        p = isNaN(profitArr[i]) ? 0 : profitArr[i];
      } else if (hasProfitComputed && cogsArr) {
        p = r - (isNaN(cogsArr[i]) ? 0 : cogsArr[i]);
      }
    }

    const isNegProfit = p !== null && p < 0;
    const isHighOutlier = r > outlierThreshold;
    if (isHighOutlier) highRevenueOutlierRows++;

    if ((isNegProfit || isHighOutlier) && anomalies.length < 10) {
      const rowId = getStringCell(idCol, i).trim() || `Dòng ${i + 1}`;
      anomalies.push({
        row_index: i + 1,
        row_id: rowId,
        reason_vi: isNegProfit
          ? `Lợi nhuận gộp âm (${formatNumber(p!, 0)} VND)`
          : `Doanh thu đột biến cao (${formatNumber(r, 0)} VND > ngưỡng TB + 2,5×ĐLC)`,
        revenue: r,
        profit: p,
      });
    }
  }

  // Concentration highlights
  const knownProducts = byProduct.filter((p) => p.key !== 'Không xác định');
  const knownRegions = byRegion.filter((r) => r.key !== 'Không xác định');

  const top1Channel = byChannel[0] || null;
  const top1Product = knownProducts[0] || byProduct[0] || null;
  const top3ProductsSharePct =
    hasProduct && byProduct.length > 0
      ? byProduct.slice(0, 3).reduce((acc, item) => acc + item.revenue_share_pct, 0)
      : null;

  const lowestMarginProduct =
    hasProfit && (knownProducts.length > 0 ? knownProducts : byProduct).length > 0
      ? (knownProducts.length > 0 ? knownProducts : byProduct)
          .filter((p) => p.revenue > 0 && p.margin_pct !== null)
          .sort((a, b) => (a.margin_pct ?? 0) - (b.margin_pct ?? 0))[0] || null
      : null;

  const lowestRevenueRegion =
    (knownRegions.length > 0 ? knownRegions : byRegion)
      .slice()
      .sort((a, b) => a.revenue - b.revenue)[0] || null;

  const unknownRegion = byRegion.find((r) => r.key === 'Không xác định');
  const unknownProduct = byProduct.find((p) => p.key === 'Không xác định');

  const validMonths = byMonth.filter((m) => m.key !== 'Không xác định');
  const bestMonth = validMonths.slice().sort((a, b) => b.revenue - a.revenue)[0] || null;
  const worstMonth = validMonths.slice().sort((a, b) => a.revenue - b.revenue)[0] || null;
  const latestMonth = validMonths.length > 0 ? validMonths[validMonths.length - 1] : null;
  const previousMonth = validMonths.length >= 2 ? validMonths[validMonths.length - 2] : null;

  const dateFrom = validMonths.length > 0 ? validMonths[0].key : '';
  const dateTo = validMonths.length > 0 ? validMonths[validMonths.length - 1].key : '';

  // Track unavailable items for UI and reporting
  const unavailable: UnavailableMetricOrDimension[] = [];

  if (isFakeZeroRevenue) {
    const revColLabel = roles.revenue.col?.label || 'Doanh thu';
    const fakeZeroMsg = `Không tính được doanh thu từ cột "${revColLabel}"`;
    unavailable.push({
      id: 'revenue_total',
      label_vi: 'Tổng doanh thu',
      reason_vi: fakeZeroMsg,
    });
    if (!roles.warnings.includes(fakeZeroMsg)) {
      roles.warnings.push(fakeZeroMsg);
    }
  }

  if (!hasOrders) {
    unavailable.push({
      id: 'orders_total',
      label_vi: 'Tổng số đơn hàng',
      reason_vi: BUSINESS_ROLE_WARNINGS.MISSING_ORDERS,
    });
    unavailable.push({
      id: 'aov',
      label_vi: 'Giá trị đơn trung bình (AOV)',
      reason_vi: BUSINESS_ROLE_WARNINGS.MISSING_ORDERS,
    });
  }

  if (!hasCogs) {
    unavailable.push({
      id: 'cogs_total',
      label_vi: 'Tổng giá vốn',
      reason_vi:
        roles.cogs.status === 'không đáng tin'
          ? roles.cogs.reason_vi
          : BUSINESS_ROLE_WARNINGS.MISSING_COGS_ONLY,
    });
  }

  if (!hasProfit) {
    unavailable.push({
      id: 'gross_profit_total',
      label_vi: 'Tổng lợi nhuận gộp',
      reason_vi:
        roles.profit.status === 'không đáng tin'
          ? roles.profit.reason_vi
          : roles.cogs.status === 'thiếu'
          ? BUSINESS_ROLE_WARNINGS.MISSING_COGS_AND_PROFIT
          : roles.profit.reason_vi,
    });
  }

  if (grossMarginPct === null) {
    const marginReason =
      roles.profit.status === 'không đáng tin'
        ? roles.profit.reason_vi
        : roles.cogs.status === 'không đáng tin'
        ? roles.cogs.reason_vi
        : BUSINESS_ROLE_WARNINGS.MISSING_COGS_AND_PROFIT;

    unavailable.push({
      id: 'gross_margin_pct',
      label_vi: 'Biên lợi nhuận gộp',
      reason_vi: marginReason,
    });
  }

  if (!hasChannel) {
    unavailable.push({
      id: 'by_channel',
      label_vi: 'Phân tích theo kênh bán',
      reason_vi: BUSINESS_ROLE_WARNINGS.MISSING_CHANNEL,
    });
  }

  if (!hasRegion) {
    unavailable.push({
      id: 'by_region',
      label_vi: 'Phân tích theo khu vực',
      reason_vi: BUSINESS_ROLE_WARNINGS.MISSING_REGION,
    });
  }

  if (!hasProduct) {
    unavailable.push({
      id: 'by_product',
      label_vi: 'Phân tích theo sản phẩm',
      reason_vi: BUSINESS_ROLE_WARNINGS.MISSING_PRODUCT,
    });
    unavailable.push({
      id: 'top3_products_share',
      label_vi: 'Tỷ trọng Top 3 sản phẩm',
      reason_vi: BUSINESS_ROLE_WARNINGS.MISSING_PRODUCT,
    });
  }

  if (!hasTime) {
    unavailable.push({
      id: 'by_month',
      label_vi: 'Xu hướng theo thời gian',
      reason_vi: BUSINESS_ROLE_WARNINGS.MISSING_TIME,
    });
  } else if (byMonth.length === 0 || rowsWithoutPeriod === n) {
    unavailable.push({
      id: 'by_month',
      label_vi: 'Phân tích theo tháng',
      reason_vi: 'Cột Tháng không có giá trị hợp lệ: các phân tích theo tháng không được tính.',
    });
  }

  const summary: BusinessAnalysisSummary = {
    kind: 'business',
    total_rows: n,
    total_columns: table.columns.length,
    date_from: dateFrom,
    date_to: dateTo,
    months_count: validMonths.length,
    rows_without_period: rowsWithoutPeriod > 0 ? rowsWithoutPeriod : undefined,
    totals: {
      orders: totalOrders,
      revenue: totalRevenue,
      cogs: totalCogs,
      profit: totalProfit,
      gross_margin_pct: grossMarginPct,
      aov,
    },
    by_channel: byChannel,
    by_month: byMonth,
    by_region: byRegion,
    by_product: byProduct,
    concentration: {
      top1_channel: top1Channel,
      top1_product: top1Product,
      top3_products_share_pct: top3ProductsSharePct,
      lowest_margin_product: lowestMarginProduct,
      lowest_revenue_region: lowestRevenueRegion,
      unknown_region_revenue: unknownRegion?.revenue ?? 0,
      unknown_region_share_pct: unknownRegion?.revenue_share_pct ?? 0,
      unknown_product_revenue: unknownProduct?.revenue ?? 0,
      unknown_product_share_pct: unknownProduct?.revenue_share_pct ?? 0,
    },
    trend: {
      best_month: bestMonth,
      worst_month: worstMonth,
      latest_month: latestMonth,
      previous_month: previousMonth,
      latest_mom_delta: latestMonth?.mom_revenue_delta ?? null,
      latest_mom_pct: latestMonth?.mom_revenue_pct ?? null,
    },
    quality: {
      missing_numeric_cells: missingNumericCells,
      unknown_dimension_rows: unknownDimensionRows,
      negative_profit_rows: negativeProfitRows,
      high_revenue_outlier_rows: highRevenueOutlierRows,
      anomalies,
    },
    measure_labels: {
      orders: roles.orders.col?.label || 'Số đơn hàng',
      revenue: roles.revenue.col?.label || 'Doanh thu',
      cogs: roles.cogs.col?.label || 'Giá vốn',
      profit: roles.profit.col?.label || 'Lợi nhuận gộp',
    },
    dimension_labels: {
      channel: roles.channel.col?.label || 'Kênh bán',
      month: roles.time.col?.label || 'Tháng',
      region: roles.region.col?.label || 'Khu vực',
      product: roles.product.col?.label || 'Sản phẩm',
    },
    role_resolution: roles,
    unavailable,
  };

  if (onProgress) {
    onProgress(80, 'Đang dựng chỉ số KPI và biểu đồ kinh doanh...');
  }

  // Build standardized Metric[]
  const periodObj = dateFrom && dateTo ? { from: dateFrom, to: dateTo } : undefined;
  const metrics: Metric[] = [
    {
      id: 'biz_total_revenue',
      label_vi: 'Tổng doanh thu',
      symbol: null,
      value: totalRevenue,
      unit: 'currency',
      status: 'ok',
      polarity: 'higher_better',
      formula_vi: 'Tổng cột Doanh thu trên toàn bộ các dòng sạch',
      inputs: ['revenue'],
      period: periodObj,
      calc: [
        { label_vi: 'Số dòng dữ liệu sạch', value: n, unit: 'dòng' },
        { label_vi: 'Tổng doanh thu', value: totalRevenue, unit: 'VND' },
      ],
    },
    {
      id: 'biz_total_profit',
      label_vi: 'Tổng lợi nhuận gộp',
      symbol: null,
      value: totalProfit,
      unit: 'currency',
      status: totalProfit !== null ? 'ok' : 'insufficient_data',
      polarity: 'higher_better',
      formula_vi: 'Tổng cột Lợi nhuận gộp (= Doanh thu - Giá vốn)',
      inputs: ['profit', 'revenue', 'cogs'],
      period: periodObj,
      reason_vi: totalProfit === null ? roles.profit.reason_vi : undefined,
      calc:
        totalProfit !== null
          ? [
              { label_vi: 'Tổng doanh thu', value: totalRevenue, unit: 'VND' },
              { label_vi: 'Tổng giá vốn', value: totalCogs ?? 0, unit: 'VND' },
              { label_vi: 'Tổng lợi nhuận gộp', value: totalProfit, unit: 'VND' },
            ]
          : undefined,
    },
    {
      id: 'biz_gross_margin',
      label_vi: 'Biên lợi nhuận gộp',
      symbol: null,
      value: grossMarginPct !== null ? grossMarginPct / 100 : null,
      unit: 'ratio',
      status: grossMarginPct !== null ? 'ok' : 'insufficient_data',
      polarity: 'higher_better',
      formula_vi: 'Tổng lợi nhuận gộp / Tổng doanh thu',
      inputs: ['profit', 'revenue'],
      period: periodObj,
      reason_vi: grossMarginPct === null ? 'Không có dữ liệu giá vốn hoặc lợi nhuận gộp' : undefined,
      calc:
        grossMarginPct !== null
          ? [
              { label_vi: 'Tổng lợi nhuận gộp', value: totalProfit ?? 0, unit: 'VND' },
              { label_vi: 'Tổng doanh thu', value: totalRevenue, unit: 'VND' },
              { label_vi: 'Biên lợi nhuận gộp', value: grossMarginPct / 100, unit: 'ratio' },
            ]
          : undefined,
    },
    {
      id: 'biz_total_orders',
      label_vi: 'Tổng số đơn hàng',
      symbol: null,
      value: totalOrders,
      unit: 'count',
      status: totalOrders !== null ? 'ok' : 'insufficient_data',
      polarity: 'higher_better',
      formula_vi: 'Tổng cột Số đơn trên toàn bộ các dòng sạch',
      inputs: ['orders'],
      period: periodObj,
      reason_vi: totalOrders === null ? roles.orders.reason_vi : undefined,
      calc:
        totalOrders !== null
          ? [{ label_vi: 'Tổng số đơn hàng', value: totalOrders, unit: 'đơn' }]
          : undefined,
    },
    {
      id: 'biz_total_cogs',
      label_vi: 'Tổng giá vốn',
      symbol: null,
      value: totalCogs,
      unit: 'currency',
      status: totalCogs !== null ? 'ok' : 'insufficient_data',
      polarity: 'lower_better',
      formula_vi: 'Tổng cột Giá vốn trên toàn bộ các dòng sạch',
      inputs: ['cogs'],
      period: periodObj,
      reason_vi: totalCogs === null ? roles.cogs.reason_vi : undefined,
      calc:
        totalCogs !== null
          ? [{ label_vi: 'Tổng giá vốn', value: totalCogs, unit: 'VND' }]
          : undefined,
    },
    {
      id: 'biz_aov',
      label_vi: 'Giá trị đơn trung bình (AOV)',
      symbol: null,
      value: aov,
      unit: 'currency',
      status: aov !== null ? 'ok' : 'insufficient_data',
      polarity: 'higher_better',
      formula_vi: 'Tổng doanh thu / Tổng số đơn hàng',
      inputs: ['revenue', 'orders'],
      period: periodObj,
      reason_vi: aov === null ? roles.orders.reason_vi : undefined,
      calc:
        aov !== null
          ? [
              { label_vi: 'Tổng doanh thu', value: totalRevenue, unit: 'VND' },
              { label_vi: 'Tổng số đơn hàng', value: totalOrders ?? 0, unit: 'đơn' },
              { label_vi: 'Giá trị đơn trung bình', value: aov, unit: 'VND' },
            ]
          : undefined,
    },
  ];

  if (top1Channel) {
    metrics.push({
      id: 'biz_top_channel',
      label_vi: 'Kênh doanh thu cao nhất',
      symbol: null,
      value: top1Channel.revenue,
      text: `${top1Channel.key} (${formatNumber(top1Channel.revenue, 0)} VND)`,
      unit: 'text',
      status: 'ok',
      polarity: 'higher_better',
      formula_vi: 'Kênh bán có tổng doanh thu cao nhất',
      inputs: ['channel', 'revenue'],
      period: periodObj,
    });
  }

  if (top1Product) {
    metrics.push({
      id: 'biz_top_product',
      label_vi: 'Sản phẩm doanh thu cao nhất',
      symbol: null,
      value: top1Product.revenue,
      text: `${top1Product.key} (${formatNumber(top1Product.revenue, 0)} VND)`,
      unit: 'text',
      status: 'ok',
      polarity: 'higher_better',
      formula_vi: 'Sản phẩm có tổng doanh thu cao nhất',
      inputs: ['product', 'revenue'],
      period: periodObj,
    });
  }

  if (latestMonth && latestMonth.mom_revenue_pct !== null && latestMonth.mom_revenue_pct !== undefined) {
    metrics.push({
      id: 'biz_mom_change',
      label_vi: 'Biến động doanh thu tháng gần nhất',
      symbol: null,
      value: latestMonth.mom_revenue_pct / 100,
      unit: 'ratio',
      status: 'ok',
      polarity: 'higher_better',
      formula_vi: '(Doanh thu tháng gần nhất - Tháng trước) / Tháng trước',
      inputs: ['month', 'revenue'],
      period: periodObj,
      delta: {
        value: latestMonth.mom_revenue_delta ?? null,
        label_vi: `so với tháng ${previousMonth?.key || ''}`,
        status: 'ok',
      },
    });
  }

  // Build standardized ChartSpec[]
  const charts: ChartSpec[] = [];
  const hasMarginOrProfit = totalProfit !== null || grossMarginPct !== null;

  if (byChannel.length > 0) {
    charts.push({
      id: 'chart_biz_channel_revenue',
      title_vi: 'Doanh thu theo Kênh bán (VND)',
      subtitle_vi: hasMarginOrProfit
        ? 'So sánh tổng doanh thu và biên lợi nhuận gộp giữa các kênh bán hàng'
        : 'So sánh tổng doanh thu giữa các kênh bán hàng',
      kind: 'bar',
      symbols: byChannel.map((c) => c.key),
      data: {
        categories: byChannel.map((c) => c.key),
        values: byChannel.map((c) => c.revenue),
        valueFormat: 'currency',
        unit: 'VND',
      },
      table: {
        columns: ['Kênh bán', 'Số đơn', 'Doanh thu (VND)', 'Lợi nhuận gộp (VND)', 'Biên LN (%)', 'Tỷ trọng (%)'],
        rows: byChannel.map((c) => [
          c.key,
          c.orders !== null ? formatNumber(c.orders, 0) : 'KHÔNG ĐỦ DỮ LIỆU',
          formatNumber(c.revenue, 0),
          c.profit !== null ? formatNumber(c.profit, 0) : 'KHÔNG ĐỦ DỮ LIỆU',
          c.margin_pct !== null ? formatPercent(c.margin_pct / 100) : 'KHÔNG ĐỦ DỮ LIỆU',
          formatPercent(c.revenue_share_pct / 100),
        ]),
      },
      aria_vi: `Biểu đồ doanh thu theo kênh bán gồm ${byChannel.length} kênh; cao nhất là ${byChannel[0].key}.`,
    });
  }

  if (byMonth.length > 0) {
    charts.push({
      id: 'chart_biz_month_trend',
      title_vi: 'Xu hướng Doanh thu theo Tháng (VND)',
      subtitle_vi: hasMarginOrProfit
        ? 'Diễn biến tổng doanh thu và lợi nhuận gộp theo từng tháng'
        : 'Diễn biến tổng doanh thu theo từng tháng',
      kind: 'column',
      symbols: byMonth.map((m) => m.key),
      data: {
        categories: byMonth.map((m) => m.key),
        values: byMonth.map((m) => m.revenue),
        valueFormat: 'currency',
        unit: 'VND',
      },
      table: {
        columns: ['Tháng', 'Số đơn', 'Doanh thu (VND)', 'Lợi nhuận gộp (VND)', 'Biến động MoM (%)'],
        rows: byMonth.map((m) => [
          m.key,
          m.orders !== null ? formatNumber(m.orders, 0) : 'KHÔNG ĐỦ DỮ LIỆU',
          formatNumber(m.revenue, 0),
          m.profit !== null ? formatNumber(m.profit, 0) : 'KHÔNG ĐỦ DỮ LIỆU',
          m.mom_revenue_pct !== null && m.mom_revenue_pct !== undefined
            ? formatPercent(m.mom_revenue_pct / 100)
            : '-',
        ]),
      },
      aria_vi: `Biểu đồ xu hướng doanh thu theo ${byMonth.length} tháng từ ${dateFrom} đến ${dateTo}.`,
    });
  }

  if (byProduct.length > 0) {
    charts.push({
      id: 'chart_biz_product_revenue',
      title_vi: 'Doanh thu theo Sản phẩm (VND)',
      subtitle_vi: hasMarginOrProfit
        ? 'Đóng góp doanh thu và biên lợi nhuận gộp của từng nhóm sản phẩm'
        : 'Đóng góp doanh thu của từng nhóm sản phẩm',
      kind: 'bar',
      symbols: byProduct.map((p) => p.key),
      data: {
        categories: byProduct.map((p) => p.key),
        values: byProduct.map((p) => p.revenue),
        valueFormat: 'currency',
        unit: 'VND',
      },
      table: {
        columns: ['Sản phẩm', 'Số đơn', 'Doanh thu (VND)', 'Lợi nhuận gộp (VND)', 'Biên LN (%)', 'Tỷ trọng (%)'],
        rows: byProduct.map((p) => [
          p.key,
          p.orders !== null ? formatNumber(p.orders, 0) : 'KHÔNG ĐỦ DỮ LIỆU',
          formatNumber(p.revenue, 0),
          p.profit !== null ? formatNumber(p.profit, 0) : 'KHÔNG ĐỦ DỮ LIỆU',
          p.margin_pct !== null ? formatPercent(p.margin_pct / 100) : 'KHÔNG ĐỦ DỮ LIỆU',
          formatPercent(p.revenue_share_pct / 100),
        ]),
      },
      aria_vi: `Biểu đồ doanh thu theo sản phẩm gồm ${byProduct.length} nhóm sản phẩm.`,
    });
  }

  if (byRegion.length > 0) {
    charts.push({
      id: 'chart_biz_region_revenue',
      title_vi: 'Cơ cấu Doanh thu theo Khu vực',
      subtitle_vi: 'Tỷ trọng doanh thu phân bổ giữa các khu vực địa lý',
      kind: 'pie',
      symbols: byRegion.map((r) => r.key),
      data: {
        unit: 'VND',
        series: byRegion.map((r) => ({
          name: r.key,
          value: r.revenue,
          share: r.revenue_share_pct / 100,
        })),
      },
      table: {
        columns: ['Khu vực', 'Số đơn', 'Doanh thu (VND)', 'Lợi nhuận gộp (VND)', 'Tỷ trọng (%)'],
        rows: byRegion.map((r) => [
          r.key,
          r.orders !== null ? formatNumber(r.orders, 0) : 'KHÔNG ĐỦ DỮ LIỆU',
          formatNumber(r.revenue, 0),
          r.profit !== null ? formatNumber(r.profit, 0) : 'KHÔNG ĐỦ DỮ LIỆU',
          formatPercent(r.revenue_share_pct / 100),
        ]),
      },
      aria_vi: `Biểu đồ cơ cấu doanh thu theo ${byRegion.length} khu vực.`,
    });
  }

  // Combine warnings
  const warnings: string[] = [...roles.warnings];
  if (hasTime && rowsWithoutPeriod === n) {
    const msg = 'Cột Tháng không có giá trị hợp lệ: các phân tích theo tháng không được tính.';
    if (!warnings.includes(msg)) warnings.push(msg);
    if (!roles.warnings.includes(msg)) roles.warnings.push(msg);
  } else if (hasTime && rowsWithoutPeriod > 0 && rowsWithoutPeriod < n) {
    const msg = `Có ${rowsWithoutPeriod} dòng không có tháng hợp lệ: các dòng này không đưa vào xu hướng theo tháng nhưng vẫn được tính vào tổng và các chiều khác.`;
    if (!warnings.includes(msg)) warnings.push(msg);
    if (!roles.warnings.includes(msg)) roles.warnings.push(msg);
  }

  if (unknownDimensionRows > 0) {
    warnings.push(
      `Có ${unknownDimensionRows} dòng dữ liệu được gán nhãn "Không xác định" ở cột phân loại (do ô gốc bị trống).`
    );
  }
  if (validMonths.length > 0 && validMonths.length < 6) {
    warnings.push(
      `Dữ liệu chỉ trải dài ${validMonths.length} tháng (${dateFrom} đến ${dateTo}), chưa đủ đánh giá tính mùa vụ cả năm.`
    );
  }
  if (missingNumericCells > 0) {
    warnings.push(`Phát hiện ${missingNumericCells} ô số liệu bị trống đã được quy về 0 khi tổng hợp.`);
  }

  return {
    summary,
    metrics,
    charts,
    warnings,
    rows_without_period: rowsWithoutPeriod > 0 ? rowsWithoutPeriod : undefined,
    role_resolution: roles,
    unavailable,
  };
}
