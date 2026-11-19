/**
 * Full Data Cleaning Pipeline & Constraint Validation (Section 5).
 * Applies operations in strict sequential order:
 * 1. drop_exact_duplicates
 * 2. drop_rows_missing_ohlc
 * 3. fill_missing_volume_zero
 * 4. flag_outliers
 * 5. drop_flagged_outliers
 * 6. sort_by_symbol_date
 *
 * Checks post-clean constraints (Section 5.4):
 * - >= min_sessions per symbol
 * - >= 1 symbol remaining
 * - No duplicate (date, symbol) keys
 */

import type { RawDataset } from '../dataset';
import type { CleanOpKey } from '../schemas';
import { dropExactDuplicates } from './ops/dropExactDuplicates';
import { dropRowsMissingOhlc } from './ops/dropRowsMissingOhlc';
import { fillMissingVolumeZero } from './ops/fillMissingVolumeZero';
import { flagOutliers } from './ops/flagOutliers';
import { dropFlaggedOutliers } from './ops/dropFlaggedOutliers';
import { sortBySymbolDate } from './ops/sortBySymbolDate';
import { CLEAN_CONFIG } from './cleanConfig';

export interface ConstraintViolation {
  symbol: string;
  sessions_remaining: number;
  sessions_required: number;
  causing_op: CleanOpKey;
  message_vi: string;
}

export interface DiffRowMeta {
  source_row: number;
  original_index: number;
  symbol: string;
  date_days: number;
  status: 'normal' | 'dropped' | 'outlier' | 'filled';
  dropped_by?: CleanOpKey;
  details_vi?: string;
}

export interface CleanPipelineResult {
  valid: boolean;
  cleanDataset: RawDataset;
  outlierFlags: Uint8Array;
  violations: ConstraintViolation[];
  warnings: string[];
  totalBeforeRows: number;
  totalAfterRows: number;
  droppedCount: number;
  filledCount: number;
  outlierCount: number;
  symbolSessions: Record<string, number>;
  diffRows: DiffRowMeta[];
}

export function runCleaningPipeline(
  raw: RawDataset,
  decisions: Record<string, boolean>,
  options: {
    min_sessions?: number;
    strict_mode?: boolean;
  } = {}
): CleanPipelineResult {
  const minSessions = options.min_sessions ?? CLEAN_CONFIG.MIN_SESSIONS_REQUIRED;
  const strictMode = options.strict_mode ?? true;

  const totalBeforeRows = raw.symbol_idx.length;
  let currentDataset = raw;
  let currentFlags = new Uint8Array(totalBeforeRows);

  // Track status for each original row index
  const diffRows: DiffRowMeta[] = [];
  for (let i = 0; i < totalBeforeRows; i++) {
    diffRows.push({
      source_row: raw.source_row ? raw.source_row[i] : i + 1,
      original_index: i,
      symbol: raw.symbols[raw.symbol_idx[i]],
      date_days: raw.date_days[i],
      status: 'normal',
    });
  }

  let droppedCount = 0;
  let filledCount = 0;
  let outlierCount = 0;

  // Helper to check if an operation is enabled by op key or proposal ID
  const isOpEnabled = (op: CleanOpKey): boolean => {
    if (decisions[op] !== undefined) return Boolean(decisions[op]);
    if (decisions[`prop_${op}`] !== undefined) return Boolean(decisions[`prop_${op}`]);
    return false;
  };

  // Track which op dropped which original source row
  const droppedByOp = new Map<number, CleanOpKey>();

  // 1. Drop exact duplicates
  if (isOpEnabled('drop_exact_duplicates')) {
    const dupRes = dropExactDuplicates(currentDataset);
    for (const droppedIdx of dupRes.droppedIndices) {
      const sourceRow = currentDataset.source_row ? currentDataset.source_row[droppedIdx] : droppedIdx + 1;
      droppedByOp.set(sourceRow, 'drop_exact_duplicates');
      const orig = diffRows.find((d) => d.source_row === sourceRow && d.status === 'normal');
      if (orig) {
        orig.status = 'dropped';
        orig.dropped_by = 'drop_exact_duplicates';
        orig.details_vi = 'Dòng trùng lặp hoàn toàn';
      }
    }
    currentDataset = dupRes.dataset;
    droppedCount += dupRes.droppedIndices.length;
  }

  // 2. Drop rows missing OHLC
  if (isOpEnabled('drop_rows_missing_ohlc')) {
    const ohlcRes = dropRowsMissingOhlc(currentDataset);
    for (const droppedIdx of ohlcRes.droppedIndices) {
      const sourceRow = currentDataset.source_row ? currentDataset.source_row[droppedIdx] : droppedIdx + 1;
      droppedByOp.set(sourceRow, 'drop_rows_missing_ohlc');
      const orig = diffRows.find((d) => d.source_row === sourceRow && d.status === 'normal');
      if (orig) {
        orig.status = 'dropped';
        orig.dropped_by = 'drop_rows_missing_ohlc';
        orig.details_vi = 'Thiếu một trong các mức giá OHLC';
      }
    }
    currentDataset = ohlcRes.dataset;
    droppedCount += ohlcRes.droppedIndices.length;
  }

  // 3. Fill missing volume with zero
  if (isOpEnabled('fill_missing_volume_zero')) {
    const volRes = fillMissingVolumeZero(currentDataset);
    for (const filledIdx of volRes.filledIndices) {
      const sourceRow = currentDataset.source_row ? currentDataset.source_row[filledIdx] : filledIdx + 1;
      const orig = diffRows.find((d) => d.source_row === sourceRow && d.status === 'normal');
      if (orig) {
        orig.status = 'filled';
        orig.details_vi = 'Được điền khối lượng = 0';
      }
    }
    currentDataset = volRes.dataset;
    filledCount += volRes.filledIndices.length;
  }

  // 4. Flag outliers
  if (isOpEnabled('flag_outliers')) {
    const outlierRes = flagOutliers(currentDataset);
    currentFlags = outlierRes.outlierFlags as any;
    outlierCount = outlierRes.flaggedIndices.length;

    for (const flagIdx of outlierRes.flaggedIndices) {
      const sourceRow = currentDataset.source_row ? currentDataset.source_row[flagIdx] : flagIdx + 1;
      const orig = diffRows.find((d) => d.source_row === sourceRow && d.status === 'normal');
      if (orig) {
        orig.status = 'outlier';
        orig.details_vi = 'Biến động bất thường (z > 6, lợi suất > 10%)';
      }
    }
  }

  // 5. Drop flagged outliers
  if (isOpEnabled('drop_flagged_outliers')) {
    const dropOutlierRes = dropFlaggedOutliers(currentDataset, currentFlags);
    for (const droppedIdx of dropOutlierRes.droppedIndices) {
      const sourceRow = currentDataset.source_row ? currentDataset.source_row[droppedIdx] : droppedIdx + 1;
      droppedByOp.set(sourceRow, 'drop_flagged_outliers');
      const orig = diffRows.find((d) => d.source_row === sourceRow);
      if (orig) {
        orig.status = 'dropped';
        orig.dropped_by = 'drop_flagged_outliers';
        orig.details_vi = 'Bỏ do đánh dấu biến động bất thường';
      }
    }
    currentDataset = dropOutlierRes.dataset;
    currentFlags = dropOutlierRes.outlierFlags as any;
    droppedCount += dropOutlierRes.droppedIndices.length;
  }

  // 6. Stable sort by symbol then date (always applied)
  const sortRes = sortBySymbolDate(currentDataset, currentFlags);
  currentDataset = sortRes.dataset;
  if (sortRes.outlierFlags) {
    currentFlags = sortRes.outlierFlags as any;
  }

  // Count remaining sessions per symbol
  const symbolSessions: Record<string, number> = {};
  for (const s of currentDataset.symbols) {
    symbolSessions[s] = 0;
  }
  for (let i = 0; i < currentDataset.symbol_idx.length; i++) {
    const s = currentDataset.symbols[currentDataset.symbol_idx[i]];
    symbolSessions[s] = (symbolSessions[s] || 0) + 1;
  }

  // Section 5.4 Constraints check
  const violations: ConstraintViolation[] = [];
  const warnings: string[] = [];

  for (const [sym, count] of Object.entries(symbolSessions)) {
    if (count < minSessions) {
      let causingOp: CleanOpKey = 'drop_rows_missing_ohlc';
      if (isOpEnabled('drop_flagged_outliers')) {
        causingOp = 'drop_flagged_outliers';
      } else if (isOpEnabled('drop_exact_duplicates')) {
        causingOp = 'drop_exact_duplicates';
      }

      if (strictMode) {
        violations.push({
          symbol: sym,
          sessions_remaining: count,
          sessions_required: minSessions,
          causing_op: causingOp,
          message_vi: `Mã ${sym} chỉ còn ${count} phiên sau khi làm sạch (yêu cầu tối thiểu ${minSessions} phiên). Thao tác "${causingOp}" đã làm giảm số phiên dưới ngưỡng.`,
        });
      } else {
        warnings.push(
          `Mã ${sym} chỉ có ${count} phiên (< ${minSessions}) và sẽ bị loại bỏ khỏi tập dữ liệu phân tích (chế độ không nghiêm ngặt).`
        );
      }
    }
  }

  // Must have at least 1 usable symbol remaining
  const usableSymbolsCount = Object.values(symbolSessions).filter((c) => c >= minSessions).length;
  if (usableSymbolsCount === 0) {
    violations.push({
      symbol: 'ALL',
      sessions_remaining: 0,
      sessions_required: minSessions,
      causing_op: 'drop_rows_missing_ohlc',
      message_vi: `Không còn mã cổ phiếu nào đạt đủ tối thiểu ${minSessions} phiên hợp lệ sau khi làm sạch. Vui lòng tắt bớt các thao tác xóa dòng.`,
    });
  }

  // Duplicate key check in clean dataset: no duplicate (symbol, date)
  const cleanKeySeen = new Set<string>();
  for (let i = 0; i < currentDataset.symbol_idx.length; i++) {
    const key = `${currentDataset.symbols[currentDataset.symbol_idx[i]]}|${currentDataset.date_days[i]}`;
    if (cleanKeySeen.has(key)) {
      violations.push({
        symbol: currentDataset.symbols[currentDataset.symbol_idx[i]],
        sessions_remaining: currentDataset.symbol_idx.length,
        sessions_required: minSessions,
        causing_op: 'drop_exact_duplicates',
        message_vi: `Vẫn còn cặp (Mã, Ngày) bị trùng lặp trong dữ liệu sạch. Vui lòng bật thao tác "Bỏ dòng trùng lặp hoàn toàn".`,
      });
      break;
    }
    cleanKeySeen.add(key);
  }

  const valid = violations.length === 0;

  return {
    valid,
    cleanDataset: currentDataset,
    outlierFlags: currentFlags,
    violations,
    warnings,
    totalBeforeRows,
    totalAfterRows: currentDataset.symbol_idx.length,
    droppedCount,
    filledCount,
    outlierCount,
    symbolSessions,
    diffRows,
  };
}
