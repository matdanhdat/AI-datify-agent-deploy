/**
 * Standardized Business Cleaning Engine (Prompt E1).
 * High-performance, pure TypeScript implementation of the 5 discrete business cleaning operations:
 * 1. remove_blank_rows: Remove rows that are entirely empty or whitespace.
 * 2. trim_whitespace: Trim leading/trailing whitespace and collapse internal consecutive spaces in string cells.
 * 3. drop_exact_duplicates: Drop exact duplicate rows based on hash/composite key of all row values.
 * 4. fill_blank_dimension_label: Replace blank/empty dimension cells with "Không xác định".
 * 5. sort_natural: Stable sort by time column ascending, then by ID column natural collator order.
 *
 * Guarantees zero AI involvement in calculation, zero data modification by LLM,
 * and exact numerical match for all aggregations.
 */

import type { BusinessColumn, BusinessTable, ColumnRole } from '../businessTable';
import type { CleanProposal } from '../schemas';
import { sha256Hex } from '../hash';
import { resolveBusinessRoles, type BusinessResolvedRoles } from '../metrics/businessRoles';
import { applyManualBusinessRoles } from '../validator/business';

export interface BusinessCleanDecisions {
  remove_blank_rows?: boolean;
  trim_whitespace?: boolean;
  drop_exact_duplicates?: boolean;
  fill_blank_dimension_label?: boolean;
  sort_natural?: boolean;
  [key: string]: boolean | undefined;
}

export interface BusinessColumnSummary {
  key: string;
  label: string;
  role: ColumnRole;
  non_null_count: number;
  missing_count: number;
  distinct_count: number;
  sample_values: string[];
  min?: number | string;
  max?: number | string;
  sum?: number;
  avg?: number;
}

/**
 * Capability IDs actually computed by the Business Cleaning & Profiling Engine.
 * Single source of truth used by context suggestion filtering (U2).
 */
export const BUSINESS_PROFILE_CAPABILITIES = [
  'biz_total_orders',
  'biz_total_revenue',
  'biz_total_cogs',
  'biz_total_profit',
  'biz_gross_margin_pct',
  'biz_aov',
  'biz_revenue_by_channel',
  'biz_margin_by_channel',
  'biz_revenue_by_product',
  'biz_margin_by_product',
  'biz_revenue_by_region',
  'biz_revenue_by_month',
  'data_quality_profile',
  'data_summary',
] as const;

export interface BusinessProfile {
  kind: 'business';
  total_rows: number;
  total_columns: number;
  skipped_blank_rows: number;
  skipped_total_rows?: number;
  skipped_total_row_numbers?: number[];
  trimmed_cells_count: number;
  exact_duplicates_count: number;
  blank_dimension_cells_count: number;
  columns_summary: BusinessColumnSummary[];
  aggregates: {
    orders: number | null;
    total_orders: number | null;
    revenue: number;
    total_revenue: number;
    cogs: number | null;
    total_cogs: number | null;
    profit: number | null;
    total_profit: number | null;
    margin_pct: number | null;
    gross_margin_pct: number | null;
    aov: number | null;
  };
  breakdown: {
    by_channel: Record<string, { rows: number; orders: number | null; revenue: number; cogs: number | null; profit: number | null; margin_pct?: number | null }>;
    by_month: Record<string, { rows: number; orders: number | null; revenue: number; cogs: number | null; profit: number | null; margin_pct?: number | null }>;
    by_region: Record<string, { rows: number; orders: number | null; revenue: number; cogs: number | null; profit: number | null; margin_pct?: number | null }>;
    by_product: Record<string, { rows: number; orders: number | null; revenue: number; cogs: number | null; profit: number | null; margin_pct?: number | null }>;
  };
}

export interface BusinessCleanPipelineResult {
  valid: boolean;
  violations: Array<{ code: string; message_vi: string }>;
  cleanTable: BusinessTable;
  proposals: CleanProposal[];
  decisions: Record<string, boolean>;
  totalBeforeRows: number;
  totalAfterRows: number;
  droppedCount: number;
  statsBefore: {
    orders: number | null;
    total_orders: number | null;
    revenue: number;
    total_revenue: number;
    cogs: number | null;
    total_cogs: number | null;
    profit: number | null;
    total_profit: number | null;
    margin_pct: number | null;
    gross_margin_pct: number | null;
    aov: number | null;
  };
  statsAfter: {
    orders: number | null;
    total_orders: number | null;
    revenue: number;
    total_revenue: number;
    cogs: number | null;
    total_cogs: number | null;
    profit: number | null;
    total_profit: number | null;
    margin_pct: number | null;
    gross_margin_pct: number | null;
    aov: number | null;
  };
  rawTable?: BusinessTable;
  resolvedRoles?: BusinessResolvedRoles;
  diffRows: Array<{
    row_id: string;
    status: 'kept' | 'trimmed' | 'duplicate_dropped' | 'blank_filled' | 'blank_row_dropped';
    details_vi: string;
    original_row: number;
  }>;
}

/**
 * Extracts raw string representation of a cell at given row across any column role.
 */
function getCellString(col: BusinessColumn, rowIdx: number): string {
  switch (col.role) {
    case 'id':
      return col.values[rowIdx] ?? '';
    case 'time':
      if (col.raw_labels && col.raw_labels[rowIdx] !== undefined) {
        return col.raw_labels[rowIdx];
      }
      return String(col.values[rowIdx] ?? '');
    case 'dimension':
      if (col.raw_labels && col.raw_labels[rowIdx] !== undefined) {
        return col.raw_labels[rowIdx];
      }
      const code = col.codes[rowIdx];
      if (code === 0xffff || code === undefined) return '';
      return col.categories[code] ?? '';
    case 'measure':
      const v = col.values[rowIdx];
      return isNaN(v) ? '' : String(v);
    default:
      return '';
  }
}

/**
 * Deep clones a BusinessTable so modifications in operations do not mutate previous states.
 */
export function cloneBusinessTable(table: BusinessTable): BusinessTable {
  const n = table.n;
  const source_row = new Int32Array(table.source_row);
  const columns: BusinessColumn[] = table.columns.map((col) => {
    switch (col.role) {
      case 'id':
        return {
          role: 'id',
          key: col.key,
          label: col.label,
          values: [...col.values],
          userChosenRole: col.userChosenRole,
        };
      case 'time':
        return {
          role: 'time',
          key: col.key,
          label: col.label,
          granularity: col.granularity,
          values: new Int32Array(col.values),
          raw_labels: col.raw_labels ? [...col.raw_labels] : undefined,
          userChosenRole: col.userChosenRole,
        };
      case 'dimension':
        return {
          role: 'dimension',
          key: col.key,
          label: col.label,
          categories: [...col.categories],
          codes: new Uint16Array(col.codes),
          raw_labels: col.raw_labels ? [...col.raw_labels] : undefined,
          userChosenRole: col.userChosenRole,
        };
      case 'measure':
        return {
          role: 'measure',
          key: col.key,
          label: col.label,
          unit: col.unit,
          values: new Float64Array(col.values),
          raw_values: col.raw_values ? new Float64Array(col.raw_values) : undefined,
          raw_strings: col.raw_strings ? [...col.raw_strings] : undefined,
          detectedUnit: col.detectedUnit,
          multiplier: col.multiplier,
          userUnit: col.userUnit,
          unitSource: col.unitSource,
          unit_suspicious: col.unit_suspicious,
          suspiciousReason: col.suspiciousReason,
          ambiguous_separator: col.ambiguous_separator,
          sampleAmbiguous: col.sampleAmbiguous,
          userDecimalConvention: col.userDecimalConvention,
          initialDecimalConvention: col.initialDecimalConvention,
          userChosenRole: col.userChosenRole,
        };
      default:
        return { ...col } as BusinessColumn;
    }
  });

  return {
    kind: 'business',
    n,
    source_row,
    columns,
    skipped_blank_rows: table.skipped_blank_rows,
    skipped_total_rows: table.skipped_total_rows,
    skipped_total_row_numbers: table.skipped_total_row_numbers ? [...table.skipped_total_row_numbers] : undefined,
    available_sheets: table.available_sheets ? [...table.available_sheets] : undefined,
    selected_sheet: table.selected_sheet,
    raw_bytes: table.raw_bytes,
    filename: table.filename,
    manual_column_roles: table.manual_column_roles ? { ...table.manual_column_roles } : undefined,
    cogs_exceeds_revenue_warning: table.cogs_exceeds_revenue_warning,
  };
}

/**
 * OP 1: Remove all-blank rows (rows where all cells are empty string or whitespace).
 */
export function removeBlankRows(table: BusinessTable): {
  table: BusinessTable;
  dropped_rows: number;
  dropped_indices: number[];
} {
  const keepIndices: number[] = [];
  const dropped_indices: number[] = [];

  for (let i = 0; i < table.n; i++) {
    let hasContent = false;
    for (const col of table.columns) {
      const s = getCellString(col, i);
      if (s.trim().length > 0) {
        hasContent = true;
        break;
      }
    }
    if (hasContent) {
      keepIndices.push(i);
    } else {
      dropped_indices.push(i);
    }
  }

  if (keepIndices.length === table.n) {
    return { table, dropped_rows: 0, dropped_indices: [] };
  }

  const newN = keepIndices.length;
  const newSourceRow = new Int32Array(newN);
  for (let k = 0; k < newN; k++) {
    newSourceRow[k] = table.source_row[keepIndices[k]];
  }

  const newColumns: BusinessColumn[] = table.columns.map((col) => {
    switch (col.role) {
      case 'id':
        return {
          ...col,
          values: keepIndices.map((idx) => col.values[idx]),
        };
      case 'time': {
        const vals = new Int32Array(newN);
        const raw_labels = col.raw_labels ? keepIndices.map((idx) => col.raw_labels![idx]) : undefined;
        for (let k = 0; k < newN; k++) {
          vals[k] = col.values[keepIndices[k]];
        }
        return { ...col, values: vals, raw_labels };
      }
      case 'dimension': {
        const codes = new Uint16Array(newN);
        const raw_labels = col.raw_labels ? keepIndices.map((idx) => col.raw_labels![idx]) : undefined;
        for (let k = 0; k < newN; k++) {
          codes[k] = col.codes[keepIndices[k]];
        }
        return { ...col, codes, raw_labels, categories: [...col.categories] };
      }
      case 'measure': {
        const vals = new Float64Array(newN);
        const rawVals = col.raw_values ? new Float64Array(newN) : undefined;
        const rawStrings = col.raw_strings ? keepIndices.map((idx) => col.raw_strings![idx]) : undefined;
        for (let k = 0; k < newN; k++) {
          vals[k] = col.values[keepIndices[k]];
          if (rawVals && col.raw_values) rawVals[k] = col.raw_values[keepIndices[k]];
        }
        return { ...col, values: vals, raw_values: rawVals, raw_strings: rawStrings };
      }
      default:
        return { ...col } as BusinessColumn;
    }
  });

  return {
    table: {
      kind: 'business',
      n: newN,
      source_row: newSourceRow,
      columns: newColumns,
      skipped_blank_rows: table.skipped_blank_rows,
      skipped_total_rows: table.skipped_total_rows,
      skipped_total_row_numbers: table.skipped_total_row_numbers ? [...table.skipped_total_row_numbers] : undefined,
      available_sheets: table.available_sheets ? [...table.available_sheets] : undefined,
      selected_sheet: table.selected_sheet,
      raw_bytes: table.raw_bytes,
      filename: table.filename,
      manual_column_roles: table.manual_column_roles ? { ...table.manual_column_roles } : undefined,
      cogs_exceeds_revenue_warning: table.cogs_exceeds_revenue_warning,
    },
    dropped_rows: dropped_indices.length,
    dropped_indices,
  };
}

/**
 * OP 2: Trim whitespace and collapse consecutive internal spaces in string/dimension/time/id cells.
 */
export function trimWhitespace(table: BusinessTable): {
  table: BusinessTable;
  trimmed_cells: number;
  changed_cells: Array<{ row: number; column: string; before: string; after: string }>;
} {
  let trimmed_cells = 0;
  const changed_cells: Array<{ row: number; column: string; before: string; after: string }> = [];

  const next = cloneBusinessTable(table);

  for (const col of next.columns) {
    if (col.role === 'id') {
      for (let i = 0; i < next.n; i++) {
        const orig = col.values[i];
        const trimmed = orig.trim().replace(/\s+/g, ' ');
        if (trimmed !== orig) {
          trimmed_cells++;
          changed_cells.push({ row: i, column: col.label, before: orig, after: trimmed });
          col.values[i] = trimmed;
        }
      }
    } else if (col.role === 'time') {
      if (col.raw_labels) {
        for (let i = 0; i < next.n; i++) {
          const orig = col.raw_labels[i];
          const trimmed = orig.trim().replace(/\s+/g, ' ');
          if (trimmed !== orig) {
            trimmed_cells++;
            changed_cells.push({ row: i, column: col.label, before: orig, after: trimmed });
            col.raw_labels[i] = trimmed;
          }
        }
      }
    } else if (col.role === 'dimension') {
      // Rebuild categories and codes with trimmed strings
      const catMap = new Map<string, number>();
      const newCategories: string[] = [];

      for (let i = 0; i < next.n; i++) {
        const raw = col.raw_labels ? col.raw_labels[i] : (col.codes[i] === 0xffff ? '' : col.categories[col.codes[i]]);
        const trimmed = raw.trim().replace(/\s+/g, ' ');
        if (raw !== trimmed) {
          trimmed_cells++;
          changed_cells.push({ row: i, column: col.label, before: raw, after: trimmed });
        }
        if (col.raw_labels) {
          col.raw_labels[i] = trimmed;
        }

        if (!trimmed) {
          col.codes[i] = 0xffff;
        } else {
          let catIdx = catMap.get(trimmed);
          if (catIdx === undefined) {
            catIdx = newCategories.length;
            catMap.set(trimmed, catIdx);
            newCategories.push(trimmed);
          }
          col.codes[i] = catIdx;
        }
      }
      col.categories = newCategories;
    }
  }

  return { table: next, trimmed_cells, changed_cells };
}

/**
 * OP 3: Drop exact duplicate rows based on hash of all row values (after trimming).
 * Preserves first occurrence, drops subsequent occurrences.
 */
export function dropExactDuplicates(table: BusinessTable): {
  table: BusinessTable;
  dropped_rows: number;
  dropped_indices: number[];
  dropped_ids: string[];
} {
  const seen = new Set<string>();
  const keepIndices: number[] = [];
  const dropped_indices: number[] = [];
  const dropped_ids: string[] = [];

  const idCol = table.columns.find((c) => c.role === 'id') as { role: 'id'; values: string[] } | undefined;

  for (let i = 0; i < table.n; i++) {
    const rowValues = table.columns.map((c) => getCellString(c, i).trim());
    const key = rowValues.join('\u001F');

    if (seen.has(key)) {
      dropped_indices.push(i);
      const rowId = idCol ? idCol.values[i] : `Row ${i + 1}`;
      dropped_ids.push(rowId);
    } else {
      seen.add(key);
      keepIndices.push(i);
    }
  }

  if (dropped_indices.length === 0) {
    return { table, dropped_rows: 0, dropped_indices: [], dropped_ids: [] };
  }

  const newN = keepIndices.length;
  const newSourceRow = new Int32Array(newN);
  for (let k = 0; k < newN; k++) {
    newSourceRow[k] = table.source_row[keepIndices[k]];
  }

  const newColumns: BusinessColumn[] = table.columns.map((col) => {
    switch (col.role) {
      case 'id':
        return {
          ...col,
          values: keepIndices.map((idx) => col.values[idx]),
        };
      case 'time': {
        const vals = new Int32Array(newN);
        const raw_labels = col.raw_labels ? keepIndices.map((idx) => col.raw_labels![idx]) : undefined;
        for (let k = 0; k < newN; k++) {
          vals[k] = col.values[keepIndices[k]];
        }
        return { ...col, values: vals, raw_labels };
      }
      case 'dimension': {
        const codes = new Uint16Array(newN);
        const raw_labels = col.raw_labels ? keepIndices.map((idx) => col.raw_labels![idx]) : undefined;
        for (let k = 0; k < newN; k++) {
          codes[k] = col.codes[keepIndices[k]];
        }
        return { ...col, codes, raw_labels, categories: [...col.categories] };
      }
      case 'measure': {
        const vals = new Float64Array(newN);
        const rawVals = col.raw_values ? new Float64Array(newN) : undefined;
        const rawStrings = col.raw_strings ? keepIndices.map((idx) => col.raw_strings![idx]) : undefined;
        for (let k = 0; k < newN; k++) {
          vals[k] = col.values[keepIndices[k]];
          if (rawVals && col.raw_values) rawVals[k] = col.raw_values[keepIndices[k]];
        }
        return { ...col, values: vals, raw_values: rawVals, raw_strings: rawStrings };
      }
      default:
        return { ...col } as BusinessColumn;
    }
  });

  return {
    table: {
      kind: 'business',
      n: newN,
      source_row: newSourceRow,
      columns: newColumns,
      skipped_blank_rows: table.skipped_blank_rows,
      skipped_total_rows: table.skipped_total_rows,
      skipped_total_row_numbers: table.skipped_total_row_numbers ? [...table.skipped_total_row_numbers] : undefined,
      available_sheets: table.available_sheets ? [...table.available_sheets] : undefined,
      selected_sheet: table.selected_sheet,
      raw_bytes: table.raw_bytes,
      filename: table.filename,
      manual_column_roles: table.manual_column_roles ? { ...table.manual_column_roles } : undefined,
      cogs_exceeds_revenue_warning: table.cogs_exceeds_revenue_warning,
    },
    dropped_rows: dropped_indices.length,
    dropped_indices,
    dropped_ids,
  };
}

/**
 * OP 4: Fill blank/empty dimension cells with "Không xác định".
 */
export function fillBlankDimensionLabel(
  table: BusinessTable,
  fillLabel: string = 'Không xác định'
): {
  table: BusinessTable;
  filled_cells: number;
  changed_cells: Array<{ row: number; column: string; original_id: string }>;
} {
  let filled_cells = 0;
  const changed_cells: Array<{ row: number; column: string; original_id: string }> = [];

  const next = cloneBusinessTable(table);
  const idCol = next.columns.find((c) => c.role === 'id') as { role: 'id'; values: string[] } | undefined;

  for (const col of next.columns) {
    if (col.role === 'dimension') {
      let fillCatIdx = col.categories.indexOf(fillLabel);
      if (fillCatIdx === -1) {
        fillCatIdx = col.categories.length;
        col.categories.push(fillLabel);
      }

      for (let i = 0; i < next.n; i++) {
        const raw = col.raw_labels ? col.raw_labels[i] : (col.codes[i] === 0xffff ? '' : col.categories[col.codes[i]]);
        if (!raw || !raw.trim()) {
          filled_cells++;
          const rowId = idCol ? idCol.values[i] : `Row ${i + 1}`;
          changed_cells.push({ row: i, column: col.label, original_id: rowId });
          col.codes[i] = fillCatIdx;
          if (col.raw_labels) {
            col.raw_labels[i] = fillLabel;
          }
        }
      }
    }
  }

  return { table: next, filled_cells, changed_cells };
}

/**
 * OP 5: Stable sort by time column ascending, then ID column natural order.
 */
export function sortNatural(table: BusinessTable): BusinessTable {
  const collator = new Intl.Collator('vi', { numeric: true, sensitivity: 'base' });

  const timeCol = table.columns.find((c) => c.role === 'time') as
    | { role: 'time'; values: Int32Array; raw_labels?: string[] }
    | undefined;
  const idCol = table.columns.find((c) => c.role === 'id') as { role: 'id'; values: string[] } | undefined;

  const indices = Array.from({ length: table.n }, (_, i) => i);

  indices.sort((a, b) => {
    if (timeCol) {
      if (timeCol.raw_labels) {
        const timeCmp = timeCol.raw_labels[a].localeCompare(timeCol.raw_labels[b]);
        if (timeCmp !== 0) return timeCmp;
      } else {
        const timeCmp = timeCol.values[a] - timeCol.values[b];
        if (timeCmp !== 0) return timeCmp;
      }
    }

    if (idCol) {
      const idCmp = collator.compare(idCol.values[a], idCol.values[b]);
      if (idCmp !== 0) return idCmp;
    }

    return a - b;
  });

  const newSourceRow = new Int32Array(table.n);
  for (let k = 0; k < table.n; k++) {
    newSourceRow[k] = table.source_row[indices[k]];
  }

  const newColumns: BusinessColumn[] = table.columns.map((col) => {
    switch (col.role) {
      case 'id':
        return {
          ...col,
          values: indices.map((idx) => col.values[idx]),
        };
      case 'time': {
        const vals = new Int32Array(table.n);
        const raw_labels = col.raw_labels ? indices.map((idx) => col.raw_labels![idx]) : undefined;
        for (let k = 0; k < table.n; k++) {
          vals[k] = col.values[indices[k]];
        }
        return { ...col, values: vals, raw_labels };
      }
      case 'dimension': {
        const codes = new Uint16Array(table.n);
        const raw_labels = col.raw_labels ? indices.map((idx) => col.raw_labels![idx]) : undefined;
        for (let k = 0; k < table.n; k++) {
          codes[k] = col.codes[indices[k]];
        }
        return { ...col, codes, raw_labels, categories: [...col.categories] };
      }
      case 'measure': {
        const vals = new Float64Array(table.n);
        const rawVals = col.raw_values ? new Float64Array(table.n) : undefined;
        const rawStrings = col.raw_strings ? indices.map((idx) => col.raw_strings![idx]) : undefined;
        for (let k = 0; k < table.n; k++) {
          vals[k] = col.values[indices[k]];
          if (rawVals && col.raw_values) rawVals[k] = col.raw_values[indices[k]];
        }
        return { ...col, values: vals, raw_values: rawVals, raw_strings: rawStrings };
      }
      default:
        return { ...col } as BusinessColumn;
    }
  });

  return {
    kind: 'business',
    n: table.n,
    source_row: newSourceRow,
    columns: newColumns,
    skipped_blank_rows: table.skipped_blank_rows,
    skipped_total_rows: table.skipped_total_rows,
    skipped_total_row_numbers: table.skipped_total_row_numbers ? [...table.skipped_total_row_numbers] : undefined,
    available_sheets: table.available_sheets ? [...table.available_sheets] : undefined,
    selected_sheet: table.selected_sheet,
    raw_bytes: table.raw_bytes,
    filename: table.filename,
    manual_column_roles: table.manual_column_roles ? { ...table.manual_column_roles } : undefined,
    cogs_exceeds_revenue_warning: table.cogs_exceeds_revenue_warning,
  };
}

/**
 * Calculates aggregates and breakdowns for a BusinessTable.
 */
export function calculateBusinessAggregates(
  table: BusinessTable,
  resolvedRoles?: BusinessResolvedRoles
): {
  aggregates: BusinessProfile['aggregates'];
  breakdown: BusinessProfile['breakdown'];
  resolvedRoles: BusinessResolvedRoles;
} {
  const roles = resolvedRoles || applyManualBusinessRoles(resolveBusinessRoles(table), table);

  const hasRevenue =
    (roles.revenue.status === 'tìm thấy' || roles.revenue.status === 'suy luận') &&
    roles.revenue.col !== null;
  const hasOrders = roles.orders.status === 'tìm thấy' && roles.orders.col !== null;
  const hasCogs = roles.cogs.status === 'tìm thấy' && roles.cogs.col !== null;
  const hasProfitExplicit =
    (roles.profit.status === 'tìm thấy' || roles.profit.status === 'suy luận') &&
    roles.profit.col !== null;
  const isProfitComputed = roles.profit.status === 'tính ra';
  const isProfitUntrusted = roles.profit.status === 'không đáng tin';

  const revCol = hasRevenue
    ? (table.columns.find((c) => c.key === roles.revenue.col?.key && c.role === 'measure') as Extract<BusinessColumn, { role: 'measure' }>)
    : undefined;
  const ordersCol = hasOrders
    ? (table.columns.find((c) => c.key === roles.orders.col?.key && c.role === 'measure') as Extract<BusinessColumn, { role: 'measure' }>)
    : undefined;
  const cogsCol = hasCogs
    ? (table.columns.find((c) => c.key === roles.cogs.col?.key && c.role === 'measure') as Extract<BusinessColumn, { role: 'measure' }>)
    : undefined;
  const profitCol = hasProfitExplicit
    ? (table.columns.find((c) => c.key === roles.profit.col?.key && c.role === 'measure') as Extract<BusinessColumn, { role: 'measure' }>)
    : undefined;

  let total_orders = 0;
  let total_revenue = 0;
  let total_cogs = 0;
  let total_profit = 0;

  for (let i = 0; i < table.n; i++) {
    const o = ordersCol ? ordersCol.values[i] || 0 : 0;
    const r = revCol ? revCol.values[i] || 0 : 0;
    const c = cogsCol ? cogsCol.values[i] || 0 : 0;
    let p = profitCol ? profitCol.values[i] || 0 : 0;
    if (isProfitComputed && revCol && cogsCol) {
      p = r - c;
    }

    if (hasOrders) total_orders += o;
    if (hasRevenue) total_revenue += r;
    if (hasCogs) total_cogs += c;
    if (hasProfitExplicit || isProfitComputed) total_profit += p;
  }

  const final_orders = hasOrders ? total_orders : null;
  const final_revenue = total_revenue;
  const final_cogs = hasCogs ? total_cogs : null;
  let final_profit: number | null = null;
  if (!isProfitUntrusted && (hasProfitExplicit || (isProfitComputed && hasRevenue && hasCogs))) {
    final_profit = total_profit;
  }

  const gross_margin_pct =
    final_profit !== null && final_revenue > 0 ? (final_profit / final_revenue) * 100 : null;
  const aov =
    final_orders !== null && final_orders > 0 && final_revenue > 0
      ? final_revenue / final_orders
      : null;

  // Dimensions for breakdown using resolvedRoles
  const channelCol =
    roles.channel.status === 'tìm thấy' && roles.channel.col
      ? table.columns.find((c) => c.key === roles.channel.col?.key)
      : undefined;
  const timeCol =
    roles.time.status === 'tìm thấy' && roles.time.col
      ? table.columns.find((c) => c.key === roles.time.col?.key)
      : undefined;
  const regionCol =
    roles.region.status === 'tìm thấy' && roles.region.col
      ? table.columns.find((c) => c.key === roles.region.col?.key)
      : undefined;
  const productCol =
    roles.product.status === 'tìm thấy' && roles.product.col
      ? table.columns.find((c) => c.key === roles.product.col?.key)
      : undefined;

  function buildGroup(dimCol?: BusinessColumn) {
    const map: Record<
      string,
      { rows: number; orders: number | null; revenue: number; cogs: number | null; profit: number | null; margin_pct?: number | null }
    > = {};
    if (!dimCol) return map;

    for (let i = 0; i < table.n; i++) {
      let key = getCellString(dimCol, i).trim();
      if (!key) key = 'Không xác định';

      const o = ordersCol ? ordersCol.values[i] || 0 : 0;
      const r = revCol ? revCol.values[i] || 0 : 0;
      const c = cogsCol ? cogsCol.values[i] || 0 : 0;
      let p = profitCol ? profitCol.values[i] || 0 : 0;
      if (isProfitComputed && revCol && cogsCol) {
        p = r - c;
      }

      if (!map[key]) {
        map[key] = {
          rows: 0,
          orders: hasOrders ? 0 : null,
          revenue: 0,
          cogs: hasCogs ? 0 : null,
          profit: (hasProfitExplicit || isProfitComputed) && !isProfitUntrusted ? 0 : null,
        };
      }
      map[key].rows++;
      if (hasOrders && map[key].orders !== null) map[key].orders! += o;
      map[key].revenue += r;
      if (hasCogs && map[key].cogs !== null) map[key].cogs! += c;
      if ((hasProfitExplicit || isProfitComputed) && !isProfitUntrusted && map[key].profit !== null) {
        map[key].profit! += p;
      }
    }

    for (const item of Object.values(map)) {
      item.margin_pct =
        item.profit !== null && item.revenue > 0 ? (item.profit / item.revenue) * 100 : null;
    }

    return map as any;
  }

  return {
    aggregates: {
      total_orders: final_orders,
      orders: final_orders,
      total_revenue: final_revenue,
      revenue: final_revenue,
      total_cogs: final_cogs,
      cogs: final_cogs,
      total_profit: final_profit,
      profit: final_profit,
      gross_margin_pct,
      margin_pct: gross_margin_pct,
      aov,
    },
    breakdown: {
      by_channel: buildGroup(channelCol),
      by_month: buildGroup(timeCol),
      by_region: buildGroup(regionCol),
      by_product: buildGroup(productCol),
    },
    resolvedRoles: roles,
  };
}

/**
 * Calculates comprehensive BusinessProfile from a BusinessTable.
 */
export function calculateBusinessProfile(table: BusinessTable): BusinessProfile {
  // 1. Column summaries
  const columns_summary: BusinessColumnSummary[] = table.columns.map((col) => {
    let non_null_count = 0;
    let missing_count = 0;
    const distinctSet = new Set<string>();
    const samples: string[] = [];

    let sum = 0;
    let minNum = Infinity;
    let maxNum = -Infinity;
    let minStr = '';
    let maxStr = '';

    for (let i = 0; i < table.n; i++) {
      const s = getCellString(col, i).trim();
      if (!s) {
        missing_count++;
      } else {
        non_null_count++;
        distinctSet.add(s);
        if (samples.length < 5 && !samples.includes(s)) {
          samples.push(s);
        }

        if (col.role === 'measure') {
          const num = col.values[i];
          if (!isNaN(num)) {
            sum += num;
            if (num < minNum) minNum = num;
            if (num > maxNum) maxNum = num;
          }
        } else {
          if (!minStr || s < minStr) minStr = s;
          if (!maxStr || s > maxStr) maxStr = s;
        }
      }
    }

    return {
      key: col.key,
      label: col.label,
      role: col.role,
      non_null_count,
      missing_count,
      distinct_count: distinctSet.size,
      sample_values: samples,
      min: col.role === 'measure' ? (minNum === Infinity ? 0 : minNum) : minStr,
      max: col.role === 'measure' ? (maxNum === -Infinity ? 0 : maxNum) : maxStr,
      sum: col.role === 'measure' ? sum : undefined,
      avg: col.role === 'measure' && non_null_count > 0 ? sum / non_null_count : undefined,
    };
  });

  // 2. Count defects in raw table
  // Whitespace cells count
  let trimmed_cells_count = 0;
  for (const col of table.columns) {
    if (col.role === 'id' || col.role === 'time' || col.role === 'dimension') {
      for (let i = 0; i < table.n; i++) {
        const s = getCellString(col, i);
        if (s !== s.trim().replace(/\s+/g, ' ')) {
          trimmed_cells_count++;
        }
      }
    }
  }

  // Exact duplicate rows count
  const seenExact = new Set<string>();
  let exact_duplicates_count = 0;
  for (let i = 0; i < table.n; i++) {
    const rowStr = table.columns.map((c) => getCellString(c, i).trim().replace(/\s+/g, ' ')).join('\u001F');
    if (seenExact.has(rowStr)) {
      exact_duplicates_count++;
    } else {
      seenExact.add(rowStr);
    }
  }

  // Blank dimension cells count
  let blank_dimension_cells_count = 0;
  for (const col of table.columns) {
    if (col.role === 'dimension') {
      for (let i = 0; i < table.n; i++) {
        const s = getCellString(col, i).trim();
        if (!s) blank_dimension_cells_count++;
      }
    }
  }

  // Skipped blank rows and total rows from parser / file
  const skipped_blank_rows = table.skipped_blank_rows ?? 0;
  const skipped_total_rows = table.skipped_total_rows ?? 0;
  const skipped_total_row_numbers = table.skipped_total_row_numbers ?? [];

  const { aggregates, breakdown } = calculateBusinessAggregates(table);

  return {
    kind: 'business',
    total_rows: table.n + skipped_blank_rows + skipped_total_rows,
    total_columns: table.columns.length,
    skipped_blank_rows,
    skipped_total_rows,
    skipped_total_row_numbers,
    trimmed_cells_count,
    exact_duplicates_count,
    blank_dimension_cells_count,
    columns_summary,
    aggregates,
    breakdown,
  };
}

/**
 * Generates the 5 standardized CleanProposals for a business dataset.
 */
export function generateBusinessProposals(
  table: BusinessTable,
  profile: BusinessProfile,
  cleanRows?: number
): CleanProposal[] {
  const hasTime = table.columns.some((c) => c.role === 'time');
  const hasId = table.columns.some((c) => c.role === 'id');

  let sortTitle = 'Sắp xếp thứ tự tự nhiên';
  if (hasTime && hasId) {
    sortTitle = 'Sắp xếp thứ tự tự nhiên (Thời gian, Mã dòng)';
  } else if (hasTime) {
    sortTitle = 'Sắp xếp thứ tự tự nhiên (Thời gian)';
  } else if (hasId) {
    sortTitle = 'Sắp xếp thứ tự tự nhiên (Mã dòng)';
  }

  const R = cleanRows ?? (table.n - profile.exact_duplicates_count);
  const sortDescription = hasTime
    ? `Sắp xếp ${R} dòng theo thứ tự thời gian tăng dần${hasId ? ', sau đó theo Mã dòng.' : '.'}`
    : `Sắp xếp ${R} dòng theo thứ tự tự nhiên${hasId ? ' của Mã dòng.' : '.'}`;

  const proposals: CleanProposal[] = [
    {
      id: 'prop_remove_blank_rows',
      op: 'remove_blank_rows' as any,
      title_vi: 'Loại bỏ dòng trống hoàn toàn',
      description_vi:
        profile.skipped_blank_rows === 0
          ? 'Không phát hiện dòng trống hoàn toàn nào trong file này.'
          : `Phát hiện ${profile.skipped_blank_rows} dòng trống hoàn toàn. Loại bỏ để tránh sai lệch tổng số dòng.`,
      rows_affected: profile.skipped_blank_rows,
      affected_symbols: [],
      sample_rows: [],
      severity: 'info',
      default_enabled: true,
    },
    {
      id: 'prop_trim_whitespace',
      op: 'trim_whitespace' as any,
      title_vi: 'Chuẩn hóa khoảng trắng ô dữ liệu',
      description_vi:
        profile.trimmed_cells_count === 0
          ? 'Không phát hiện ô nào có khoảng trắng thừa trong file này.'
          : `Phát hiện ${profile.trimmed_cells_count} ô có khoảng trắng thừa ở đầu, cuối hoặc giữa các từ. Tỉa gọn và thu gọn khoảng trắng.`,
      rows_affected: profile.trimmed_cells_count,
      affected_symbols: [],
      sample_rows: [],
      severity: 'info',
      default_enabled: true,
    },
    {
      id: 'prop_drop_exact_duplicates',
      op: 'drop_exact_duplicates',
      title_vi: 'Loại bỏ dòng trùng lặp hoàn toàn',
      description_vi:
        profile.exact_duplicates_count === 0
          ? 'Không phát hiện dòng trùng lặp nào trong file này.'
          : `Phát hiện ${profile.exact_duplicates_count} dòng trùng lặp hoàn toàn. Giữ lại lần xuất hiện đầu tiên.`,
      rows_affected: profile.exact_duplicates_count,
      affected_symbols: [],
      sample_rows: [],
      severity: 'warn',
      default_enabled: true,
    },
    {
      id: 'prop_fill_blank_dimension_label',
      op: 'fill_blank_dimension_label' as any,
      title_vi: 'Điền nhãn cho ô phân loại bị để trống',
      description_vi:
        profile.blank_dimension_cells_count === 0
          ? 'Không phát hiện ô phân loại nào bị trống trong file này.'
          : `Phát hiện ${profile.blank_dimension_cells_count} ô phân loại bị trống. Điền nhãn "Không xác định".`,
      rows_affected: profile.blank_dimension_cells_count,
      affected_symbols: [],
      sample_rows: [],
      severity: 'warn',
      default_enabled: true,
    },
    {
      id: 'prop_sort_natural',
      op: 'sort_natural' as any,
      title_vi: sortTitle,
      description_vi: sortDescription,
      rows_affected: R,
      affected_symbols: [],
      sample_rows: [],
      severity: 'info',
      default_enabled: true,
    },
  ];

  return proposals;
}

/**
 * Runs the complete business cleaning pipeline with user decisions.
 */
export function runBusinessCleanPipeline(
  table: BusinessTable,
  decisions: Record<string, boolean> = {}
): BusinessCleanPipelineResult {
  let resolvedRoles = resolveBusinessRoles(table);
  resolvedRoles = applyManualBusinessRoles(resolvedRoles, table);
  const initialStats = calculateBusinessAggregates(table, resolvedRoles).aggregates;
  const rawTable = cloneBusinessTable(table);

  let current = cloneBusinessTable(table);
  const diffRows: BusinessCleanPipelineResult['diffRows'] = [];

  // Track initial total before rows
  const totalBeforeRows = current.n;

  // 1. remove_blank_rows
  if (decisions['remove_blank_rows'] !== false && decisions['prop_remove_blank_rows'] !== false) {
    const res = removeBlankRows(current);
    current = res.table;
  }

  // 2. trim_whitespace
  if (decisions['trim_whitespace'] !== false && decisions['prop_trim_whitespace'] !== false) {
    const res = trimWhitespace(current);
    current = res.table;
    const idCol = current.columns.find((c) => c.role === 'id') as { role: 'id'; values: string[] } | undefined;
    for (const c of res.changed_cells) {
      const rowId = idCol && idCol.values[c.row] ? idCol.values[c.row] : `Row ${c.row + 1}`;
      const origRow = current.source_row ? current.source_row[c.row] : c.row + 1;
      diffRows.push({
        row_id: rowId,
        status: 'trimmed',
        details_vi: `Cột ${c.column}: Chuẩn hóa khoảng trắng từ "${c.before}" → "${c.after}"`,
        original_row: origRow,
      });
    }
  }

  // 3. drop_exact_duplicates
  if (decisions['drop_exact_duplicates'] !== false && decisions['prop_drop_exact_duplicates'] !== false) {
    const prevSourceRow = current.source_row;
    const res = dropExactDuplicates(current);
    current = res.table;
    for (let k = 0; k < res.dropped_ids.length; k++) {
      const origRow = prevSourceRow ? prevSourceRow[res.dropped_indices[k]] : res.dropped_indices[k] + 1;
      diffRows.push({
        row_id: res.dropped_ids[k],
        status: 'duplicate_dropped',
        details_vi: `Loại bỏ dòng trùng lặp mã ${res.dropped_ids[k]} (dòng gốc ${origRow})`,
        original_row: origRow,
      });
    }
  }

  // 4. fill_blank_dimension_label
  if (decisions['fill_blank_dimension_label'] !== false && decisions['prop_fill_blank_dimension_label'] !== false) {
    const res = fillBlankDimensionLabel(current, 'Không xác định');
    current = res.table;
    for (const c of res.changed_cells) {
      const origRow = current.source_row ? current.source_row[c.row] : c.row + 1;
      diffRows.push({
        row_id: c.original_id,
        status: 'blank_filled',
        details_vi: `Cột ${c.column}: Điền nhãn khuyết thành "Không xác định" (mã ${c.original_id})`,
        original_row: origRow,
      });
    }
  }

  // 5. sort_natural
  if (decisions['sort_natural'] !== false && decisions['prop_sort_natural'] !== false) {
    current = sortNatural(current);
  }

  const finalStats = calculateBusinessAggregates(current, resolvedRoles).aggregates;

  // Validation
  const violations: Array<{ code: string; message_vi: string }> = [];
  if (current.n < 5) {
    violations.push({
      code: 'DATA_TOO_FEW_ROWS',
      message_vi: `Tập dữ liệu sau làm sạch còn quá ít dòng (${current.n} dòng, tối thiểu 5 dòng).`,
    });
  }

  const profile = calculateBusinessProfile(table);
  const proposals = generateBusinessProposals(table, profile);

  return {
    valid: violations.length === 0,
    violations,
    cleanTable: current,
    proposals,
    decisions,
    totalBeforeRows,
    totalAfterRows: current.n,
    droppedCount: totalBeforeRows - current.n,
    rawTable,
    statsBefore: initialStats,
    statsAfter: finalStats,
    resolvedRoles,
    diffRows,
  };
}

/**
 * Computes deterministic canonical SHA-256 hash for a cleaned BusinessTable.
 */
export async function computeBusinessCanonicalHash(table: BusinessTable): Promise<string> {
  const lines: string[] = [
    '__PIXEL_CANONICAL_BUSINESS_CLEAN_TABLE_V1__',
    `COLUMNS:${table.columns.map((c) => `${c.key}:${c.role}`).join(',')}`,
    `ROWS:${table.n}`,
  ];

  for (let i = 0; i < table.n; i++) {
    const rowVals = table.columns.map((c) => {
      if (c.role === 'measure') {
        const v = c.values[i];
        return isNaN(v) ? 'NaN' : v.toFixed(4);
      }
      return getCellString(c, i).trim();
    });
    lines.push(rowVals.join('|'));
  }

  const payload = lines.join('\n');
  return sha256Hex(payload);
}
