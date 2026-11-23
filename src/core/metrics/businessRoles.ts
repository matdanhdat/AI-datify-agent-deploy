/**
 * Strict Column Role Resolver for Business Datasets (Prompt 1B-1 & 1B-1b).
 * Eliminates silent fallbacks, enforces whole-word and negative-keyword matching,
 * and tracks explicit resolution status ('tìm thấy' | 'suy luận' | 'tính ra' | 'thiếu' | 'không đáng tin').
 *
 * Pure TypeScript - zero UI dependencies.
 */

import type { BusinessColumn, BusinessTable } from '../businessTable';

export type RoleResolutionStatus = 'tìm thấy' | 'suy luận' | 'tính ra' | 'thiếu' | 'không đáng tin';

export interface ResolvedRoleItem {
  status: RoleResolutionStatus;
  col: BusinessColumn | null;
  reason_vi: string;
}

export interface BusinessResolvedRoles {
  revenue: ResolvedRoleItem;
  cogs: ResolvedRoleItem;
  profit: ResolvedRoleItem;
  orders: ResolvedRoleItem;
  channel: ResolvedRoleItem;
  region: ResolvedRoleItem;
  product: ResolvedRoleItem;
  time: ResolvedRoleItem;
  warnings: string[];
}

export const BUSINESS_ROLE_WARNINGS = {
  MISSING_ORDERS:
    'Không có cột Số đơn: các chỉ số về số đơn và giá trị đơn trung bình không được tính.',
  MISSING_COGS_AND_PROFIT:
    'Không có cột Giá vốn hoặc Lợi nhuận gộp: biên lợi nhuận gộp không được tính.',
  MISSING_COGS_ONLY:
    'Không có cột Giá vốn: tổng giá vốn không được tính.',
  COGS_ALL_ZERO:
    'Cột Giá vốn toàn bằng 0: biên lợi nhuận gộp không được tính.',
  PROFIT_EQUALS_REVENUE:
    'Lợi nhuận gộp bằng doanh thu ở mọi dòng: dữ liệu giá vốn không đáng tin, biên lợi nhuận gộp không được tính.',
  PROFIT_COMPUTED:
    'Lợi nhuận gộp được tính bằng Doanh thu trừ Giá vốn vì file không có cột Lợi nhuận gộp.',
  MISSING_PRODUCT:
    'Không có cột Sản phẩm: các phân tích theo sản phẩm không được tính.',
  MISSING_CHANNEL:
    'Không có cột Kênh bán: các phân tích theo kênh không được tính.',
  MISSING_REGION:
    'Không có cột Khu vực: các phân tích theo khu vực không được tính.',
  MISSING_TIME:
    'Không có cột Tháng: các phân tích theo tháng không được tính.',
  REVENUE_INFERRED: (colName: string) =>
    `Không thấy cột tên Doanh thu. Agent tạm hiểu cột "${colName}" là doanh thu.`,
  PROFIT_INFERRED: (colName: string) =>
    `Cột "${colName}" được hiểu là lợi nhuận gộp.`,
  MULTIPLE_MATCHES: (roleName: string, listStr: string, chosenCol: string) =>
    `Có nhiều cột có thể là ${roleName}: ${listStr}. Agent dùng cột "${chosenCol}".`,
} as const;

/**
 * Normalizes text for matching column headers:
 * - lowercase
 * - strip Vietnamese diacritics (NFD, đ -> d)
 * - replace symbols [_ - . / ( ) [ ] \\] with whitespace
 * - remove common currency/unit tokens as whole words: vnd, dong, %, nghin dong, trieu dong, ty dong, usd, k, tr
 * - collapse multiple consecutive spaces, trim
 */
export function normalizeRoleText(str: string): string {
  if (!str) return '';
  let s = str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[_\-./()[\]\\,:]/g, ' ');

  // Strip known unit phrases & tokens as whole words
  s = s.replace(/\b(trieu dong|nghin dong|ty dong|vnd|dong|usd|k|tr)\b/g, ' ');
  s = s.replace(/%/g, ' ');

  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Checks if a normalized string contains an exact phrase with word boundary protection.
 */
function hasWordPhrase(text: string, phrase: string): boolean {
  if (!text || !phrase) return false;
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const reg = new RegExp(`(^|\\s)${escaped}(\\s|$)`);
  return reg.test(text);
}

/**
 * Checks if any exclusion keyword appears in the normalized text.
 */
function hasExclusion(text: string, exclusions: string[]): boolean {
  return exclusions.some((ex) => hasWordPhrase(text, ex));
}

interface MatchCandidate {
  col: BusinessColumn;
  score: number;
  reason: string;
  isInferred?: boolean;
}

/**
 * Resolves the Revenue column strictly.
 * Keywords: "doanh thu thuan", "net sales", "doanh thu", "doanh so", "revenue", "sales", "thanh tien", "tong tien".
 * Exclusions: "gia von", "cost", "chi phi", "loi nhuan", "profit", "ty le", "bien", "margin", "tang truong", "growth", "don gia", "chiet khau".
 */
function resolveRevenueColumn(measures: BusinessColumn[]): { item: ResolvedRoleItem; warning?: string } {
  const EXCLUSIONS = [
    'gia von',
    'cost',
    'chi phi',
    'loi nhuan',
    'profit',
    'ty le',
    'bien',
    'margin',
    'tang truong',
    'growth',
    'don gia',
    'gia ban',
    'gia niem yet',
    'unit price',
    'price',
    'chiet khau',
    'thoi gian',
    'tinh trang',
    'ky hieu',
  ];

  const candidates: MatchCandidate[] = [];

  for (const col of measures) {
    const norm = normalizeRoleText(col.label);
    if (hasExclusion(norm, EXCLUSIONS)) continue;

    if (hasWordPhrase(norm, 'doanh thu thuan') || hasWordPhrase(norm, 'net sales')) {
      candidates.push({ col, score: 100, reason: `Khớp chính xác "${col.label}" (Doanh thu thuần)` });
    } else if (hasWordPhrase(norm, 'doanh thu') || hasWordPhrase(norm, 'revenue')) {
      candidates.push({ col, score: 80, reason: `Khớp "${col.label}" (Doanh thu)` });
    } else if (hasWordPhrase(norm, 'doanh so') || hasWordPhrase(norm, 'sales')) {
      candidates.push({ col, score: 70, reason: `Khớp "${col.label}" (Doanh số)` });
    } else if (
      hasWordPhrase(norm, 'thanh tien') ||
      hasWordPhrase(norm, 'tong tien') ||
      hasWordPhrase(norm, 'gia tri hop dong') ||
      hasWordPhrase(norm, 'gia tri don hang') ||
      hasWordPhrase(norm, 'amount')
    ) {
      candidates.push({ col, score: 60, reason: `Khớp "${col.label}" (Thành tiền/Tổng tiền)` });
    }
  }

  let warning: string | undefined;

  if (candidates.length === 0) {
    return {
      item: {
        status: 'thiếu',
        col: null,
        reason_vi: 'Không tìm thấy cột Doanh thu hợp lệ trong file',
      },
    };
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];

  if (candidates.length > 1) {
    const listStr = candidates.map((c) => `"${c.col.label}"`).join(', ');
    warning = BUSINESS_ROLE_WARNINGS.MULTIPLE_MATCHES('Doanh thu', listStr, best.col.label);
  }

  return {
    item: {
      status: 'tìm thấy',
      col: best.col,
      reason_vi: best.reason,
    },
    warning,
  };
}

/**
 * Resolves the Orders column strictly.
 * Keywords: "so don hang", "so luong don", "order count", "so giao dich", "so don", "don hang", "orders".
 * Exclusions: "gia tri", "gia tri don", "aov", "doanh thu tren don", "tien", "thanh tien", "so luong ton", "so luong sp".
 * Must NOT match isolated "so luong", "sl", "quantity".
 */
function resolveOrdersColumn(measures: BusinessColumn[]): { item: ResolvedRoleItem; warning?: string } {
  const EXCLUSIONS = [
    'ma khach hang',
    'ma kh',
    'customer id',
    'so dien thoai',
    'sdt',
    'phone',
    'telephone',
    'ma don hang',
    'ma don',
    'order id',
    'ma',
    'id',
    'stt',
    'gia tri',
    'gia tri don',
    'aov',
    'doanh thu tren don',
    'tien',
    'thanh tien',
    'so luong ton',
    'so luong sp',
  ];

  const candidates: MatchCandidate[] = [];

  for (const col of measures) {
    const norm = normalizeRoleText(col.label);
    if (hasExclusion(norm, EXCLUSIONS)) continue;

    if (
      hasWordPhrase(norm, 'so don hang') ||
      hasWordPhrase(norm, 'so luong don') ||
      hasWordPhrase(norm, 'order count') ||
      hasWordPhrase(norm, 'so hop dong') ||
      hasWordPhrase(norm, 'so can ban') ||
      hasWordPhrase(norm, 'so xe ban')
    ) {
      candidates.push({ col, score: 100, reason: `Khớp chính xác "${col.label}" (Số đơn hàng)` });
    } else if (
      hasWordPhrase(norm, 'so don') ||
      hasWordPhrase(norm, 'so giao dich') ||
      hasWordPhrase(norm, 'so luong ban') ||
      hasWordPhrase(norm, 'sl ban') ||
      hasWordPhrase(norm, 'units sold')
    ) {
      candidates.push({ col, score: 90, reason: `Khớp "${col.label}" (Số đơn)` });
    } else if (
      hasWordPhrase(norm, 'don hang') ||
      hasWordPhrase(norm, 'orders') ||
      hasWordPhrase(norm, 'so luong') ||
      hasWordPhrase(norm, 'sl') ||
      hasWordPhrase(norm, 'qty') ||
      hasWordPhrase(norm, 'quantity')
    ) {
      candidates.push({ col, score: 80, reason: `Khớp "${col.label}" (Số lượng)` });
    }
  }

  let warning: string | undefined;

  if (candidates.length === 0) {
    return {
      item: {
        status: 'thiếu',
        col: null,
        reason_vi: BUSINESS_ROLE_WARNINGS.MISSING_ORDERS,
      },
    };
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];

  if (candidates.length > 1) {
    const listStr = candidates.map((c) => `"${c.col.label}"`).join(', ');
    warning = BUSINESS_ROLE_WARNINGS.MULTIPLE_MATCHES('Số đơn', listStr, best.col.label);
  }

  return {
    item: {
      status: 'tìm thấy',
      col: best.col,
      reason_vi: best.reason,
    },
    warning,
  };
}

/**
 * Resolves the COGS column strictly.
 * Keywords: "gia von hang ban", "chi phi gia von", "cost of goods sold", "cost of goods", "gia von", "cogs", "tien von".
 * Exclusions: "doanh thu", "loi nhuan", "van chuyen", "quang cao", "marketing", "mat bang".
 * Must NOT match isolated "chi phi", "cost", "von".
 */
function resolveCogsColumn(measures: BusinessColumn[]): { item: ResolvedRoleItem; warning?: string } {
  const EXCLUSIONS = [
    'doanh thu',
    'loi nhuan',
    'chi phi marketing',
    'chi phi van chuyen',
    'van chuyen',
    'shipping',
    'quang cao',
    'ads',
    'marketing',
    'mat bang',
    'nhan su',
    'luong',
    'van hanh',
  ];

  const candidates: MatchCandidate[] = [];

  for (const col of measures) {
    const norm = normalizeRoleText(col.label);
    if (hasExclusion(norm, EXCLUSIONS)) continue;

    if (
      hasWordPhrase(norm, 'gia von hang ban') ||
      hasWordPhrase(norm, 'cost of goods sold') ||
      hasWordPhrase(norm, 'cost of goods') ||
      hasWordPhrase(norm, 'gvhb') ||
      hasWordPhrase(norm, 'chi phi gia von') ||
      hasWordPhrase(norm, 'chi phi von') ||
      hasWordPhrase(norm, 'chi phi nhap hang') ||
      hasWordPhrase(norm, 'gia thanh') ||
      hasWordPhrase(norm, 'chi phi san xuat')
    ) {
      candidates.push({ col, score: 100, reason: `Khớp chính xác "${col.label}" (Giá vốn hàng bán)` });
    } else if (hasWordPhrase(norm, 'gia nhap')) {
      candidates.push({ col, score: 90, reason: `Khớp "${col.label}" (Giá nhập)` });
    } else if (hasWordPhrase(norm, 'gia von') || hasWordPhrase(norm, 'cogs') || hasWordPhrase(norm, 'tien von')) {
      candidates.push({ col, score: 80, reason: `Khớp "${col.label}" (Giá vốn)` });
    }
  }

  let warning: string | undefined;

  if (candidates.length === 0) {
    return {
      item: {
        status: 'thiếu',
        col: null,
        reason_vi: BUSINESS_ROLE_WARNINGS.MISSING_COGS_ONLY,
      },
    };
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];

  if (candidates.length > 1) {
    const listStr = candidates.map((c) => `"${c.col.label}"`).join(', ');
    warning = BUSINESS_ROLE_WARNINGS.MULTIPLE_MATCHES('Giá vốn', listStr, best.col.label);
  }

  return {
    item: {
      status: 'tìm thấy',
      col: best.col,
      reason_vi: best.reason,
    },
    warning,
  };
}

/**
 * Resolves the Profit column strictly.
 * Primary: "loi nhuan gop", "gross profit", "lai gop".
 * Secondary (inferred): "loi nhuan", "profit" (without "gop"). Status becomes "suy luận".
 * Exclusions: "rong", "net", "thuan", "sau thue", "truoc thue", "ebit", "ebitda", "bien", "margin", "ty le", "doanh thu", "gia von".
 */
function resolveProfitColumn(measures: BusinessColumn[]): { item: ResolvedRoleItem; warning?: string } {
  const EXCLUSIONS = [
    'rong',
    'net',
    'thuan',
    'sau thue',
    'truoc thue',
    'ebit',
    'ebitda',
    'bien',
    'margin',
    'ty le',
    'doanh thu',
    'gia von',
  ];

  const candidates: MatchCandidate[] = [];

  for (const col of measures) {
    const norm = normalizeRoleText(col.label);
    if (hasExclusion(norm, EXCLUSIONS)) continue;

    if (
      hasWordPhrase(norm, 'loi nhuan gop') ||
      hasWordPhrase(norm, 'gross profit') ||
      hasWordPhrase(norm, 'lai gop')
    ) {
      candidates.push({ col, score: 100, reason: `Khớp chính xác "${col.label}" (Lợi nhuận gộp)` });
    } else if (hasWordPhrase(norm, 'loi nhuan') || hasWordPhrase(norm, 'profit')) {
      candidates.push({
        col,
        score: 50,
        reason: `Suy luận từ "${col.label}" (Lợi nhuận chung, không ghi rõ gộp)`,
        isInferred: true,
      });
    }
  }

  let warning: string | undefined;

  if (candidates.length === 0) {
    return {
      item: {
        status: 'thiếu',
        col: null,
        reason_vi: BUSINESS_ROLE_WARNINGS.MISSING_COGS_AND_PROFIT,
      },
    };
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];

  if (candidates.length > 1) {
    const listStr = candidates.map((c) => `"${c.col.label}"`).join(', ');
    warning = BUSINESS_ROLE_WARNINGS.MULTIPLE_MATCHES('Lợi nhuận gộp', listStr, best.col.label);
  }

  if (best.isInferred) {
    return {
      item: {
        status: 'suy luận',
        col: best.col,
        reason_vi: best.reason,
      },
      warning: warning || BUSINESS_ROLE_WARNINGS.PROFIT_INFERRED(best.col.label),
    };
  }

  return {
    item: {
      status: 'tìm thấy',
      col: best.col,
      reason_vi: best.reason,
    },
    warning,
  };
}

/**
 * Resolves a Dimension column (Channel, Region, Product) strictly.
 * No position-based fallbacks.
 */
function resolveDimensionColumn(
  dims: BusinessColumn[],
  keywords: string[],
  roleNameVi: string,
  missingWarning: string
): { item: ResolvedRoleItem; warning?: string } {
  const candidates: MatchCandidate[] = [];

  for (const col of dims) {
    const norm = normalizeRoleText(col.label);
    for (let i = 0; i < keywords.length; i++) {
      const kw = keywords[i];
      if (hasWordPhrase(norm, kw)) {
        candidates.push({
          col,
          score: 100 - i * 10,
          reason: `Khớp "${col.label}" (${roleNameVi})`,
        });
        break;
      }
    }
  }

  if (candidates.length === 0) {
    return {
      item: {
        status: 'thiếu',
        col: null,
        reason_vi: missingWarning,
      },
    };
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  let warning: string | undefined;
  if (candidates.length > 1) {
    const listStr = candidates.map((c) => `"${c.col.label}"`).join(', ');
    warning = BUSINESS_ROLE_WARNINGS.MULTIPLE_MATCHES(roleNameVi, listStr, best.col.label);
  }

  return {
    item: {
      status: 'tìm thấy',
      col: best.col,
      reason_vi: best.reason,
    },
    warning,
  };
}

/**
 * Resolves the Time column.
 * First checks if table has a column with role === 'time'.
 * Otherwise searches dimensions for time keywords.
 */
function resolveTimeColumn(table: BusinessTable): ResolvedRoleItem {
  const timeCol = table.columns.find((c) => c.role === 'time');
  if (timeCol) {
    return {
      status: 'tìm thấy',
      col: timeCol,
      reason_vi: `Cột thời gian từ bảng dữ liệu: "${timeCol.label}"`,
    };
  }

  const dims = table.columns.filter((c) => c.role === 'dimension');
  const TIME_EXCLUSIONS = ['thoi gian giao hang', 'giao hang'];
  const TIME_KEYWORDS = [
    'thang ban',
    'thoi gian ban',
    'thoi gian',
    'ky bao cao',
    'month',
    'thang',
    'ngay',
    'nam',
    'quy',
    'date',
    'year',
    'quarter',
    'time',
  ];
  for (const col of dims) {
    const norm = normalizeRoleText(col.label);
    if (hasExclusion(norm, TIME_EXCLUSIONS)) continue;
    if (TIME_KEYWORDS.some((kw) => hasWordPhrase(norm, kw))) {
      return {
        status: 'tìm thấy',
        col,
        reason_vi: `Khớp cột thời gian: "${col.label}"`,
      };
    }
  }

  return {
    status: 'thiếu',
    col: null,
    reason_vi: BUSINESS_ROLE_WARNINGS.MISSING_TIME,
  };
}

/**
 * Master Column Resolver for Business Table.
 * Enforces rules (a) through (g) of Prompt 1B-1 and 1B-1b.
 */
export function resolveBusinessRoles(table: BusinessTable): BusinessResolvedRoles {
  const measures = table.columns.filter((c) => c.role === 'measure') as Extract<BusinessColumn, { role: 'measure' }>[];
  const dims = table.columns.filter((c) => c.role === 'dimension') as Extract<BusinessColumn, { role: 'dimension' }>[];

  const warnings: string[] = [];

  // 1. Resolve direct columns
  const revenueResWrap = resolveRevenueColumn(measures);
  let revenueRes = revenueResWrap.item;
  if (revenueResWrap.warning) warnings.push(revenueResWrap.warning);

  const ordersResWrap = resolveOrdersColumn(measures);
  let ordersRes = ordersResWrap.item;
  if (ordersResWrap.warning) warnings.push(ordersResWrap.warning);

  const cogsResWrap = resolveCogsColumn(measures);
  let cogsRes = cogsResWrap.item;
  if (cogsResWrap.warning) warnings.push(cogsResWrap.warning);

  const profitResWrap = resolveProfitColumn(measures);
  let profitRes = profitResWrap.item;
  if (profitResWrap.warning) warnings.push(profitResWrap.warning);

  // 1b. Inferred Revenue fallback:
  // If revenue is missing but there is exactly 1 unassigned measure (without revenue exclusion keywords), infer it as Revenue with warning.
  // If 2 or more unassigned measures exist without keywords, revenue remains 'thiếu'.
  if (revenueRes.status === 'thiếu') {
    const revenueExclusions = [
      'gia von',
      'cost',
      'chi phi',
      'loi nhuan',
      'profit',
      'ty le',
      'bien',
      'margin',
      'tang truong',
      'growth',
      'don gia',
      'gia ban',
      'gia niem yet',
      'unit price',
      'price',
      'chiet khau',
      'thoi gian',
      'tinh trang',
      'ky hieu',
    ];
    const assignedCols = new Set([ordersRes.col, cogsRes.col, profitRes.col].filter(Boolean));
    const unassignedMeasures = measures.filter(
      (c) => !assignedCols.has(c) && !hasExclusion(normalizeRoleText(c.label), revenueExclusions)
    );
    if (unassignedMeasures.length === 1) {
      const single = unassignedMeasures[0];
      revenueRes = {
        status: 'suy luận',
        col: single,
        reason_vi: `Suy luận Doanh thu từ "${single.label}"`,
      };
      warnings.push(BUSINESS_ROLE_WARNINGS.REVENUE_INFERRED(single.label));
    }
  }

  // 2. Inter-metric inference rules (a), (b), (c)
  // (a) If profit missing but both revenue & cogs present: compute profit
  if (profitRes.status === 'thiếu' && revenueRes.status === 'tìm thấy' && cogsRes.status === 'tìm thấy') {
    profitRes = {
      status: 'tính ra',
      col: null,
      reason_vi: BUSINESS_ROLE_WARNINGS.PROFIT_COMPUTED,
    };
    warnings.push(BUSINESS_ROLE_WARNINGS.PROFIT_COMPUTED);
  }
  // (b) If cogs missing but both revenue & profit present:
  // Prompt 1B-1b H2/H4: Do NOT compute cogs = revenue - profit. Cogs remains missing/null.
  // Profit margin can still be calculated directly.
  else if (cogsRes.status === 'thiếu' && (profitRes.status === 'tìm thấy' || profitRes.status === 'suy luận')) {
    warnings.push(BUSINESS_ROLE_WARNINGS.MISSING_COGS_ONLY);
  }
  // (c) If both cogs and profit missing: both remain 'thiếu'
  else if (cogsRes.status === 'thiếu' && profitRes.status === 'thiếu') {
    warnings.push(BUSINESS_ROLE_WARNINGS.MISSING_COGS_AND_PROFIT);
  }

  // 3. Resolve Dimensions (Channel, Region, Product, Time)
  const channelResWrap = resolveDimensionColumn(
    dims,
    ['kenh ban hang', 'hinh thuc ban', 'nen tang', 'channel', 'kenh ban', 'kenh phan phoi', 'sales channel', 'kenh'],
    'Kênh bán',
    BUSINESS_ROLE_WARNINGS.MISSING_CHANNEL
  );
  const channelRes = channelResWrap.item;
  if (channelResWrap.warning) warnings.push(channelResWrap.warning);

  const regionResWrap = resolveDimensionColumn(
    dims,
    ['khu vuc', 'vung', 'mien', 'tinh thanh', 'thanh pho', 'chi nhanh', 'dia ban', 'region', 'city', 'area'],
    'Khu vực',
    BUSINESS_ROLE_WARNINGS.MISSING_REGION
  );
  const regionRes = regionResWrap.item;
  if (regionResWrap.warning) warnings.push(regionResWrap.warning);

  const productResWrap = resolveDimensionColumn(
    dims,
    [
      'mat hang',
      'du an',
      'mau xe',
      'dong xe',
      'model',
      'sku',
      'loai hang',
      'nhom hang',
      'danh muc',
      'ten san pham',
      'san pham',
      'product name',
      'product',
    ],
    'Sản phẩm',
    BUSINESS_ROLE_WARNINGS.MISSING_PRODUCT
  );
  const productRes = productResWrap.item;
  if (productResWrap.warning) warnings.push(productResWrap.warning);

  const timeRes = resolveTimeColumn(table);

  // 4. Content sanity checks (COGS all 0, Profit == Revenue for all rows)
  // Check: Giá vốn toàn bằng 0
  if (cogsRes.status === 'tìm thấy' && cogsRes.col && cogsRes.col.role === 'measure') {
    const vals = cogsRes.col.values;
    const isAllZero = vals.length > 0 && vals.every((v) => v === 0);
    if (isAllZero) {
      cogsRes.status = 'không đáng tin';
      cogsRes.col = null;
      cogsRes.reason_vi = BUSINESS_ROLE_WARNINGS.COGS_ALL_ZERO;
      warnings.push(BUSINESS_ROLE_WARNINGS.COGS_ALL_ZERO);
    }
  }

  // Check: Lợi nhuận gộp bằng doanh thu ở mọi dòng
  if (
    (revenueRes.status === 'tìm thấy' || revenueRes.status === 'suy luận') &&
    revenueRes.col &&
    revenueRes.col.role === 'measure' &&
    (profitRes.status === 'tìm thấy' || profitRes.status === 'suy luận') &&
    profitRes.col &&
    profitRes.col.role === 'measure'
  ) {
    const revVals = revenueRes.col.values;
    const profitVals = profitRes.col.values;
    const isProfitEqualsRev =
      revVals.length > 0 &&
      revVals.every((r, idx) => Math.abs(r - profitVals[idx]) < 0.0001 && r !== 0);

    if (isProfitEqualsRev) {
      profitRes.status = 'không đáng tin';
      profitRes.col = null;
      profitRes.reason_vi = BUSINESS_ROLE_WARNINGS.PROFIT_EQUALS_REVENUE;
      if (cogsRes.status === 'tìm thấy') {
        cogsRes.status = 'không đáng tin';
        cogsRes.col = null;
        cogsRes.reason_vi = BUSINESS_ROLE_WARNINGS.PROFIT_EQUALS_REVENUE;
      }
      warnings.push(BUSINESS_ROLE_WARNINGS.PROFIT_EQUALS_REVENUE);
    }
  }

  // 5. Append missing dimension warnings
  if (ordersRes.status === 'thiếu') {
    warnings.push(BUSINESS_ROLE_WARNINGS.MISSING_ORDERS);
  }
  if (productRes.status === 'thiếu') {
    warnings.push(BUSINESS_ROLE_WARNINGS.MISSING_PRODUCT);
  }
  if (channelRes.status === 'thiếu') {
    warnings.push(BUSINESS_ROLE_WARNINGS.MISSING_CHANNEL);
  }
  if (regionRes.status === 'thiếu') {
    warnings.push(BUSINESS_ROLE_WARNINGS.MISSING_REGION);
  }
  if (timeRes.status === 'thiếu') {
    warnings.push(BUSINESS_ROLE_WARNINGS.MISSING_TIME);
  }

  // Deduplicate warnings preserving order
  const uniqueWarnings = Array.from(new Set(warnings));

  return {
    revenue: revenueRes,
    cogs: cogsRes,
    profit: profitRes,
    orders: ordersRes,
    channel: channelRes,
    region: regionRes,
    product: productRes,
    time: timeRes,
    warnings: uniqueWarnings,
  };
}
