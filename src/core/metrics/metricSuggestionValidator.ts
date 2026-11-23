import { BUSINESS_METRIC_CATALOG } from './businessCatalog';

export interface MetricSuggestionCatalogItem {
  id: string;
  name: string;
  feasible: boolean;
  reason?: string;
}

export interface MetricSuggestionInput {
  clean_row_count: number;
  confirmed_roles: string[];
  catalog_metrics: MetricSuggestionCatalogItem[];
  confidence_level: string;
}

export interface MetricSuggestionOutput {
  suggested_ids: string[];
  reasons: Record<string, string>;
  notes: string[];
}

export interface MetricSuggestionResult extends MetricSuggestionOutput {
  source: 'ai' | 'fallback';
  model?: string;
  latency_ms: number;
}

const KNOWN_METRIC_IDS = new Set(BUSINESS_METRIC_CATALOG.map((m) => m.id));

const DEFAULT_REASON = 'Chỉ số phù hợp với danh mục dữ liệu đã xác thực.';

export function getFallbackReasonForMetric(id: string): string {
  if (id.includes('revenue') || id.includes('total_revenue')) {
    return 'Chỉ số cốt lõi phản ánh quy mô bán hàng của doanh nghiệp.';
  } else if (id.includes('orders') || id === 'aov') {
    return 'Đo lường tần suất giao dịch và giá trị đơn hàng trung bình.';
  } else if (id.includes('profit') || id.includes('margin')) {
    return 'Đo lường hiệu quả sinh lời và khả năng kiểm soát giá vốn.';
  } else if (id.includes('channel')) {
    return 'Phân tích cơ cấu và hiệu quả giữa các kênh phân phối.';
  } else if (id.includes('region')) {
    return 'Đánh giá mức độ phủ thị trường theo từng khu vực địa lý.';
  } else if (id.includes('month') || id.includes('growth')) {
    return 'Theo dõi nhịp tăng trưởng và xu hướng bán hàng theo thời gian.';
  } else if (id.includes('product')) {
    return 'Xác định các mặt hàng chủ lực và cơ cấu doanh thu theo sản phẩm.';
  }
  return DEFAULT_REASON;
}

export function sanitizeTextNoDigits(text: string, maxLength = 160): string {
  if (typeof text !== 'string') return '';
  // Strip HTML tags
  let cleaned = text.replace(/<[^>]*>/g, '');
  // Strip delimiters <>{}[] and markdown formatting symbols like **, *, __, `, #
  cleaned = cleaned.replace(/[<>{}[\]*_`#]/g, '');
  // Normalize whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  if (cleaned.length > maxLength) {
    cleaned = cleaned.slice(0, maxLength).trim();
  }
  return cleaned;
}

export function validateMetricSuggestion(
  raw: unknown,
  feasibleMetricIds: Set<string>
): MetricSuggestionOutput {
  const result: MetricSuggestionOutput = {
    suggested_ids: [],
    reasons: {},
    notes: [],
  };

  if (!raw || typeof raw !== 'object') {
    return buildFallbackMetricSuggestion(
      BUSINESS_METRIC_CATALOG.filter((m) => feasibleMetricIds.has(m.id)),
      []
    );
  }

  const rawObj = raw as Record<string, unknown>;

  // 1. Validate suggested_ids
  const rawIds = Array.isArray(rawObj.suggested_ids) ? rawObj.suggested_ids : [];
  const seenIds = new Set<string>();

  for (const item of rawIds) {
    if (typeof item !== 'string') continue;
    const trimmedId = item.trim();
    // Must be in catalog and feasible
    if (KNOWN_METRIC_IDS.has(trimmedId) && feasibleMetricIds.has(trimmedId) && !seenIds.has(trimmedId)) {
      seenIds.add(trimmedId);
      result.suggested_ids.push(trimmedId);
    }
  }

  // If no valid IDs survived, fallback to all feasible IDs
  if (result.suggested_ids.length === 0) {
    const fallback = buildFallbackMetricSuggestion(
      BUSINESS_METRIC_CATALOG.filter((m) => feasibleMetricIds.has(m.id)),
      []
    );
    return fallback;
  }

  // 2. Validate reasons: if contains digits, discard and use fallback reason of that metric
  const rawReasons =
    rawObj.reasons && typeof rawObj.reasons === 'object' && !Array.isArray(rawObj.reasons)
      ? (rawObj.reasons as Record<string, unknown>)
      : {};

  for (const id of result.suggested_ids) {
    const val = rawReasons[id];
    if (typeof val === 'string') {
      const sanitized = sanitizeTextNoDigits(val, 180);
      // Strictly reject any reason that contains digits -> use metric's fallback reason
      if (/\d/.test(sanitized)) {
        result.reasons[id] = getFallbackReasonForMetric(id);
      } else if (sanitized.length > 0) {
        result.reasons[id] = sanitized;
      } else {
        result.reasons[id] = getFallbackReasonForMetric(id);
      }
    } else {
      result.reasons[id] = getFallbackReasonForMetric(id);
    }
  }

  // 3. Validate notes (max 2 items, max 160 chars each, no digits, no HTML/brackets)
  const rawNotes = Array.isArray(rawObj.notes) ? rawObj.notes : [];
  for (const note of rawNotes) {
    if (result.notes.length >= 2) break;
    if (typeof note === 'string') {
      // Must not contain digits
      if (/\d/.test(note)) continue;
      const sanitized = sanitizeTextNoDigits(note, 160);
      if (sanitized.length > 0) {
        result.notes.push(sanitized);
      }
    }
  }

  return result;
}

export function buildFallbackMetricSuggestion(
  feasibleMetrics: Array<{ id: string; name: string }>,
  _confirmedRoles: string[] = []
): MetricSuggestionOutput {
  const suggested_ids = feasibleMetrics.map((m) => m.id);
  const reasons: Record<string, string> = {};

  for (const m of feasibleMetrics) {
    if (m.id.includes('revenue') || m.id.includes('total_revenue')) {
      reasons[m.id] = 'Chỉ số cốt lõi phản ánh quy mô bán hàng của doanh nghiệp.';
    } else if (m.id.includes('orders') || m.id === 'aov') {
      reasons[m.id] = 'Đo lường tần suất giao dịch và giá trị đơn hàng trung bình.';
    } else if (m.id.includes('profit') || m.id.includes('margin')) {
      reasons[m.id] = 'Đo lường hiệu quả sinh lời và khả năng kiểm soát giá vốn.';
    } else if (m.id.includes('channel')) {
      reasons[m.id] = 'Phân tích cơ cấu và hiệu quả giữa các kênh phân phối.';
    } else if (m.id.includes('region')) {
      reasons[m.id] = 'Đánh giá mức độ phủ thị trường theo từng khu vực địa lý.';
    } else if (m.id.includes('month') || m.id.includes('growth')) {
      reasons[m.id] = 'Theo dõi nhịp tăng trưởng và xu hướng bán hàng theo thời gian.';
    } else if (m.id.includes('product')) {
      reasons[m.id] = 'Xác định các mặt hàng chủ lực và cơ cấu doanh thu theo sản phẩm.';
    } else {
      reasons[m.id] = DEFAULT_REASON;
    }
  }

  const notes = [
    'Hệ thống tự động đề xuất các chỉ số khả thi dựa trên các cột đã xác nhận.',
    'Bạn có thể chọn hoặc bỏ chọn bất kỳ chỉ số nào trước khi phân tích.',
  ];

  return {
    suggested_ids,
    reasons,
    notes,
  };
}
