/**
 * Business Question Analysis Service (Prompt 5B).
 * Orchestrates user question analysis: tries AI task `question_to_metrics` with 7s timeout,
 * validates AI output against catalog & feasibility invariants, and falls back to deterministic keyword mapping.
 */

import { callAi, getAiStatus } from './aiClient';
import {
  mapQuestionsToMetrics,
  type QuestionMetricResult,
} from '../core/metrics/questionToMetrics';
import { BUSINESS_METRIC_CATALOG } from '../core/metrics/businessCatalog';
import type {
  QuestionToMetricsInput,
  QuestionToMetricsOutput,
} from '../core/aiTaskSchemas';

export interface BusinessQuestionServiceOptions {
  questions: string[];
  feasibilityById: Record<string, { feasible: boolean; reason?: string }>;
  labelById?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export type QuestionSourceType =
  | 'AI HIỂU CÂU HỎI'
  | 'HIỂU THEO TỪ KHÓA (DỰ PHÒNG)';

export interface BusinessQuestionAnalysisResult {
  perQuestion: QuestionMetricResult[];
  tickUnion: string[];
  source: QuestionSourceType;
  latency_ms: number;
}

export const FALLBACK_SOURCE: QuestionSourceType = 'HIỂU THEO TỪ KHÓA (DỰ PHÒNG)';
export const AI_SOURCE: QuestionSourceType = 'AI HIỂU CÂU HỎI';

/**
 * Validates and sanitizes AI output against strict safety rules.
 */
export function validateAiQuestionOutput(
  raw: unknown,
  questionsCount: number,
  feasibilityById: Record<string, { feasible: boolean; reason?: string }>
): QuestionToMetricsOutput | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const obj = raw as Record<string, any>;
  const validCatalogIds = new Set(BUSINESS_METRIC_CATALOG.map((m) => m.id));

  const validMatches: QuestionToMetricsOutput['matches'] = [];
  const validUnanswerable: QuestionToMetricsOutput['unanswerable'] = [];

  if (Array.isArray(obj.matches)) {
    for (const m of obj.matches) {
      if (
        typeof m.question_index !== 'number' ||
        m.question_index < 0 ||
        m.question_index >= questionsCount
      ) {
        continue;
      }

      if (!Array.isArray(m.metric_ids)) {
        continue;
      }

      // Filter: must be in catalog AND feasible = true
      const filteredMetricIds = m.metric_ids.filter((id: unknown) => {
        if (typeof id !== 'string') return false;
        if (!validCatalogIds.has(id)) return false;
        return feasibilityById[id]?.feasible === true;
      });

      // Reason validation: <= 160 chars, no digits, no HTML
      let reason = typeof m.reason === 'string' ? m.reason.trim() : '';
      if (/\d/.test(reason) || /<[^>]*>/.test(reason) || reason.length > 160) {
        reason = 'Chỉ số phù hợp với câu hỏi của bạn.';
      }

      if (filteredMetricIds.length > 0) {
        validMatches.push({
          question_index: m.question_index,
          metric_ids: filteredMetricIds,
          reason,
        });
      }
    }
  }

  if (Array.isArray(obj.unanswerable)) {
    for (const u of obj.unanswerable) {
      if (
        typeof u.question_index !== 'number' ||
        u.question_index < 0 ||
        u.question_index >= questionsCount
      ) {
        continue;
      }

      let reason = typeof u.reason === 'string' ? u.reason.trim() : '';
      if (/\d/.test(reason) || /<[^>]*>/.test(reason) || reason.length > 160) {
        reason = 'Dữ liệu hiện tại chưa có thông tin phù hợp.';
      }

      validUnanswerable.push({
        question_index: u.question_index,
        reason,
      });
    }
  }

  if (validMatches.length === 0 && validUnanswerable.length === 0) {
    return null;
  }

  return {
    matches: validMatches,
    unanswerable: validUnanswerable,
  };
}

/**
 * Main service function to analyze user questions.
 * Guaranteed to return within timeoutMs without hanging or throwing unhandled errors.
 */
export async function analyzeBusinessQuestions(
  options: BusinessQuestionServiceOptions
): Promise<BusinessQuestionAnalysisResult> {
  const startMs = Date.now();
  const timeoutMs = options.timeoutMs ?? 7000;
  const questions = options.questions || [];
  const feasibilityById = options.feasibilityById || {};
  const labelById = options.labelById || {};

  // Always precalculate deterministic keyword result as safe foundation
  const fallbackResult = mapQuestionsToMetrics(
    questions,
    feasibilityById,
    labelById
  );

  if (questions.length === 0) {
    return {
      perQuestion: [],
      tickUnion: [],
      source: FALLBACK_SOURCE,
      latency_ms: Date.now() - startMs,
    };
  }

  // Quick check if AI is available
  try {
    const aiStatus = await getAiStatus().catch(() => ({
      ai_mode: 'fallback' as const,
    }));
    if (aiStatus.ai_mode === 'fallback') {
      return {
        ...fallbackResult,
        source: FALLBACK_SOURCE,
        latency_ms: Date.now() - startMs,
      };
    }
  } catch {
    return {
      ...fallbackResult,
      source: FALLBACK_SOURCE,
      latency_ms: Date.now() - startMs,
    };
  }

  // Prepare payload for AI Gateway
  const catalogPayload = BUSINESS_METRIC_CATALOG.map((m) => ({
    id: m.id,
    name: m.name,
    feasible: feasibilityById[m.id]?.feasible === true,
    reason: feasibilityById[m.id]?.reason,
  }));

  const payload: QuestionToMetricsInput = {
    questions,
    catalog_metrics: catalogPayload,
  };

  // Setup AbortController for 7-second cap
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  const combinedSignal = options.signal
    ? AbortSignal.any
      ? AbortSignal.any([options.signal, controller.signal])
      : controller.signal
    : controller.signal;

  try {
    const res = await callAi<QuestionToMetricsOutput>(
      'question_to_metrics',
      payload,
      combinedSignal
    );
    clearTimeout(timeoutId);

    const validatedAi = validateAiQuestionOutput(
      res.data,
      questions.length,
      feasibilityById
    );

    if (!validatedAi) {
      return {
        ...fallbackResult,
        source: FALLBACK_SOURCE,
        latency_ms: Date.now() - startMs,
      };
    }

    // Merge AI suggestions with keyword results:
    // - Keep all keyword-matched tickIds
    // - Add valid feasible metric IDs from AI
    // - Retain blockedIds and notes from keyword map
    const unionSet = new Set<string>(fallbackResult.tickUnion);
    const mergedPerQuestion: QuestionMetricResult[] = fallbackResult.perQuestion.map(
      (kwQ, idx) => {
        const aiMatch = validatedAi.matches.find((m) => m.question_index === idx);
        const aiUnans = validatedAi.unanswerable.find((u) => u.question_index === idx);

        const currentTickIds = new Set<string>(kwQ.tickIds);

        if (aiMatch && aiMatch.metric_ids.length > 0) {
          for (const mId of aiMatch.metric_ids) {
            currentTickIds.add(mId);
            unionSet.add(mId);
          }
        }

        const tickIds = Array.from(currentTickIds);
        let unanswerable = kwQ.unanswerable;
        if (tickIds.length === 0 && aiUnans) {
          unanswerable = aiUnans.reason || kwQ.unanswerable;
        } else if (tickIds.length > 0) {
          unanswerable = undefined;
        }

        return {
          ...kwQ,
          tickIds,
          unanswerable,
        };
      }
    );

    return {
      perQuestion: mergedPerQuestion,
      tickUnion: Array.from(unionSet),
      source: AI_SOURCE,
      latency_ms: Date.now() - startMs,
    };
  } catch (_err) {
    clearTimeout(timeoutId);
    return {
      ...fallbackResult,
      source: FALLBACK_SOURCE,
      latency_ms: Date.now() - startMs,
    };
  }
}
