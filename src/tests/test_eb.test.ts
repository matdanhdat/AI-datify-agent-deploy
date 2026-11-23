import { describe, it, expect } from 'vitest';
import { validateBytes, DEFAULT_LIMITS } from '../core/validator';

describe('Prompt 1C-2d Section E-b: Column with "1.5", "2.25", "700" (nghìn đồng)', () => {
  it('parses "1.5", "2.25", "700" with nghìn đồng correctly into 1500, 2250, 700000, sum = 703750', async () => {
    const csvContent = [
      'Mã đơn,Thời gian,Kênh,Doanh thu (nghìn đồng)',
      'DH01,2026-01-01,Website,1.5',
      'DH02,2026-01-02,Website,2.25',
      'DH03,2026-01-03,Cửa hàng,700',
      'DH04,2026-01-04,Cửa hàng,10',
      'DH05,2026-01-05,Website,20',
    ].join('\n');

    const encoder = new TextEncoder();
    const bytes = encoder.encode(csvContent);

    const res = await validateBytes('test-eb.csv', bytes, DEFAULT_LIMITS);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const table = res.businessTable;
    expect(table).toBeDefined();
    if (!table) return;

    const revCol = table.columns.find((c) => c.label.includes('Doanh thu'));
    expect(revCol).toBeDefined();
    expect(revCol?.role).toBe('measure');
    if (!revCol || revCol.role !== 'measure') return;

    console.log('E-b revCol userDecimalConvention:', revCol.userDecimalConvention);
    console.log('E-b revCol values:', Array.from(revCol.values));

    expect(revCol.values[0]).toBe(1500);
    expect(revCol.values[1]).toBe(2250);
    expect(revCol.values[2]).toBe(700000);

    const sum = revCol.values[0] + revCol.values[1] + revCol.values[2];
    expect(sum).toBe(703750);
  });
});
