import React, { useState } from 'react';
import type { Metric } from '../../core/schemas';
import { kpiTone } from '../../core/metrics/metricSpec';
import { formatNumber, formatPercent } from '../../utils/format';
import { MetricCalcModal } from './MetricCalcModal';
import { PixelIcon } from '../pixel/PixelIcon';

export interface KpiTileProps {
  metric: Metric;
  sparklinePrices?: number[];
  className?: string;
  style?: React.CSSProperties;
}

export const KpiTile: React.FC<KpiTileProps> = ({
  metric,
  sparklinePrices,
  className = '',
  style = {},
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const toneResult = kpiTone(metric);

  const getToneColor = (tone: 'good' | 'bad' | 'neutral'): string => {
    if (tone === 'good') return 'var(--good)';
    if (tone === 'bad') return 'var(--bad)';
    return 'var(--ink)';
  };

  const formatDisplayValue = () => {
    if (metric.status === 'insufficient_data') {
      return 'Chưa đủ dữ liệu';
    }
    if (metric.value === null || metric.value === undefined) {
      return metric.text || '-';
    }
    switch (metric.unit) {
      case 'ratio':
        return formatPercent(metric.value);
      case 'currency':
        return `${formatNumber(metric.value)} đ`;
      case 'count':
        return formatNumber(metric.value, 0);
      case 'number':
        return formatNumber(metric.value, 2);
      case 'text':
        return metric.text || '-';
      default:
        return formatNumber(metric.value);
    }
  };

  const renderDelta = () => {
    if (!metric.delta || metric.delta.status === 'insufficient_data') {
      return null;
    }
    const val = metric.delta.value;
    if (val === null || val === undefined) return null;

    const isPositive = val > 0;
    const isNegative = val < 0;
    const arrow = isPositive ? '▲' : isNegative ? '▼' : '■';
    const deltaColor =
      toneResult.deltaTone === 'good'
        ? 'var(--good)'
        : toneResult.deltaTone === 'bad'
        ? 'var(--bad)'
        : 'var(--chart-text)';

    let formattedDelta = '';
    if (metric.unit === 'ratio') {
      formattedDelta = `${isPositive ? '+' : ''}${formatPercent(val)}`;
    } else if (metric.unit === 'currency') {
      formattedDelta = `${isPositive ? '+' : ''}${formatNumber(val)} đ`;
    } else {
      formattedDelta = `${isPositive ? '+' : ''}${formatNumber(val, 2)}`;
    }

    return (
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '3px',
          fontSize: '11px',
          fontWeight: '600',
          color: deltaColor,
        }}
      >
        <span>{arrow}</span>
        <span>{formattedDelta}</span>
        <span style={{ color: 'var(--chart-text)', fontWeight: 'normal' }}>
          {metric.delta.label_vi}
        </span>
      </div>
    );
  };

  // Sparkline SVG path generator
  const renderSparkline = () => {
    if (!sparklinePrices || sparklinePrices.length < 2) return null;
    const pts = sparklinePrices.slice(-20); // last 20 points
    const min = Math.min(...pts);
    const max = Math.max(...pts);
    const range = max - min || 1;
    const w = 54;
    const h = 20;

    const points = pts
      .map((p, idx) => {
        const x = (idx / (pts.length - 1)) * w;
        const y = h - ((p - min) / range) * (h - 4) - 2;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

    const strokeColor =
      pts[pts.length - 1] >= pts[0] ? 'var(--good)' : 'var(--bad)';

    return (
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        style={{ overflow: 'visible' }}
        aria-hidden="true"
      >
        <polyline
          fill="none"
          stroke={strokeColor}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
      </svg>
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setIsModalOpen(true);
    }
  };

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-label={`Chi tiết chỉ số ${metric.label_vi}`}
        onClick={() => setIsModalOpen(true)}
        onKeyDown={handleKeyDown}
        className={`kpi-tile font-excel ${className}`}
        title={`Bấm để xem công thức và số liệu chi tiết của ${metric.label_vi}`}
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: 'var(--chart-bg)',
          border: '1px solid var(--chart-grid)',
          padding: '10px 14px',
          cursor: 'pointer',
          position: 'relative',
          transition: 'all 0.15s ease',
          outline: 'none',
          minHeight: '84px',
          ...style,
        }}
      >
        {/* Top: Label and Info Indicator */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '6px',
          }}
        >
          <span
            style={{
              fontSize: '12px',
              fontWeight: 'bold',
              color: 'var(--chart-text)',
              lineHeight: 1.2,
            }}
          >
            {metric.label_vi}
          </span>
          <span
            style={{
              color: 'var(--chart-axis)',
              fontSize: '11px',
              opacity: 0.8,
            }}
          >
            <PixelIcon name="info" size={10} />
          </span>
        </div>

        {/* Center: Large Metric Value */}
        <div
          style={{
            fontSize: metric.status === 'insufficient_data' ? '13px' : '20px',
            fontWeight: 'bold',
            color:
              metric.status === 'insufficient_data'
                ? 'var(--chart-text)'
                : getToneColor(toneResult.valueTone),
            margin: '4px 0',
            lineHeight: 1.1,
          }}
        >
          {formatDisplayValue()}
        </div>

        {/* Bottom: Delta & Tag / Sparkline */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '11px',
            minHeight: '18px',
          }}
        >
          <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {renderDelta()}
            {toneResult.tagText && (
              <span
                style={{
                  display: 'inline-block',
                  padding: '1px 6px',
                  fontSize: '10px',
                  fontWeight: 'bold',
                  backgroundColor:
                    toneResult.tagTone === 'good'
                      ? 'var(--good-bg)'
                      : toneResult.tagTone === 'bad'
                      ? 'var(--warn-bg)'
                      : 'var(--panel)',
                  color:
                    toneResult.tagTone === 'good'
                      ? 'var(--good)'
                      : toneResult.tagTone === 'bad'
                      ? 'var(--bad)'
                      : 'var(--ink)',
                  border: '1px solid var(--chart-grid)',
                }}
              >
                {toneResult.tagText}
              </span>
            )}
          </div>
          <div>{renderSparkline()}</div>
        </div>
      </div>

      <MetricCalcModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        metric={metric}
      />
    </>
  );
};
