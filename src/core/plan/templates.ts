/**
 * Built-in Plan Templates (Prompt P6 Section 8.4)
 * Provides 7 standard offline / fallback templates that can be configured
 * and executed without requiring AI connectivity.
 */

import type { CleanDataset, Plan } from '../schemas';

export interface PlanTemplate {
  id: string;
  name_vi: string;
  description_vi: string;
  category: 'performance' | 'risk' | 'relationship' | 'volume';
  buildPlan: (dataset: CleanDataset, params?: any) => Plan;
}

export const PLAN_TEMPLATES: PlanTemplate[] = [
  {
    id: 'compare_periods',
    name_vi: 'So sánh hai kỳ',
    description_vi: 'So sánh lợi suất, biến động, sụt giảm và khối lượng giữa 2 khoảng thời gian',
    category: 'performance',
    buildPlan: (dataset: CleanDataset, custom?: { period_a?: { from: string; to: string }; period_b?: { from: string; to: string } }): Plan => {
      // Find min and max dates in dataset
      let minDate = '2026-01-01';
      let maxDate = '2026-03-31';

      if ('date_days' in dataset && dataset.date_days && dataset.date_days.length > 0) {
        const sortedDays = Array.from(dataset.date_days).sort((a, b) => a - b);
        minDate = new Date(sortedDays[0] * 86400000).toISOString().slice(0, 10);
        maxDate = new Date(sortedDays[sortedDays.length - 1] * 86400000).toISOString().slice(0, 10);
        const midIdx = Math.floor(sortedDays.length / 2);
        const midDate = new Date(sortedDays[midIdx] * 86400000).toISOString().slice(0, 10);
        const prevMidDate = new Date(sortedDays[Math.max(0, midIdx - 1)] * 86400000).toISOString().slice(0, 10);

        const period_a = custom?.period_a || { from: minDate, to: prevMidDate };
        const period_b = custom?.period_b || { from: midDate, to: maxDate };

        return {
          title_vi: 'So sánh hiệu suất giữa hai kỳ',
          steps: [
            {
              op: 'compare_periods',
              params: {
                period_a,
                period_b,
                metrics: ['period_return', 'ann_vol', 'avg_volume', 'max_dd'],
              },
            },
          ],
        };
      } else if ('rows' in dataset && Array.isArray((dataset as any).rows) && (dataset as any).rows.length > 0) {
        const sortedDates = [...new Set((dataset as any).rows.map((r: any) => String(r.date)))].sort();
        if (sortedDates.length >= 2) {
          minDate = String(sortedDates[0]);
          maxDate = String(sortedDates[sortedDates.length - 1]);
          const midIdx = Math.floor(sortedDates.length / 2);
          const midDate = String(sortedDates[midIdx]);
          const prevMidDate = String(sortedDates[Math.max(0, midIdx - 1)]);

          const period_a = custom?.period_a || { from: minDate, to: prevMidDate };
          const period_b = custom?.period_b || { from: midDate, to: maxDate };

          return {
            title_vi: 'So sánh hiệu suất giữa hai kỳ',
            steps: [
              {
                op: 'compare_periods',
                params: {
                  period_a,
                  period_b,
                  metrics: ['period_return', 'ann_vol', 'avg_volume', 'max_dd'],
                },
              },
            ],
          };
        }
      }

      return {
        title_vi: 'So sánh hiệu suất giữa hai kỳ',
        steps: [
          {
            op: 'compare_periods',
            params: {
              period_a: custom?.period_a || { from: minDate, to: '2026-02-15' },
              period_b: custom?.period_b || { from: '2026-02-16', to: maxDate },
              metrics: ['period_return', 'ann_vol', 'avg_volume', 'max_dd'],
            },
          },
        ],
      };
    },
  },

  {
    id: 'rank_top_n',
    name_vi: 'Xếp hạng mã theo lợi suất',
    description_vi: 'Xếp hạng top các mã có lợi suất cao nhất hoặc thấp nhất trong kỳ',
    category: 'performance',
    buildPlan: (_dataset: CleanDataset, custom?: { metric?: string; n?: number; order?: 'desc' | 'asc' }): Plan => {
      return {
        title_vi: 'Xếp hạng cổ phiếu theo lợi suất tích lũy',
        steps: [
          {
            op: 'rank_top_n',
            params: {
              metric: (custom?.metric as any) || 'period_return',
              n: custom?.n || 10,
              order: custom?.order || 'desc',
            },
          },
        ],
      };
    },
  },

  {
    id: 'rolling_volatility',
    name_vi: 'Biến động 20 phiên',
    description_vi: 'Đo lường mức độ biến động hàng năm (annualized volatility) theo cửa sổ trượt 20 phiên',
    category: 'risk',
    buildPlan: (_dataset: CleanDataset, custom?: { window?: number }): Plan => {
      return {
        title_vi: 'Độ biến động 20 phiên các mã cổ phiếu',
        steps: [
          {
            op: 'rolling_volatility',
            params: {
              window: custom?.window || 20,
            },
          },
        ],
      };
    },
  },

  {
    id: 'monthly_returns',
    name_vi: 'Lợi suất theo tháng',
    description_vi: 'Tính tỷ lệ phần trăm thay đổi ngày và tổng hợp lợi suất bình quân theo từng tháng',
    category: 'performance',
    buildPlan: (_dataset: CleanDataset): Plan => {
      return {
        title_vi: 'Lợi suất trung bình theo từng tháng',
        steps: [
          {
            op: 'pct_change',
            params: {
              column: 'close',
              periods: 1,
            },
          },
          {
            op: 'group_aggregate',
            params: {
              by: 'month',
              column: 'return',
              agg: 'mean',
            },
          },
        ],
      };
    },
  },

  {
    id: 'correlation_matrix',
    name_vi: 'Tương quan giữa các mã',
    description_vi: 'Tính ma trận hệ số tương quan lợi suất ngày giữa toàn bộ danh mục cổ phiếu',
    category: 'relationship',
    buildPlan: (_dataset: CleanDataset): Plan => {
      return {
        title_vi: 'Ma trận tương quan lợi suất giữa các mã',
        steps: [
          {
            op: 'pct_change',
            params: {
              column: 'close',
              periods: 1,
            },
          },
          {
            op: 'correlation',
            params: {},
          },
        ],
      };
    },
  },

  {
    id: 'normalize_base100',
    name_vi: 'Chuẩn hóa về 100',
    description_vi: 'Đưa giá các mã về cùng mốc 100 tại ngày đầu để so sánh mức tăng trưởng',
    category: 'performance',
    buildPlan: (_dataset: CleanDataset): Plan => {
      return {
        title_vi: 'So sánh tăng trưởng giá (chuẩn hóa mốc 100)',
        steps: [
          {
            op: 'normalize_base100',
            params: {},
          },
        ],
      };
    },
  },

  {
    id: 'weekday_volume',
    name_vi: 'Khối lượng trung bình theo thứ',
    description_vi: 'Tổng hợp khối lượng giao dịch bình quân theo từng thứ trong tuần (Thứ 2 đến Thứ 6)',
    category: 'volume',
    buildPlan: (_dataset: CleanDataset): Plan => {
      return {
        title_vi: 'Khối lượng giao dịch bình quân theo thứ trong tuần',
        steps: [
          {
            op: 'group_aggregate',
            params: {
              by: 'weekday',
              column: 'volume',
              agg: 'mean',
            },
          },
        ],
      };
    },
  },
];
