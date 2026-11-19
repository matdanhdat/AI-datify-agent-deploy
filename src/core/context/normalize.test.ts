import { describe, it, expect } from 'vitest';
import { normalizeContext, computeContextHash } from './normalize';
import { BusinessContextSchema, type BusinessContext } from '../schemas';

describe('D3: Business Context Normalization and Hash Verification', () => {
  it('rejects when analysis_questions is empty', () => {
    const res = normalizeContext({
      company_name: 'CTCP ABC',
      analysis_questions: [],
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('Bạn cần nhập ít nhất một yêu cầu phân tích.');
  });

  it('rejects when analysis_questions has more than 8 questions', () => {
    const questions = [
      'Câu hỏi 1 hợp lệ?',
      'Câu hỏi 2 hợp lệ?',
      'Câu hỏi 3 hợp lệ?',
      'Câu hỏi 4 hợp lệ?',
      'Câu hỏi 5 hợp lệ?',
      'Câu hỏi 6 hợp lệ?',
      'Câu hỏi 7 hợp lệ?',
      'Câu hỏi 8 hợp lệ?',
      'Câu hỏi 9 vượt mức?',
    ];
    const res = normalizeContext({ analysis_questions: questions });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('Tối đa 8 câu hỏi, hiện có 9.');
  });

  it('rejects a question that is too short (< 5 chars)', () => {
    const res = normalizeContext({
      analysis_questions: ['Ok?'],
    });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('Câu thứ 1 quá ngắn (cần ít nhất 5 ký tự).');
  });

  it('accepts a question that is exactly 5 chars', () => {
    const res = normalizeContext({
      analysis_questions: ['12345'],
    });
    expect(res.ok).toBe(true);
    expect(res.data?.analysis_questions[0]).toBe('12345');
  });

  it('rejects a question that is too long (> 200 chars)', () => {
    const longQ = 'A'.repeat(201);
    const res = normalizeContext({
      analysis_questions: ['Câu hỏi 1 hợp lệ?', longQ],
    });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('Câu thứ 2 quá dài (tối đa 200 ký tự).');
  });

  it('trims and collapses whitespace, removes blank lines, and deduplicates case-insensitively', () => {
    const res = normalizeContext({
      company_name: '   Công ty   Cổ phần    Vinamilk   ',
      role: '  Giám   đốc   Tài   chính  ',
      extra_info: '  Thông tin  \x00\x1F  bổ sung  ',
      analysis_questions: [
        '  Doanh thu theo  kênh  nào   cao nhất?  ',
        '',
        '   ',
        'DOANH THU THEO KÊNH NÀO CAO NHẤT? ', // Duplicate
        'Mã nào rủi ro cao nhất?',
      ],
    });

    expect(res.ok).toBe(true);
    expect(res.data?.company_name).toBe('Công ty Cổ phần Vinamilk');
    expect(res.data?.role).toBe('Giám đốc Tài chính');
    expect(res.data?.extra_info).toBe('Thông tin bổ sung');
    expect(res.data?.analysis_questions.length).toBe(2);
    expect(res.data?.analysis_questions[0]).toBe('Doanh thu theo kênh nào cao nhất?');
    expect(res.data?.analysis_questions[1]).toBe('Mã nào rủi ro cao nhất?');
  });

  it('verifies deterministic canonical SHA-256 context_hash', () => {
    const ctx1: BusinessContext = {
      company_name: 'Vinamilk',
      role: 'CFO',
      extra_info: 'Q3 Report',
      analysis_questions: ['Doanh thu theo kênh nào cao nhất?'],
    };

    const hash1 = computeContextHash(ctx1);
    const hash2 = computeContextHash({ ...ctx1 });
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64);

    // Any minor character change produces a different hash
    const ctxChanged: BusinessContext = {
      ...ctx1,
      role: 'CEO',
    };
    const hashChanged = computeContextHash(ctxChanged);
    expect(hashChanged).not.toBe(hash1);
  });

  it('U2: accepts extra_info up to exactly 2,000 characters and rejects 2,001 characters', () => {
    const valid2000 = 'a'.repeat(2000);
    const resOk = normalizeContext({
      extra_info: valid2000,
      analysis_questions: ['Doanh thu theo kênh bán nào cao nhất?'],
    });
    expect(resOk.ok).toBe(true);
    expect(resOk.data?.extra_info?.length).toBe(2000);
    expect(BusinessContextSchema.safeParse(resOk.data).success).toBe(true);

    const invalid2001 = 'a'.repeat(2001);
    const resFail = normalizeContext({
      extra_info: invalid2001,
      analysis_questions: ['Doanh thu theo kênh bán nào cao nhất?'],
    });
    expect(resFail.ok).toBe(false);
    expect(resFail.error).toBe('Thông tin bổ sung tối đa 2.000 ký tự.');

    const schemaFail = BusinessContextSchema.safeParse({
      extra_info: invalid2001,
      analysis_questions: ['Doanh thu theo kênh bán nào cao nhất?'],
    });
    expect(schemaFail.success).toBe(false);
  });

  it('U2: preserves word boundaries across newlines in extra_info', () => {
    const res = normalizeContext({
      extra_info: 'Cửa hàng thời trang\nCó ba kênh bán\t\tchủ lực',
      analysis_questions: ['Doanh thu theo kênh bán nào cao nhất?'],
    });
    expect(res.ok).toBe(true);
    expect(res.data?.extra_info).toBe('Cửa hàng thời trang Có ba kênh bán chủ lực');
  });
});
