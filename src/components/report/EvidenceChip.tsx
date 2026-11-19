import React from 'react';
import { parseEvidenceKey, METRIC_DEFINITIONS } from '../../core/metrics/metricSpec';
import { PixelIcon } from '../pixel/PixelIcon';

export interface EvidenceChipProps {
  evidenceKey: string;
  onNavigateToTarget: (targetKey: string, symbol: string | null) => void;
}

export const EvidenceChip: React.FC<EvidenceChipProps> = ({
  evidenceKey,
  onNavigateToTarget,
}) => {
  const parsed = parseEvidenceKey(evidenceKey);
  const isMetric = parsed.type === 'm';

  // Human readable label
  let label = parsed.id;
  if (isMetric) {
    label = METRIC_DEFINITIONS[parsed.id]?.label_vi || parsed.id;
  } else {
    // Chart
    const chartLabels: Record<string, string> = {
      chart_price_ma: 'Biểu đồ Giá & MA',
      chart_candle_volume: 'Nến & Khối lượng',
      chart_monthly_returns: 'Lợi suất theo tháng',
      chart_return_hist: 'Phân phối lợi suất',
      chart_drawdown: 'Đường cong sụt giảm',
      chart_volume_combo: 'Khối lượng & MA20',
      chart_top_days: 'Phiên tăng/giảm mạnh',
      chart_normalized: 'So sánh mốc 100',
      chart_symbol_returns: 'So sánh lợi suất',
      chart_risk_return: 'Rủi ro vs Lợi nhuận',
      chart_trade_share: 'Tỷ trọng khối lượng',
      chart_correlation: 'Ma trận tương quan',
    };
    label = chartLabels[parsed.id] || parsed.id;
  }

  const symLabel = parsed.symbol ? ` · ${parsed.symbol}` : '';

  return (
    <button
      type="button"
      className="evidence-chip"
      onClick={() => onNavigateToTarget(parsed.id, parsed.symbol)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 8px',
        fontSize: '11px',
        fontFamily: 'var(--font-pixel)',
        color: 'var(--ink)',
        backgroundColor: isMetric ? 'var(--excel-blue-bg)' : 'var(--panel-alt)',
        border: '1px solid var(--ink)',
        borderRadius: '0px',
        cursor: 'pointer',
        transition: 'all 0.1s ease',
      }}
      title={`Bấm để chuyển tới ${label}${symLabel}`}
      aria-label={`Căn cứ: ${label}${symLabel}`}
    >
      <span style={{ color: isMetric ? 'var(--excel-blue)' : 'var(--accent)', display: 'inline-flex', alignItems: 'center' }}>
        <PixelIcon name={isMetric ? 'file' : 'chart'} size={12} />
      </span>
      <span>
        {label}
        {symLabel}
      </span>
    </button>
  );
};

