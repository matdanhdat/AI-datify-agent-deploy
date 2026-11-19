import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchCleaningExplanations } from './cleaningExplainer';
import * as aiClient from '../services/aiClient';
import { sessionStore } from '../services/sessionStore';
import type { CleanProposal, Profile } from '../core/schemas';

describe('P3 Cleaning Explainer Agent - Output Verification & Fallback', () => {
  const sessionId = '123e4567-e89b-12d3-a456-426614174000';

  const mockProfile: Profile = {
    total_rows: 1000,
    total_symbols: 2,
    date_from: '2025-01-01',
    date_to: '2025-02-15',
    total_missing_cells: 5,
    total_outliers: 2,
    total_exact_duplicates: 4,
    by_symbol: {
      TMA: {
        symbol: 'TMA',
        rows: 500,
        unique_dates: 500,
        date_from: '2025-01-01',
        date_to: '2025-02-15',
        missing: { open: 0, high: 0, low: 0, close: 0, volume: 2 },
        missing_rate: { open: 0, high: 0, low: 0, close: 0, volume: 0.004 },
        exact_duplicates: 2,
        duplicate_keys: 0,
        zero_volume_sessions: 0,
        long_gaps_count: 0,
        outliers_count: 1,
        stats: { close_min: 50, close_median: 55, close_max: 60, vol_min: 1000, vol_median: 2000, vol_max: 5000 },
      },
    },
  };

  const mockProposals: CleanProposal[] = [
    {
      id: 'prop_dups',
      op: 'drop_exact_duplicates',
      title_vi: 'Loại bỏ trùng lặp',
      description_vi: 'Bỏ 4 dòng trùng lặp',
      rows_affected: 4,
      affected_symbols: ['TMA'],
      sample_rows: [10, 20],
      severity: 'info',
      default_enabled: true,
    },
    {
      id: 'prop_vol',
      op: 'fill_missing_volume_zero',
      title_vi: 'Điền khối lượng',
      description_vi: 'Điền 2 ô khối lượng',
      rows_affected: 2,
      affected_symbols: ['TMA'],
      sample_rows: [15],
      severity: 'info',
      default_enabled: true,
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStore.setRecord({
      id: sessionId,
      state: 'cleaning_review',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      log: [],
      meta: {},
    });
  });

  it('accepts valid AI explanations with verified authorized numbers', async () => {
    vi.spyOn(aiClient, 'callAi').mockResolvedValue({
      ok: true,
      task: 'explain_cleaning',
      model: 'gemini-3.5-flash-lite',
      latency_ms: 120,
      data: {
        explanations: [
          {
            id: 'prop_dups',
            why_vi: 'Loại bỏ 4 dòng trùng lặp giúp dữ liệu chính xác.',
            risk_vi: 'Hầu như không có rủi ro đối với tập dữ liệu.',
          },
        ],
      },
    });

    const res = await fetchCleaningExplanations(sessionId, mockProposals, mockProfile);
    expect(res['prop_dups'].is_ai).toBe(true);
    expect(res['prop_dups'].why_vi).toContain('4 dòng trùng lặp');
  });

  it('rejects AI explanation containing unauthorized rogue numbers (hallucination defense)', async () => {
    vi.spyOn(aiClient, 'callAi').mockResolvedValue({
      ok: true,
      task: 'explain_cleaning',
      model: 'gemini-3.5-flash-lite',
      latency_ms: 120,
      data: {
        explanations: [
          {
            id: 'prop_rogue_num',
            why_vi: 'Loại bỏ 9999 dòng trùng lặp giúp dữ liệu tốt hơn.', // 9999 is unauthorized!
            risk_vi: 'Không có rủi ro.',
          },
        ],
      },
    });

    const res = await fetchCleaningExplanations(sessionId, [
      {
        id: 'prop_rogue_num',
        op: 'drop_exact_duplicates',
        title_vi: 'Loại bỏ trùng lặp',
        description_vi: 'Bỏ dòng',
        rows_affected: 4,
        affected_symbols: ['TMA'],
        sample_rows: [],
        severity: 'info',
        default_enabled: true,
      },
    ], mockProfile);

    // Fallback template is used instead of hallucinated number
    expect(res['prop_rogue_num'].is_ai).toBe(false);
    expect(res['prop_rogue_num'].reject_reason).toContain('Chứa con số không nằm trong danh mục cho phép');
  });

  it('rejects AI explanation containing forbidden investment recommendations', async () => {
    vi.spyOn(aiClient, 'callAi').mockResolvedValue({
      ok: true,
      task: 'explain_cleaning',
      model: 'gemini-3.5-flash-lite',
      latency_ms: 120,
      data: {
        explanations: [
          {
            id: 'prop_invest_check',
            why_vi: 'Khuyến nghị mua mạnh cổ phiếu TMA sau khi làm sạch.', // Forbidden investment keyword
            risk_vi: 'Cắt lỗ khi giá giảm 5%.',
          },
        ],
      },
    });

    const res = await fetchCleaningExplanations(sessionId, [
      {
        id: 'prop_invest_check',
        op: 'drop_exact_duplicates',
        title_vi: 'Loại bỏ trùng lặp',
        description_vi: 'Bỏ dòng',
        rows_affected: 4,
        affected_symbols: ['TMA'],
        sample_rows: [],
        severity: 'info',
        default_enabled: true,
      },
    ], mockProfile);

    expect(res['prop_invest_check'].is_ai).toBe(false);
    expect(res['prop_invest_check'].reject_reason).toContain('Chứa từ ngữ khuyến nghị đầu tư');
  });

  it('gracefully falls back to pre-authored templates on gateway network failure', async () => {
    vi.spyOn(aiClient, 'callAi').mockRejectedValue(new Error('Gateway timeout'));

    const res = await fetchCleaningExplanations(sessionId, [
      {
        id: 'prop_net_fail',
        op: 'fill_missing_volume_zero',
        title_vi: 'Điền khối lượng',
        description_vi: 'Điền 2 ô khối lượng',
        rows_affected: 2,
        affected_symbols: ['TMA'],
        sample_rows: [],
        severity: 'info',
        default_enabled: true,
      },
    ], mockProfile);

    expect(res['prop_net_fail'].is_ai).toBe(false);
    expect(res['prop_net_fail'].why_vi).toContain('Điền giá trị 0 cho 2 phiên');
    expect(res['prop_net_fail'].risk_vi).toContain('Khối lượng bằng 0');
  });
});
