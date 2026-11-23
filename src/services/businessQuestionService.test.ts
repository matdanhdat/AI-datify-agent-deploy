import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateAiQuestionOutput,
  analyzeBusinessQuestions,
  AI_SOURCE,
  FALLBACK_SOURCE,
} from './businessQuestionService';
import * as aiClient from './aiClient';

describe('businessQuestionService Test Suite (Prompt 5B)', () => {
  const mockFeasibility: Record<string, { feasible: boolean; reason?: string }> = {
    total_revenue: { feasible: true },
    revenue_by_channel: { feasible: true },
    margin_by_channel: { feasible: false, reason: 'Thiếu cột Giá vốn hoặc Lợi nhuận gộp.' },
    revenue_by_product: { feasible: true },
  };

  describe('validateAiQuestionOutput', () => {
    it('drops invalid question_index, unknown metric IDs, and infeasible metric IDs', () => {
      const raw = {
        matches: [
          {
            question_index: 0,
            metric_ids: ['revenue_by_channel', 'foo_metric', 'margin_by_channel'],
            reason: 'Kênh bán hàng có số liệu tốt trong 2026', // has digit
          },
          {
            question_index: 99, // invalid index
            metric_ids: ['total_revenue'],
            reason: 'Doanh thu',
          },
        ],
        unanswerable: [
          {
            question_index: 1,
            reason: '<b>Không có dữ liệu</b>', // has html
          },
        ],
      };

      const out = validateAiQuestionOutput(raw, 2, mockFeasibility);
      expect(out).not.toBeNull();
      expect(out!.matches.length).toBe(1);
      expect(out!.matches[0].question_index).toBe(0);
      // 'foo_metric' and unfeasible 'margin_by_channel' dropped
      expect(out!.matches[0].metric_ids).toEqual(['revenue_by_channel']);
      // Reason containing digits was replaced
      expect(out!.matches[0].reason).toBe('Chỉ số phù hợp với câu hỏi của bạn.');

      // HTML in unanswerable reason sanitized
      expect(out!.unanswerable.length).toBe(1);
      expect(out!.unanswerable[0].reason).toBe('Dữ liệu hiện tại chưa có thông tin phù hợp.');
    });

    it('returns null on invalid or empty payload', () => {
      expect(validateAiQuestionOutput(null, 1, mockFeasibility)).toBeNull();
      expect(validateAiQuestionOutput({}, 1, mockFeasibility)).toBeNull();
      expect(
        validateAiQuestionOutput(
          { matches: [{ question_index: 0, metric_ids: ['unknown_id'] }] },
          1,
          mockFeasibility
        )
      ).toBeNull();
    });
  });

  describe('analyzeBusinessQuestions', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('uses AI when available and valid', async () => {
      vi.spyOn(aiClient, 'getAiStatus').mockResolvedValue({
        ai_mode: 'ai',
        slots: 2,
        model: 'gemini-3.5-flash-lite',
        model_fallback: null,
      });

      vi.spyOn(aiClient, 'callAi').mockResolvedValue({
        ok: true,
        task: 'question_to_metrics',
        model: 'gemini-3.5-flash-lite',
        latency_ms: 50,
        data: {
          matches: [
            {
              question_index: 0,
              metric_ids: ['revenue_by_channel'],
              reason: 'Chỉ số phù hợp kênh bán hàng',
            },
          ],
          unanswerable: [],
        },
      });

      const res = await analyzeBusinessQuestions({
        questions: ['Kênh nào tốt nhất?'],
        feasibilityById: mockFeasibility,
      });

      expect(res.source).toBe(AI_SOURCE);
      expect(res.perQuestion[0].tickIds).toContain('revenue_by_channel');
      expect(res.tickUnion).toContain('revenue_by_channel');
    });

    it('falls back to keyword mapping when AI errors or times out', async () => {
      vi.spyOn(aiClient, 'getAiStatus').mockResolvedValue({
        ai_mode: 'ai',
        slots: 2,
        model: 'gemini-3.5-flash-lite',
        model_fallback: null,
      });

      vi.spyOn(aiClient, 'callAi').mockRejectedValue(new Error('AI network timeout'));

      const res = await analyzeBusinessQuestions({
        questions: ['Kênh nào tốt nhất?'],
        feasibilityById: mockFeasibility,
      });

      expect(res.source).toBe(FALLBACK_SOURCE);
      expect(res.perQuestion[0].tickIds).toContain('revenue_by_channel');
      expect(res.tickUnion).toContain('revenue_by_channel');
    });

    it('falls back when AI mode is fallback', async () => {
      vi.spyOn(aiClient, 'getAiStatus').mockResolvedValue({
        ai_mode: 'fallback',
        slots: 0,
        model: 'gemini-3.5-flash-lite',
        model_fallback: null,
      });

      const res = await analyzeBusinessQuestions({
        questions: ['Kênh nào tốt nhất?'],
        feasibilityById: mockFeasibility,
      });

      expect(res.source).toBe(FALLBACK_SOURCE);
      expect(res.perQuestion[0].tickIds).toContain('revenue_by_channel');
    });
  });
});
