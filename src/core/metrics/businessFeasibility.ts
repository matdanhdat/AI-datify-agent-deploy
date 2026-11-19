/**
 * Business Metrics Feasibility Evaluator (Prompt 1C-1).
 * Pure functions determining whether each business metric is computable
 * and providing deterministic, single-line reasons when not feasible.
 * Zero UI dependencies, zero execution wiring.
 */

import type { BusinessTable, BusinessColumn } from '../businessTable';
import type { BusinessResolvedRoles, RoleResolutionStatus } from './businessRoles';
import {
  BUSINESS_ROLE_IDS,
  BUSINESS_ROLE_LABELS,
  BUSINESS_METRIC_CATALOG,
  type BusinessRoleId,
} from './businessCatalog';
import { formatTimeMonth } from './businessAnalyzer';

export type RoleFeasibilityStatus = 'missing' | 'unreliable' | 'ok';

export interface BusinessFacts {
  rowCount: number;
  roleStatus: Record<BusinessRoleId, RoleFeasibilityStatus>;
  marginSource: 'cost' | 'profit' | 'none';
  distinct: {
    channel: number;
    region: number;
    product: number;
  };
  validMonths: number;
  sums: {
    revenue: number;
    orders: number;
    margin_source: number | null;
  };
}

export type FeasibilityResult =
  | { feasible: true }
  | {
      feasible: false;
      reason: string;
      missingRoles: BusinessRoleId[];
      missingAnyOf: BusinessRoleId[][];
    };

export interface MetricFeasibilityItem {
  metricId: string;
  result: FeasibilityResult;
}

export function mapRoleStatus(status: RoleResolutionStatus): RoleFeasibilityStatus {
  if (status === 'thiếu') return 'missing';
  if (status === 'không đáng tin') return 'unreliable';
  return 'ok'; // 'tìm thấy' | 'suy luận' | 'tính ra'
}

/**
 * Builds business facts in a single pass O(n) over the table.
 * Pure function: no file I/O, no network calls, no Date.now, no Math.random.
 */
export function buildBusinessFacts(
  table: BusinessTable,
  roles: BusinessResolvedRoles
): BusinessFacts {
  const rowCount = table.n;

  const roleStatus: Record<BusinessRoleId, RoleFeasibilityStatus> = {
    revenue: mapRoleStatus(roles.revenue.status),
    orders: mapRoleStatus(roles.orders.status),
    cost: mapRoleStatus(roles.cogs.status),
    profit: mapRoleStatus(roles.profit.status),
    product: mapRoleStatus(roles.product.status),
    channel: mapRoleStatus(roles.channel.status),
    region: mapRoleStatus(roles.region.status),
    period: mapRoleStatus(roles.time.status),
  };

  // Determine marginSource:
  // 'none' only when both cost and profit are missing.
  // If resolver selects a source that is 'không đáng tin', marginSource is still that source.
  let marginSource: 'cost' | 'profit' | 'none' = 'none';
  if (roles.cogs.status === 'tìm thấy' || roles.cogs.status === 'không đáng tin') {
    marginSource = 'cost';
  } else if (
    roles.profit.status === 'tìm thấy' ||
    roles.profit.status === 'suy luận' ||
    roles.profit.status === 'không đáng tin'
  ) {
    marginSource = 'profit';
  }

  // Find column arrays for fast iteration
  const revCol = roles.revenue.col?.role === 'measure' ? roles.revenue.col : null;
  const ordCol = roles.orders.col?.role === 'measure' ? roles.orders.col : null;

  let marginCol: BusinessColumn | null = null;
  if (marginSource === 'cost') {
    if (roles.cogs.col?.role === 'measure') {
      marginCol = roles.cogs.col;
    } else {
      // Find measure in table matching cost label if col was cleared due to unreliable
      marginCol = table.columns.find((c) => c.role === 'measure' && c.label === roles.cogs.reason_vi) || null;
    }
  } else if (marginSource === 'profit') {
    if (roles.profit.col?.role === 'measure') {
      marginCol = roles.profit.col;
    } else {
      marginCol = table.columns.find((c) => c.role === 'measure' && c.label === roles.profit.reason_vi) || null;
    }
  }

  const chanCol = roles.channel.col;
  const regCol = roles.region.col;
  const prodCol = roles.product.col;
  const timeCol = roles.time.col;

  const channelSet = new Set<string>();
  const regionSet = new Set<string>();
  const productSet = new Set<string>();
  const validMonthsSet = new Set<string>();

  let sumRev = 0;
  let sumOrders = 0;
  let sumMargin = marginSource !== 'none' ? 0 : null;

  for (let i = 0; i < rowCount; i++) {
    // 1. Sums
    if (revCol) {
      const v = revCol.values[i];
      if (!isNaN(v) && isFinite(v)) sumRev += v;
    }
    if (ordCol) {
      const v = ordCol.values[i];
      if (!isNaN(v) && isFinite(v)) sumOrders += v;
    }
    if (marginCol && marginCol.role === 'measure' && sumMargin !== null) {
      const v = marginCol.values[i];
      if (!isNaN(v) && isFinite(v)) sumMargin += v;
    }

    // 2. Distinct Channel
    if (chanCol) {
      if (chanCol.role === 'dimension') {
        const code = chanCol.codes[i];
        if (code !== 0xffff) {
          const cat = (chanCol.categories[code] || '').trim();
          if (cat) channelSet.add(cat);
        }
      } else if (chanCol.role === 'id') {
        const val = (chanCol.values[i] || '').trim();
        if (val) channelSet.add(val);
      }
    }

    // 3. Distinct Region
    if (regCol) {
      if (regCol.role === 'dimension') {
        const code = regCol.codes[i];
        if (code !== 0xffff) {
          const cat = (regCol.categories[code] || '').trim();
          if (cat) regionSet.add(cat);
        }
      } else if (regCol.role === 'id') {
        const val = (regCol.values[i] || '').trim();
        if (val) regionSet.add(val);
      }
    }

    // 4. Distinct Product
    if (prodCol) {
      if (prodCol.role === 'dimension') {
        const code = prodCol.codes[i];
        if (code !== 0xffff) {
          const cat = (prodCol.categories[code] || '').trim();
          if (cat) productSet.add(cat);
        }
      } else if (prodCol.role === 'id') {
        const val = (prodCol.values[i] || '').trim();
        if (val) productSet.add(val);
      }
    }

    // 5. Valid Months
    if (timeCol) {
      if (timeCol.role === 'time') {
        const mKey = formatTimeMonth(timeCol, i);
        if (mKey && /^\d{4}-(0[1-9]|1[0-2])$/.test(mKey)) {
          validMonthsSet.add(mKey);
        }
      } else if (timeCol.role === 'dimension') {
        const code = timeCol.codes[i];
        const raw = code !== 0xffff ? (timeCol.categories[code] || '').trim() : '';
        if (raw) {
          // Check formatted month
          const mKey = formatTimeMonth(
            { role: 'time', key: 'time_dim', label: 'Time', granularity: 'month', values: new Int32Array(1), raw_labels: [raw] },
            0
          );
          if (mKey && /^\d{4}-(0[1-9]|1[0-2])$/.test(mKey)) {
            validMonthsSet.add(mKey);
          }
        }
      }
    }
  }

  return {
    rowCount,
    roleStatus,
    marginSource,
    distinct: {
      channel: channelSet.size,
      region: regionSet.size,
      product: productSet.size,
    },
    validMonths: validMonthsSet.size,
    sums: {
      revenue: sumRev,
      orders: sumOrders,
      margin_source: sumMargin,
    },
  };
}

/**
 * Checks feasibility of a single metric against given business facts.
 * Pure function: deterministic, zero input mutation.
 */
export function checkFeasibility(metricId: string, facts: BusinessFacts): FeasibilityResult {
  const metric = BUSINESS_METRIC_CATALOG.find((m) => m.id === metricId);
  if (!metric) {
    return {
      feasible: false,
      reason: 'Chỉ số không có trong danh mục.',
      missingRoles: [],
      missingAnyOf: [],
    };
  }

  // (1) Check Missing Columns
  const missingRoles: BusinessRoleId[] = [];
  for (const r of metric.requiredRoles) {
    if (facts.roleStatus[r] === 'missing') {
      missingRoles.push(r);
    }
  }

  const missingAnyOf: BusinessRoleId[][] = [];
  let anyOfGroupMissing = false;
  for (const group of metric.requiredAnyOf) {
    const allMissing = group.every((r) => facts.roleStatus[r] === 'missing');
    if (allMissing) {
      missingAnyOf.push(group);
      anyOfGroupMissing = true;
    }
  }

  if (missingRoles.length > 0 || anyOfGroupMissing) {
    const missingLabels: string[] = [];
    if (missingRoles.includes('revenue')) missingLabels.push(BUSINESS_ROLE_LABELS.revenue);
    if (missingRoles.includes('orders')) missingLabels.push(BUSINESS_ROLE_LABELS.orders);

    if (anyOfGroupMissing) {
      missingLabels.push('Giá vốn hoặc Lợi nhuận gộp');
    } else {
      if (missingRoles.includes('cost')) missingLabels.push(BUSINESS_ROLE_LABELS.cost);
      if (missingRoles.includes('profit')) missingLabels.push(BUSINESS_ROLE_LABELS.profit);
    }

    if (missingRoles.includes('product')) missingLabels.push(BUSINESS_ROLE_LABELS.product);
    if (missingRoles.includes('channel')) missingLabels.push(BUSINESS_ROLE_LABELS.channel);
    if (missingRoles.includes('region')) missingLabels.push(BUSINESS_ROLE_LABELS.region);
    if (missingRoles.includes('period')) missingLabels.push(BUSINESS_ROLE_LABELS.period);

    return {
      feasible: false,
      reason: `Thiếu cột ${missingLabels.join(', ')}.`,
      missingRoles,
      missingAnyOf,
    };
  }

  // (2) Check Unreliable Columns (used roles)
  const usedRoles: BusinessRoleId[] = [...metric.requiredRoles];
  if (metric.requiredAnyOf.some((g) => g.includes('cost') && g.includes('profit'))) {
    if (facts.marginSource === 'cost') {
      usedRoles.push('cost');
    } else if (facts.marginSource === 'profit') {
      usedRoles.push('profit');
    }
  }

  for (const r of BUSINESS_ROLE_IDS) {
    if (usedRoles.includes(r) && facts.roleStatus[r] === 'unreliable') {
      return {
        feasible: false,
        reason: `Dữ liệu cột ${BUSINESS_ROLE_LABELS[r]} không đáng tin.`,
        missingRoles: [],
        missingAnyOf: [],
      };
    }
  }

  // (3) Check Constraints in Order of Declaration in B3
  for (const c of metric.constraints) {
    if (c.type === 'positive_sum') {
      if (c.role === 'revenue') {
        if (facts.sums.revenue <= 0) {
          return {
            feasible: false,
            reason: 'Cột Doanh thu không có giá trị dương.',
            missingRoles: [],
            missingAnyOf: [],
          };
        }
      } else if (c.role === 'orders') {
        if (facts.sums.orders <= 0) {
          return {
            feasible: false,
            reason: 'Cột Số đơn không có giá trị dương.',
            missingRoles: [],
            missingAnyOf: [],
          };
        }
      } else if (c.role === 'margin_source') {
        const val = facts.sums.margin_source;
        if (val === null || val <= 0) {
          const roleLabel = facts.marginSource === 'profit' ? 'Lợi nhuận gộp' : 'Giá vốn';
          return {
            feasible: false,
            reason: `Cột ${roleLabel} không có giá trị dương.`,
            missingRoles: [],
            missingAnyOf: [],
          };
        }
      }
    } else if (c.type === 'min_distinct') {
      const count = facts.distinct[c.role];
      const roleLabel = BUSINESS_ROLE_LABELS[c.role];
      if (count === 0) {
        return {
          feasible: false,
          reason: `Cột ${roleLabel} không có giá trị nào.`,
          missingRoles: [],
          missingAnyOf: [],
        };
      }
      if (count === 1) {
        return {
          feasible: false,
          reason: `Cột ${roleLabel} chỉ có 1 giá trị, không có gì để so sánh.`,
          missingRoles: [],
          missingAnyOf: [],
        };
      }
    } else if (c.type === 'min_months') {
      const months = facts.validMonths;
      if (months === 0) {
        return {
          feasible: false,
          reason: 'Không dòng nào có tháng hợp lệ.',
          missingRoles: [],
          missingAnyOf: [],
        };
      }
      if (months === 1) {
        return {
          feasible: false,
          reason: 'Chỉ có 1 tháng hợp lệ, không đủ để so sánh theo thời gian.',
          missingRoles: [],
          missingAnyOf: [],
        };
      }
    }
  }

  return { feasible: true };
}

/**
 * Returns feasibility evaluation for all 13 catalog metrics in exact B3 order.
 */
export function listFeasibility(facts: BusinessFacts): MetricFeasibilityItem[] {
  return BUSINESS_METRIC_CATALOG.map((m) => ({
    metricId: m.id,
    result: checkFeasibility(m.id, facts),
  }));
}
