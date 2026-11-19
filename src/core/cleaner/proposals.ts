/**
 * Clean proposals generator from allowlist operations (Section 5).
 * Only proposes an operation when rows_affected > 0 (except sort_by_symbol_date).
 * Pure function - zero side effects.
 */

import type { RawDataset } from '../dataset';
import type { CleanProposal, Profile } from '../schemas';
import { dropExactDuplicates } from './ops/dropExactDuplicates';
import { dropRowsMissingOhlc } from './ops/dropRowsMissingOhlc';
import { fillMissingVolumeZero } from './ops/fillMissingVolumeZero';
import { flagOutliers } from './ops/flagOutliers';
import { CLEAN_CONFIG } from './cleanConfig';

/**
 * Extracts distinct symbol names for a set of raw row indices.
 */
function getAffectedSymbols(raw: RawDataset, indices: number[]): string[] {
  const set = new Set<string>();
  for (const idx of indices) {
    if (idx >= 0 && idx < raw.symbol_idx.length) {
      set.add(raw.symbols[raw.symbol_idx[idx]]);
    }
  }
  return Array.from(set);
}

/**
 * Extracts 1-based original source row numbers for sample display.
 */
function getSampleRows(raw: RawDataset, indices: number[]): number[] {
  const samples: number[] = [];
  const limit = Math.min(indices.length, CLEAN_CONFIG.MAX_SAMPLE_ROWS);
  for (let i = 0; i < limit; i++) {
    const idx = indices[i];
    const sourceRow = raw.source_row ? raw.source_row[idx] : idx + 1;
    samples.push(sourceRow);
  }
  return samples;
}

export function generateProposals(raw: RawDataset, profile: Profile): CleanProposal[] {
  const proposals: CleanProposal[] = [];

  // 1. Check drop_exact_duplicates
  const dupResult = dropExactDuplicates(raw);
  if (dupResult.droppedIndices.length > 0) {
    const affectedSymbols = getAffectedSymbols(raw, dupResult.droppedIndices);
    const sampleRows = getSampleRows(raw, dupResult.droppedIndices);
    proposals.push({
      id: 'prop_drop_exact_duplicates',
      op: 'drop_exact_duplicates',
      title_vi: 'Bỏ dòng trùng lặp hoàn toàn',
      description_vi: `Phát hiện ${dupResult.droppedIndices.length} dòng dữ liệu trùng lặp hoàn toàn ở các mã (${affectedSymbols.join(', ')}). Giữ lại phiên bản xuất hiện đầu tiên.`,
      rows_affected: dupResult.droppedIndices.length,
      affected_symbols: affectedSymbols,
      sample_rows: sampleRows,
      severity: 'info',
      default_enabled: true,
    });
  }

  // 2. Check drop_rows_missing_ohlc
  // (evaluated after dropping exact duplicates so counts don't double count)
  const afterDups = dupResult.dataset;
  const missingOhlcResult = dropRowsMissingOhlc(afterDups);
  if (missingOhlcResult.droppedIndices.length > 0) {
    // Map back to original indices for sample row display
    const affectedSymbols = getAffectedSymbols(afterDups, missingOhlcResult.droppedIndices);
    const sampleRows = getSampleRows(afterDups, missingOhlcResult.droppedIndices);
    proposals.push({
      id: 'prop_drop_rows_missing_ohlc',
      op: 'drop_rows_missing_ohlc',
      title_vi: 'Bỏ dòng thiếu giá OHLC',
      description_vi: `Phát hiện ${missingOhlcResult.droppedIndices.length} phiên bị thiếu một trong các mức giá mở, cao, thấp hoặc đóng. Bỏ các dòng này để tránh làm méo biểu đồ.`,
      rows_affected: missingOhlcResult.droppedIndices.length,
      affected_symbols: affectedSymbols,
      sample_rows: sampleRows,
      severity: 'warn',
      default_enabled: true,
    });
  }

  // 3. Check fill_missing_volume_zero
  const afterOhlc = missingOhlcResult.dataset;
  const fillVolResult = fillMissingVolumeZero(afterOhlc);
  if (fillVolResult.filledIndices.length > 0) {
    const affectedSymbols = getAffectedSymbols(afterOhlc, fillVolResult.filledIndices);
    const sampleRows = getSampleRows(afterOhlc, fillVolResult.filledIndices);
    proposals.push({
      id: 'prop_fill_missing_volume_zero',
      op: 'fill_missing_volume_zero',
      title_vi: 'Điền 0 cho ô khối lượng trống',
      description_vi: `Ô khối lượng trống sẽ được điền 0 (${fillVolResult.filledIndices.length} ô ở các mã ${affectedSymbols.join(', ')}). Lưu ý: ô trống chưa chắc là không có giao dịch; điền 0 làm giảm khối lượng trung bình. Chỉ bật nếu bạn biết chắc.`,
      rows_affected: fillVolResult.filledIndices.length,
      affected_symbols: affectedSymbols,
      sample_rows: sampleRows,
      severity: 'info',
      default_enabled: false,
    });
  }

  // 4 & 5. Check outliers
  // Outliers calculated on dataset with duplicates and missing OHLC removed
  const outlierResult = flagOutliers(afterOhlc);
  if (outlierResult.flaggedIndices.length > 0) {
    const affectedSymbols = outlierResult.flaggedSymbols;
    const sampleRows = getSampleRows(afterOhlc, outlierResult.flaggedIndices);

    // Proposal 4: flag_outliers (default ON)
    proposals.push({
      id: 'prop_flag_outliers',
      op: 'flag_outliers',
      title_vi: 'Đánh dấu các phiên biến động bất thường',
      description_vi: `Phát hiện ${outlierResult.flaggedIndices.length} phiên có mức biến động giá bất thường (z > 6 và |lợi suất| > 10%) ở các mã (${affectedSymbols.join(', ')}). Chỉ gắn cờ đánh dấu, không thay đổi số liệu.`,
      rows_affected: outlierResult.flaggedIndices.length,
      affected_symbols: affectedSymbols,
      sample_rows: sampleRows,
      severity: 'info',
      default_enabled: true,
    });

    // Proposal 5: drop_flagged_outliers (default OFF)
    proposals.push({
      id: 'prop_drop_flagged_outliers',
      op: 'drop_flagged_outliers',
      title_vi: 'Loại bỏ các phiên bất thường đã đánh dấu',
      description_vi: `Loại bỏ ${outlierResult.flaggedIndices.length} phiên bất thường khỏi tập dữ liệu sạch để tránh gây nhiễu cho các thuật toán định lượng.`,
      rows_affected: outlierResult.flaggedIndices.length,
      affected_symbols: affectedSymbols,
      sample_rows: sampleRows,
      severity: 'warn',
      default_enabled: false,
    });
  }

  // 6. sort_by_symbol_date is always applied, but also listed in proposals for informational clarity
  proposals.push({
    id: 'prop_sort_by_symbol_date',
    op: 'sort_by_symbol_date',
    title_vi: 'Sắp xếp chuẩn hóa theo Mã và Ngày',
    description_vi: `Toàn bộ ${profile.total_rows} dòng sẽ được sắp xếp ổn định tăng dần theo Mã chứng khoán và Ngày giao dịch trước khi phân tích.`,
    rows_affected: profile.total_rows,
    affected_symbols: raw.symbols,
    sample_rows: [],
    severity: 'info',
    default_enabled: true,
  });

  return proposals;
}

