import React from 'react';
import type { ChartSpec } from '../../core/schemas';
import { ExcelCard } from '../pixel/ExcelCard';
import { formatNumber } from '../../utils/format';

export interface CorrelationHeatmapProps {
  spec: ChartSpec;
}

export const CorrelationHeatmap: React.FC<CorrelationHeatmapProps> = ({ spec }) => {
  const symbols: string[] = spec.data?.symbols || spec.symbols || [];
  const matrix: (number | null)[][] = spec.data?.matrix || [];
  const commonDatesCount = spec.data?.commonDatesCount ?? 0;

  const getCellBackground = (val: number | null, isDiagonal: boolean) => {
    if (isDiagonal) return 'var(--blue-bg)';
    if (val === null || val === undefined) return 'transparent';
    if (val > 0.5) return 'var(--good-bg)';
    if (val < -0.2) return 'var(--warn-bg)';
    return 'transparent';
  };

  const getCellTextColor = (val: number | null, isDiagonal: boolean) => {
    if (isDiagonal) return 'var(--blue-d)';
    if (val === null || val === undefined) return 'var(--chart-text)';
    if (val > 0.5) return 'var(--good-d)';
    if (val < -0.2) return 'var(--bad)';
    return 'var(--ink)';
  };

  return (
    <ExcelCard
      title={spec.title_vi}
      subtitle={spec.subtitle_vi || 'Hệ số tương quan Pearson giữa các cặp mã'}
    >
      <div style={{ overflowX: 'auto', padding: 'var(--space-2) 0' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontFamily: 'var(--font-excel)',
            fontSize: '13px',
            backgroundColor: 'var(--chart-bg)',
            border: '1px solid var(--chart-grid)',
          }}
        >
          <thead>
            <tr style={{ backgroundColor: 'var(--panel)', borderBottom: '2px solid var(--chart-grid)' }}>
              <th
                style={{
                  padding: '8px 12px',
                  textAlign: 'left',
                  color: 'var(--ink)',
                  fontWeight: 'bold',
                  borderRight: '1px solid var(--chart-grid)',
                }}
              >
                Mã cổ phiếu
              </th>
              {symbols.map((s) => (
                <th
                  key={s}
                  style={{
                    padding: '8px 12px',
                    textAlign: 'center',
                    color: 'var(--ink)',
                    fontWeight: 'bold',
                    borderRight: '1px solid var(--chart-grid)',
                  }}
                >
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {symbols.map((sRow, rIdx) => (
              <tr
                key={sRow}
                style={{
                  borderBottom: '1px solid var(--chart-grid)',
                  backgroundColor: rIdx % 2 === 0 ? 'var(--chart-bg)' : 'var(--panel)',
                }}
              >
                <td
                  style={{
                    padding: '8px 12px',
                    fontWeight: 'bold',
                    color: 'var(--ink)',
                    borderRight: '1px solid var(--chart-grid)',
                  }}
                >
                  {sRow}
                </td>
                {symbols.map((sCol, cIdx) => {
                  const isDiag = rIdx === cIdx;
                  const val = matrix[rIdx]?.[cIdx] ?? (isDiag ? 1.0 : null);
                  return (
                    <td
                      key={sCol}
                      style={{
                        padding: '8px 12px',
                        textAlign: 'center',
                        fontWeight: isDiag ? 'bold' : 'normal',
                        borderRight: '1px solid var(--chart-grid)',
                        backgroundColor: getCellBackground(val, isDiag),
                        color: getCellTextColor(val, isDiag),
                      }}
                    >
                      {val !== null ? formatNumber(val, 2) : '-'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        <div
          style={{
            marginTop: 'var(--space-2)',
            fontSize: '11px',
            color: 'var(--chart-text)',
            fontStyle: 'italic',
          }}
        >
          * Tính trên {commonDatesCount} phiên giao dịch trùng nhau của các mã (yêu cầu tối thiểu 20 phiên).
        </div>
      </div>
    </ExcelCard>
  );
};

