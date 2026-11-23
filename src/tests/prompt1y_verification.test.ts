import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { validateBytes } from '../core/validator';
import { runBusinessCleanPipeline } from '../core/cleaner/businessCleaner';
import { resolveBusinessRoles } from '../core/metrics/businessRoles';

describe('Prompt 1Y Verification Suite', () => {
  const dienTuPath = path.resolve(__dirname, '../../samples/business/dien-tu-thieu-loi-nhuan.csv');
  const oToPath = path.resolve(__dirname, '../../samples/business/o-to-thieu-kenh-thieu-gia-von.csv');

  it('Verifies correct diffRow original_row and row_id on dien-tu-thieu-loi-nhuan.csv', async () => {
    const bytes = new Uint8Array(fs.readFileSync(dienTuPath));
    const val = await validateBytes('dien-tu-thieu-loi-nhuan.csv', bytes);
    expect(val.ok).toBe(true);
    if (!val.ok) throw new Error('Validation failed');

    const res = runBusinessCleanPipeline(val.businessTable!, {});
    
    // DT-004: blank_filled on row 5
    const dt004 = res.diffRows.find(d => d.row_id === 'DT-004' && d.status === 'blank_filled');
    expect(dt004).toBeDefined();
    expect(dt004?.original_row).toBe(5);

    // DT-006: trimmed on row 7
    const dt006 = res.diffRows.find(d => d.row_id === 'DT-006' && d.status === 'trimmed');
    expect(dt006).toBeDefined();
    expect(dt006?.original_row).toBe(7);

    // DT-010: trimmed on row 11
    const dt010 = res.diffRows.find(d => d.row_id === 'DT-010' && d.status === 'trimmed');
    expect(dt010).toBeDefined();
    expect(dt010?.original_row).toBe(11);

    // DT-008: duplicate_dropped on row 27
    const dt008 = res.diffRows.find(d => d.row_id === 'DT-008' && d.status === 'duplicate_dropped');
    expect(dt008).toBeDefined();
    expect(dt008?.original_row).toBe(27);
  });

  it('Verifies missing columns detection on o-to-thieu-kenh-thieu-gia-von.csv', async () => {
    const bytes = new Uint8Array(fs.readFileSync(oToPath));
    const val = await validateBytes('o-to-thieu-kenh-thieu-gia-von.csv', bytes);
    expect(val.ok).toBe(true);
    if (!val.ok) throw new Error('Validation failed');

    const res = runBusinessCleanPipeline(val.businessTable!, {});
    const roles = resolveBusinessRoles(res.cleanTable);

    expect(roles.channel.status).toBe('thiếu');
    expect(roles.cogs.status).toBe('thiếu');
    expect(roles.profit.status).toBe('thiếu');
    expect(roles.region.status).toBe('tìm thấy');
    expect(roles.product.status).toBe('tìm thấy');
    expect(roles.revenue.status).toBe('tìm thấy');
    expect(roles.orders.status).toBe('tìm thấy');
  });
});
