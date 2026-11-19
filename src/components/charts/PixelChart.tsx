import React, { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import type { ChartSpec } from '../../core/schemas';
import { ExcelCard } from '../pixel/ExcelCard';
import { buildEChartsOption } from './buildOption';
import { CorrelationHeatmap } from './CorrelationHeatmap';

export interface PixelChartProps {
  spec: ChartSpec;
  height?: string | number;
  className?: string;
}

export const PixelChart: React.FC<PixelChartProps> = ({
  spec,
  height = '320px',
  className = '',
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);
  const [showTable, setShowTable] = useState(false);

  // If heatmap, delegate to CorrelationHeatmap
  if (spec.kind === 'heatmap') {
    return <CorrelationHeatmap spec={spec} />;
  }

  useEffect(() => {
    if (showTable) {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispose();
        chartInstanceRef.current = null;
      }
      return;
    }

    if (!chartContainerRef.current) return;

    // Check if canvas 2d context is available (avoid ZRender errors in headless JSDOM)
    try {
      const c = document.createElement('canvas');
      if (!c.getContext || !c.getContext('2d')) {
        return;
      }
    } catch {
      return;
    }

    let chart: echarts.ECharts | null = null;
    try {
      chart = echarts.init(chartContainerRef.current, undefined, {
        renderer: 'svg',
      });
      chartInstanceRef.current = chart;

      const option = buildEChartsOption(spec);
      chart.setOption(option, true);
    } catch {
      // JSDOM or unsupported canvas/SVG fallback in unit tests
    }

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && chartContainerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        chart?.resize();
      });
      resizeObserver.observe(chartContainerRef.current);
    }

    return () => {
      resizeObserver?.disconnect();
      if (chart) {
        chart.dispose();
        chartInstanceRef.current = null;
      }
    };
  }, [spec, showTable]);

  const handleDownloadPng = () => {
    if (!chartInstanceRef.current) return;
    try {
      const url = chartInstanceRef.current.getDataURL({
        type: 'png',
        pixelRatio: 2,
        backgroundColor: 'var(--chart-bg)',
      });
      const link = document.createElement('a');
      link.download = `${spec.id || 'chart'}.png`;
      link.href = url;
      link.click();
    } catch {
      // Failed to export (e.g. tainted canvas or SVG error)
    }
  };

  return (
    <ExcelCard
      title={spec.title_vi}
      subtitle={spec.subtitle_vi}
      onViewTable={() => setShowTable((prev) => !prev)}
      onDownloadPng={!showTable ? handleDownloadPng : undefined}
      className={className}
    >
      {spec.empty_reason_vi ? (
        <div
          style={{
            padding: 'var(--space-6)',
            textAlign: 'center',
            color: 'var(--chart-text)',
            fontSize: '13px',
          }}
        >
          {spec.empty_reason_vi}
        </div>
      ) : showTable ? (
        // Raw Data Table View
        (() => {
          const isBusinessChart = spec.id?.startsWith('chart_biz_');
          const hiddenIndices: number[] = [];
          const hiddenNames: string[] = [];
          if (isBusinessChart) {
            spec.table.columns.forEach((colName, cIdx) => {
              if (cIdx > 0) {
                const allMissing = spec.table.rows.every((row) => String(row[cIdx]).trim() === 'KHÔNG ĐỦ DỮ LIỆU');
                if (allMissing) {
                  hiddenIndices.push(cIdx);
                  hiddenNames.push(colName.replace(/\s*\(VND\)|\s*\(%\)/g, '').trim());
                }
              }
            });
          }
          const visibleColIndices = spec.table.columns
            .map((_, i) => i)
            .filter((i) => !hiddenIndices.includes(i));

          return (
            <div style={{ maxHeight: height, overflowY: 'auto', overflowX: 'auto' }}>
              {hiddenNames.length > 0 && (
                <div
                  style={{
                    fontSize: '11px',
                    color: 'var(--ink-soft)',
                    marginBottom: '6px',
                    fontStyle: 'italic',
                  }}
                >
                  Không hiển thị cột {hiddenNames.join(', ')} vì file không có dữ liệu tương ứng.
                </div>
              )}
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontFamily: 'var(--font-excel)',
                  fontSize: '12px',
                  backgroundColor: 'var(--chart-bg)',
                  border: '1px solid var(--chart-grid)',
                }}
              >
                <thead>
                  <tr style={{ backgroundColor: 'var(--panel)', borderBottom: '2px solid var(--chart-grid)' }}>
                    {visibleColIndices.map((origIdx, vIdx) => (
                      <th
                        key={origIdx}
                        style={{
                          padding: '6px 10px',
                          textAlign: vIdx === 0 ? 'left' : 'right',
                          color: 'var(--ink)',
                          fontWeight: 'bold',
                          borderRight: '1px solid var(--chart-grid)',
                          position: 'sticky',
                          top: 0,
                          backgroundColor: 'var(--panel)',
                        }}
                      >
                        {spec.table.columns[origIdx]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {spec.table.rows.map((row, rIdx) => (
                    <tr
                      key={rIdx}
                      style={{
                        borderBottom: '1px solid var(--chart-grid)',
                        backgroundColor: rIdx % 2 === 0 ? 'var(--chart-bg)' : 'var(--panel)',
                      }}
                    >
                      {visibleColIndices.map((origIdx, vIdx) => (
                        <td
                          key={origIdx}
                          style={{
                            padding: '6px 10px',
                            textAlign: vIdx === 0 ? 'left' : 'right',
                            color: 'var(--ink)',
                            borderRight: '1px solid var(--chart-grid)',
                          }}
                        >
                          {row[origIdx]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })()
      ) : (
        // ECharts Visual Container
        <div
          ref={chartContainerRef}
          style={{ width: '100%', height, minHeight: '220px' }}
          role="img"
          aria-label={spec.aria_vi || spec.title_vi}
        />
      )}
    </ExcelCard>
  );
};
