/**
 * Business Metrics Catalog declared purely as serializable data (Prompt 1C-1).
 * Zero UI dependencies, zero execution wiring.
 */

export const BUSINESS_ROLE_IDS = [
  'revenue',
  'orders',
  'cost',
  'profit',
  'product',
  'channel',
  'region',
  'period',
] as const;

export type BusinessRoleId = (typeof BUSINESS_ROLE_IDS)[number];

export const BUSINESS_ROLE_LABELS: Record<BusinessRoleId, string> = {
  revenue: 'Doanh thu',
  orders: 'Số đơn',
  cost: 'Giá vốn',
  profit: 'Lợi nhuận gộp',
  product: 'Sản phẩm',
  channel: 'Kênh',
  region: 'Khu vực',
  period: 'Tháng',
};

export type MetricConstraint =
  | { type: 'positive_sum'; role: 'revenue' | 'orders' | 'margin_source' }
  | { type: 'min_distinct'; role: 'channel' | 'region' | 'product'; n: number }
  | { type: 'min_months'; n: number };

export type MetricOutput = 'answer' | 'pivot' | 'chart';

export interface BusinessMetricDef {
  id: string;
  name: string;
  sampleQuestion: string;
  requiredRoles: BusinessRoleId[];
  requiredAnyOf: BusinessRoleId[][];
  constraints: MetricConstraint[];
  outputs: MetricOutput[];
}

export const BUSINESS_METRIC_CATALOG: BusinessMetricDef[] = [
  {
    id: 'total_revenue',
    name: 'Tổng doanh thu',
    sampleQuestion: 'Tổng doanh thu là bao nhiêu?',
    requiredRoles: ['revenue'],
    requiredAnyOf: [],
    constraints: [{ type: 'positive_sum', role: 'revenue' }],
    outputs: ['answer'],
  },
  {
    id: 'total_orders',
    name: 'Tổng số đơn',
    sampleQuestion: 'Tổng số đơn hàng là bao nhiêu?',
    requiredRoles: ['orders'],
    requiredAnyOf: [],
    constraints: [{ type: 'positive_sum', role: 'orders' }],
    outputs: ['answer'],
  },
  {
    id: 'aov',
    name: 'Giá trị trung bình mỗi đơn',
    sampleQuestion: 'Trung bình mỗi đơn hàng có giá trị bao nhiêu?',
    requiredRoles: ['revenue', 'orders'],
    requiredAnyOf: [],
    constraints: [
      { type: 'positive_sum', role: 'revenue' },
      { type: 'positive_sum', role: 'orders' },
    ],
    outputs: ['answer'],
  },
  {
    id: 'gross_profit',
    name: 'Lợi nhuận gộp',
    sampleQuestion: 'Lợi nhuận gộp là bao nhiêu?',
    requiredRoles: ['revenue'],
    requiredAnyOf: [['cost', 'profit']],
    constraints: [
      { type: 'positive_sum', role: 'revenue' },
      { type: 'positive_sum', role: 'margin_source' },
    ],
    outputs: ['answer'],
  },
  {
    id: 'gross_margin',
    name: 'Biên lợi nhuận gộp',
    sampleQuestion: 'Biên lợi nhuận gộp là bao nhiêu phần trăm?',
    requiredRoles: ['revenue'],
    requiredAnyOf: [['cost', 'profit']],
    constraints: [
      { type: 'positive_sum', role: 'revenue' },
      { type: 'positive_sum', role: 'margin_source' },
    ],
    outputs: ['answer'],
  },
  {
    id: 'revenue_by_channel',
    name: 'Doanh thu theo kênh',
    sampleQuestion: 'Kênh nào bán tốt nhất?',
    requiredRoles: ['revenue', 'channel'],
    requiredAnyOf: [],
    constraints: [
      { type: 'positive_sum', role: 'revenue' },
      { type: 'min_distinct', role: 'channel', n: 2 },
    ],
    outputs: ['pivot', 'chart'],
  },
  {
    id: 'revenue_by_region',
    name: 'Doanh thu theo khu vực',
    sampleQuestion: 'Khu vực nào đóng góp nhiều nhất?',
    requiredRoles: ['revenue', 'region'],
    requiredAnyOf: [],
    constraints: [
      { type: 'positive_sum', role: 'revenue' },
      { type: 'min_distinct', role: 'region', n: 2 },
    ],
    outputs: ['pivot', 'chart'],
  },
  {
    id: 'revenue_by_month',
    name: 'Doanh thu theo tháng',
    sampleQuestion: 'Doanh thu các tháng biến động thế nào?',
    requiredRoles: ['revenue', 'period'],
    requiredAnyOf: [],
    constraints: [
      { type: 'positive_sum', role: 'revenue' },
      { type: 'min_months', n: 2 },
    ],
    outputs: ['pivot', 'chart'],
  },
  {
    id: 'revenue_growth',
    name: 'Tăng trưởng doanh thu theo tháng',
    sampleQuestion: 'Tháng gần nhất tăng hay giảm so với tháng trước?',
    requiredRoles: ['revenue', 'period'],
    requiredAnyOf: [],
    constraints: [
      { type: 'positive_sum', role: 'revenue' },
      { type: 'min_months', n: 2 },
    ],
    outputs: ['answer', 'chart'],
  },
  {
    id: 'revenue_by_product',
    name: 'Doanh thu theo sản phẩm',
    sampleQuestion: 'Sản phẩm nào bán chạy nhất?',
    requiredRoles: ['revenue', 'product'],
    requiredAnyOf: [],
    constraints: [
      { type: 'positive_sum', role: 'revenue' },
      { type: 'min_distinct', role: 'product', n: 2 },
    ],
    outputs: ['pivot', 'chart'],
  },
  {
    id: 'margin_by_channel',
    name: 'Biên lợi nhuận theo kênh',
    sampleQuestion: 'Kênh nào có biên lợi nhuận cao nhất?',
    requiredRoles: ['revenue', 'channel'],
    requiredAnyOf: [['cost', 'profit']],
    constraints: [
      { type: 'positive_sum', role: 'revenue' },
      { type: 'positive_sum', role: 'margin_source' },
      { type: 'min_distinct', role: 'channel', n: 2 },
    ],
    outputs: ['pivot', 'chart'],
  },
  {
    id: 'margin_by_product',
    name: 'Biên lợi nhuận theo sản phẩm',
    sampleQuestion: 'Sản phẩm nào lãi nhất?',
    requiredRoles: ['revenue', 'product'],
    requiredAnyOf: [['cost', 'profit']],
    constraints: [
      { type: 'positive_sum', role: 'revenue' },
      { type: 'positive_sum', role: 'margin_source' },
      { type: 'min_distinct', role: 'product', n: 2 },
    ],
    outputs: ['pivot', 'chart'],
  },
  {
    id: 'channel_product_matrix',
    name: 'Biên lợi nhuận theo kênh và sản phẩm',
    sampleQuestion: 'Kênh nào bán sản phẩm nào lãi nhất?',
    requiredRoles: ['revenue', 'channel', 'product'],
    requiredAnyOf: [['cost', 'profit']],
    constraints: [
      { type: 'positive_sum', role: 'revenue' },
      { type: 'positive_sum', role: 'margin_source' },
      { type: 'min_distinct', role: 'channel', n: 2 },
      { type: 'min_distinct', role: 'product', n: 2 },
    ],
    outputs: ['pivot'],
  },
];
