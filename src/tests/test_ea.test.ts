import { describe, it, expect } from 'vitest';
import { resolveBusinessRoles } from '../core/metrics/businessRoles';
import type { BusinessTable, BusinessColumn } from '../core/businessTable';

function makeTable(columns: Array<{ label: string; role?: any; values?: any }>): BusinessTable {
  return {
    kind: 'business',
    n: 5,
    source_row: new Int32Array([1, 2, 3, 4, 5]),
    columns: columns.map((col, idx) => ({
      key: `col_${idx}`,
      label: col.label,
      role: col.role || 'dimension',
      values: col.values || ['A', 'B', 'C', 'D', 'E'],
    })) as BusinessColumn[],
  };
}

describe('Prompt 1C-2d Section E-a: Column Role Resolution checks', () => {
  it('Thời gian -> is Month/Time', () => {
    const table = makeTable([{ label: 'Thời gian' }]);
    const res = resolveBusinessRoles(table);
    expect(res.time.status).toBe('tìm thấy');
    expect(res.time.col?.label).toBe('Thời gian');
  });

  it('Thời gian bán -> is Month/Time', () => {
    const table = makeTable([{ label: 'Thời gian bán' }]);
    const res = resolveBusinessRoles(table);
    expect(res.time.status).toBe('tìm thấy');
    expect(res.time.col?.label).toBe('Thời gian bán');
  });

  it('Kỳ báo cáo -> is Month/Time', () => {
    const table = makeTable([{ label: 'Kỳ báo cáo' }]);
    const res = resolveBusinessRoles(table);
    expect(res.time.status).toBe('tìm thấy');
    expect(res.time.col?.label).toBe('Kỳ báo cáo');
  });

  it('Tháng -> is Month/Time', () => {
    const table = makeTable([{ label: 'Tháng' }]);
    const res = resolveBusinessRoles(table);
    expect(res.time.status).toBe('tìm thấy');
    expect(res.time.col?.label).toBe('Tháng');
  });

  it('Thời gian giao hàng -> is NOT Month/Time', () => {
    const table = makeTable([{ label: 'Thời gian giao hàng' }]);
    const res = resolveBusinessRoles(table);
    expect(res.time.status).not.toBe('tìm thấy');
  });

  it('Tình trạng -> is NOT Region', () => {
    const table = makeTable([{ label: 'Tình trạng' }]);
    const res = resolveBusinessRoles(table);
    expect(res.region.status).not.toBe('tìm thấy');
  });
});
