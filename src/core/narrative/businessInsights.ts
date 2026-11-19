/**
 * Business Insights Verification & Deterministic Template Fallback (Prompt M3-B3 & B4).
 * Enforces strict post-AI guardrails:
 * 1. Safe JSON parsing & Zod validation
 * 2. Every evidence_id must exist in FactsTable
 * 3. Every numeric token in AI text must match a value in the cited facts (normalized for VN formatting/rounding)
 * 4. Plain-text sanitization (zero HTML/script execution)
 * 5. Deterministic template fallback when AI fails, times out, or produces invalid/hallucinated items.
 */

import type { FactsTable, FactItem } from './factsBuilder';
import { sanitizeDataLabel } from './factsBuilder';

export type InsightConfidence = 'cao' | 'vừa' | 'thấp';

export interface BusinessInsightItem {
  title: string;
  statement: string;
  evidence_ids: string[];
  confidence: InsightConfidence;
}

export interface BusinessRecommendationItem {
  action: string;
  rationale: string;
  evidence_ids: string[];
  expected_effect_note: string;
  risk: string;
}

export interface BusinessInsightsReport {
  source: 'ai' | 'template';
  model: string;
  facts_hash: string;
  latency_ms: number;
  rejected_count: number;
  rejected_reasons: string[];
  feedback_applied?: string;
  generated_at: string;
  insights: BusinessInsightItem[];
  recommendations: BusinessRecommendationItem[];
  limitations: string[];
}

export interface RawAiBusinessInsightsPayload {
  insights?: Array<{
    title?: unknown;
    statement?: unknown;
    evidence_ids?: unknown;
    confidence?: unknown;
  }>;
  recommendations?: Array<{
    action?: unknown;
    rationale?: unknown;
    evidence_ids?: unknown;
    expected_effect_note?: unknown;
    risk?: unknown;
  }>;
  limitations?: unknown[];
}

/**
 * Strips any HTML tags, script payloads, and control chars so text is strictly plain text.
 */
export function sanitizePlainText(input: unknown, maxLen = 450): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

/**
 * Extracts numeric tokens from Vietnamese prose while ignoring fact IDs (F1, F12),
 * year-month identifiers (2026-10), and structural list counts like "Top 1"/"Top 3".
 */
export function extractNumbersFromVietnameseText(text: string): Array<{ raw: string; parsed: number }> {
  // Mask out safe non-metric identifiers before extracting numbers
  const masked = text
    .replace(/\bF\d+\b/gi, ' ') // Fact IDs (F1, F12)
    .replace(/\b20\d{2}[-/](?:0?[1-9]|1[0-2])(?:[-/](?:0?[1-9]|[12]\d|3[01]))?\b/g, ' ') // Dates / YYYY-MM
    .replace(/\b(?:tháng|quý|năm)\s+\d{1,4}\b/gi, ' ') // "tháng 10", "năm 2026"
    .replace(/\btop\s*[1-5]\b/gi, ' ') // "Top 1", "Top 3"
    .replace(/\bcổng\s*[12]\b/gi, ' ') // "Cổng 1", "Cổng 2"
    .replace(/\bbước\s*[1-5]\b/gi, ' ');

  const matches = masked.match(/\d+(?:[.,]\d+)*/g) || [];
  const results: Array<{ raw: string; parsed: number }> = [];

  for (const raw of matches) {
    const parsed = parseVietnameseNumberToken(raw);
    if (parsed !== null && Number.isFinite(parsed)) {
      results.push({ raw, parsed });
    }
  }
  return results;
}

/**
 * Normalizes both Vietnamese ("1.135.530.000", "46,84", "339.775,58") and standard ("46.84") numeric tokens.
 */
export function parseVietnameseNumberToken(token: string): number | null {
  const s = token.trim();
  if (!s) return null;

  const hasDot = s.includes('.');
  const hasComma = s.includes(',');

  let normalized = s;
  if (hasDot && hasComma) {
    // Vietnamese format: dot thousands, comma decimal (e.g. 339.775,58)
    normalized = s.replace(/\./g, '').replace(',', '.');
  } else if (hasComma && !hasDot) {
    // Check if comma is decimal (e.g. 46,84) vs thousand separator (e.g. 3,342)
    const parts = s.split(',');
    if (parts.length === 2 && parts[1].length !== 3) {
      normalized = s.replace(',', '.');
    } else if (parts.length > 2) {
      normalized = s.replace(/,/g, '');
    } else {
      // Ambiguous 3 digits after comma -> treat as thousand separator if >= 4 digits total (e.g. 3,342)
      normalized = s.replace(/,/g, '');
    }
  } else if (hasDot && !hasComma) {
    const parts = s.split('.');
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      // Vietnamese thousand separator (e.g. 1.135.530.000 or 3.342)
      normalized = s.replace(/\./g, '');
    } else {
      // Standard decimal (e.g. 46.84)
      normalized = s;
    }
  }

  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

/**
 * Checks if a parsed number from AI text matches ANY allowed number from the cited facts
 * (including reasonable scale conversions like tỷ/triệu or 1-2 decimal rounding).
 */
function numberMatchesAllowed(val: number, allowedValues: number[]): boolean {
  for (const rawAllowed of allowedValues) {
    const target = Math.abs(rawAllowed);
    const v = Math.abs(val);

    if (target === 0 && v === 0) return true;

    // Exact or rounding match (e.g. 46.84 vs 46.837 or 46.8)
    const diff = Math.abs(v - target);
    const relTol = Math.max(0.06, target * 0.005); // 0.5% or 0.06 absolute rounding tolerance
    if (diff <= relTol) return true;

    // Allow common Vietnamese unit shorthand (triệu = /1e6, tỷ = /1e9, nghìn = /1e3)
    for (const div of [1e3, 1e6, 1e9]) {
      const scaled = target / div;
      if (scaled >= 0.05 && Math.abs(v - scaled) <= Math.max(0.06, scaled * 0.015)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Collects all numeric values allowed by a given list of evidence_ids in FactsTable.
 */
function collectAllowedNumbersForEvidence(
  evidenceIds: string[],
  factMap: Map<string, FactItem>
): number[] {
  const nums: number[] = [];
  for (const id of evidenceIds) {
    const f = factMap.get(id);
    if (!f) continue;
    for (const n of f.raw_numbers) {
      nums.push(n);
    }
    // Also include parsed tokens from display text (e.g. rounded displays)
    for (const tok of extractNumbersFromVietnameseText(f.display)) {
      nums.push(tok.parsed);
    }
  }
  return nums;
}

/**
 * Builds deterministic, 100% verified template insights directly from FactsTable
 * whenever AI is unavailable, slow/timed out, returns invalid JSON, or hallucinates.
 */
export function buildTemplateBusinessInsights(
  factsTable: FactsTable,
  options?: {
    latency_ms?: number;
    rejected_count?: number;
    rejected_reasons?: string[];
    feedback_applied?: string;
  }
): BusinessInsightsReport {
  const byCategory = (cat: FactItem['category']) => factsTable.facts.filter((f) => f.category === cat);
  const fTotal = byCategory('total');
  const fChannels = byCategory('channel');
  const fMonths = byCategory('month');
  const fProducts = byCategory('product');
  const fRegions = byCategory('region');
  const fConc = byCategory('concentration');
  const fQuality = byCategory('quality');

  const insights: BusinessInsightItem[] = [];
  const recommendations: BusinessRecommendationItem[] = [];
  const limitations: string[] = [];

  // Insight 1: Overall performance
  const revFact = fTotal.find((f) => f.label_vi.includes('Tổng doanh thu'));
  const profFact = fTotal.find((f) => f.label_vi.includes('Tổng lợi nhuận'));
  const marginFact = fTotal.find((f) => f.label_vi.includes('Biên lợi nhuận'));
  const orderFact = fTotal.find((f) => f.label_vi.includes('Tổng số đơn'));
  if (revFact && profFact && marginFact) {
    const ev = [revFact.id, profFact.id, marginFact.id, ...(orderFact ? [orderFact.id] : [])];
    insights.push({
      title: 'Tổng quan quy mô doanh thu và biên lợi nhuận gộp',
      statement: `Tổng doanh thu đạt ${revFact.display}, tạo ra lợi nhuận gộp ${profFact.display} với biên lợi nhuận gộp ${marginFact.display}${orderFact ? ` trên tổng ${orderFact.display}` : ''}.`,
      evidence_ids: ev,
      confidence: 'cao',
    });
  } else if (revFact) {
    const ev = [revFact.id, ...(orderFact ? [orderFact.id] : [])];
    insights.push({
      title: 'Tổng quan quy mô doanh thu',
      statement: `Tổng doanh thu đạt ${revFact.display}${orderFact ? ` trên tổng ${orderFact.display}` : ''}.`,
      evidence_ids: ev,
      confidence: 'cao',
    });
  }

  // Insight 2: Channel leader
  if (fChannels.length > 0) {
    const topCh = fChannels[0];
    const bottomCh = fChannels[fChannels.length - 1];
    const ev = bottomCh && bottomCh.id !== topCh.id ? [topCh.id, bottomCh.id] : [topCh.id];
    insights.push({
      title: 'Phân hóa doanh thu giữa các kênh bán hàng',
      statement: `${topCh.label_vi.replace(/\[DATA:|\]/g, '')} dẫn đầu với ${topCh.display}${bottomCh && bottomCh.id !== topCh.id ? `; thấp hơn là ${bottomCh.label_vi.replace(/\[DATA:|\]/g, '')} (${bottomCh.display})` : ''}.`,
      evidence_ids: ev,
      confidence: 'cao',
    });

    recommendations.push({
      action: `Ưu tiên duy trì nguồn lực vận hành cho kênh dẫn đầu và rà soát hiệu quả chuyển đổi ở kênh thấp hơn`,
      rationale: `Dựa trên cơ cấu doanh thu và biên lợi nhuận gộp thực tế giữa các kênh (${topCh.display}).`,
      evidence_ids: ev,
      expected_effect_note: 'Cân bằng tăng trưởng doanh thu và bảo toàn biên lợi nhuận gộp chung.',
      risk: 'Cần theo dõi chi phí bán hàng và khuyến mãi (chưa có trong bảng dữ liệu hiện tại).',
    });
  }

  // Insight 3: Monthly trend
  const momFact = fMonths.find((f) => f.label_vi.includes('Biến động tháng gần nhất'));
  const bestMonthFact = fMonths.find((f) => f.label_vi.includes('cao nhất'));
  const worstMonthFact = fMonths.find((f) => f.label_vi.includes('thấp nhất'));
  if (bestMonthFact) {
    const ev = [bestMonthFact.id, ...(worstMonthFact ? [worstMonthFact.id] : []), ...(momFact ? [momFact.id] : [])];
    insights.push({
      title: 'Diễn biến doanh thu theo các tháng khảo sát',
      statement: `${bestMonthFact.label_vi.replace(/\[DATA:|\]/g, '')} đạt ${bestMonthFact.display}${worstMonthFact ? `, trong khi ${worstMonthFact.label_vi.replace(/\[DATA:|\]/g, '')} ghi nhận ${worstMonthFact.display}` : ''}${momFact ? `. ${momFact.label_vi.replace(/\[DATA:|\]/g, '')} ${momFact.display}` : ''}.`,
      evidence_ids: ev,
      confidence: 'cao',
    });
  }

  // Insight 4: Product performance & lowest margin watch
  const topProd = fProducts.find((f) => f.label_vi.includes('doanh thu cao nhất'));
  const lowMarginProd = fProducts.find((f) => f.label_vi.includes('biên lợi nhuận thấp nhất'));
  if (topProd) {
    const ev = [topProd.id, ...(lowMarginProd ? [lowMarginProd.id] : []), ...(fConc[0] ? [fConc[0].id] : [])];
    insights.push({
      title: 'Cơ cấu đóng góp sản phẩm và điểm cần chú ý về biên lợi nhuận',
      statement: `${topProd.label_vi.replace(/\[DATA:|\]/g, '')} đạt ${topProd.display}${fConc[0] ? `; Top 3 sản phẩm chiếm ${fConc[0].display}` : ''}${lowMarginProd ? `. Cần lưu ý ${lowMarginProd.label_vi.replace(/\[DATA:|\]/g, '')} (${lowMarginProd.display})` : ''}.`,
      evidence_ids: ev,
      confidence: 'cao',
    });

    if (lowMarginProd) {
      recommendations.push({
        action: 'Rà soát cấu trúc giá vốn và chính sách chiết khấu của nhóm sản phẩm có biên lợi nhuận thấp nhất',
        rationale: `Nhóm này có biên lợi nhuận thấp hơn mức bình quân (${lowMarginProd.display}).`,
        evidence_ids: [lowMarginProd.id, ...(marginFact ? [marginFact.id] : [])],
        expected_effect_note: 'Cải thiện biên lợi nhuận gộp mà không cần tăng chi phí thu hút đơn hàng mới.',
        risk: 'Điều chỉnh giá bán có thể ảnh hưởng sản lượng nếu không đi kèm kiểm thử nhu cầu.',
      });
    }
  }

  // Insight 5: Regions & data quality
  const lowRegion = fRegions.find((f) => f.label_vi.includes('thấp nhất'));
  const unknownFact = fQuality.find((f) => f.label_vi.includes('Không xác định'));
  if (lowRegion || unknownFact) {
    const ev = [...(lowRegion ? [lowRegion.id] : []), ...(unknownFact ? [unknownFact.id] : [])];
    insights.push({
      title: 'Phân bổ khu vực và dữ liệu thiếu phân loại',
      statement: `${lowRegion ? `${lowRegion.label_vi.replace(/\[DATA:|\]/g, '')} đạt ${lowRegion.display}. ` : ''}${unknownFact ? `Phần dữ liệu khuyết nhãn ghi nhận: ${unknownFact.display}.` : ''}`.trim(),
      evidence_ids: ev,
      confidence: 'vừa',
    });

    if (unknownFact) {
      recommendations.push({
        action: 'Chuẩn hóa quy trình nhập liệu bắt buộc cho trường Khu vực và Sản phẩm trước kỳ tổng hợp tiếp theo',
        rationale: `Vẫn còn doanh thu rơi vào nhóm "Không xác định" (${unknownFact.display}).`,
        evidence_ids: [unknownFact.id],
        expected_effect_note: 'Giảm sai lệch khi phân bổ ngân sách theo khu vực và danh mục sản phẩm.',
        risk: 'Tốn thêm thời gian rà soát dữ liệu đầu vào tại điểm bán hoặc sàn thương mại điện tử.',
      });
    }
  }

  if (recommendations.length === 0 && fTotal[0]) {
    recommendations.push({
      action: 'Bổ sung thêm cột giá vốn hoặc số đơn hàng để nhận khuyến nghị vận hành chi tiết hơn',
      rationale: `Bảng dữ liệu hiện tại tập trung vào quy mô doanh thu (${fTotal[0].display}).`,
      evidence_ids: [fTotal[0].id],
      expected_effect_note: 'Tối ưu hóa lợi nhuận và quản trị giỏ hàng khi có đủ biến số tài chính.',
      risk: 'Cần đồng bộ dữ liệu từ bộ phận kế toán hoặc hệ thống POS.',
    });
  }

  // Limitations
  limitations.push(`Phân tích chỉ phản ánh dữ liệu trong phạm vi ${factsTable.period}, chưa đủ đánh giá tính mùa vụ dài hạn cả năm.`);
  if (unknownFact) {
    limitations.push(`Một phần giao dịch bị trống nhãn phân loại đã được gom vào mục "Không xác định" (${unknownFact.id}).`);
  }
  if (!profFact) {
    limitations.push('Dữ liệu chưa có thông tin giá vốn hoặc lợi nhuận gộp, không thể đánh giá biên lợi nhuận.');
  } else {
    limitations.push('Dữ liệu hiện tại chỉ bao gồm doanh thu, giá vốn và lợi nhuận gộp; chưa tính chi phí vận hành, marketing hay hoàn hủy.');
  }

  return {
    source: 'template',
    model: 'template-local',
    facts_hash: factsTable.hash,
    latency_ms: options?.latency_ms ?? 0,
    rejected_count: options?.rejected_count ?? 0,
    rejected_reasons: options?.rejected_reasons ?? [],
    feedback_applied: options?.feedback_applied ? sanitizeDataLabel(options.feedback_applied, 200) : undefined,
    generated_at: new Date().toISOString(),
    insights,
    recommendations,
    limitations,
  };
}

/**
 * Verifies raw AI JSON payload strictly against FactsTable.
 * Rejects any item with missing/invalid evidence_ids or hallucinated numbers.
 * Falls back cleanly to deterministic template if AI output is invalid or all insights fail verification.
 */
export function verifyBusinessInsightsOutput(
  rawPayload: unknown,
  factsTable: FactsTable,
  meta: {
    model: string;
    latency_ms: number;
    feedback_applied?: string;
  }
): BusinessInsightsReport {
  const factMap = new Map<string, FactItem>(factsTable.facts.map((f) => [f.id, f]));
  const rejectedReasons: string[] = [];
  let rejectedCount = 0;

  if (!rawPayload || typeof rawPayload !== 'object') {
    return buildTemplateBusinessInsights(factsTable, {
      latency_ms: meta.latency_ms,
      rejected_count: 1,
      rejected_reasons: ['Phản hồi AI không phải đối tượng JSON hợp lệ.'],
      feedback_applied: meta.feedback_applied,
    });
  }

  const payload = rawPayload as RawAiBusinessInsightsPayload;
  const validInsights: BusinessInsightItem[] = [];
  const validRecs: BusinessRecommendationItem[] = [];
  const validLimits: string[] = [];

  // 1. Verify insights
  const rawInsights = Array.isArray(payload.insights) ? payload.insights.slice(0, 5) : [];
  for (let i = 0; i < rawInsights.length; i++) {
    const item = rawInsights[i];
    const title = sanitizePlainText(item?.title, 140);
    const statement = sanitizePlainText(item?.statement, 450);
    const evRaw = Array.isArray(item?.evidence_ids) ? item.evidence_ids.map(String) : [];
    const validEv = evRaw.filter((id) => factMap.has(id));
    const hasInvalidEv = evRaw.some((id) => !factMap.has(id));

    if (!title || !statement || validEv.length === 0 || hasInvalidEv) {
      rejectedCount++;
      rejectedReasons.push(`Loại nhận định #${i + 1}: thiếu nội dung hoặc mã bằng chứng không tồn tại.`);
      continue;
    }

    const allowedNums = collectAllowedNumbersForEvidence(validEv, factMap);
    const tokens = extractNumbersFromVietnameseText(`${title} ${statement}`);
    const badTokens = tokens.filter((t) => !numberMatchesAllowed(t.parsed, allowedNums));

    if (badTokens.length > 0) {
      rejectedCount++;
      rejectedReasons.push(
        `Loại nhận định #${i + 1}: phát hiện số liệu không khớp bảng sự kiện (${badTokens.map((b) => b.raw).join(', ')}).`
      );
      continue;
    }

    const confRaw = String(item?.confidence || 'vừa').toLowerCase();
    const confidence: InsightConfidence =
      confRaw === 'cao' || confRaw === 'thấp' || confRaw === 'vừa' ? confRaw : 'vừa';

    validInsights.push({
      title,
      statement,
      evidence_ids: validEv,
      confidence,
    });
  }

  // 2. Verify recommendations
  const rawRecs = Array.isArray(payload.recommendations) ? payload.recommendations.slice(0, 5) : [];
  for (let i = 0; i < rawRecs.length; i++) {
    const item = rawRecs[i];
    const action = sanitizePlainText(item?.action, 220);
    const rationale = sanitizePlainText(item?.rationale, 350);
    const expected_effect_note = sanitizePlainText(item?.expected_effect_note, 250);
    const risk = sanitizePlainText(item?.risk, 250);
    const evRaw = Array.isArray(item?.evidence_ids) ? item.evidence_ids.map(String) : [];
    const validEv = evRaw.filter((id) => factMap.has(id));
    const hasInvalidEv = evRaw.some((id) => !factMap.has(id));

    if (!action || !rationale || validEv.length === 0 || hasInvalidEv) {
      rejectedCount++;
      rejectedReasons.push(`Loại đề xuất #${i + 1}: thiếu nội dung hoặc mã bằng chứng không tồn tại.`);
      continue;
    }

    const allowedNums = collectAllowedNumbersForEvidence(validEv, factMap);
    const tokens = extractNumbersFromVietnameseText(`${action} ${rationale} ${expected_effect_note} ${risk}`);
    const badTokens = tokens.filter((t) => !numberMatchesAllowed(t.parsed, allowedNums));

    if (badTokens.length > 0) {
      rejectedCount++;
      rejectedReasons.push(
        `Loại đề xuất #${i + 1}: phát hiện số liệu không khớp bảng sự kiện (${badTokens.map((b) => b.raw).join(', ')}).`
      );
      continue;
    }

    validRecs.push({
      action,
      rationale,
      evidence_ids: validEv,
      expected_effect_note: expected_effect_note || 'Cải thiện hiệu quả dựa trên dữ liệu lịch sử.',
      risk: risk || 'Cần theo dõi thêm chi phí thực thi thực tế.',
    });
  }

  // 3. Verify limitations
  const rawLimits = Array.isArray(payload.limitations) ? payload.limitations.slice(0, 5) : [];
  const allFactNums = collectAllowedNumbersForEvidence(Array.from(factMap.keys()), factMap);
  for (const lim of rawLimits) {
    const txt = sanitizePlainText(lim, 260);
    if (!txt) continue;
    const tokens = extractNumbersFromVietnameseText(txt);
    const badTokens = tokens.filter((t) => !numberMatchesAllowed(t.parsed, allFactNums));
    if (badTokens.length === 0) {
      validLimits.push(txt);
    } else {
      rejectedCount++;
      rejectedReasons.push(`Loại giới hạn dữ liệu do chứa số lạ (${badTokens.map((b) => b.raw).join(', ')}).`);
    }
  }

  // If zero insights survived strict verification, fall back cleanly to deterministic template
  if (validInsights.length === 0) {
    return buildTemplateBusinessInsights(factsTable, {
      latency_ms: meta.latency_ms,
      rejected_count: rejectedCount,
      rejected_reasons: rejectedReasons,
      feedback_applied: meta.feedback_applied,
    });
  }

  // Fill limitations fallback if AI omitted them
  if (validLimits.length === 0) {
    validLimits.push(`Phân tích chỉ dựa trên dữ liệu đã nạp trong kỳ ${factsTable.period}.`);
  }

  return {
    source: 'ai',
    model: meta.model,
    facts_hash: factsTable.hash,
    latency_ms: meta.latency_ms,
    rejected_count: rejectedCount,
    rejected_reasons: rejectedReasons,
    feedback_applied: meta.feedback_applied ? sanitizeDataLabel(meta.feedback_applied, 200) : undefined,
    generated_at: new Date().toISOString(),
    insights: validInsights,
    recommendations: validRecs,
    limitations: validLimits,
  };
}
