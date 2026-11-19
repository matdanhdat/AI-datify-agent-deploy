import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { KpiTile } from './KpiTile';
import { MetricCalcModal } from './MetricCalcModal';
import { PixelChart } from './PixelChart';
import { CorrelationHeatmap } from './CorrelationHeatmap';
import type { Metric, ChartSpec } from '../../core/schemas';

describe('P4 Charts & KPI Static Analysis (No Hardcoded Hex Colors)', () => {
  it('verifies ZERO hardcoded hex color codes (#...) exist in src/components/charts/', () => {
    const chartsDir = path.resolve(__dirname);
    const files = fs.readdirSync(chartsDir).filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));

    expect(files.length).toBeGreaterThan(0);

    const hexRegex = /#[0-9a-fA-F]{3,8}\b/g;
    const violations: { file: string; match: string }[] = [];

    for (const file of files) {
      if (file.endsWith('.test.tsx') || file.endsWith('.test.ts')) continue;
      const content = fs.readFileSync(path.join(chartsDir, file), 'utf8');
      const matches = content.match(hexRegex);
      if (matches) {
        for (const m of matches) {
          violations.push({ file, match: m });
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

describe('P4 Chart & KPI Components UI Testing', () => {
  const sampleMetric: Metric = {
    id: 'period_return',
    label_vi: 'Lợi suất cả kỳ',
    symbol: 'TMA',
    value: 0.3465,
    unit: 'ratio',
    status: 'ok',
    polarity: 'higher_better',
    formula_vi: '(Giá đóng cuối kỳ / Giá đóng đầu kỳ) - 1',
    inputs: ['close'],
    meaning_vi: 'Tỷ lệ sinh lời trong kỳ nắm giữ cổ phiếu.',
    excel_hint: '=(C252-C2)/C2',
    delta: {
      value: 0.052,
      label_vi: 'so với kỳ trước',
      status: 'ok',
    },
    calc: [
      { label_vi: 'Giá đóng đầu kỳ', value: 52.26, unit: 'currency' },
      { label_vi: 'Giá đóng cuối kỳ', value: 70.37, unit: 'currency' },
      { label_vi: 'Lợi suất cả kỳ', value: 0.3465, unit: 'ratio' },
    ],
  };

  it('renders KpiTile with label, formatted percentage, and delta arrow', () => {
    render(<KpiTile metric={sampleMetric} sparklinePrices={[50, 55, 60, 70.37]} />);

    expect(screen.getByText('Lợi suất cả kỳ')).toBeDefined();
    expect(screen.getByText('34,65%')).toBeDefined();
    expect(screen.getByText('▲')).toBeDefined();
    expect(screen.getByText('+5,20%')).toBeDefined();
    expect(screen.getByText('so với kỳ trước')).toBeDefined();
  });

  it('opens MetricCalcModal when KpiTile is clicked and displays formula and inputs', () => {
    render(<KpiTile metric={sampleMetric} />);

    // Click tile
    const tile = screen.getByRole('button', { name: /chi tiết chỉ số Lợi suất cả kỳ/i });
    fireEvent.click(tile);

    // Modal title & contents
    expect(screen.getByText(/Cách tính: Lợi suất cả kỳ \(TMA\)/)).toBeDefined();
    expect(screen.getByText('Tỷ lệ sinh lời trong kỳ nắm giữ cổ phiếu.')).toBeDefined();
    expect(screen.getByText('(Giá đóng cuối kỳ / Giá đóng đầu kỳ) - 1')).toBeDefined();
    expect(screen.getByText('=(C252-C2)/C2')).toBeDefined();
    expect(screen.getByText('Giá đóng đầu kỳ')).toBeDefined();
  });

  it('renders MetricCalcModal directly and closes when clicking Đóng button', () => {
    let closed = false;
    render(
      <MetricCalcModal
        isOpen={true}
        onClose={() => {
          closed = true;
        }}
        metric={sampleMetric}
      />
    );

    const closeBtn = screen.getByRole('button', { name: 'Đóng' });
    fireEvent.click(closeBtn);
    expect(closed).toBe(true);
  });

  it('renders PixelChart and toggles between visual chart and raw data table mode', () => {
    const chartSpec: ChartSpec = {
      id: 'chart_test_sample',
      title_vi: 'Biểu đồ Thử nghiệm Test',
      subtitle_vi: 'Mô tả phụ cho biểu đồ',
      kind: 'line',
      symbols: ['TMA'],
      data: {
        dates: ['2026-01-01', '2026-01-02'],
        close: [50, 52],
      },
      table: {
        columns: ['Ngày', 'Giá đóng cửa'],
        rows: [
          ['01/01/2026', '50,00'],
          ['02/01/2026', '52,00'],
        ],
      },
    };

    render(<PixelChart spec={chartSpec} />);

    expect(screen.getByText('Biểu đồ Thử nghiệm Test')).toBeDefined();
    expect(screen.getByText('Mô tả phụ cho biểu đồ')).toBeDefined();

    // Click "Bảng số liệu" button to toggle table view
    const tableBtn = screen.getByTitle('Xem bảng số liệu thô');
    fireEvent.click(tableBtn);

    // Assert table headers and rows are now visible
    expect(screen.getByText('Ngày')).toBeDefined();
    expect(screen.getByText('01/01/2026')).toBeDefined();
    expect(screen.getByText('52,00')).toBeDefined();
  });

  it('renders CorrelationHeatmap with symbols and correlation values', () => {
    const corrSpec: ChartSpec = {
      id: 'chart_correlation',
      title_vi: 'Ma trận Hệ số Tương quan Giá',
      kind: 'heatmap',
      symbols: ['TMA', 'TMB'],
      data: {
        symbols: ['TMA', 'TMB'],
        matrix: [
          [1.0, 0.75],
          [0.75, 1.0],
        ],
        commonDatesCount: 150,
      },
      table: {
        columns: ['Mã', 'TMA', 'TMB'],
        rows: [
          ['TMA', '1,00', '0,75'],
          ['TMB', '0,75', '1,00'],
        ],
      },
    };

    render(<CorrelationHeatmap spec={corrSpec} />);

    expect(screen.getByText('Ma trận Hệ số Tương quan Giá')).toBeDefined();
    expect(screen.getAllByText('TMA').length).toBeGreaterThan(0);
    expect(screen.getAllByText('TMB').length).toBeGreaterThan(0);
    expect(screen.getByText(/150 phiên giao dịch/)).toBeDefined();
  });
});
