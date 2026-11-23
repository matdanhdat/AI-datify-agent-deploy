/**
 * Business Metrics Single-Pass Selective Computer (Prompt 1D-1 Phần 1).
 * Pure TypeScript, O(n) single pass, Web Worker compatible.
 * Evaluates feasibility via businessFeasibility.ts, computes only requested metrics,
 * formats 1-line code text answers with tie-breaking, evaluates code-driven confidence,
 * generates code-driven data limits, and emits structured fact events with human-readable 'nguon'.
 */

import type { BusinessTable, BusinessColumn } from '../businessTable';
import {
  BUSINESS_METRIC_CATALOG,
  type BusinessMetricDef,
} from './businessCatalog';
import {
  buildBusinessFacts,
  checkFeasibility,
  type FeasibilityResult,
} from './businessFeasibility';
import {
  resolveBusinessRoles,
  type BusinessResolvedRoles,
  type ResolvedRoleItem,
} from './businessRoles';
import {
  applyManualBusinessRoles,
  UNIT_SUSPICIOUS_MIN_AOV,
  UNIT_SUSPICIOUS_MAX_AOV,
  COGS_EXCEEDS_REVENUE_WARNING_PREFIX,
} from '../validator/business';
import { formatTimeMonth } from './businessAnalyzer';
import { formatNumber, formatPercent } from '../../utils/format';
import type { ChartSpec } from '../schemas';
import type { BusinessProfile } from '../cleaner/businessCleaner';

export interface MetricFactEvent {
  id: string;
  label_vi: string;
  value: number | string;
  display: string;
  unit: string;
  nguon: string;
  raw_numbers: number[];
}

export interface PivotRow {
  key: string;
  label: string;
  revenue?: number;
  revenue_share_pct?: number;
  orders?: number;
  cogs?: number;
  profit?: number;
  margin_pct?: number;
  aov?: number;
  [extra: string]: any;
}

export interface MetricPivotTable {
  dimension: string;
  headers: string[];
  rows: PivotRow[];
}

export interface MatrixCell {
  channel: string;
  product: string;
  revenue: number;
  cogs: number;
  profit: number;
  margin_pct: number;
}

export interface MatrixPivotTable {
  channels: string[];
  products: string[];
  cells: MatrixCell[];
}

export interface SelectedMetricResult {
  id: string;
  name: string;
  status: 'tính được' | 'khóa';
  feasible: boolean;
  reason?: string;
  answerText: string;
  pivot?: MetricPivotTable | MatrixPivotTable;
  chart?: ChartSpec;
  events: MetricFactEvent[];
  isComputed?: boolean;
}

export interface ConfidenceInfo {
  level: 'HIGH' | 'MEDIUM' | 'LOW';
  level_vi: 'CAO' | 'TRUNG BÌNH' | 'THẤP';
  reasons: string[];
  warning?: string;
}

export interface ComputeSelectedOutput {
  metrics: Record<string, SelectedMetricResult>;
  confidence: ConfidenceInfo;
  dataLimits: string[];
  facts: MetricFactEvent[];
  rowCount: number;
  isProfitComputed?: boolean;
  totalRevenue?: number;
  totalCogs?: number | null;
}

/**
 * Finds maximum and minimum items with strict tie-breaking.
 */
export function findExtremesWithTies<T>(
  items: T[],
  getValue: (item: T) => number,
  isPercent = false
): {
  maxItems: T[];
  maxValue: number;
  minItems: T[];
  minValue: number;
  hasMaxTie: boolean;
  hasMinTie: boolean;
} {
  if (items.length === 0) {
    return {
      maxItems: [],
      maxValue: 0,
      minItems: [],
      minValue: 0,
      hasMaxTie: false,
      hasMinTie: false,
    };
  }

  const roundVal = (v: number) => (isPercent ? Math.round(v * 100) / 100 : Math.round(v));

  let maxV = -Infinity;
  let minV = Infinity;

  for (const it of items) {
    const v = roundVal(getValue(it));
    if (v > maxV) maxV = v;
    if (v < minV) minV = v;
  }

  const maxItems = items.filter((it) => roundVal(getValue(it)) === maxV);
  const minItems = items.filter((it) => roundVal(getValue(it)) === minV);

  return {
    maxItems,
    maxValue: maxV,
    minItems,
    minValue: minV,
    hasMaxTie: maxItems.length > 1,
    hasMinTie: minItems.length > 1,
  };
}

/**
 * Single-pass O(n) selective business metrics calculator.
 */
export function computeSelected(
  table: BusinessTable,
  selectedMetricIds: string[],
  options?: {
    profile?: BusinessProfile | null;
    customRoles?: BusinessResolvedRoles;
  }
): ComputeSelectedOutput {
  const rowCount = table.n;
  let roles = options?.customRoles || resolveBusinessRoles(table);
  roles = applyManualBusinessRoles(roles, table);

  const facts = buildBusinessFacts(table, roles);
  const selectedDefs: BusinessMetricDef[] = [];
  const feasibilityMap = new Map<string, FeasibilityResult>();

  for (const mid of selectedMetricIds) {
    const def = BUSINESS_METRIC_CATALOG.find((m) => m.id === mid);
    if (!def) continue;
    selectedDefs.push(def);
    feasibilityMap.set(mid, checkFeasibility(mid, facts));
  }

  // Determine which column values and groupings are actually required
  const feasibleDefs = selectedDefs.filter((d) => feasibilityMap.get(d.id)?.feasible);
  const needsRevenue = feasibleDefs.some(
    (d) => d.requiredRoles.includes('revenue') || d.requiredAnyOf.some((g) => g.includes('revenue'))
  );
  const needsOrders = feasibleDefs.some((d) => d.requiredRoles.includes('orders'));
  const needsCogsOrProfit = feasibleDefs.some((d) =>
    d.requiredAnyOf.some((g) => g.includes('cost') || g.includes('profit'))
  );

  const needsChannel = feasibleDefs.some((d) => d.requiredRoles.includes('channel'));
  const needsRegion = feasibleDefs.some((d) => d.requiredRoles.includes('region'));
  const needsProduct = feasibleDefs.some((d) => d.requiredRoles.includes('product'));
  const needsMonth = feasibleDefs.some((d) => d.requiredRoles.includes('period'));
  const needsMatrix = feasibleDefs.some((d) => d.id === 'channel_product_matrix');

  // TypedArray column accessors
  const revCol = roles.revenue.col?.role === 'measure' ? roles.revenue.col : null;
  const ordCol = roles.orders.col?.role === 'measure' ? roles.orders.col : null;

  let cogsCol: Extract<BusinessColumn, { role: 'measure' }> | null = null;
  let profitCol: Extract<BusinessColumn, { role: 'measure' }> | null = null;

  if (roles.cogs.col?.role === 'measure') {
    cogsCol = roles.cogs.col as any;
  }
  if (roles.profit.col?.role === 'measure') {
    profitCol = roles.profit.col as any;
  }

  const isProfitComputed = !profitCol && Boolean(revCol && cogsCol);

  const chanCol = roles.channel.col;
  const regCol = roles.region.col;
  const prodCol = roles.product.col;
  const timeCol = roles.time.col;

  // Single-pass accumulators
  let totalRevenue = 0;
  let totalOrders = 0;
  let totalCogs = 0;
  let totalProfit = 0;

  interface GroupAcc {
    key: string;
    label: string;
    revenue: number;
    orders: number;
    cogs: number;
    profit: number;
  }

  const channelMap = new Map<string, GroupAcc>();
  const regionMap = new Map<string, GroupAcc>();
  const productMap = new Map<string, GroupAcc>();
  const monthMap = new Map<string, GroupAcc>();
  const matrixMap = new Map<string, MatrixCell>();

  const getColText = (col: any, rowIdx: number): string => {
    if (!col) return 'Không xác định';
    if (col.role === 'dimension') {
      const code = col.codes[rowIdx];
      if (code === 0xffff) return 'Không xác định';
      const cat = (col.categories[code] || '').trim();
      return cat || 'Không xác định';
    }
    if (col.role === 'id') {
      const v = (col.values[rowIdx] || '').trim();
      return v || 'Không xác định';
    }
    if (col.role === 'time') {
      const m = formatTimeMonth(col, rowIdx);
      return m || 'Không xác định';
    }
    return 'Không xác định';
  };

  // Execute single-pass loop O(n)
  for (let i = 0; i < rowCount; i++) {
    let r = 0;
    if (needsRevenue && revCol) {
      const val = revCol.values[i];
      if (!isNaN(val) && isFinite(val)) r = val;
    }

    let o = 0;
    if (needsOrders && ordCol) {
      const val = ordCol.values[i];
      if (!isNaN(val) && isFinite(val)) o = val;
    }

    let c = 0;
    let p = 0;
    if (needsCogsOrProfit) {
      if (cogsCol) {
        const val = cogsCol.values[i];
        if (!isNaN(val) && isFinite(val)) c = val;
      }
      if (profitCol) {
        const val = profitCol.values[i];
        if (!isNaN(val) && isFinite(val)) p = val;
      } else if (isProfitComputed) {
        p = r - c;
      }
      if (!cogsCol && profitCol) {
        c = r - p;
      }
    }

    totalRevenue += r;
    totalOrders += o;
    totalCogs += c;
    totalProfit += p;

    // Dimension grouping accumulators
    if (needsChannel && chanCol) {
      const chKey = getColText(chanCol, i);
      let acc = channelMap.get(chKey);
      if (!acc) {
        acc = { key: chKey, label: chKey, revenue: 0, orders: 0, cogs: 0, profit: 0 };
        channelMap.set(chKey, acc);
      }
      acc.revenue += r;
      acc.orders += o;
      acc.cogs += c;
      acc.profit += p;
    }

    if (needsRegion && regCol) {
      const regKey = getColText(regCol, i);
      let acc = regionMap.get(regKey);
      if (!acc) {
        acc = { key: regKey, label: regKey, revenue: 0, orders: 0, cogs: 0, profit: 0 };
        regionMap.set(regKey, acc);
      }
      acc.revenue += r;
      acc.orders += o;
      acc.cogs += c;
      acc.profit += p;
    }

    if (needsProduct && prodCol) {
      const prodKey = getColText(prodCol, i);
      let acc = productMap.get(prodKey);
      if (!acc) {
        acc = { key: prodKey, label: prodKey, revenue: 0, orders: 0, cogs: 0, profit: 0 };
        productMap.set(prodKey, acc);
      }
      acc.revenue += r;
      acc.orders += o;
      acc.cogs += c;
      acc.profit += p;
    }

    if (needsMonth && timeCol) {
      const mKey = getColText(timeCol, i);
      let acc = monthMap.get(mKey);
      if (!acc) {
        acc = { key: mKey, label: mKey, revenue: 0, orders: 0, cogs: 0, profit: 0 };
        monthMap.set(mKey, acc);
      }
      acc.revenue += r;
      acc.orders += o;
      acc.cogs += c;
      acc.profit += p;
    }

    if (needsMatrix && chanCol && prodCol) {
      const chKey = getColText(chanCol, i);
      const prKey = getColText(prodCol, i);
      const cellKey = `${chKey}::${prKey}`;
      let cell = matrixMap.get(cellKey);
      if (!cell) {
        cell = { channel: chKey, product: prKey, revenue: 0, cogs: 0, profit: 0, margin_pct: 0 };
        matrixMap.set(cellKey, cell);
      }
      cell.revenue += r;
      cell.cogs += c;
      cell.profit += p;
    }
  }

  // Calculate margin % on matrix cells
  for (const cell of matrixMap.values()) {
    cell.margin_pct = cell.revenue > 0 ? (cell.profit / cell.revenue) * 100 : 0;
  }

  const results: Record<string, SelectedMetricResult> = {};
  const allEvents: MetricFactEvent[] = [];
  let factSeq = 1;

  const revColName = roles.revenue.col?.label || 'Doanh thu';
  const ordersColName = roles.orders.col?.label || 'Số đơn';
  const cogsColName = roles.cogs.col?.label || 'Giá vốn';
  const profitColName = roles.profit.col?.label || 'Lợi nhuận';

  // Construct individual metric results
  for (const def of selectedDefs) {
    const fRes = feasibilityMap.get(def.id)!;
    if (!fRes.feasible) {
      results[def.id] = {
        id: def.id,
        name: def.name,
        status: 'khóa',
        feasible: false,
        reason: (fRes as any).reason || 'Chỉ số không khả thi do thiếu dữ liệu.',
        answerText: `Chỉ số bị khóa: ${(fRes as any).reason}`,
        events: [],
      };
      continue;
    }

    // Feasible calculation branch
    if (def.id === 'total_revenue') {
      const ans = `Tổng doanh thu đạt ${formatNumber(totalRevenue, 0)} VND.`;
      const ev: MetricFactEvent = {
        id: `F${factSeq++}`,
        label_vi: 'Tổng doanh thu',
        value: totalRevenue,
        display: `${formatNumber(totalRevenue, 0)} VND`,
        unit: 'VND',
        nguon: `Cột "${revColName}", ${rowCount} dòng sau làm sạch`,
        raw_numbers: [totalRevenue],
      };
      allEvents.push(ev);
      results[def.id] = {
        id: def.id,
        name: def.name,
        status: 'tính được',
        feasible: true,
        answerText: ans,
        events: [ev],
      };
    } else if (def.id === 'total_orders') {
      const ans = `Tổng số đơn hàng đạt ${formatNumber(totalOrders, 0)} đơn.`;
      const ev: MetricFactEvent = {
        id: `F${factSeq++}`,
        label_vi: 'Tổng số đơn hàng',
        value: totalOrders,
        display: `${formatNumber(totalOrders, 0)} đơn`,
        unit: 'đơn',
        nguon: `Cột "${ordersColName}", ${rowCount} dòng sau làm sạch`,
        raw_numbers: [totalOrders],
      };
      allEvents.push(ev);
      results[def.id] = {
        id: def.id,
        name: def.name,
        status: 'tính được',
        feasible: true,
        answerText: ans,
        events: [ev],
      };
    } else if (def.id === 'aov') {
      const aov = totalOrders > 0 ? totalRevenue / totalOrders : 0;
      const ans = `Giá trị trung bình mỗi đơn (AOV) đạt ${formatNumber(aov, 2)} VND.`;
      const ev: MetricFactEvent = {
        id: `F${factSeq++}`,
        label_vi: 'Giá trị trung bình mỗi đơn (AOV)',
        value: aov,
        display: `${formatNumber(aov, 2)} VND`,
        unit: 'VND/đơn',
        nguon: `Tổng doanh thu / Tổng số đơn (${rowCount} dòng)`,
        raw_numbers: [aov, totalRevenue, totalOrders],
      };
      allEvents.push(ev);
      results[def.id] = {
        id: def.id,
        name: def.name,
        status: 'tính được',
        feasible: true,
        answerText: ans,
        events: [ev],
      };
    } else if (def.id === 'gross_profit') {
      const sourceLabel = isProfitComputed ? 'tự tính từ Doanh thu - Giá vốn' : `từ cột "${profitColName}"`;
      const ans = `Tổng lợi nhuận gộp đạt ${formatNumber(totalProfit, 0)} VND (${sourceLabel}).`;
      const ev: MetricFactEvent = {
        id: `F${factSeq++}`,
        label_vi: 'Tổng lợi nhuận gộp',
        value: totalProfit,
        display: `${formatNumber(totalProfit, 0)} VND`,
        unit: 'VND',
        nguon: isProfitComputed
          ? `Hiệu số giữa cột "${revColName}" và cột "${cogsColName}"`
          : `Cột "${profitColName}", ${rowCount} dòng sau làm sạch`,
        raw_numbers: [totalProfit],
      };
      allEvents.push(ev);
      results[def.id] = {
        id: def.id,
        name: def.name,
        status: 'tính được',
        feasible: true,
        isComputed: isProfitComputed,
        answerText: ans,
        events: [ev],
      };
    } else if (def.id === 'gross_margin') {
      const marginPct = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
      const ans = `Biên lợi nhuận gộp tổng thể đạt ${formatPercent(marginPct / 100)}.`;
      const ev: MetricFactEvent = {
        id: `F${factSeq++}`,
        label_vi: 'Biên lợi nhuận gộp',
        value: Number(marginPct.toFixed(2)),
        display: formatPercent(marginPct / 100),
        unit: '%',
        nguon: `Tổng lợi nhuận gộp / Tổng doanh thu (${rowCount} dòng)`,
        raw_numbers: [marginPct, totalProfit, totalRevenue],
      };
      allEvents.push(ev);
      results[def.id] = {
        id: def.id,
        name: def.name,
        status: 'tính được',
        feasible: true,
        isComputed: isProfitComputed,
        answerText: ans,
        events: [ev],
      };
    } else if (def.id === 'revenue_by_channel') {
      const channels = Array.from(channelMap.values()).map((ch) => ({
        key: ch.key,
        label: ch.label,
        revenue: ch.revenue,
        revenue_share_pct: totalRevenue > 0 ? (ch.revenue / totalRevenue) * 100 : 0,
        orders: ch.orders,
      }));
      channels.sort((a, b) => b.revenue - a.revenue);

      const extremes = findExtremesWithTies(channels, (c) => c.revenue);
      let ans = '';
      if (extremes.hasMaxTie) {
        ans = `Kênh bán tốt nhất đạt ${formatNumber(extremes.maxValue, 0)} VND (hòa: ${extremes.maxItems.map((c) => c.label).join(' và ')}).`;
      } else if (extremes.maxItems.length > 0) {
        const top = extremes.maxItems[0];
        ans = `Kênh bán tốt nhất là ${top.label} đạt ${formatNumber(top.revenue, 0)} VND (${formatPercent(top.revenue_share_pct / 100)} tổng DT).`;
      }

      const evs: MetricFactEvent[] = channels.map((ch) => ({
        id: `F${factSeq++}`,
        label_vi: `Kênh ${ch.label}`,
        value: ch.revenue,
        display: `${formatNumber(ch.revenue, 0)} VND (${formatPercent(ch.revenue_share_pct / 100)})`,
        unit: 'VND',
        nguon: `Nhóm theo cột "${roles.channel.col?.label || 'Kênh'}", ${rowCount} dòng`,
        raw_numbers: [ch.revenue, ch.revenue_share_pct],
      }));
      allEvents.push(...evs);

      const pivot: MetricPivotTable = {
        dimension: 'Kênh bán',
        headers: ['Kênh', 'Doanh thu (VND)', 'Tỷ trọng (%)', 'Số đơn'],
        rows: channels.map((c) => ({
          key: c.key,
          label: c.label,
          revenue: c.revenue,
          revenue_share_pct: Number(c.revenue_share_pct.toFixed(2)),
          orders: c.orders,
        })),
      };

      const chart: ChartSpec = {
        id: 'chart_biz_channel_revenue',
        title_vi: 'CƠ CẤU DOANH THU THEO KÊNH BÁN',
        kind: 'bar',
        symbols: channels.map((c) => c.key),
        data: {
          categories: channels.map((c) => c.label),
          series: [{ name: 'Doanh thu (VND)', values: channels.map((c) => c.revenue) }],
        },
        table: {
          columns: ['Kênh bán', 'Doanh thu (VND)', 'Tỷ trọng (%)', 'Số đơn'],
          rows: channels.map((c) => [
            c.label,
            formatNumber(c.revenue, 0),
            formatPercent(c.revenue_share_pct / 100),
            c.orders > 0 ? formatNumber(c.orders, 0) : '—',
          ]),
        },
      };

      results[def.id] = {
        id: def.id,
        name: def.name,
        status: 'tính được',
        feasible: true,
        answerText: ans,
        pivot,
        chart,
        events: evs,
      };
    } else if (def.id === 'revenue_by_region') {
      const regions = Array.from(regionMap.values()).map((rg) => ({
        key: rg.key,
        label: rg.label,
        revenue: rg.revenue,
        revenue_share_pct: totalRevenue > 0 ? (rg.revenue / totalRevenue) * 100 : 0,
      }));
      regions.sort((a, b) => b.revenue - a.revenue);

      const extremes = findExtremesWithTies(regions, (r) => r.revenue);
      let topDesc = '';
      if (extremes.hasMaxTie) {
        topDesc = `Khu vực cao nhất đạt ${formatNumber(extremes.maxValue, 0)} VND (hòa: ${extremes.maxItems.map((r) => r.label).join(' và ')})`;
      } else if (extremes.maxItems.length > 0) {
        topDesc = `Khu vực đóng góp nhiều nhất là ${extremes.maxItems[0].label} đạt ${formatNumber(extremes.maxValue, 0)} VND`;
      }

      let botDesc = '';
      if (extremes.hasMinTie) {
        botDesc = `thấp nhất đạt ${formatNumber(extremes.minValue, 0)} VND (hòa: ${extremes.minItems.map((r) => r.label).join(' và ')})`;
      } else if (extremes.minItems.length > 0) {
        botDesc = `thấp nhất là ${extremes.minItems[0].label} đạt ${formatNumber(extremes.minValue, 0)} VND`;
      }
      const ans = `${topDesc}; ${botDesc}.`;

      const evs: MetricFactEvent[] = regions.map((rg) => ({
        id: `F${factSeq++}`,
        label_vi: `Khu vực ${rg.label}`,
        value: rg.revenue,
        display: `${formatNumber(rg.revenue, 0)} VND (${formatPercent(rg.revenue_share_pct / 100)})`,
        unit: 'VND',
        nguon: `Nhóm theo cột "${roles.region.col?.label || 'Khu vực'}", ${rowCount} dòng`,
        raw_numbers: [rg.revenue, rg.revenue_share_pct],
      }));
      allEvents.push(...evs);

      const pivot: MetricPivotTable = {
        dimension: 'Khu vực',
        headers: ['Khu vực', 'Doanh thu (VND)', 'Tỷ trọng (%)'],
        rows: regions.map((r) => ({
          key: r.key,
          label: r.label,
          revenue: r.revenue,
          revenue_share_pct: Number(r.revenue_share_pct.toFixed(2)),
        })),
      };

      const chart: ChartSpec = {
        id: 'chart_biz_region_revenue',
        title_vi: 'DOANH THU THEO KHU VỰC ĐỊA LÝ',
        kind: 'bar',
        symbols: regions.map((r) => r.key),
        data: {
          categories: regions.map((r) => r.label),
          series: [{ name: 'Doanh thu (VND)', values: regions.map((r) => r.revenue) }],
        },
        table: {
          columns: ['Khu vực', 'Doanh thu (VND)', 'Tỷ trọng (%)'],
          rows: regions.map((r) => [
            r.label,
            formatNumber(r.revenue, 0),
            formatPercent(r.revenue_share_pct / 100),
          ]),
        },
      };

      results[def.id] = {
        id: def.id,
        name: def.name,
        status: 'tính được',
        feasible: true,
        answerText: ans,
        pivot,
        chart,
        events: evs,
      };
    } else if (def.id === 'revenue_by_month') {
      const months = Array.from(monthMap.values()).map((m) => ({
        key: m.key,
        label: m.label,
        revenue: m.revenue,
        revenue_share_pct: totalRevenue > 0 ? (m.revenue / totalRevenue) * 100 : 0,
        orders: m.orders,
      }));
      months.sort((a, b) => a.key.localeCompare(b.key));

      const extremes = findExtremesWithTies(months, (m) => m.revenue);
      let topDesc = '';
      if (extremes.hasMaxTie) {
        topDesc = `Tháng cao nhất đạt ${formatNumber(extremes.maxValue, 0)} VND (hòa: ${extremes.maxItems.map((m) => m.label).join(' và ')})`;
      } else if (extremes.maxItems.length > 0) {
        topDesc = `Tháng cao nhất là ${extremes.maxItems[0].label} (${formatNumber(extremes.maxValue, 0)} VND)`;
      }

      let botDesc = '';
      if (extremes.hasMinTie) {
        botDesc = `thấp nhất đạt ${formatNumber(extremes.minValue, 0)} VND (hòa: ${extremes.minItems.map((m) => m.label).join(' và ')})`;
      } else if (extremes.minItems.length > 0) {
        botDesc = `thấp nhất là ${extremes.minItems[0].label} (${formatNumber(extremes.minValue, 0)} VND)`;
      }
      const ans = `${topDesc}; ${botDesc}.`;

      const evs: MetricFactEvent[] = months.map((m) => ({
        id: `F${factSeq++}`,
        label_vi: `Tháng ${m.label}`,
        value: m.revenue,
        display: `${formatNumber(m.revenue, 0)} VND (${formatPercent(m.revenue_share_pct / 100)})`,
        unit: 'VND',
        nguon: `Nhóm theo cột "${roles.time.col?.label || 'Tháng'}", ${rowCount} dòng`,
        raw_numbers: [m.revenue, m.revenue_share_pct],
      }));
      allEvents.push(...evs);

      const pivot: MetricPivotTable = {
        dimension: 'Tháng',
        headers: ['Tháng', 'Doanh thu (VND)', 'Tỷ trọng (%)', 'Số đơn'],
        rows: months.map((m) => ({
          key: m.key,
          label: m.label,
          revenue: m.revenue,
          revenue_share_pct: Number(m.revenue_share_pct.toFixed(2)),
          orders: m.orders,
        })),
      };

      const chart: ChartSpec = {
        id: 'chart_biz_month_trend',
        title_vi: 'XU HƯỚNG DOANH THU THEO THÁNG',
        kind: 'line',
        symbols: months.map((m) => m.key),
        data: {
          categories: months.map((m) => m.label),
          series: [{ name: 'Doanh thu (VND)', values: months.map((m) => m.revenue) }],
        },
        table: {
          columns: ['Tháng', 'Doanh thu (VND)', 'Tỷ trọng (%)', 'Số đơn'],
          rows: months.map((m) => [
            m.label,
            formatNumber(m.revenue, 0),
            formatPercent(m.revenue_share_pct / 100),
            m.orders > 0 ? formatNumber(m.orders, 0) : '—',
          ]),
        },
      };

      results[def.id] = {
        id: def.id,
        name: def.name,
        status: 'tính được',
        feasible: true,
        answerText: ans,
        pivot,
        chart,
        events: evs,
      };
    } else if (def.id === 'revenue_growth') {
      const months = Array.from(monthMap.values()).map((m) => ({
        key: m.key,
        label: m.label,
        revenue: m.revenue,
      }));
      months.sort((a, b) => a.key.localeCompare(b.key));

      let latestDelta = 0;
      let latestPct = 0;
      let latestMonth = '';
      let prevMonth = '';

      if (months.length >= 2) {
        const cur = months[months.length - 1];
        const prev = months[months.length - 2];
        latestDelta = cur.revenue - prev.revenue;
        latestPct = prev.revenue > 0 ? (latestDelta / prev.revenue) * 100 : 0;
        latestMonth = cur.label;
        prevMonth = prev.label;
      }

      const sign = latestDelta >= 0 ? '+' : '';
      const dirWord = latestDelta >= 0 ? 'tăng' : 'giảm';
      const ans = `Tháng gần nhất (${latestMonth}) đạt ${formatNumber(months[months.length - 1]?.revenue || 0, 0)} VND, ${dirWord} ${formatPercent(Math.abs(latestPct) / 100)} (${sign}${formatNumber(latestDelta, 0)} VND) so với tháng trước.`;

      const ev: MetricFactEvent = {
        id: `F${factSeq++}`,
        label_vi: 'Tăng trưởng doanh thu tháng gần nhất',
        value: Number(latestPct.toFixed(2)),
        display: `${dirWord} ${formatPercent(Math.abs(latestPct) / 100)} (${sign}${formatNumber(latestDelta, 0)} VND)`,
        unit: '%',
        nguon: `So sánh giữa ${latestMonth} và ${prevMonth}`,
        raw_numbers: [latestPct, latestDelta],
      };
      allEvents.push(ev);

      const growthCategories = months.slice(1).map((m) => m.label);
      const growthSeriesValues = months.slice(1).map((m, idx) => {
        const prevRev = months[idx].revenue;
        return prevRev > 0 ? Number((((m.revenue - prevRev) / prevRev) * 100).toFixed(2)) : 0;
      });
      const chart: ChartSpec = {
        id: 'chart_biz_revenue_growth',
        title_vi: 'TĂNG TRƯỞNG DOANH THU THEO THÁNG',
        kind: 'bar',
        symbols: growthCategories,
        data: {
          categories: growthCategories,
          series: [
            {
              name: 'Tăng trưởng (%)',
              values: growthSeriesValues,
            },
          ],
        },
        table: {
          columns: ['Tháng', 'Tăng trưởng (%)'],
          rows: growthCategories.map((cat, idx) => [cat, formatPercent(growthSeriesValues[idx] / 100)]),
        },
      };

      results[def.id] = {
        id: def.id,
        name: def.name,
        status: 'tính được',
        feasible: true,
        answerText: ans,
        chart,
        events: [ev],
      };
    } else if (def.id === 'revenue_by_product') {
      const prods = Array.from(productMap.values()).map((p) => ({
        key: p.key,
        label: p.label,
        revenue: p.revenue,
        revenue_share_pct: totalRevenue > 0 ? (p.revenue / totalRevenue) * 100 : 0,
      }));
      prods.sort((a, b) => b.revenue - a.revenue);

      const extremes = findExtremesWithTies(prods, (p) => p.revenue);
      let ans = '';
      if (extremes.hasMaxTie) {
        ans = `Sản phẩm bán chạy nhất đạt ${formatNumber(extremes.maxValue, 0)} VND (hòa: ${extremes.maxItems.map((p) => p.label).join(' và ')}).`;
      } else if (extremes.maxItems.length > 0) {
        const top = extremes.maxItems[0];
        ans = `Sản phẩm bán chạy nhất là ${top.label} đạt ${formatNumber(top.revenue, 0)} VND (${formatPercent(top.revenue_share_pct / 100)} tổng DT).`;
      }

      const evs: MetricFactEvent[] = prods.map((pr) => ({
        id: `F${factSeq++}`,
        label_vi: `Sản phẩm ${pr.label}`,
        value: pr.revenue,
        display: `${formatNumber(pr.revenue, 0)} VND (${formatPercent(pr.revenue_share_pct / 100)})`,
        unit: 'VND',
        nguon: `Nhóm theo cột "${roles.product.col?.label || 'Sản phẩm'}", ${rowCount} dòng`,
        raw_numbers: [pr.revenue, pr.revenue_share_pct],
      }));
      allEvents.push(...evs);

      const pivot: MetricPivotTable = {
        dimension: 'Sản phẩm',
        headers: ['Sản phẩm', 'Doanh thu (VND)', 'Tỷ trọng (%)'],
        rows: prods.map((p) => ({
          key: p.key,
          label: p.label,
          revenue: p.revenue,
          revenue_share_pct: Number(p.revenue_share_pct.toFixed(2)),
        })),
      };

      const chart: ChartSpec = {
        id: 'chart_biz_product_revenue',
        title_vi: 'CƠ CẤU DOANH THU THEO SẢN PHẨM',
        kind: 'bar',
        symbols: prods.map((p) => p.key),
        data: {
          categories: prods.map((p) => p.label),
          series: [{ name: 'Doanh thu (VND)', values: prods.map((p) => p.revenue) }],
        },
        table: {
          columns: ['Sản phẩm', 'Doanh thu (VND)', 'Tỷ trọng (%)'],
          rows: prods.map((p) => [
            p.label,
            formatNumber(p.revenue, 0),
            formatPercent(p.revenue_share_pct / 100),
          ]),
        },
      };

      results[def.id] = {
        id: def.id,
        name: def.name,
        status: 'tính được',
        feasible: true,
        answerText: ans,
        pivot,
        chart,
        events: evs,
      };
    } else if (def.id === 'margin_by_channel') {
      const channels = Array.from(channelMap.values()).map((ch) => ({
        key: ch.key,
        label: ch.label,
        margin_pct: ch.revenue > 0 ? (ch.profit / ch.revenue) * 100 : 0,
        profit: ch.profit,
        revenue: ch.revenue,
      }));
      channels.sort((a, b) => b.margin_pct - a.margin_pct);

      const extremes = findExtremesWithTies(channels, (c) => c.margin_pct, true);
      let ans = '';
      if (extremes.hasMaxTie) {
        ans = `Kênh có biên lợi nhuận cao nhất đạt ${formatPercent(extremes.maxValue / 100)} (hòa: ${extremes.maxItems.map((c) => c.label).join(' và ')}).`;
      } else if (extremes.maxItems.length > 0) {
        const top = extremes.maxItems[0];
        ans = `Kênh có biên lợi nhuận cao nhất là ${top.label} đạt ${formatPercent(top.margin_pct / 100)}.`;
      }

      const evs: MetricFactEvent[] = channels.map((ch) => ({
        id: `F${factSeq++}`,
        label_vi: `Biên LN Kênh ${ch.label}`,
        value: Number(ch.margin_pct.toFixed(2)),
        display: formatPercent(ch.margin_pct / 100),
        unit: '%',
        nguon: `Lợi nhuận / Doanh thu kênh "${ch.label}"`,
        raw_numbers: [ch.margin_pct, ch.profit, ch.revenue],
      }));
      allEvents.push(...evs);

      const pivot: MetricPivotTable = {
        dimension: 'Kênh bán',
        headers: ['Kênh', 'Lợi nhuận (VND)', 'Doanh thu (VND)', 'Biên LN (%)'],
        rows: channels.map((c) => ({
          key: c.key,
          label: c.label,
          profit: c.profit,
          revenue: c.revenue,
          margin_pct: Number(c.margin_pct.toFixed(2)),
        })),
      };

      const chart: ChartSpec = {
        id: 'chart_biz_channel_margin',
        title_vi: 'BIÊN LỢI NHUẬN GỘP THEO KÊNH BÁN',
        kind: 'bar',
        symbols: channels.map((c) => c.key),
        data: {
          categories: channels.map((c) => c.label),
          series: [{ name: 'Biên LN (%)', values: channels.map((c) => Number(c.margin_pct.toFixed(2))) }],
        },
        table: {
          columns: ['Kênh bán', 'Lợi nhuận (VND)', 'Doanh thu (VND)', 'Biên LN (%)'],
          rows: channels.map((c) => [
            c.label,
            formatNumber(c.profit, 0),
            formatNumber(c.revenue, 0),
            formatPercent(c.margin_pct / 100),
          ]),
        },
      };

      results[def.id] = {
        id: def.id,
        name: def.name,
        status: 'tính được',
        feasible: true,
        answerText: ans,
        pivot,
        chart,
        events: evs,
      };
    } else if (def.id === 'margin_by_product') {
      const prods = Array.from(productMap.values()).map((p) => ({
        key: p.key,
        label: p.label,
        margin_pct: p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0,
        profit: p.profit,
        revenue: p.revenue,
      }));
      prods.sort((a, b) => b.margin_pct - a.margin_pct);

      const extremes = findExtremesWithTies(prods, (p) => p.margin_pct, true);
      let ans = '';
      if (extremes.hasMaxTie) {
        ans = `Sản phẩm có biên lợi nhuận cao nhất đạt ${formatPercent(extremes.maxValue / 100)} (hòa: ${extremes.maxItems.map((p) => p.label).join(' và ')}).`;
      } else if (extremes.maxItems.length > 0) {
        const top = extremes.maxItems[0];
        ans = `Sản phẩm lãi nhất là ${top.label} với biên lợi nhuận ${formatPercent(top.margin_pct / 100)}.`;
      }

      const evs: MetricFactEvent[] = prods.map((pr) => ({
        id: `F${factSeq++}`,
        label_vi: `Biên LN SP ${pr.label}`,
        value: Number(pr.margin_pct.toFixed(2)),
        display: formatPercent(pr.margin_pct / 100),
        unit: '%',
        nguon: `Lợi nhuận / Doanh thu sản phẩm "${pr.label}"`,
        raw_numbers: [pr.margin_pct, pr.profit, pr.revenue],
      }));
      allEvents.push(...evs);

      const pivot: MetricPivotTable = {
        dimension: 'Sản phẩm',
        headers: ['Sản phẩm', 'Lợi nhuận (VND)', 'Doanh thu (VND)', 'Biên LN (%)'],
        rows: prods.map((p) => ({
          key: p.key,
          label: p.label,
          profit: p.profit,
          revenue: p.revenue,
          margin_pct: Number(p.margin_pct.toFixed(2)),
        })),
      };

      const chart: ChartSpec = {
        id: 'chart_biz_product_margin',
        title_vi: 'BIÊN LỢI NHUẬN GỘP THEO SẢN PHẨM',
        kind: 'bar',
        symbols: prods.map((p) => p.key),
        data: {
          categories: prods.map((p) => p.label),
          series: [{ name: 'Biên LN (%)', values: prods.map((p) => Number(p.margin_pct.toFixed(2))) }],
        },
        table: {
          columns: ['Sản phẩm', 'Lợi nhuận (VND)', 'Doanh thu (VND)', 'Biên LN (%)'],
          rows: prods.map((p) => [
            p.label,
            formatNumber(p.profit, 0),
            formatNumber(p.revenue, 0),
            formatPercent(p.margin_pct / 100),
          ]),
        },
      };

      results[def.id] = {
        id: def.id,
        name: def.name,
        status: 'tính được',
        feasible: true,
        answerText: ans,
        pivot,
        chart,
        events: evs,
      };
    } else if (def.id === 'channel_product_matrix') {
      const cells = Array.from(matrixMap.values());
      const extremes = findExtremesWithTies(cells, (c) => c.margin_pct, true);

      let maxDesc = '';
      if (extremes.hasMaxTie) {
        const names = extremes.maxItems.map((c) => `${c.channel} × ${c.product}`).join(' và ');
        maxDesc = `Biên lợi nhuận cao nhất đạt ${formatPercent(extremes.maxValue / 100)} (hòa: ${names})`;
      } else if (extremes.maxItems.length > 0) {
        const top = extremes.maxItems[0];
        maxDesc = `Biên lợi nhuận cao nhất là ${top.channel} × ${top.product} đạt ${formatPercent(top.margin_pct / 100)}`;
      }

      let minDesc = '';
      if (extremes.hasMinTie) {
        const names = extremes.minItems.map((c) => `${c.channel} × ${c.product}`).join(' và ');
        minDesc = `biên thấp nhất đạt ${formatPercent(extremes.minValue / 100)} (hòa: ${names})`;
      } else if (extremes.minItems.length > 0) {
        const bot = extremes.minItems[0];
        minDesc = `biên thấp nhất là ${bot.channel} × ${bot.product} đạt ${formatPercent(bot.margin_pct / 100)}`;
      }

      const ans = `${maxDesc}; ${minDesc}.`;

      const evs: MetricFactEvent[] = cells.map((cell) => ({
        id: `F${factSeq++}`,
        label_vi: `Ma trận ${cell.channel} × ${cell.product}`,
        value: Number(cell.margin_pct.toFixed(2)),
        display: `${formatPercent(cell.margin_pct / 100)} (DT: ${formatNumber(cell.revenue, 0)} đ, LN: ${formatNumber(cell.profit, 0)} đ)`,
        unit: '%',
        nguon: `Giao giữa kênh "${cell.channel}" và sản phẩm "${cell.product}"`,
        raw_numbers: [cell.margin_pct, cell.revenue, cell.profit],
      }));
      allEvents.push(...evs);

      const uniqueChannels = Array.from(new Set(cells.map((c) => c.channel)));
      const uniqueProducts = Array.from(new Set(cells.map((c) => c.product)));

      const matrixPivot: MatrixPivotTable = {
        channels: uniqueChannels,
        products: uniqueProducts,
        cells,
      };

      results[def.id] = {
        id: def.id,
        name: def.name,
        status: 'tính được',
        feasible: true,
        answerText: ans,
        pivot: matrixPivot,
        events: evs,
      };
    }
  }

  // 1.4 Code-driven confidence evaluation
  const confidence = evaluateCodeConfidence(table, roles, results, totalRevenue, totalCogs);

  // 1.5 Code-driven data limits generation
  const dataLimits = generateCodeDataLimits(table, roles, results, options?.profile);

  return {
    metrics: results,
    confidence,
    dataLimits,
    facts: allEvents,
    rowCount,
    isProfitComputed,
    totalRevenue,
    totalCogs,
  };
}

/**
 * 1.4 Code-driven Confidence Evaluator.
 * Follows strict deterministic rules:
 * - Default: HIGH (CAO)
 * - MEDIUM (TRUNG BÌNH): if user-selected metric is locked, or uses inferred/computed role.
 * - LOW (THẤP): if rowCount < 10, or unit suspicious (1.000 đ - 50 tỷ đ), or total COGS > total Revenue.
 * - Explicitly does NOT demote confirmed user-chosen columns.
 */
/**
 * Single translation function for business role identifiers and labels to Vietnamese.
 * Unknown IDs return 'cột chưa rõ'. (Prompt 3A 0g.1)
 */
export function translateBusinessRoleId(roleIdOrLabel: unknown): string {
  if (typeof roleIdOrLabel !== 'string' || !roleIdOrLabel.trim()) {
    return 'cột chưa rõ';
  }
  const clean = roleIdOrLabel.trim();
  if (
    clean === 'Doanh thu' ||
    clean === 'Số đơn' ||
    clean === 'Giá vốn' ||
    clean === 'Lợi nhuận gộp' ||
    clean === 'Sản phẩm' ||
    clean === 'Kênh' ||
    clean === 'Khu vực' ||
    clean === 'Tháng'
  ) {
    return clean;
  }
  switch (clean.toLowerCase()) {
    case 'revenue':
      return 'Doanh thu';
    case 'orders':
      return 'Số đơn';
    case 'cost':
    case 'cogs':
      return 'Giá vốn';
    case 'profit':
      return 'Lợi nhuận gộp';
    case 'product':
      return 'Sản phẩm';
    case 'channel':
      return 'Kênh';
    case 'region':
      return 'Khu vực';
    case 'period':
    case 'time':
      return 'Tháng';
    default:
      return 'cột chưa rõ';
  }
}

export const RESOLVED_ROLE_KEYS = [
  'revenue',
  'cogs',
  'profit',
  'orders',
  'channel',
  'region',
  'product',
  'time',
] as const;
export type ResolvedRoleKey = (typeof RESOLVED_ROLE_KEYS)[number];
export type ResolvedRoleItemWithChosen = ResolvedRoleItem & { userChosen?: boolean };

export function evaluateCodeConfidence(
  table: BusinessTable,
  roles: BusinessResolvedRoles,
  selectedResults: Record<string, SelectedMetricResult>,
  totalRev: number,
  totalCogs: number | null
): ConfidenceInfo {
  const reasons: string[] = [];
  let isLow = false;
  let isMedium = false;
  let warning: string | undefined;

  // Rule 1: Dưới 10 dòng -> THẤP
  if (table.n < 10) {
    isLow = true;
    warning = `Dữ liệu ít (${table.n} dòng), kết luận chỉ mang tính tham khảo.`;
    reasons.push(warning);
  }

  // Rule 2: Giá vốn lớn hơn doanh thu -> THẤP
  if (totalCogs !== null && totalCogs > totalRev && totalRev > 0) {
    isLow = true;
    reasons.push(
      `${COGS_EXCEEDS_REVENUE_WARNING_PREFIX} (${Math.round(totalCogs).toLocaleString('vi-VN')} đ) lớn hơn doanh thu (${Math.round(totalRev).toLocaleString('vi-VN')} đ).`
    );
  }

  // Rule 3: Cờ đơn vị / giá trị bất thường theo hằng số hiện có (Prompt 2A-1 0c.1)
  // Ngưỡng UNIT_SUSPICIOUS_MIN_AOV / MAX_AOV chỉ áp lên AOV (doanh thu / số đơn)
  // hoặc, khi không có cột đơn, lên doanh thu trung bình mỗi dòng.
  let totalOrdForAov = 0;
  if (roles.orders?.col && roles.orders.col.role === 'measure') {
    const ordCol = roles.orders.col as Extract<BusinessColumn, { role: 'measure' }>;
    totalOrdForAov = ordCol.values.reduce((s, v) => s + (isNaN(v) ? 0 : v), 0);
  }

  if (totalOrdForAov > 0 && totalRev > 0) {
    const aov = totalRev / totalOrdForAov;
    if (aov < UNIT_SUSPICIOUS_MIN_AOV || aov > UNIT_SUSPICIOUS_MAX_AOV) {
      isLow = true;
      reasons.push(
        `Đơn vị có giá trị đơn hàng trung bình (AOV = ${Math.round(aov).toLocaleString('vi-VN')} đ) bất thường (ngoài ngưỡng ${UNIT_SUSPICIOUS_MIN_AOV.toLocaleString('vi-VN')} đ - ${UNIT_SUSPICIOUS_MAX_AOV.toLocaleString('vi-VN')} đ).`
      );
    }
  } else if (table.n > 0 && totalRev > 0) {
    const avgRev = totalRev / table.n;
    if (avgRev < UNIT_SUSPICIOUS_MIN_AOV || avgRev > UNIT_SUSPICIOUS_MAX_AOV) {
      isLow = true;
      reasons.push(
        `Đơn vị có doanh thu trung bình mỗi dòng (${Math.round(avgRev).toLocaleString('vi-VN')} đ) bất thường (ngoài ngưỡng ${UNIT_SUSPICIOUS_MIN_AOV.toLocaleString('vi-VN')} đ - ${UNIT_SUSPICIOUS_MAX_AOV.toLocaleString('vi-VN')} đ).`
      );
    }
  }

  // Rule 4: Có chỉ số người dùng chọn bị khóa vì thiếu cột -> TRUNG BÌNH
  const lockedCount = Object.values(selectedResults).filter((r) => r.status === 'khóa').length;
  if (lockedCount > 0) {
    isMedium = true;
    reasons.push(`Có ${lockedCount} chỉ số được chọn bị khóa do thiếu cột hoặc dữ liệu không đủ.`);
  }

  // Rule 5: Chỉ cột SUY LUẬN chưa xác nhận mới hạ bậc TRUNG BÌNH; cột TÍNH RA không hạ bậc (Prompt 3A 0g.2 & 0g.3)
  for (const roleKey of RESOLVED_ROLE_KEYS) {
    const roleItem = roles[roleKey] as ResolvedRoleItemWithChosen | undefined;
    if (roleItem) {
      const isUserChosen = Boolean(
        roleItem.userChosen ||
        (roleItem.col as (BusinessColumn & { userChosenRole?: string }) | null)?.userChosenRole
      );
      if (!isUserChosen && roleItem.status === 'suy luận') {
        isMedium = true;
        reasons.push(
          `Cột ${translateBusinessRoleId(roleKey)} sử dụng giá trị suy luận.`
        );
      }
    }
  }

  let level: 'HIGH' | 'MEDIUM' | 'LOW' = 'HIGH';
  let level_vi: 'CAO' | 'TRUNG BÌNH' | 'THẤP' = 'CAO';
  if (isLow) {
    level = 'LOW';
    level_vi = 'THẤP';
  } else if (isMedium) {
    level = 'MEDIUM';
    level_vi = 'TRUNG BÌNH';
  }

  return { level, level_vi, reasons, warning };
}

/**
 * 1.5 Code-driven Data Limits Generator.
 */
export function generateCodeDataLimits(
  table: BusinessTable,
  roles: BusinessResolvedRoles,
  selectedResults: Record<string, SelectedMetricResult>,
  profile?: BusinessProfile | null
): string[] {
  const limits: string[] = [];

  // 1. Missing role columns (translated via single function, no raw IDs)
  const missingCols = RESOLVED_ROLE_KEYS
    .filter((k) => roles[k]?.status === 'thiếu')
    .map((k) => translateBusinessRoleId(k));
  if (missingCols.length > 0) {
    limits.push(`Bảng dữ liệu thiếu các cột vai trò: ${missingCols.join(', ')}.`);
  }

  // 2. Locked metrics with verbatim reasons
  const lockedMetrics = Object.values(selectedResults).filter((r) => r.status === 'khóa');
  for (const lm of lockedMetrics) {
    limits.push(`Chỉ số "${lm.name}" bị khóa: ${lm.reason}`);
  }

  // 3. Row count & Skipped rows
  limits.push(`Dữ liệu gồm ${table.n} dòng hợp lệ sau làm sạch.`);
  if (profile) {
    const skipped = (profile.skipped_blank_rows || 0) + (profile.skipped_total_rows || 0);
    if (skipped > 0) {
      limits.push(
        `Đã loại bỏ ${skipped} dòng trước phân tích (${profile.skipped_blank_rows || 0} dòng trống, ${profile.skipped_total_rows || 0} dòng tổng).`
      );
    }
  }

  // 4. Inferred / Computed roles
  for (const roleKey of RESOLVED_ROLE_KEYS) {
    const roleInfo = roles[roleKey] as ResolvedRoleItemWithChosen | undefined;
    if (roleInfo) {
      const isUserChosen = Boolean(
        roleInfo.userChosen ||
        (roleInfo.col as (BusinessColumn & { userChosenRole?: string }) | null)?.userChosenRole
      );
      const roleLabel = translateBusinessRoleId(roleKey);
      if (isUserChosen) {
        limits.push(
          `Cột "${roleInfo.col?.label || ''}" được gán vai trò ${roleLabel} bởi người dùng chọn tay.`
        );
      } else if (roleInfo.status === 'suy luận') {
        limits.push(
          `Cột "${roleInfo.col?.label || ''}" được hệ thống suy luận tự động làm ${roleLabel}.`
        );
      } else if (roleInfo.status === 'tính ra') {
        limits.push(
          `Chỉ tiêu ${roleLabel} được tự động tính từ Doanh thu - Giá vốn.`
        );
      }
    }
  }

  // 5. Applied units
  for (const col of table.columns) {
    if (col.role === 'measure' && col.multiplier && col.multiplier !== 1) {
      const unitName = col.userUnit || col.detectedUnit || '';
      limits.push(
        `Cột "${col.label}" được nhân hệ số ${col.multiplier.toLocaleString('vi-VN')} theo đơn vị "${unitName}".`
      );
    }
  }

  if (limits.length === 0) {
    limits.push('Không có giới hạn đáng kể.');
  }

  return limits;
}
