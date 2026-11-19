import { describe, it, expect } from 'vitest';
import {
  ALL_SUGGESTIONS,
  MAX_ANALYSIS_QUESTIONS,
  countVietnameseWords,
  getAvailableCapabilities,
  getTopPopularQuestions,
  getUnsupportedSuggestions,
  getVisibleSuggestions,
  hasQuestionInText,
  isSuggestionSupported,
  parseQuestionLines,
  toggleQuestionInText,
  type SuggestionGroup,
} from './suggestions';
import { METRIC_DEFINITIONS, chartBackingMetrics } from '../metrics/metricSpec';
import { BUSINESS_PROFILE_CAPABILITIES } from '../cleaner/businessCleaner';

describe('U2: Question Suggestions & Input Helpers (suggestions.ts)', () => {
  it('ensures every displayed suggestion only references existing capabilities of its group', () => {
    const groups: SuggestionGroup[] = ['business', 'trading', 'general'];
    const visible = getVisibleSuggestions();
    expect(visible.length).toBeGreaterThan(0);

    for (const s of visible) {
      expect(s.needs.length).toBeGreaterThan(0);
      expect(isSuggestionSupported(s)).toBe(true);
      const capabilities = getAvailableCapabilities(s.group);
      for (const needId of s.needs) {
        expect(capabilities.has(needId)).toBe(true);
      }
    }

    // Trading capabilities strictly map back to real METRIC_DEFINITIONS / chartBackingMetrics
    const tradingVisible = getVisibleSuggestions('trading');
    expect(tradingVisible.length).toBe(7);
    for (const s of tradingVisible) {
      for (const needId of s.needs) {
        const existsInCode =
          needId in METRIC_DEFINITIONS ||
          needId in chartBackingMetrics ||
          needId === 'data_summary' ||
          needId === 'data_quality_profile';
        expect(existsInCode).toBe(true);
      }
    }

    // Business capabilities strictly map back to real BUSINESS_PROFILE_CAPABILITIES
    const businessVisible = getVisibleSuggestions('business');
    expect(businessVisible.length).toBe(7);
    const bizCapSet = new Set<string>(BUSINESS_PROFILE_CAPABILITIES);
    for (const s of businessVisible) {
      for (const needId of s.needs) {
        expect(bizCapSet.has(needId)).toBe(true);
      }
    }

    // Every group has at least 2 visible suggestions
    for (const g of groups) {
      expect(getVisibleSuggestions(g).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('excludes suggestions that reference unimplemented metrics from displayed list', () => {
    const unsupported = getUnsupportedSuggestions();
    expect(unsupported.length).toBeGreaterThan(0);

    const visibleIds = new Set(getVisibleSuggestions().map((s) => s.id));
    for (const item of unsupported) {
      expect(visibleIds.has(item.id)).toBe(false);
    }

    // Specifically verify biz_aov_by_channel and biz_mom_revenue_delta are excluded
    expect(visibleIds.has('biz_aov_by_channel')).toBe(false);
    expect(visibleIds.has('biz_mom_revenue_delta')).toBe(false);

    // Custom check with fake missing metric
    expect(
      isSuggestionSupported({
        id: 'fake_metric_q',
        text: 'Chỉ số chưa tồn tại?',
        group: 'trading',
        needs: ['non_existent_metric_xyz'],
      })
    ).toBe(false);
  });

  it('has no duplicate IDs or duplicate question texts across ALL_SUGGESTIONS', () => {
    const idSet = new Set<string>();
    const textSet = new Set<string>();

    for (const s of ALL_SUGGESTIONS) {
      expect(idSet.has(s.id)).toBe(false);
      idSet.add(s.id);

      const normText = s.text.trim().toLowerCase();
      expect(textSet.has(normText)).toBe(false);
      textSet.add(normText);
    }
  });

  it('toggleQuestionInText adds to new line, avoids case-insensitive duplicates, removes on re-click, and enforces limit of 8', () => {
    // 1. Add to empty text
    const r1 = toggleQuestionInText('', 'Doanh thu theo kênh bán nào cao nhất?');
    expect(r1.action).toBe('added');
    expect(r1.count).toBe(1);
    expect(r1.nextText).toBe('Doanh thu theo kênh bán nào cao nhất?');

    // 2. Append to new line without overwriting existing content
    const r2 = toggleQuestionInText(r1.nextText, 'Sản phẩm nào đóng góp nhiều doanh thu nhất?');
    expect(r2.action).toBe('added');
    expect(r2.count).toBe(2);
    expect(parseQuestionLines(r2.nextText)).toEqual([
      'Doanh thu theo kênh bán nào cao nhất?',
      'Sản phẩm nào đóng góp nhiều doanh thu nhất?',
    ]);

    // 3. Case-insensitive match removes existing question instead of duplicating
    expect(hasQuestionInText(r2.nextText, 'DOANH THU THEO KÊNH BÁN NÀO CAO NHẤT?')).toBe(true);
    const r3 = toggleQuestionInText(r2.nextText, 'DOANH THU THEO KÊNH BÁN NÀO CAO NHẤT?');
    expect(r3.action).toBe('removed');
    expect(r3.count).toBe(1);
    expect(r3.nextText).toBe('Sản phẩm nào đóng góp nhiều doanh thu nhất?');

    // 4. Limit of 8 questions enforced
    const eightLines = Array.from({ length: MAX_ANALYSIS_QUESTIONS }, (_, i) => `Câu hỏi phân tích số ${i + 1}?`).join(
      '\n'
    );
    const rLimit = toggleQuestionInText(eightLines, 'Câu hỏi thứ 9 vượt mức?');
    expect(rLimit.action).toBe('limit_reached');
    expect(rLimit.count).toBe(8);
    expect(rLimit.nextText).toBe(eightLines);

    // 5. Even at 8 questions, toggling an existing question removes it
    const rRemoveFrom8 = toggleQuestionInText(eightLines, 'Câu hỏi phân tích số 3?');
    expect(rRemoveFrom8.action).toBe('removed');
    expect(rRemoveFrom8.count).toBe(7);
  });

  it('getTopPopularQuestions returns up to 3 visible questions for active group', () => {
    const bizTop3 = getTopPopularQuestions('business', 3);
    expect(bizTop3).toHaveLength(3);
    expect(bizTop3[0]).toBe('Doanh thu theo kênh bán nào cao nhất?');

    const trdTop3 = getTopPopularQuestions('trading', 3);
    expect(trdTop3).toHaveLength(3);
    expect(trdTop3[0]).toBe('Mã nào sinh lời tốt nhất trong kỳ?');

    const genTop3 = getTopPopularQuestions('general', 3);
    expect(genTop3).toHaveLength(2);
  });

  it('countVietnameseWords accurately counts words with multiple spaces, tabs, newlines, and diacritics', () => {
    expect(countVietnameseWords('')).toBe(0);
    expect(countVietnameseWords('    \n\t   ')).toBe(0);
    expect(countVietnameseWords('Cửa hàng thời trang')).toBe(4);
    expect(countVietnameseWords('  Cửa   hàng\tthời  trang\n\ncó   ba   kênh   bán  ')).toBe(8);
    expect(
      countVietnameseWords(
        'Ví dụ: Cửa hàng thời trang có ba kênh bán (cửa hàng, website, sàn thương mại điện tử).'
      )
    ).toBe(18);
  });
});
