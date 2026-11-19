import React from 'react';
import { PixelModal } from '../pixel/PixelModal';
import { PixelButton } from '../pixel/PixelButton';
import type { Metric } from '../../core/schemas';
import { formatNumber, formatPercent } from '../../utils/format';

export interface MetricCalcModalProps {
  isOpen: boolean;
  onClose: () => void;
  metric?: Metric | null;
}

export const MetricCalcModal: React.FC<MetricCalcModalProps> = ({
  isOpen,
  onClose,
  metric,
}) => {
  if (!metric) return null;

  const formatCalcValue = (val: number | string, unit?: string) => {
    if (typeof val === 'string') return val;
    if (unit === 'ratio') return formatPercent(val);
    if (unit === 'currency') return `${formatNumber(val)} đ`;
    if (unit === 'phiên' || unit === 'count') return `${formatNumber(val, 0)} phiên`;
    if (unit === 'CP') return `${formatNumber(val, 0)} CP`;
    return formatNumber(val);
  };

  return (
    <PixelModal
      isOpen={isOpen}
      onClose={onClose}
      title={`Cách tính: ${metric.label_vi}${metric.symbol ? ` (${metric.symbol})` : ''}`}
      maxWidth="580px"
      actions={
        <PixelButton variant="primary" onClick={onClose}>
          Đóng
        </PixelButton>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {/* Metric Meaning */}
        {metric.meaning_vi && (
          <div
            style={{
              padding: 'var(--space-3)',
              backgroundColor: 'var(--panel)',
              border: '1px solid var(--chart-grid)',
              fontSize: '13px',
              color: 'var(--ink)',
              lineHeight: 1.5,
            }}
          >
            <strong>Ý nghĩa: </strong>
            <span>{metric.meaning_vi}</span>
          </div>
        )}

        {/* Insufficient data notice */}
        {metric.status === 'insufficient_data' && (
          <div
            style={{
              padding: 'var(--space-3)',
              backgroundColor: 'var(--warn-bg)',
              border: '1px solid var(--warn)',
              color: 'var(--ink)',
              fontSize: '13px',
            }}
          >
            <strong>Chưa đủ dữ liệu: </strong>
            <span>{metric.reason_vi || 'Chuỗi dữ liệu chưa đủ điều kiện tính toán.'}</span>
          </div>
        )}

        {/* Textual Formula */}
        <div>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 'bold',
              color: 'var(--chart-text)',
              textTransform: 'uppercase',
              marginBottom: 'var(--space-1)',
            }}
          >
            Công thức tính toán
          </div>
          <div
            style={{
              fontFamily: 'var(--font-excel)',
              padding: 'var(--space-3)',
              backgroundColor: 'var(--chart-bg)',
              border: '1px solid var(--chart-grid)',
              color: 'var(--ink)',
              fontSize: '13px',
            }}
          >
            {metric.formula_vi}
          </div>
        </div>

        {/* Excel Formula Hint */}
        {metric.excel_hint && (
          <div>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 'bold',
                color: 'var(--chart-text)',
                textTransform: 'uppercase',
                marginBottom: 'var(--space-1)',
              }}
            >
              Công thức tương đương trong Excel
            </div>
            <div
              style={{
                fontFamily: 'monospace',
                padding: 'var(--space-2) var(--space-3)',
                backgroundColor: 'var(--panel)',
                border: '1px dashed var(--chart-axis)',
                color: 'var(--ink)',
                fontSize: '12px',
                overflowX: 'auto',
              }}
            >
              {metric.excel_hint}
            </div>
          </div>
        )}

        {/* Concrete Step-by-Step Inputs */}
        {metric.calc && metric.calc.length > 0 && (
          <div>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 'bold',
                color: 'var(--chart-text)',
                textTransform: 'uppercase',
                marginBottom: 'var(--space-1)',
              }}
            >
              Số liệu đầu vào cụ thể của kỳ này
            </div>
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
              <tbody>
                {metric.calc.map((step, idx) => (
                  <tr
                    key={idx}
                    style={{
                      borderBottom:
                        idx === metric.calc!.length - 1
                          ? 'none'
                          : '1px solid var(--chart-grid)',
                    }}
                  >
                    <td
                      style={{
                        padding: '6px 10px',
                        color: 'var(--chart-text)',
                        width: '60%',
                      }}
                    >
                      {step.label_vi}
                    </td>
                    <td
                      style={{
                        padding: '6px 10px',
                        textAlign: 'right',
                        fontWeight: idx === metric.calc!.length - 1 ? 'bold' : 'normal',
                        color: 'var(--ink)',
                      }}
                    >
                      {formatCalcValue(step.value, step.unit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PixelModal>
  );
};
