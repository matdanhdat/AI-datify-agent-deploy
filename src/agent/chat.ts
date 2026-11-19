/**
 * Chat Assistant Orchestrator (Prompt P6 Section 5).
 * Strictly read-only query and explanation pipeline.
 * Adheres to architectural boundaries: NEVER imports mutating stores or services.
 * Implements 3-tier pipeline: Guard Filter -> Local Rule Answer -> Verified AI Gateway.
 */

import { guardQuestion } from '../core/chat/guard';
import { localAnswer, type LocalAnswerResult } from '../core/chat/local';
import { getChatContext, listMetrics } from '../services/readers';
import { checkParagraph, type CheckContext } from '../core/narrative/check';
import { callAI } from '../services/aiClient';

export interface ChatResponse {
  answer_vi: string;
  source: 'local' | 'ai' | 'system';
  evidence: string[];
  intent?: string;
  targetPage?: string;
  refused?: boolean;
  reason?: string;
}

// Rate limiter state: 1 request every 2000 ms
let lastRequestTime = 0;

export function _resetRateLimiter(): void {
  lastRequestTime = 0;
}

export async function askAssistant(params: {
  sessionId: string;
  question: string;
  page: string;
  activeSymbol?: string;
  history?: Array<{ sender: 'user' | 'ai'; text: string }>;
  signal?: AbortSignal;
}): Promise<ChatResponse> {
  const { sessionId, question, page, activeSymbol, history = [], signal } = params;

  // 1. Enforce rate limit (1 request per 2s)
  const now = Date.now();
  if (now - lastRequestTime < 2000) {
    return {
      answer_vi: 'Trợ lý đang bận, bạn vui lòng chờ ít giây trước khi gửi câu hỏi tiếp theo.',
      source: 'system',
      evidence: [],
      refused: true,
      reason: 'rate_limited',
    };
  }
  lastRequestTime = now;

  // 2. Tier 1: Pure Rule Guard (Interception without AI)
  const guard = guardQuestion(question);
  if (!guard.allowed) {
    return {
      answer_vi: guard.cannedAnswer_vi || 'Yêu cầu không được hỗ trợ.',
      source: 'system',
      evidence: [],
      refused: true,
      reason: guard.reason,
    };
  }

  // 3. Build Read-Only Chat Context
  const context = getChatContext(sessionId, page, activeSymbol);

  // 4. Tier 2: Deterministic Local Answer
  const localRes: LocalAnswerResult = localAnswer(question, context);
  if (localRes.intent !== 'unknown') {
    return {
      answer_vi: localRes.answer_vi,
      source: 'local',
      evidence: localRes.evidence,
      intent: localRes.intent,
      targetPage: localRes.targetPage,
    };
  }

  // 5. Tier 3: Call AI Task 'chat_explain'
  try {
    if (signal?.aborted) {
      throw new DOMException('Aborted by user', 'AbortError');
    }

    const gatewayRes = await callAI<{
      intent: string;
      answer_vi: string;
      evidence: string[];
    }>('chat_explain', {
      question: question.slice(0, 500),
      page,
      state: context.state,
      history: history.slice(-6).map((h) => ({
        sender: h.sender,
        text: h.text.slice(0, 300),
      })),
      context,
    });

    const aiRes = gatewayRes.data;

    // Handle off-topic or change-request AI intent
    if (aiRes.intent === 'off_topic' || aiRes.intent === 'change_request') {
      return {
        answer_vi:
          'Trợ lý hoạt động ở chế độ CHỈ-ĐỌC và chỉ hỗ trợ giải thích dữ liệu giao dịch hoặc hướng dẫn sử dụng hệ thống.',
        source: 'system',
        evidence: [],
        refused: true,
        reason: aiRes.intent,
      };
    }

    // Number & Evidence Verification via checkParagraph
    const allMetrics = listMetrics(sessionId);
    const checkCtx: CheckContext = {
      metrics: allMetrics,
      symbols: context.data_summary?.symbols || [],
      trading_days: 252,
    };

    const issues = checkParagraph(
      {
        id: 'chat_answer',
        text: aiRes.answer_vi,
        evidence: aiRes.evidence || [],
      },
      checkCtx
    );

    // If verification fails with hallucinations or forbidden phrases -> Discard AI answer
    const severeIssues = issues.filter(
      (i) => i.reason === 'NOT_IN_DATA' || i.reason === 'FORBIDDEN_PHRASE' || i.reason === 'NOT_IN_EVIDENCE'
    );

    if (severeIssues.length > 0) {
      // Discard AI hallucination, use safe canned response
      return {
        answer_vi:
          'Tôi không thể xác nhận số liệu trong câu trả lời này, nên không hiển thị. Bạn thử hỏi cụ thể hơn về một chỉ số nhé.',
        source: 'local',
        evidence: [],
        refused: true,
        reason: 'verification_failed',
      };
    }

    return {
      answer_vi: aiRes.answer_vi,
      source: 'ai',
      evidence: aiRes.evidence || [],
      intent: aiRes.intent,
    };
  } catch (err: any) {
    if (err?.name === 'AbortError' || signal?.aborted) {
      return {
        answer_vi: 'Đã hủy yêu cầu.',
        source: 'system',
        evidence: [],
        refused: true,
      };
    }

    // AI gateway offline / rate limit / model unavailable -> friendly fallback
    return {
      answer_vi:
        'Trợ lý đang ở chế độ giải đáp từ tài liệu và số liệu (chưa kết nối AI). Bạn có thể bấm vào các câu hỏi gợi ý bên dưới.',
      source: 'local',
      evidence: [],
      refused: true,
      reason: err?.message || 'ai_unavailable',
    };
  }
}
