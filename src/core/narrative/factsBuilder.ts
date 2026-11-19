/**
 * Compact Business Facts Table Builder (Prompt M3-B2 & B4).
 * Single input source for AI business insights — ZERO raw data rows ever leave the browser.
 * Enforces prompt-injection sanitization on all data labels and keeps JSON payload < 4 KB.
 * Pure TypeScript - deterministic SHA-256 hash.
 */

import type { BusinessAnalysisSummary } from '../metrics/businessAnalyzer';
import { formatNumber, formatPercent } from '../../utils/format';
import { sha256Sync } from '../context/normalize';

export type FactCategory =
  | 'total'
  | 'channel'
  | 'month'
  | 'region'
  | 'product'
  | 'concentration'
  | 'quality';

export interface FactItem {
  id: string;
  category: FactCategory;
  label_vi: string;
  value: number | string;
  display: string;
  unit: string;
  chart_id?: string;
  /** Exact numeric values present in this fact for post-AI anti-hallucination verification */
  raw_numbers: number[];
}

export interface FactsTable {
  hash: string;
  byte_size: number;
  generated_at: string;
  dataset_kind: 'business';
  period: string;
  facts: FactItem[];
}

/**
 * Sanitizes any string coming from user data (product/channel/region names, feedback)
 * to neutralize prompt injection and HTML/script injection.
 */
export function sanitizeDataLabel(input: unknown, maxLen = 60): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/<[^>]*>/g, '') // Strip any HTML/script tags
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[\x00-\x1F\x7F]/g, '') // Strip control characters
    .replace(/[`{}[\]]/g, '') // Strip delimiter characters used in JSON/markdown injection
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

/**
 * Builds a compact (< 4 KB), prompt-injection-safe FactsTable from BusinessAnalysisSummary.
 */
export function buildBusinessFactsTable(
  summary: BusinessAnalysisSummary,
  options?: { droppedRowsDuringClean?: number }
): FactsTable {
  const facts: FactItem[] = [];
  let seq = 1;

  const pushFact = (
    category: FactCategory,
    label_vi: string,
    value: number | string,
    display: string,
    unit: string,
    raw_numbers: (number | null | undefined)[],
    chart_id?: string
  ) => {
    facts.push({
      id: `F${seq++}`,
      category,
      label_vi,
      value,
      display,
      unit,
      chart_id,
      raw_numbers: raw_numbers.filter((v): v is number => typeof v === 'number' && Number.isFinite(v)),
    });
  };

  const t = summary.totals;
  const periodStr =
    summary.date_from && summary.date_to
      ? `${sanitizeDataLabel(summary.date_from, 20)} đến ${sanitizeDataLabel(summary.date_to, 20)} (${summary.months_count} tháng)`
      : `${summary.months_count} kỳ`;

  // 1. Totals (F1..F6)
  pushFact(
    'total',
    'Tổng số dòng dữ liệu sạch và kỳ khảo sát',
    summary.total_rows,
    `${formatNumber(summary.total_rows, 0)} dòng (${periodStr})`,
    'dòng',
    [summary.total_rows, summary.months_count]
  );
  pushFact(
    'total',
    'Tổng doanh thu',
    t.revenue,
    `${formatNumber(t.revenue, 0)} VND`,
    'VND',
    [t.revenue],
    'chart_biz_channel_revenue'
  );
  if (t.cogs !== null && t.cogs !== undefined) {
    pushFact(
      'total',
      'Tổng giá vốn',
      t.cogs,
      `${formatNumber(t.cogs, 0)} VND`,
      'VND',
      [t.cogs]
    );
  }
  if (t.profit !== null && t.profit !== undefined) {
    pushFact(
      'total',
      'Tổng lợi nhuận gộp',
      t.profit,
      `${formatNumber(t.profit, 0)} VND`,
      'VND',
      [t.profit]
    );
  }
  if (t.gross_margin_pct !== null && t.gross_margin_pct !== undefined) {
    pushFact(
      'total',
      'Biên lợi nhuận gộp tổng thể',
      Number(t.gross_margin_pct.toFixed(2)),
      formatPercent(t.gross_margin_pct / 100),
      '%',
      [t.gross_margin_pct, Number(t.gross_margin_pct.toFixed(2))]
    );
  }
  if (t.orders !== null && t.orders !== undefined && t.aov !== null && t.aov !== undefined) {
    pushFact(
      'total',
      'Tổng số đơn hàng và giá trị đơn trung bình (AOV)',
      t.orders,
      `${formatNumber(t.orders, 0)} đơn; AOV ${formatNumber(t.aov, 2)} VND`,
      'đơn / VND',
      [t.orders, t.aov, Number(t.aov.toFixed(2))]
    );
  }

  // 2. Channels (top 3 / all if <= 4)
  for (const ch of summary.by_channel.slice(0, 4)) {
    const safeName = sanitizeDataLabel(ch.key, 40);
    const details =
      ch.orders !== null && ch.profit !== null && ch.margin_pct !== null
        ? `Doanh thu ${formatNumber(ch.revenue, 0)} VND (${formatPercent(ch.revenue_share_pct / 100)}), ${formatNumber(ch.orders, 0)} đơn, LN ${formatNumber(ch.profit, 0)} VND, biên LN ${formatPercent(ch.margin_pct / 100)}`
        : `Doanh thu ${formatNumber(ch.revenue, 0)} VND (${formatPercent(ch.revenue_share_pct / 100)})`;
    pushFact(
      'channel',
      `Kênh [DATA:${safeName}]`,
      ch.revenue,
      details,
      'VND / %',
      [ch.revenue, ch.revenue_share_pct, ch.orders, ch.profit, ch.margin_pct, ch.aov],
      'chart_biz_channel_revenue'
    );
  }

  // 3. Monthly trend (best, worst, latest MoM)
  const { best_month, worst_month, latest_month, previous_month, latest_mom_delta, latest_mom_pct } =
    summary.trend;
  if (best_month) {
    const safeM = sanitizeDataLabel(best_month.key, 20);
    const details =
      best_month.orders !== null
        ? `${formatNumber(best_month.revenue, 0)} VND (${formatPercent(best_month.revenue_share_pct / 100)} tổng DT, ${formatNumber(best_month.orders, 0)} đơn)`
        : `${formatNumber(best_month.revenue, 0)} VND (${formatPercent(best_month.revenue_share_pct / 100)} tổng DT)`;
    pushFact(
      'month',
      `Tháng doanh thu cao nhất [DATA:${safeM}]`,
      best_month.revenue,
      details,
      'VND',
      [best_month.revenue, best_month.revenue_share_pct, best_month.orders, best_month.profit],
      'chart_biz_month_trend'
    );
  }
  if (worst_month && worst_month.key !== best_month?.key) {
    const safeM = sanitizeDataLabel(worst_month.key, 20);
    const details =
      worst_month.orders !== null
        ? `${formatNumber(worst_month.revenue, 0)} VND (${formatPercent(worst_month.revenue_share_pct / 100)} tổng DT, ${formatNumber(worst_month.orders, 0)} đơn)`
        : `${formatNumber(worst_month.revenue, 0)} VND (${formatPercent(worst_month.revenue_share_pct / 100)} tổng DT)`;
    pushFact(
      'month',
      `Tháng doanh thu thấp nhất [DATA:${safeM}]`,
      worst_month.revenue,
      details,
      'VND',
      [worst_month.revenue, worst_month.revenue_share_pct, worst_month.orders, worst_month.profit],
      'chart_biz_month_trend'
    );
  }
  if (latest_month && previous_month && latest_mom_delta !== null && latest_mom_pct !== null) {
    const dir = latest_mom_delta >= 0 ? 'tăng' : 'giảm';
    const absDelta = Math.abs(latest_mom_delta);
    const absPct = Math.abs(latest_mom_pct);
    pushFact(
      'month',
      `Biến động tháng gần nhất [DATA:${sanitizeDataLabel(latest_month.key, 20)}] so với [DATA:${sanitizeDataLabel(previous_month.key, 20)}]`,
      Number(latest_mom_pct.toFixed(2)),
      `${dir} ${formatNumber(absDelta, 0)} VND (${latest_mom_pct >= 0 ? '+' : ''}${formatPercent(latest_mom_pct / 100)})`,
      'VND / %',
      [latest_mom_delta, absDelta, latest_mom_pct, absPct, latest_month.revenue, previous_month.revenue],
      'chart_biz_month_trend'
    );
  }

  // 4. Products (top 1, lowest margin, bottom known, concentration Top 3)
  const { top1_product, top3_products_share_pct, lowest_margin_product, lowest_revenue_region } =
    summary.concentration;
  if (top1_product) {
    const safeP = sanitizeDataLabel(top1_product.key, 40);
    const details =
      top1_product.margin_pct !== null
        ? `${formatNumber(top1_product.revenue, 0)} VND (${formatPercent(top1_product.revenue_share_pct / 100)}), biên LN ${formatPercent(top1_product.margin_pct / 100)}`
        : `${formatNumber(top1_product.revenue, 0)} VND (${formatPercent(top1_product.revenue_share_pct / 100)})`;
    pushFact(
      'product',
      `Sản phẩm doanh thu cao nhất [DATA:${safeP}]`,
      top1_product.revenue,
      details,
      'VND / %',
      [top1_product.revenue, top1_product.revenue_share_pct, top1_product.margin_pct, top1_product.profit],
      'chart_biz_product_revenue'
    );
  }
  const secondProduct = summary.by_product.find((p) => p.key !== top1_product?.key && p.key !== 'Không xác định');
  if (secondProduct) {
    const safeP = sanitizeDataLabel(secondProduct.key, 40);
    const details =
      secondProduct.margin_pct !== null
        ? `${formatNumber(secondProduct.revenue, 0)} VND (${formatPercent(secondProduct.revenue_share_pct / 100)}), biên LN ${formatPercent(secondProduct.margin_pct / 100)}`
        : `${formatNumber(secondProduct.revenue, 0)} VND (${formatPercent(secondProduct.revenue_share_pct / 100)})`;
    pushFact(
      'product',
      `Sản phẩm đứng thứ hai [DATA:${safeP}]`,
      secondProduct.revenue,
      details,
      'VND / %',
      [secondProduct.revenue, secondProduct.revenue_share_pct, secondProduct.margin_pct, secondProduct.profit],
      'chart_biz_product_revenue'
    );
  }
  if (lowest_margin_product && lowest_margin_product.margin_pct !== null) {
    const safeP = sanitizeDataLabel(lowest_margin_product.key, 40);
    pushFact(
      'product',
      `Sản phẩm biên lợi nhuận thấp nhất [DATA:${safeP}]`,
      Number(lowest_margin_product.margin_pct.toFixed(2)),
      `Biên LN ${formatPercent(lowest_margin_product.margin_pct / 100)}, doanh thu ${formatNumber(lowest_margin_product.revenue, 0)} VND (${formatPercent(lowest_margin_product.revenue_share_pct / 100)})`,
      '% / VND',
      [lowest_margin_product.margin_pct, lowest_margin_product.revenue, lowest_margin_product.revenue_share_pct],
      'chart_biz_product_revenue'
    );
  }
  if (top3_products_share_pct !== null && top3_products_share_pct !== undefined && summary.by_product.length > 0) {
    pushFact(
      'concentration',
      'Mức tập trung Top 3 sản phẩm dẫn đầu',
      Number(top3_products_share_pct.toFixed(2)),
      `${formatPercent(top3_products_share_pct / 100)} tổng doanh thu`,
      '%',
      [top3_products_share_pct, 3],
      'chart_biz_product_revenue'
    );
  }

  // 5. Regions (top & lowest)
  const topRegion = summary.by_region.find((r) => r.key !== 'Không xác định') || summary.by_region[0];
  if (topRegion) {
    const safeR = sanitizeDataLabel(topRegion.key, 40);
    pushFact(
      'region',
      `Khu vực doanh thu cao nhất [DATA:${safeR}]`,
      topRegion.revenue,
      `${formatNumber(topRegion.revenue, 0)} VND (${formatPercent(topRegion.revenue_share_pct / 100)})`,
      'VND / %',
      [topRegion.revenue, topRegion.revenue_share_pct, topRegion.profit],
      'chart_biz_region_revenue'
    );
  }
  if (lowest_revenue_region && lowest_revenue_region.key !== topRegion?.key) {
    const safeR = sanitizeDataLabel(lowest_revenue_region.key, 40);
    pushFact(
      'region',
      `Khu vực doanh thu thấp nhất [DATA:${safeR}]`,
      lowest_revenue_region.revenue,
      `${formatNumber(lowest_revenue_region.revenue, 0)} VND (${formatPercent(lowest_revenue_region.revenue_share_pct / 100)})`,
      'VND / %',
      [lowest_revenue_region.revenue, lowest_revenue_region.revenue_share_pct, lowest_revenue_region.profit],
      'chart_biz_region_revenue'
    );
  }

  // 6. Unknown categories & data quality
  const { unknown_region_revenue, unknown_region_share_pct, unknown_product_revenue, unknown_product_share_pct } =
    summary.concentration;
  if (unknown_region_revenue > 0 || unknown_product_revenue > 0) {
    pushFact(
      'quality',
      'Tỷ trọng mục "Không xác định" (ô phân loại khuyết)',
      unknown_region_revenue + unknown_product_revenue,
      `Khu vực Không xác định: ${formatNumber(unknown_region_revenue, 0)} VND (${formatPercent(unknown_region_share_pct / 100)}); Sản phẩm Không xác định: ${formatNumber(unknown_product_revenue, 0)} VND (${formatPercent(unknown_product_share_pct / 100)})`,
      'VND / %',
      [unknown_region_revenue, unknown_region_share_pct, unknown_product_revenue, unknown_product_share_pct],
      'chart_biz_region_revenue'
    );
  }

  const droppedRows = options?.droppedRowsDuringClean ?? 0;
  pushFact(
    'quality',
    'Chất lượng dữ liệu sau làm sạch',
    summary.quality.missing_numeric_cells,
    `Loại ${droppedRows} dòng ở bước làm sạch; ${summary.quality.missing_numeric_cells} ô số trống; ${summary.quality.unknown_dimension_rows} dòng có nhãn Không xác định; ${summary.quality.negative_profit_rows} dòng lợi nhuận âm`,
    'dòng / ô',
    [
      droppedRows,
      summary.quality.missing_numeric_cells,
      summary.quality.unknown_dimension_rows,
      summary.quality.negative_profit_rows,
    ]
  );

  // Build compact wire JSON representation for hashing & size budget check (< 4 KB)
  const compactForHash = facts.map((f) => ({
    id: f.id,
    label_vi: f.label_vi,
    display: f.display,
    unit: f.unit,
  }));
  const serialized = JSON.stringify(compactForHash);
  const byteSize = new TextEncoder().encode(serialized).length;
  const hash = sha256Sync(serialized);

  return {
    hash,
    byte_size: byteSize,
    generated_at: new Date().toISOString(),
    dataset_kind: 'business',
    period: periodStr,
    facts,
  };
}
