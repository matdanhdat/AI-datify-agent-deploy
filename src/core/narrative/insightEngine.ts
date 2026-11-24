// src/core/narrative/insightEngine.ts
// Bộ luật insight thuần hàm: nhận số đã tính, trả phát hiện (ý nghĩa, cơ hội/rủi ro, hành động).
// Không phụ thuộc kiểu dữ liệu của app; adapter ở phía app chuyển dữ liệu vào InsightInput.

export const INSIGHT_THRESHOLDS = {
  CONC_WATCH_SHARE: 0.35,
  CONC_RISK_SHARE: 0.5,
  MARGIN_HIGH_PP: 3.0,
  MARGIN_LOW_PP: 2.0,
  SHARE_SMALL: 0.15,
  SHARE_LARGE: 0.25,
  MOM_STRONG: 0.1,
  MIN_MONTHS_FOR_TREND: 6,
  UNLABELED_SHARE: 0.02,
  MAX_FINDINGS: 6,
  MAX_ACTIONS_PRIORITY: 3,
} as const;

export const CHECK_AFTER_VALUES = ['1 tuần', '2 tuần', '4 tuần', '8 tuần', '1 quý'] as const;
export type CheckAfter = (typeof CHECK_AFTER_VALUES)[number];
export type FindingKind = 'rủi ro' | 'cơ hội' | 'theo dõi' | 'dữ liệu';
export type RuleId =
  | 'R-LOW-MARGIN-HIGH-SHARE'
  | 'R-HIGH-MARGIN-LOW-SHARE'
  | 'R-MATRIX'
  | 'R-MOM'
  | 'R-CONC'
  | 'R-UNLABELED'
  | 'R-NO-MARGIN'
  | 'R-FEW-ROWS';
export type DimensionLabel = 'kênh' | 'sản phẩm' | 'khu vực';

export interface GroupStat { name: string; revenue: number; profit?: number | null }
export interface MatrixCell { channel: string; product: string; revenue: number; profit: number }
export interface MonthStat { label: string; revenue: number }

export interface InsightInput {
  rowCount: number;
  totalRevenue: number;
  /** null hoặc undefined = file không có giá vốn/lợi nhuận. */
  totalProfit?: number | null;
  channels?: GroupStat[];
  products?: GroupStat[];
  regions?: GroupStat[];
  months?: MonthStat[];
  matrix?: MatrixCell[];
  /** id chỉ số catalog đang được chọn (đã tính được). */
  selectedMetricIds: string[];
}

export interface InsightAction {
  what: string;
  /** id catalog thật nằm trong selectedMetricIds; null chỉ cho phát hiện kind 'dữ liệu'. */
  kpiMetricId: string | null;
  checkAfter: CheckAfter;
}
export interface InsightEvidence { key: string; text: string }

export interface InsightFinding {
  ruleId: RuleId;
  dimension?: DimensionLabel;
  kind: FindingKind;
  priority: number;
  title: string;
  evidence: InsightEvidence[];
  headline: string;
  meaning: string;
  opportunityRisk: string;
  hypothesis?: string;
  actions: InsightAction[];
  /** false = chỉ do code viết, AI không được viết lại. */
  aiRewrite: boolean;
  relatedMetricIds: string[];
}

export interface InsightResult {
  findings: InsightFinding[];
  headline: InsightFinding[];
  priorityActions: Array<InsightAction & { ruleId: RuleId }>;
  emptyMessage: string | null;
}

export const INSIGHT_EMPTY_MESSAGE =
  'Chưa có phát hiện nổi bật với các chỉ số đã chọn; hãy chọn thêm chỉ số theo kênh, sản phẩm hoặc thời gian để có nhận định sâu hơn.';
export const NO_MARGIN_SENTENCE =
  'Chưa đánh giá được hiệu quả lợi nhuận vì file chưa có cột giá vốn hoặc lợi nhuận gộp; bổ sung cột này để biết kênh/sản phẩm nào thực sự có lãi.';

const TH = INSIGHT_THRESHOLDS;
const EPS = 1e-9;
const UNLABELED_RE = /^(không xác định|\(?trống\)?|chưa phân loại|unknown|n\/a)$/;

export const isUnlabeled = (name: string): boolean =>
  UNLABELED_RE.test(name.trim().toLowerCase().normalize('NFC'));

const fmtPct = (v: number): string =>
  `${v.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const fmtMoney = (v: number): string => `${Math.round(v).toLocaleString('vi-VN')} VND`;
const r2 = (v: number): number => Math.round(v * 100) / 100;
const cap = (s: string): string => (s.length ? s[0].toUpperCase() + s.slice(1) : s);
const joinVi = (a: string[]): string =>
  a.length <= 1 ? (a[0] ?? '') : `${a.slice(0, -1).join(', ')} và ${a[a.length - 1]}`;
const has = (sel: string[], ids: string[]): boolean => ids.every((i) => sel.includes(i));
const firstSelected = (sel: string[], pref: string[]): string | null =>
  pref.find((p) => sel.includes(p)) ?? null;
function act(sel: string[], what: string, pref: string[], check: CheckAfter): InsightAction | null {
  const k = firstSelected(sel, pref);
  return k ? { what, kpiMetricId: k, checkAfter: check } : null;
}
function compact<X>(xs: Array<X | null>): X[] {
  return xs.filter((x): x is X => x !== null);
}

interface Dim {
  label: DimensionLabel;
  pick: (i: InsightInput) => GroupStat[] | undefined;
  revKpi: string;
  marginKpi: string | null;
}
const DIMS: Dim[] = [
  { label: 'kênh', pick: (i) => i.channels, revKpi: 'revenue_by_channel', marginKpi: 'margin_by_channel' },
  { label: 'sản phẩm', pick: (i) => i.products, revKpi: 'revenue_by_product', marginKpi: 'margin_by_product' },
  { label: 'khu vực', pick: (i) => i.regions, revKpi: 'revenue_by_region', marginKpi: null },
];

function overallMargin(i: InsightInput): number | null {
  if (i.totalProfit == null || !(i.totalRevenue > 0)) return null;
  return (i.totalProfit / i.totalRevenue) * 100;
}

// ---- R-LOW-MARGIN-HIGH-SHARE (90) và R-HIGH-MARGIN-LOW-SHARE (80) ----
function ruleMargin(input: InsightInput, overall: number | null, mode: 'low' | 'high'): InsightFinding[] {
  if (overall === null) return [];
  const sel = input.selectedMetricIds;
  const low = mode === 'low';
  const out: InsightFinding[] = [];
  for (const d of DIMS) {
    const groups = d.pick(input);
    if (!groups || !d.marginKpi) continue;
    if (!has(sel, [d.marginKpi, d.revKpi, 'gross_margin'])) continue;
    const total = groups.reduce((s, g) => s + g.revenue, 0);
    if (!(total > 0)) continue;
    const rows = groups
      .filter((g) => !isUnlabeled(g.name) && g.revenue > 0 && g.profit != null)
      .map((g) => ({ name: g.name, share: g.revenue / total, margin: ((g.profit as number) / g.revenue) * 100 }));
    const hit = rows.filter((r) =>
      low
        ? r2(overall - r.margin) >= TH.MARGIN_LOW_PP && r.share >= TH.SHARE_LARGE - EPS
        : r2(r.margin - overall) >= TH.MARGIN_HIGH_PP && r.share <= TH.SHARE_SMALL + EPS,
    );
    if (hit.length === 0) continue;
    const best = [...rows].sort((a, b) => b.margin - a.margin)[0];
    const names = joinVi(hit.map((h) => h.name));
    const evidence: InsightEvidence[] = hit.map((h) => ({
      key: `${d.label}:${h.name}`,
      text: `${cap(d.label)} ${h.name}: chiếm ${fmtPct(h.share * 100)} doanh thu, biên ${fmtPct(h.margin)} (mức chung ${fmtPct(overall)}).`,
    }));
    evidence.push({ key: `best:${d.label}`, text: `Biên cao nhất trong ${d.label}: ${best.name}, ${fmtPct(best.margin)}.` });
    const actions = low
      ? compact([
          act(sel, `Rà soát giá bán, chiết khấu và giá nhập của ${names}; lấy ${best.name} (biên ${fmtPct(best.margin)}) làm mốc tham chiếu.`, [d.marginKpi, 'gross_margin'], '4 tuần'),
          act(sel, `Thử điều chỉnh giá hoặc giảm chiết khấu ở một phần nhỏ đơn hàng của ${names}, rồi so biên trước và sau.`, [d.marginKpi, 'gross_margin'], '8 tuần'),
        ])
      : compact([
          act(sel, `Thử đẩy bán ${names}: bán kèm với nhóm bán chạy, ưu tiên trưng bày hoặc quảng bá ở nơi có nhiều khách nhất.`, [d.revKpi, d.marginKpi], '4 tuần'),
          act(sel, `Theo dõi tỷ trọng doanh thu và biên của ${names} hằng tuần để biết đẩy bán có làm biên giảm không.`, [d.marginKpi, 'gross_margin'], '2 tuần'),
        ]);
    out.push({
      ruleId: low ? 'R-LOW-MARGIN-HIGH-SHARE' : 'R-HIGH-MARGIN-LOW-SHARE',
      dimension: d.label,
      kind: low ? 'rủi ro' : 'cơ hội',
      priority: low ? 90 : 80,
      title: low ? `${cap(d.label)} lớn nhưng biên thấp hơn mức chung` : `${cap(d.label)} lãi tốt nhưng quy mô còn nhỏ`,
      evidence,
      headline: low
        ? `${cap(d.label)} ${names} bán nhiều nhưng biên thấp hơn mức chung, đang kéo biên toàn doanh nghiệp xuống.`
        : `${cap(d.label)} ${names} lãi tốt hơn mức chung nhưng mới chiếm phần nhỏ doanh thu.`,
      meaning: low
        ? 'Nhóm này chiếm tỷ trọng lớn nên chỉ cần biên nhích lên là lợi nhuận chung cải thiện rõ hơn so với các nhóm nhỏ.'
        : 'Nhóm này tạo lãi tốt trên mỗi đồng doanh thu; nếu tăng được tỷ trọng thì biên chung sẽ được kéo lên.',
      opportunityRisk: low
        ? 'Rủi ro: lợi nhuận chung phụ thuộc nhiều vào giá bán và chiết khấu của nhóm biên thấp này.'
        : 'Cơ hội: mở rộng nhóm có lãi tốt thay vì chỉ tăng nhóm có biên thấp.',
      hypothesis: low
        ? 'Có thể do giá bán thấp, chiết khấu nhiều hoặc giá nhập cao hơn các nhóm khác; cần kiểm tra trước khi kết luận.'
        : 'Có thể nhóm này ít được giới thiệu hoặc ít được trưng bày; cần thử nghiệm nhỏ trước khi kết luận.',
      actions,
      aiRewrite: true,
      relatedMetricIds: [d.marginKpi, d.revKpi, 'gross_margin'],
    });
  }
  return out;
}

// ---- R-MATRIX (70) ----
function ruleMatrix(i: InsightInput): InsightFinding[] {
  const sel = i.selectedMetricIds;
  if (!i.matrix || !has(sel, ['channel_product_matrix'])) return [];
  const cells = i.matrix
    .filter((c) => !isUnlabeled(c.channel) && !isUnlabeled(c.product) && c.revenue > 0)
    .map((c) => ({ name: `${c.channel} × ${c.product}`, m: r2((c.profit / c.revenue) * 100) }));
  if (cells.length < 2) return [];
  const max = Math.max(...cells.map((c) => c.m));
  const min = Math.min(...cells.map((c) => c.m));
  if (max === min) return [];
  const top = cells.filter((c) => c.m === max);
  const lowc = cells.filter((c) => c.m === min);
  const topNames = joinVi(top.map((c) => c.name));
  const lowNames = joinVi(lowc.map((c) => c.name));
  const topTie = top.length > 1 ? ' (hòa)' : '';
  const lowTie = lowc.length > 1 ? ' (hòa)' : '';
  return [{
    ruleId: 'R-MATRIX',
    kind: 'theo dõi',
    priority: 70,
    title: 'Biên theo tổ hợp kênh và sản phẩm',
    evidence: [
      ...top.map((c) => ({ key: `matrix:${c.name}`, text: `Biên ${c.name}: ${fmtPct(c.m)}${topTie ? ' (cao nhất, hòa)' : ' (cao nhất)'}.` })),
      ...lowc.map((c) => ({ key: `matrix:${c.name}`, text: `Biên ${c.name}: ${fmtPct(c.m)}${lowTie ? ' (thấp nhất, hòa)' : ' (thấp nhất)'}.` })),
    ],
    headline: `Trong ma trận kênh × sản phẩm, ${topNames}${topTie} có biên cao nhất; ${lowNames}${lowTie} có biên thấp nhất.`,
    meaning: 'Cùng một sản phẩm có thể lãi khác nhau tùy kênh bán; tổ hợp biên cao là nơi nên nhân rộng, tổ hợp biên thấp cần xem lại giá hoặc chiết khấu.',
    opportunityRisk: 'Cơ hội: nhân rộng tổ hợp biên cao. Rủi ro: tổ hợp biên thấp nếu bán nhiều sẽ kéo lợi nhuận chung xuống.',
    hypothesis: 'Chênh lệch có thể do chi phí kênh, mức chiết khấu hoặc nhóm khách hàng khác nhau; cần đối chiếu trước khi kết luận.',
    actions: compact([
      act(sel, `Ưu tiên nguồn lực bán hàng cho ${topNames}; rà soát giá và chiết khấu của ${lowNames}.`, ['channel_product_matrix', 'margin_by_channel'], '4 tuần'),
    ]),
    aiRewrite: true,
    relatedMetricIds: ['channel_product_matrix', 'margin_by_channel', 'margin_by_product'],
  }];
}

// ---- R-MOM (60) ----
function ruleMom(i: InsightInput): InsightFinding[] {
  const sel = i.selectedMetricIds;
  if (!i.months || !has(sel, ['revenue_growth', 'revenue_by_month'])) return [];
  const m = [...i.months].sort((a, b) => a.label.localeCompare(b.label));
  if (m.length < 2) return [];
  const last = m[m.length - 1];
  const prev = m[m.length - 2];
  if (!(prev.revenue > 0)) return [];
  const mom = (last.revenue - prev.revenue) / prev.revenue;
  if (Math.abs(mom) < TH.MOM_STRONG - EPS) return [];
  const up = mom > 0;
  const short = m.length < TH.MIN_MONTHS_FOR_TREND;
  const actions = compact([
    act(sel, `Đối chiếu ${last.label} với kế hoạch bán hàng, chiến dịch và hàng tồn để biết vì sao doanh thu ${up ? 'tăng' : 'giảm'} trước khi nhân rộng hoặc xử lý.`, ['revenue_growth', 'revenue_by_month'], '2 tuần'),
    up
      ? act(sel, 'Nếu mức tăng đến từ một chiến dịch hoặc kênh cụ thể, thử lặp lại cách làm đó ở kỳ kế tiếp và so sánh.', ['revenue_growth', 'revenue_by_month'], '4 tuần')
      : act(sel, 'Lập kế hoạch kéo doanh thu về mức kỳ trước: ưu tiên nhóm hoặc kênh bán chính.', ['revenue_by_month', 'revenue_growth'], '4 tuần'),
  ]);
  return [{
    ruleId: 'R-MOM',
    kind: 'theo dõi',
    priority: 60,
    title: up ? 'Doanh thu tăng mạnh so với kỳ trước' : 'Doanh thu giảm mạnh so với kỳ trước',
    evidence: [
      { key: `mom:${last.label}`, text: `Doanh thu ${last.label}: ${fmtMoney(last.revenue)}, ${up ? 'tăng' : 'giảm'} ${fmtPct(Math.abs(mom) * 100)} (${fmtMoney(Math.abs(last.revenue - prev.revenue))}) so với ${prev.label}.` },
      { key: 'months:count', text: `Dữ liệu có ${m.length} kỳ tháng.` },
    ],
    headline: `Doanh thu kỳ gần nhất ${up ? 'tăng' : 'giảm'} mạnh so với kỳ trước.`,
    meaning: short
      ? 'Mới có ít kỳ dữ liệu nên chưa đủ kỳ để kết luận xu hướng; biến động này có thể chỉ là dao động ngắn hạn.'
      : 'Biến động lớn so với kỳ trước; cần xem đây là xu hướng thật hay chỉ là yếu tố mùa vụ.',
    opportunityRisk: up
      ? 'Cơ hội: nếu mức tăng đến từ cách làm lặp lại được thì có thể nhân rộng.'
      : 'Rủi ro: nếu đà giảm kéo dài, doanh thu các kỳ sau tiếp tục suy yếu.',
    hypothesis: 'Nguyên nhân có thể là chiến dịch khuyến mãi, mùa vụ hoặc thay đổi nguồn hàng; cần đối chiếu trước khi kết luận.',
    actions,
    aiRewrite: true,
    relatedMetricIds: ['revenue_growth', 'revenue_by_month'],
  }];
}

// ---- R-CONC (50) ----
function ruleConc(i: InsightInput): InsightFinding[] {
  const sel = i.selectedMetricIds;
  const out: InsightFinding[] = [];
  for (const d of DIMS) {
    const groups = d.pick(i);
    if (!groups || !has(sel, [d.revKpi])) continue;
    const total = groups.reduce((s, g) => s + g.revenue, 0);
    const ranked = groups.filter((g) => !isUnlabeled(g.name) && g.revenue > 0).sort((a, b) => b.revenue - a.revenue);
    if (!(total > 0) || ranked.length < 2) continue;
    const topRev = Math.round(ranked[0].revenue);
    const tops = ranked.filter((g) => Math.round(g.revenue) === topRev);
    const share = ranked[0].revenue / total;
    if (share < TH.CONC_WATCH_SHARE - EPS || share >= 1) continue;
    const second = ranked.find((g) => Math.round(g.revenue) !== topRev);
    const risk = share >= TH.CONC_RISK_SHARE - EPS;
    const names = joinVi(tops.map((g) => g.name));
    const tie = tops.length > 1 ? ' (hòa)' : '';
    const evidence: InsightEvidence[] = tops.map((g) => ({
      key: `${d.label}:${g.name}`,
      text: `${cap(d.label)} ${g.name}: ${fmtMoney(g.revenue)}, chiếm ${fmtPct((g.revenue / total) * 100)} doanh thu${tie}.`,
    }));
    if (second) {
      evidence.push({ key: `${d.label}:${second.name}`, text: `${cap(d.label)} ${second.name}: ${fmtMoney(second.revenue)}, chiếm ${fmtPct((second.revenue / total) * 100)} doanh thu.` });
    }
    out.push({
      ruleId: 'R-CONC',
      dimension: d.label,
      kind: risk ? 'rủi ro' : 'theo dõi',
      priority: 50,
      title: `Mức phụ thuộc vào ${d.label} dẫn đầu`,
      evidence,
      headline: `${cap(d.label)} ${names}${tie} đang dẫn đầu và chiếm phần lớn doanh thu.`,
      meaning: `Doanh thu phụ thuộc nhiều vào ${d.label} này; nếu nó biến động thì doanh thu chung lệch theo.`,
      opportunityRisk: risk
        ? `Rủi ro cao: phụ thuộc quá lớn vào một ${d.label}.`
        : `Cần theo dõi mức phụ thuộc vào ${d.label} dẫn đầu để không bị động khi có biến động.`,
      hypothesis: undefined,
      actions: compact([
        act(sel, `Giữ ổn định ${d.label} ${names}${second ? ` và thử nuôi ${d.label} ${second.name} bằng ưu đãi hoặc quảng bá riêng` : ''} để giảm phụ thuộc.`, [d.revKpi], '8 tuần'),
      ]),
      aiRewrite: true,
      relatedMetricIds: [d.revKpi],
    });
  }
  return out;
}

// ---- R-UNLABELED (20, chỉ do code viết) ----
function ruleUnlabeled(i: InsightInput): InsightFinding[] {
  const sel = i.selectedMetricIds;
  const evidence: InsightEvidence[] = [];
  const kpis: string[] = [];
  const labels: string[] = [];
  for (const d of DIMS) {
    const groups = d.pick(i);
    if (!groups || !has(sel, [d.revKpi])) continue;
    const total = groups.reduce((s, g) => s + g.revenue, 0);
    if (!(total > 0)) continue;
    const un = groups.filter((g) => isUnlabeled(g.name));
    const rev = un.reduce((s, g) => s + g.revenue, 0);
    if (rev / total >= TH.UNLABELED_SHARE - EPS && rev > 0) {
      evidence.push({ key: `unlabeled:${d.label}`, text: `${cap(d.label)}: nhóm chưa có nhãn chiếm ${fmtPct((rev / total) * 100)} doanh thu.` });
      kpis.push(d.revKpi);
      labels.push(d.label);
    }
  }
  if (evidence.length === 0) return [];
  return [{
    ruleId: 'R-UNLABELED',
    kind: 'dữ liệu',
    priority: 20,
    title: 'Một phần doanh thu chưa có nhãn phân loại',
    evidence,
    headline: `Một phần doanh thu chưa có nhãn theo ${joinVi(labels)}.`,
    meaning: 'Phần doanh thu này không quy được về nhóm cụ thể nên phân tích theo nhóm kém chính xác hơn.',
    opportunityRisk: 'Rủi ro: kết luận theo nhóm có thể lệch nếu phần chưa nhãn thuộc về một nhóm lớn.',
    actions: [{
      what: 'Bổ sung nhãn còn thiếu trong file gốc rồi nạp lại để kết quả theo nhóm chính xác hơn.',
      kpiMetricId: kpis[0] ?? null,
      checkAfter: '1 tuần',
    }],
    aiRewrite: false,
    relatedMetricIds: kpis,
  }];
}

// ---- R-NO-MARGIN (15, chỉ do code viết) và R-FEW-ROWS (10, chỉ do code viết) ----
function ruleNoMargin(): InsightFinding {
  return {
    ruleId: 'R-NO-MARGIN',
    kind: 'dữ liệu',
    priority: 15,
    title: 'Thiếu dữ liệu giá vốn hoặc lợi nhuận',
    evidence: [],
    headline: NO_MARGIN_SENTENCE,
    meaning: NO_MARGIN_SENTENCE,
    opportunityRisk: 'Rủi ro: tăng doanh thu ở nhóm không lãi vẫn có thể làm lợi nhuận giảm.',
    actions: [{ what: 'Bổ sung cột giá vốn hoặc lợi nhuận gộp vào file rồi phân tích lại.', kpiMetricId: null, checkAfter: '1 tuần' }],
    aiRewrite: false,
    relatedMetricIds: [],
  };
}
function ruleFewRows(i: InsightInput): InsightFinding {
  const s = `Mẫu ít (${i.rowCount} dòng), kết luận chỉ mang tính tham khảo; nên kiểm chứng thêm trước khi hành động.`;
  return {
    ruleId: 'R-FEW-ROWS',
    kind: 'dữ liệu',
    priority: 10,
    title: 'Số dòng dữ liệu ít',
    evidence: [{ key: 'rows:count', text: `Dữ liệu có ${i.rowCount} dòng sau làm sạch.` }],
    headline: s,
    meaning: s,
    opportunityRisk: 'Rủi ro: một vài dòng bất thường có thể làm lệch kết quả.',
    actions: [{ what: 'Bổ sung thêm dữ liệu của các kỳ khác rồi phân tích lại trước khi ra quyết định lớn.', kpiMetricId: null, checkAfter: '2 tuần' }],
    aiRewrite: false,
    relatedMetricIds: [],
  };
}

export function runInsightRules(input: InsightInput): InsightResult {
  const overall = overallMargin(input);
  const all: InsightFinding[] = [
    ...ruleMargin(input, overall, 'low'),
    ...ruleMargin(input, overall, 'high'),
    ...ruleMatrix(input),
    ...ruleMom(input),
    ...ruleConc(input),
    ...ruleUnlabeled(input),
    ...(overall === null ? [ruleNoMargin()] : []),
    ...(input.rowCount < 10 ? [ruleFewRows(input)] : []),
  ];
  const findings = all
    .map((f, idx) => ({ f, idx }))
    .sort((a, b) => b.f.priority - a.f.priority || a.idx - b.idx)
    .map((x) => x.f)
    .slice(0, TH.MAX_FINDINGS);
  const core = findings.filter((f) => f.kind !== 'dữ liệu');
  const headline = (core.length >= 3 ? core : findings).slice(0, 3);
  const priorityActions: Array<InsightAction & { ruleId: RuleId }> = [];
  const seen = new Set<string>();
  for (const f of findings) {
    const a = f.actions[0];
    if (!a) continue;
    const key = `${a.kpiMetricId ?? 'none'}|${a.what}`;
    const kpiKey = a.kpiMetricId ?? `none:${f.ruleId}`;
    if (seen.has(key) || seen.has(kpiKey)) continue;
    seen.add(key);
    seen.add(kpiKey);
    priorityActions.push({ ...a, ruleId: f.ruleId });
    if (priorityActions.length >= TH.MAX_ACTIONS_PRIORITY) break;
  }
  return { findings, headline, priorityActions, emptyMessage: findings.length === 0 ? INSIGHT_EMPTY_MESSAGE : null };
}
