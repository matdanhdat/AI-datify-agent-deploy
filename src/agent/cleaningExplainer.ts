/**
 * Browser AI Agent for explaining data cleaning proposals (Section 6.2).
 * Batches all proposals in a single non-blocking serverless call.
 * Caches by proposal hash.
 * Validates output: removes unauthorized IDs, rogue numbers, and investment recommendations.
 * Emits audit logs: ai_explanation_received or ai_explanation_fallback.
 */

import { callAi } from '../services/aiClient';
import { appendLog } from '../core/audit';
import { sessionStore } from '../services/sessionStore';
import type { CleanProposal, Profile } from '../core/schemas';
import { getFallbackExplanation } from '../core/cleaner/templates';

export interface VerifiedExplanation {
  id: string;
  why_vi: string;
  risk_vi: string;
  is_ai: boolean;
  reject_reason?: string;
}

// In-memory cache by proposals hash
const explanationCache = new Map<string, Record<string, VerifiedExplanation>>();

// Forbidden investment keywords filter (strict check)
const FORBIDDEN_INVESTMENT_REGEX =
  /(mua\b|bán\b|chốt lời|cắt lỗ|đầu tư\b|bắt đáy|khuyến nghị|target|điểm vào|vào lệnh|full margin|múc\b|thoát hàng)/i;

/**
 * Extracts all distinct integers / decimals from a text string.
 */
function extractNumbersFromText(text: string): number[] {
  const matches = text.match(/\b\d+(\.\d+)?\b/g);
  if (!matches) return [];
  return matches.map((m) => parseFloat(m));
}

/**
 * Computes a lightweight fast hash for caching proposals.
 */
function hashProposalsKey(proposals: CleanProposal[]): string {
  return proposals
    .map((p) => `${p.id}:${p.rows_affected}:${p.default_enabled}`)
    .join('|');
}

/**
 * Validates an AI-generated explanation for a single proposal against authorized numbers and forbidden phrases.
 */
function verifyAiExplanation(
  aiItem: { id: string; why_vi: string; risk_vi: string },
  _proposal: CleanProposal,
  allowedNumbers: Set<number>
): { valid: boolean; reason?: string } {
  const combinedText = `${aiItem.why_vi} ${aiItem.risk_vi}`;

  // 1. Check for unauthorized investment advice
  if (FORBIDDEN_INVESTMENT_REGEX.test(combinedText)) {
    return { valid: false, reason: 'Chứa từ ngữ khuyến nghị đầu tư' };
  }

  // 2. Check for unauthorized numbers (hallucination defense)
  const numbersInText = extractNumbersFromText(combinedText);
  for (const num of numbersInText) {
    if (!allowedNumbers.has(num)) {
      return {
        valid: false,
        reason: `Chứa con số không nằm trong danh mục cho phép (${num})`,
      };
    }
  }

  return { valid: true };
}

/**
 * Fetches explanations for clean proposals with fallback and output verification.
 */
export async function fetchCleaningExplanations(
  sessionId: string,
  proposals: CleanProposal[],
  rawProfile: Profile | any
): Promise<Record<string, VerifiedExplanation>> {
  const cacheKey = hashProposalsKey(proposals);

  // Return cached result if already fetched
  if (explanationCache.has(cacheKey)) {
    return explanationCache.get(cacheKey)!;
  }

  // 1. Prepare instant fallback map
  const isBusiness = (rawProfile as any)?.kind === 'business';
  const resultMap: Record<string, VerifiedExplanation> = {};
  for (const p of proposals) {
    const fallback = getFallbackExplanation(p.op as any, p.rows_affected, p.affected_symbols || [], isBusiness);
    resultMap[p.id] = {
      id: p.id,
      why_vi: fallback.why_vi,
      risk_vi: fallback.risk_vi,
      is_ai: false,
    };
  }

  // 2. Build authorized numbers allowlist
  const totalRows = rawProfile.total_rows || 0;
  const totalSymbols = rawProfile.total_symbols || 0;
  const totalMissing = rawProfile.total_missing_cells ?? rawProfile.blank_dimension_cells_count ?? 0;
  const totalOutliers = rawProfile.total_outliers ?? 0;
  const totalDups = rawProfile.total_exact_duplicates ?? rawProfile.exact_duplicates_count ?? 0;

  const allowedNumbers = new Set<number>([
    totalRows,
    totalSymbols,
    totalMissing,
    totalOutliers,
    totalDups,
    1,
    2,
    3,
    4,
    5,
    6,
    10,
    20,
    30,
  ]);

  const addDateNumbers = (isoDate?: string) => {
    if (!isoDate || typeof isoDate !== 'string') return;
    const parts = isoDate.split('-');
    parts.forEach((p) => {
      const n = parseInt(p, 10);
      if (!isNaN(n)) allowedNumbers.add(n);
    });
  };
  addDateNumbers(rawProfile.date_from);
  addDateNumbers(rawProfile.date_to);

  for (const p of proposals) {
    allowedNumbers.add(p.rows_affected);
    for (const s of p.sample_rows || []) {
      allowedNumbers.add(s);
    }
  }

  // 3. Construct gateway request payload (ZERO raw data rows)
  const payloadProposals = proposals.slice(0, 12).map((p) => ({
    id: p.id,
    op: p.op,
    rows_affected: p.rows_affected,
    affected_symbols: p.affected_symbols || [],
    severity: p.severity,
    default_enabled: p.default_enabled,
  }));

  const inputPayload = {
    total_rows: totalRows,
    total_symbols: totalSymbols,
    date_from: rawProfile.date_from || '',
    date_to: rawProfile.date_to || '',
    proposals: payloadProposals,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await callAi<{
      explanations: Array<{ id: string; why_vi: string; risk_vi: string }>;
    }>('explain_cleaning', inputPayload, controller.signal);
    clearTimeout(timeoutId);

    if (response.ok && response.data?.explanations) {
      let aiAcceptedCount = 0;
      let rejectedCount = 0;

      const proposalMap = new Map(proposals.map((p) => [p.id, p]));

      for (const item of response.data.explanations) {
        const proposal = proposalMap.get(item.id);
        if (!proposal) continue; // Drop unknown IDs

        const verification = verifyAiExplanation(item, proposal, allowedNumbers);
        if (verification.valid) {
          resultMap[item.id] = {
            id: item.id,
            why_vi: item.why_vi,
            risk_vi: item.risk_vi,
            is_ai: true,
          };
          aiAcceptedCount++;
        } else {
          resultMap[item.id].reject_reason = verification.reason;
          rejectedCount++;
        }
      }

      // Record audit log
      const record = sessionStore.getRecord(sessionId);
      if (record) {
        const newLog = appendLog(record.log, {
          step: record.state,
          actor: 'ai',
          action: 'ai_explanation_received',
          detail: `Nhận ${aiAcceptedCount} lời giải thích từ AI (${rejectedCount} bị từ chối do kiểm chứng).`,
        });
        sessionStore.setRecord({ ...record, log: newLog });
      }
    } else {
      // AI response not ok -> record fallback audit log
      recordFallbackAudit(sessionId, 'AI_ERROR_FALLBACK');
    }
  } catch (err: any) {
    recordFallbackAudit(sessionId, err?.message || 'NETWORK_ERROR');
  }

  // Cache final result
  explanationCache.set(cacheKey, resultMap);
  return resultMap;
}

function recordFallbackAudit(sessionId: string, reason: string): void {
  const record = sessionStore.getRecord(sessionId);
  if (!record) return;

  const newLog = appendLog(record.log, {
    step: record.state,
    actor: 'system',
    action: 'ai_explanation_fallback',
    detail: `Sử dụng lời giải thích mẫu dự phòng (lý do: ${reason}).`,
  });
  sessionStore.setRecord({ ...record, log: newLog });
}
