import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { validateBytes } from '../core/validator';
import { runBusinessCleanPipeline } from '../core/cleaner/businessCleaner';

describe('Prompt 1X Verification Suite', () => {
  const banLePath = path.resolve(__dirname, '../../samples/business/du-lieu-test-ban-le.csv');
  const dienTuPath = path.resolve(__dirname, '../../samples/business/dien-tu-thieu-loi-nhuan.csv');

  it('X2b. Verifies modal affected details for ban-le.csv (2, 4, 2, 3, 48)', async () => {
    const bytes = new Uint8Array(fs.readFileSync(banLePath));
    const val = await validateBytes('du-lieu-test-ban-le.csv', bytes);
    expect(val.ok).toBe(true);
    if (!val.ok) throw new Error('Validation failed');
    const pipe = runBusinessCleanPipeline(val.businessTable!, {});

    // 1. Dòng trống: 2 dòng
    const pBlank = pipe.proposals.find((p) => p.op === 'remove_blank_rows');
    expect(pBlank?.rows_affected).toBe(2);

    // 2. Khoảng trắng: 4 dòng
    const pTrim = pipe.proposals.find((p) => p.op === 'trim_whitespace');
    expect(pTrim?.rows_affected).toBe(4);
    const trimmedDiffs = pipe.diffRows.filter((r) => r.status === 'trimmed');
    expect(trimmedDiffs.length).toBe(4);
    expect(trimmedDiffs.some((d) => d.details_vi?.includes('" Website " → "Website"'))).toBe(true);
    expect(trimmedDiffs.some((d) => d.details_vi?.includes('"  Miền Bắc" → "Miền Bắc"'))).toBe(true);
    expect(trimmedDiffs.some((d) => d.details_vi?.includes('"Túi tote " → "Túi tote"'))).toBe(true);
    expect(trimmedDiffs.some((d) => d.details_vi?.includes('"Sàn thương mại điện tử " → "Sàn thương mại điện tử"'))).toBe(true);

    // 3. Dòng trùng: 2 dòng (DS-008, DS-043)
    const pDup = pipe.proposals.find((p) => p.op === 'drop_exact_duplicates');
    expect(pDup?.rows_affected).toBe(2);
    const dupDiffs = pipe.diffRows.filter((r) => r.status === 'duplicate_dropped');
    expect(dupDiffs.length).toBe(2);
    expect(dupDiffs.some((d) => d.row_id === 'DS-008')).toBe(true);
    expect(dupDiffs.some((d) => d.row_id === 'DS-043')).toBe(true);

    // 4. Nhãn ô trống: 3 dòng điền thành "Không xác định"
    const pFill = pipe.proposals.find((p) => p.op === 'fill_blank_dimension_label');
    expect(pFill?.rows_affected).toBe(3);
    const fillDiffs = pipe.diffRows.filter((r) => r.status === 'blank_filled');
    expect(fillDiffs.length).toBe(3);
    fillDiffs.forEach((d) => {
      expect(d.details_vi).toContain('Không xác định');
    });

    // 5. Sắp xếp tự nhiên: toàn bộ 48 dòng sạch
    const pSort = pipe.proposals.find((p) => p.op === 'sort_natural');
    expect(pSort?.rows_affected).toBe(48);
    expect(pipe.totalAfterRows).toBe(48);
  });

  it('X2b. Verifies modal affected details for dien-tu-thieu-loi-nhuan.csv (1, 2, 1, 1, 24)', async () => {
    const bytes = new Uint8Array(fs.readFileSync(dienTuPath));
    const val = await validateBytes('dien-tu-thieu-loi-nhuan.csv', bytes);
    expect(val.ok).toBe(true);
    if (!val.ok) throw new Error('Validation failed');
    const pipe = runBusinessCleanPipeline(val.businessTable!, {});

    const pBlank = pipe.proposals.find((p) => p.op === 'remove_blank_rows');
    expect(pBlank?.rows_affected).toBe(1);

    const pTrim = pipe.proposals.find((p) => p.op === 'trim_whitespace');
    expect(pTrim?.rows_affected).toBe(2);

    const pDup = pipe.proposals.find((p) => p.op === 'drop_exact_duplicates');
    expect(pDup?.rows_affected).toBe(1);
    const dupDiffs = pipe.diffRows.filter((r) => r.status === 'duplicate_dropped');
    expect(dupDiffs[0].row_id).toBe('DT-008');

    const pFill = pipe.proposals.find((p) => p.op === 'fill_blank_dimension_label');
    expect(pFill?.rows_affected).toBe(1);
    const fillDiffs = pipe.diffRows.filter((r) => r.status === 'blank_filled');
    expect(fillDiffs[0].row_id).toBe('DT-004');
    expect(fillDiffs[0].details_vi).toContain('Không xác định');

    const pSort = pipe.proposals.find((p) => p.op === 'sort_natural');
    expect(pSort?.rows_affected).toBe(24);
    expect(pipe.totalAfterRows).toBe(24);
  });

  it('X3. Verifies skipped_blank_rows is dynamically computed by validator without literal', async () => {
    const bytes = new Uint8Array(fs.readFileSync(banLePath));
    const valRes = await validateBytes('du-lieu-test-ban-le.csv', bytes);
    expect(valRes.ok).toBe(true);
    if (!valRes.ok) throw new Error('Validation failed');
    expect(valRes.summary.skipped_blank_rows).toBe(2);
    expect(valRes.businessTable?.skipped_blank_rows).toBe(2);
  });
});
