/**
 * ECharts Option Builder with Excel Formatting Rules.
 * Translates ChartSpec into ECharts configuration using dynamic CSS tokens.
 * Pure TypeScript - zero hardcoded hex color codes.
 */

import type { ChartSpec } from '../../core/schemas';
import { readToken } from './readToken';
import { formatDate, formatNumber, formatPercent } from '../../utils/format';

function formatCompactCurrencyAxis(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e9) {
    const val = v / 1e9;
    return `${Number.isInteger(val) ? val : val.toFixed(1).replace('.', ',')} tỷ`;
  }
  if (abs >= 1e6) {
    const val = v / 1e6;
    return `${Number.isInteger(val) ? val : val.toFixed(1).replace('.', ',')} tr`;
  }
  if (abs >= 1e3) {
    const val = v / 1e3;
    return `${Number.isInteger(val) ? val : val.toFixed(0)}k`;
  }
  return formatNumber(v, 0);
}

export function buildEChartsOption(spec: ChartSpec): Record<string, any> {
  const chartBg = readToken('--chart-bg');
  const chartGrid = readToken('--chart-grid');
  const chartAxis = readToken('--chart-axis');
  const chartText = readToken('--chart-text');
  const ink = readToken('--ink');
  const good = readToken('--good');
  const bad = readToken('--bad');
  const excelBlue = readToken('--excel-blue');
  const excelOrange = readToken('--excel-orange');
  const excelGray = readToken('--excel-gray');
  const excelGold = readToken('--excel-gold');

  const palette = [excelBlue, excelOrange, excelGray, excelGold, good, bad];

  const baseOption: Record<string, any> = {
    animation: false,
    backgroundColor: chartBg,
    textStyle: {
      fontFamily: 'Calibri, Arial, sans-serif',
      color: chartText,
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: chartBg,
      borderColor: chartGrid,
      textStyle: { color: ink },
    },
    grid: {
      top: 30,
      right: 20,
      bottom: 35,
      left: 50,
      containLabel: true,
    },
  };

  const { kind, data } = spec;

  switch (kind) {
    case 'line': {
      // Business series array OR Multi-symbol normalized OR Single symbol line
      if (Array.isArray(data.series)) {
        const categories = (data.categories || data.dates || []).map((d: string) =>
          d.includes('-') && d.length === 10 ? formatDate(d) : d
        );
        return {
          ...baseOption,
          legend:
            data.series.length > 1
              ? {
                  bottom: 5,
                  data: data.series.map((s: any) => s.name),
                  textStyle: { color: chartText },
                }
              : undefined,
          tooltip: {
            ...baseOption.tooltip,
            formatter: (params: any) => {
              const p = Array.isArray(params) ? params[0] : params;
              const val = typeof p?.value === 'number' ? p.value : Number(p?.data?.value ?? 0);
              return `${p?.name || ''}<br/><b>${formatNumber(val, 0)} VND</b>`;
            },
          },
          xAxis: {
            type: 'category',
            data: categories,
            splitLine: { show: false },
            axisLine: { lineStyle: { color: chartAxis } },
            axisLabel: { color: chartText },
          },
          yAxis: {
            type: 'value',
            splitLine: { show: true, lineStyle: { color: chartGrid } },
            axisLine: { show: false },
            axisLabel: {
              color: chartText,
              formatter: (v: number) => formatCompactCurrencyAxis(v),
            },
          },
          series: data.series.map((s: any, idx: number) => ({
            name: s.name,
            type: 'line',
            showSymbol: true,
            data: s.values,
            lineStyle: { width: 2, color: palette[idx % palette.length] },
            itemStyle: { color: palette[idx % palette.length] },
          })),
        };
      }

      if (data.series && typeof data.series === 'object') {
        // Multi-symbol normalized
        const seriesNames = Object.keys(data.series);
        return {
          ...baseOption,
          legend: {
            bottom: 5,
            data: seriesNames,
            textStyle: { color: chartText },
          },
          xAxis: {
            type: 'category',
            data: data.dates.map((d: string) => formatDate(d)),
            splitLine: { show: false },
            axisLine: { lineStyle: { color: chartAxis } },
            axisLabel: { color: chartText },
          },
          yAxis: {
            type: 'value',
            splitLine: { show: true, lineStyle: { color: chartGrid } },
            axisLine: { show: false },
            axisLabel: { color: chartText },
          },
          series: seriesNames.map((s, idx) => ({
            name: s,
            type: 'line',
            showSymbol: false,
            data: data.series[s],
            lineStyle: { width: 2, color: palette[idx % palette.length] },
            itemStyle: { color: palette[idx % palette.length] },
          })),
        };
      }

      // Single symbol line
      return {
        ...baseOption,
        legend: {
          bottom: 5,
          data: ['Giá đóng cửa', 'MA20', 'MA50'],
          textStyle: { color: chartText },
        },
        xAxis: {
          type: 'category',
          data: (data.dates || []).map((d: string) => formatDate(d)),
          splitLine: { show: false },
          axisLine: { lineStyle: { color: chartAxis } },
          axisLabel: { color: chartText },
        },
        yAxis: {
          type: 'value',
          scale: true,
          splitLine: { show: true, lineStyle: { color: chartGrid } },
          axisLine: { show: false },
          axisLabel: {
            color: chartText,
            formatter: (v: number) => formatNumber(v),
          },
        },
        series: [
          {
            name: 'Giá đóng cửa',
            type: 'line',
            showSymbol: false,
            data: data.close || [],
            lineStyle: { width: 2, color: excelBlue },
            itemStyle: { color: excelBlue },
          },
          {
            name: 'MA20',
            type: 'line',
            showSymbol: false,
            data: data.ma20 || [],
            lineStyle: { width: 1.5, color: excelOrange },
            itemStyle: { color: excelOrange },
          },
          {
            name: 'MA50',
            type: 'line',
            showSymbol: false,
            data: data.ma50 || [],
            lineStyle: { width: 1.5, color: excelGray },
            itemStyle: { color: excelGray },
          },
        ],
      };
    }

    case 'candlestick_volume': {
      return {
        ...baseOption,
        axisPointer: { link: [{ xAxisIndex: 'all' }] },
        grid: [
          { left: 50, right: 20, top: 20, height: '55%' },
          { left: 50, right: 20, top: '75%', height: '20%' },
        ],
        xAxis: [
          {
            type: 'category',
            data: (data.dates || []).map((d: string) => formatDate(d)),
            splitLine: { show: false },
            axisLine: { lineStyle: { color: chartAxis } },
            axisLabel: { color: chartText },
          },
          {
            type: 'category',
            gridIndex: 1,
            data: (data.dates || []).map((d: string) => formatDate(d)),
            splitLine: { show: false },
            axisLine: { lineStyle: { color: chartAxis } },
            axisLabel: { show: false },
          },
        ],
        yAxis: [
          {
            scale: true,
            splitLine: { show: true, lineStyle: { color: chartGrid } },
            axisLine: { show: false },
            axisLabel: { color: chartText },
          },
          {
            gridIndex: 1,
            splitNumber: 2,
            axisLabel: { show: false },
            axisLine: { show: false },
            splitLine: { show: false },
          },
        ],
        series: [
          {
            name: 'Nến giá',
            type: 'candlestick',
            data: data.ohlc || [],
            itemStyle: {
              color: good,
              color0: bad,
              borderColor: good,
              borderColor0: bad,
            },
          },
          {
            name: 'Khối lượng',
            type: 'bar',
            xAxisIndex: 1,
            yAxisIndex: 1,
            data: (data.volume || []).map((vol: number, i: number) => {
              const ohlc = data.ohlc[i];
              const isUp = ohlc ? ohlc[1] >= ohlc[0] : true;
              return {
                value: vol,
                itemStyle: { color: isUp ? good : bad },
              };
            }),
          },
        ],
      };
    }

    case 'column': {
      // Monthly returns (default percent) OR Business currency columns
      const hasSeriesArray = Array.isArray(data.series);
      const firstSeries = hasSeriesArray ? data.series[0] : null;
      const values: number[] = firstSeries ? firstSeries.values : (data.values || []);
      const isPct = (firstSeries?.name || '').includes('%') || data.valueFormat === 'percent';
      const isCurrency = !isPct && (data.valueFormat === 'currency' || (firstSeries?.name || '').includes('VND') || (values[0] || 0) > 100);
      const unitLabel = data.unit || 'VND';
      return {
        ...baseOption,
        tooltip: {
          ...baseOption.tooltip,
          formatter: (params: any) => {
            const p = Array.isArray(params) ? params[0] : params;
            const val = typeof p?.value === 'number' ? p.value : Number(p?.data?.value ?? 0);
            return isCurrency
              ? `${p?.name || ''}<br/><b>${formatNumber(val, 0)} ${unitLabel}</b>`
              : `${p?.name || ''}<br/><b>${isPct ? val + '%' : formatPercent(val)}</b>`;
          },
        },
        xAxis: {
          type: 'category',
          data: data.categories || [],
          splitLine: { show: false },
          axisLine: { lineStyle: { color: chartAxis } },
          axisLabel: { color: chartText },
        },
        yAxis: {
          type: 'value',
          splitLine: { show: true, lineStyle: { color: chartGrid } },
          axisLine: { show: false },
          axisLabel: {
            color: chartText,
            formatter: isCurrency
              ? (v: number) => formatCompactCurrencyAxis(v)
              : (v: number) => (isPct ? `${v}%` : `${(v * 100).toFixed(0)}%`),
          },
        },
        series: hasSeriesArray
          ? data.series.map((s: any, idx: number) => ({
              name: s.name,
              type: 'bar',
              data: (s.values || []).map((val: number) => ({
                value: val,
                itemStyle: { color: isCurrency ? (palette[idx % palette.length] || excelBlue) : val >= 0 ? good : bad },
              })),
            }))
          : [
              {
                type: 'bar',
                data: values.map((val: number) => ({
                  value: val,
                  itemStyle: { color: isCurrency ? excelBlue : val >= 0 ? good : bad },
                })),
              },
            ],
      };
    }

    case 'histogram': {
      return {
        ...baseOption,
        xAxis: {
          type: 'category',
          data: data.categories || [],
          splitLine: { show: false },
          axisLine: { lineStyle: { color: chartAxis } },
          axisLabel: {
            color: chartText,
            interval: 0,
            rotate: 30,
            fontSize: 10,
          },
        },
        yAxis: {
          type: 'value',
          splitLine: { show: true, lineStyle: { color: chartGrid } },
          axisLine: { show: false },
          axisLabel: { color: chartText },
        },
        series: [
          {
            type: 'bar',
            barCategoryGap: '2%',
            data: (data.values || []).map((count: number, idx: number) => {
              const edge = data.edges ? data.edges[idx] : 0;
              return {
                value: count,
                itemStyle: { color: edge >= 0 ? good : bad },
              };
            }),
          },
        ],
      };
    }

    case 'area': {
      // Drawdown
      return {
        ...baseOption,
        xAxis: {
          type: 'category',
          data: (data.dates || []).map((d: string) => formatDate(d)),
          splitLine: { show: false },
          axisLine: { lineStyle: { color: chartAxis } },
          axisLabel: { color: chartText },
        },
        yAxis: {
          type: 'value',
          max: 0,
          splitLine: { show: true, lineStyle: { color: chartGrid } },
          axisLine: { show: false },
          axisLabel: {
            color: chartText,
            formatter: (v: number) => `${(v * 100).toFixed(0)}%`,
          },
        },
        series: [
          {
            name: 'Sụt giảm',
            type: 'line',
            showSymbol: false,
            data: data.drawdown || [],
            lineStyle: { width: 1.5, color: bad },
            itemStyle: { color: bad },
            areaStyle: { color: bad, opacity: 0.3 },
          },
        ],
      };
    }

    case 'combo': {
      // Volume bars + MA20 volume line
      return {
        ...baseOption,
        legend: {
          bottom: 5,
          data: ['Khối lượng', 'TB 20 phiên'],
          textStyle: { color: chartText },
        },
        xAxis: {
          type: 'category',
          data: (data.dates || []).map((d: string) => formatDate(d)),
          splitLine: { show: false },
          axisLine: { lineStyle: { color: chartAxis } },
          axisLabel: { color: chartText },
        },
        yAxis: {
          type: 'value',
          splitLine: { show: true, lineStyle: { color: chartGrid } },
          axisLine: { show: false },
          axisLabel: {
            color: chartText,
            formatter: (v: number) => formatNumber(v, 0),
          },
        },
        series: [
          {
            name: 'Khối lượng',
            type: 'bar',
            data: data.volume || [],
            itemStyle: { color: excelBlue },
          },
          {
            name: 'TB 20 phiên',
            type: 'line',
            showSymbol: false,
            data: data.volumeMa20 || [],
            lineStyle: { width: 2, color: excelOrange },
            itemStyle: { color: excelOrange },
          },
        ],
      };
    }

    case 'bar': {
      // Top days / symbol returns (default percent) OR Business horizontal currency/percent bars
      const hasSeriesArray = Array.isArray(data.series);
      const firstSeries = hasSeriesArray ? data.series[0] : null;
      const values: number[] = firstSeries ? firstSeries.values : (data.values || []);
      const isPct = (firstSeries?.name || '').includes('%') || data.valueFormat === 'percent';
      const isCurrency = !isPct && (data.valueFormat === 'currency' || (firstSeries?.name || '').includes('VND') || (values[0] || 0) > 100);
      const unitLabel = data.unit || 'VND';
      return {
        ...baseOption,
        tooltip: {
          ...baseOption.tooltip,
          formatter: (params: any) => {
            const p = Array.isArray(params) ? params[0] : params;
            const val = typeof p?.value === 'number' ? p.value : Number(p?.data?.value ?? 0);
            return isCurrency
              ? `${p?.name || ''}<br/><b>${formatNumber(val, 0)} ${unitLabel}</b>`
              : `${p?.name || ''}<br/><b>${isPct ? val + '%' : formatPercent(val)}</b>`;
          },
        },
        xAxis: {
          type: 'value',
          splitLine: { show: true, lineStyle: { color: chartGrid } },
          axisLine: { show: false },
          axisLabel: {
            color: chartText,
            formatter: isCurrency
              ? (v: number) => formatCompactCurrencyAxis(v)
              : (v: number) => (isPct ? `${v}%` : formatPercent(v)),
          },
        },
        yAxis: {
          type: 'category',
          data: data.categories || [],
          splitLine: { show: false },
          axisLine: { lineStyle: { color: chartAxis } },
          axisLabel: { color: chartText },
        },
        series: hasSeriesArray
          ? data.series.map((s: any, idx: number) => ({
              name: s.name,
              type: 'bar',
              data: (s.values || []).map((val: number) => ({
                value: val,
                itemStyle: { color: isCurrency ? (palette[idx % palette.length] || excelBlue) : val >= 0 ? good : bad },
              })),
            }))
          : [
              {
                type: 'bar',
                data: values.map((val: number) => ({
                  value: val,
                  itemStyle: { color: val >= 0 ? good : bad },
                })),
              },
            ],
      };
    }

    case 'scatter': {
      // Risk vs Return
      return {
        ...baseOption,
        tooltip: {
          trigger: 'item',
          formatter: (params: any) => {
            const pt = params.data;
            return `${pt.symbol}<br/>Biến động: ${formatPercent(pt.vol)}<br/>Lợi suất: ${formatPercent(pt.ret)}`;
          },
        },
        xAxis: {
          type: 'value',
          name: 'Biến động năm hóa',
          nameLocation: 'middle',
          nameGap: 25,
          splitLine: { show: true, lineStyle: { color: chartGrid } },
          axisLine: { lineStyle: { color: chartAxis } },
          axisLabel: {
            color: chartText,
            formatter: (v: number) => formatPercent(v),
          },
        },
        yAxis: {
          type: 'value',
          name: 'Lợi suất cả kỳ',
          nameLocation: 'middle',
          nameGap: 35,
          splitLine: { show: true, lineStyle: { color: chartGrid } },
          axisLine: { show: false },
          axisLabel: {
            color: chartText,
            formatter: (v: number) => formatPercent(v),
          },
        },
        series: [
          {
            type: 'scatter',
            symbolSize: 14,
            data: (data.points || []).map((pt: any) => ({
              value: [pt.vol, pt.ret],
              symbol: pt.symbol,
              vol: pt.vol,
              ret: pt.ret,
              itemStyle: { color: excelBlue },
              label: {
                show: true,
                formatter: '{b}',
                position: 'top',
                color: ink,
              },
            })),
          },
        ],
      };
    }

    case 'pie': {
      const isBusinessChart = spec.id?.startsWith('chart_biz_');
      const unitLabel = data.unit || 'CP';

      if (isBusinessChart) {
        return {
          ...baseOption,
          tooltip: {
            trigger: 'item',
            formatter: (p: any) => {
              const rawShare = (p.data as any)?.share ?? p.share;
              const pctStr =
                typeof rawShare === 'number'
                  ? `${(rawShare * 100).toFixed(2).replace('.', ',')}%`
                  : typeof p.percent === 'number'
                  ? `${p.percent.toFixed(2).replace('.', ',')}%`
                  : '';
              return `${p.name}: ${formatNumber(p.value, 0)} ${unitLabel} (${pctStr})`;
            },
          },
          legend: {
            bottom: 5,
            textStyle: { color: chartText },
          },
          series: [
            {
              type: 'pie',
              radius: ['35%', '65%'],
              avoidLabelOverlap: true,
              data: (data.series || []).map((item: any, idx: number) => ({
                name: item.name,
                value: item.value,
                share: item.share,
                itemStyle: { color: palette[idx % palette.length] },
              })),
              label: {
                color: ink,
                formatter: (p: any) => {
                  const rawShare = (p.data as any)?.share ?? p.share;
                  const pctStr =
                    typeof rawShare === 'number'
                      ? `${(rawShare * 100).toFixed(2).replace('.', ',')}%`
                      : typeof p.percent === 'number'
                      ? `${p.percent.toFixed(2).replace('.', ',')}%`
                      : '';
                  return `${p.name}: ${pctStr}`;
                },
              },
            },
          ],
        };
      }

      return {
        ...baseOption,
        tooltip: {
          trigger: 'item',
          formatter: (p: any) =>
            `${p.name}: ${formatNumber(p.value, 0)} ${unitLabel} (${p.percent.toFixed(1)}%)`,
        },
        legend: {
          bottom: 5,
          textStyle: { color: chartText },
        },
        series: [
          {
            type: 'pie',
            radius: ['35%', '65%'],
            avoidLabelOverlap: true,
            data: (data.series || []).map((item: any, idx: number) => ({
              name: item.name,
              value: item.value,
              itemStyle: { color: palette[idx % palette.length] },
            })),
            label: {
              color: ink,
              formatter: '{b}: {d}%',
            },
          },
        ],
      };
    }

    default:
      return baseOption;
  }
}

