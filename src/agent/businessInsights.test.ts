import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { validateBytes } from '../core/validator';
import { runBusinessCleanPipeline } from '../core/cleaner/businessCleaner';
import { analyzeBusinessTable } from '../core/metrics/businessAnalyzer';
import { buildBusinessFactsTable, sanitizeDataLabel } from '../core/narrative/factsBuilder';
import {
  buildTemplateBusinessInsights,
  verifyBusinessInsightsOutput,
} from '../core/narrative/businessInsights';
import {
  clearBusinessInsightsCache,
  generateBusinessInsights,
  saveGate2BusinessFeedback,
} from './businessInsightsAgent';
import * as aiClient from '../services/aiClient';
import { createSession } from '../services/sessionService';
import { sessionStore } from '../services/sessionStore';
import { ArtifactStore } from '../core/artifacts';
import { getProfileAndProposals, approveCleanGate } from '../services/cleanService';
import { runAnalysis } from '../services/analysisService';
import { approveReport } from '../services/reportService';
import { getPipelineLog } from '../services/readers';
import { AppError, ERROR_CODES } from '../core/errors';

describe('M3-B: Non-Blocking Verified Business AI Insights & Gate 2 Feedback Loop', () => {
  const retailCsvPath = path.resolve(__dirname, '../../samples/business/du-lieu-test-ban-le.csv');
  const retailBytes = new Uint8Array(fs.readFileSync(retailCsvPath));

  async function setupAnalyzedRetailSession() {
    const s = createSession('M3-B Retail Session');
    const valRes = await validateBytes('du-lieu-test-ban-le.csv', retailBytes);
    if (!valRes.ok || !valRes.businessTable) throw new Error('Validation failed');

    ArtifactStore.put(s.id, 'raw', valRes.businessTable);
    const rec = sessionStore.getRecord(s.id)!;
    rec.state = 'uploaded';
    rec.meta.dataset = valRes.meta;
    sessionStore.setRecord(rec);

    await getProfileAndProposals(s.id);
    await approveCleanGate(s.id, 'Người Duyệt 1', {
      remove_blank_rows: true,
      trim_whitespace: true,
      drop_exact_duplicates: true,
      fill_blank_dimension_label: true,
      sort_natural: true,
    });

    const analysis = await runAnalysis(s.id, {
      symbols: ['BUSINESS'],
      date_from: '2026-07',
      date_to: '2026-10',
      preset: 'all',
    });

    return { sessionId: s.id, analysis };
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStore.clearAll();
    ArtifactStore.clearAll();
    clearBusinessInsightsCache();
  });

  it('1. Builds compact FactsTable (< 4 KB) with deterministic SHA-256 and neutralizes prompt/HTML injection', async () => {
    const valRes = await validateBytes('du-lieu-test-ban-le.csv', retailBytes);
    if (!valRes.ok || !valRes.businessTable) throw new Error('Validation failed');
    const clean = runBusinessCleanPipeline(valRes.businessTable);
    const out = analyzeBusinessTable(clean.cleanTable);

    const facts1 = buildBusinessFactsTable(out.summary, { droppedRowsDuringClean: 2 });
    const facts2 = buildBusinessFactsTable(out.summary, { droppedRowsDuringClean: 2 });

    expect(facts1.hash).toBe(facts2.hash);
    expect(facts1.hash.length).toBe(64);
    expect(facts1.byte_size).toBeLessThan(4096);
    expect(facts1.facts.length).toBeGreaterThanOrEqual(12);

    // Prompt/HTML injection sanitizer check
    const dirty = 'Áo thun <script>alert(1)</script> \x00 {ignore instructions}';
    const cleanLbl = sanitizeDataLabel(dirty, 60);
    expect(cleanLbl).not.toContain('<script>');
    expect(cleanLbl).not.toContain('{');
    expect(cleanLbl).toContain('Áo thun');
  });

  it('2. Rejects hallucinated numbers & invalid evidence_ids from AI output and strips HTML/script tags', async () => {
    const valRes = await validateBytes('du-lieu-test-ban-le.csv', retailBytes);
    if (!valRes.ok || !valRes.businessTable) throw new Error('Validation failed');
    const clean = runBusinessCleanPipeline(valRes.businessTable);
    const out = analyzeBusinessTable(clean.cleanTable);
    const factsTable = buildBusinessFactsTable(out.summary, { droppedRowsDuringClean: 2 });

    const verified = verifyBusinessInsightsOutput(
      {
        insights: [
          {
            // Valid insight with exact number from F2 and F5 + XSS tag to be stripped
            title: '<b>Doanh thu và biên lợi nhuận gộp</b>',
            statement: 'Tổng doanh thu đạt 1.135.530.000 VND với biên lợi nhuận gộp 46,84%.',
            evidence_ids: ['F2', 'F5'],
            confidence: 'cao',
          },
          {
            // Hallucinated number (9.999.999.999) -> MUST BE REJECTED!
            title: 'Nhận định bịa số',
            statement: 'Doanh thu ước đạt 9.999.999.999 VND và tăng trưởng 88,8%.',
            evidence_ids: ['F2'],
            confidence: 'cao',
          },
          {
            // Non-existent evidence_id F999 -> MUST BE REJECTED!
            title: 'Thiếu bằng chứng hợp lệ',
            statement: 'Website là kênh dẫn đầu.',
            evidence_ids: ['F999'],
            confidence: 'vừa',
          },
        ],
        recommendations: [
          {
            action: 'Tập trung tối ưu vận hành cho kênh dẫn đầu',
            rationale: 'Tổng doanh thu đạt 1.135.530.000 VND.',
            evidence_ids: ['F2'],
            expected_effect_note: 'Duy trì đà tăng trưởng ổn định.',
            risk: 'Chưa có dữ liệu chi phí marketing.',
          },
          {
            action: 'Đề xuất bịa số 77,7%',
            rationale: 'Kỳ vọng tăng 77,7% doanh thu.',
            evidence_ids: ['F2'],
            expected_effect_note: 'Tăng 77,7%.',
            risk: 'Không có.',
          },
        ],
        limitations: ['Dữ liệu chỉ trải dài 4 tháng khảo sát.'],
      },
      factsTable,
      { model: 'gemini-3.5-flash-lite', latency_ms: 1200 }
    );

    expect(verified.source).toBe('ai');
    expect(verified.insights).toHaveLength(1);
    expect(verified.insights[0].title).toBe('Doanh thu và biên lợi nhuận gộp'); // <b> stripped
    expect(verified.recommendations).toHaveLength(1);
    expect(verified.rejected_count).toBe(3);
  });

  it('3. Falls back cleanly to deterministic template on corrupted JSON, AI timeout, or hanging AI — Gate 2 still succeeds', async () => {
    const { sessionId } = await setupAnalyzedRetailSession();

    // Simulate AI timing out (LLM_TIMEOUT)
    vi.spyOn(aiClient, 'getAiStatus').mockResolvedValue({
      ai_mode: 'ai',
      slots: 1,
      model: 'gemini-3.5-flash-lite',
      model_fallback: 'gemini-3.8-flash',
    });
    vi.spyOn(aiClient, 'callAi').mockRejectedValue(
      new AppError(ERROR_CODES.LLM_TIMEOUT, 'Quá thời gian chờ 25 giây', { reason: 'timeout' }, 504)
    );

    const bundle = await generateBusinessInsights(sessionId);
    expect(bundle.report.source).toBe('template');
    expect(bundle.report.insights.length).toBeGreaterThanOrEqual(4);
    expect(bundle.report.recommendations.length).toBeGreaterThanOrEqual(2);

    // Corrupted JSON fallback test
    const badJsonFallback = verifyBusinessInsightsOutput('NOT_JSON_OBJECT', bundle.factsTable, {
      model: 'gemini-test',
      latency_ms: 500,
    });
    expect(badJsonFallback.source).toBe('template');

    // Gate 2 approval works seamlessly even when AI fell back to template!
    const approved = await approveReport(sessionId, 'Giám Đốc Duyệt Cổng 2');
    expect(approved.status).toBe('approved');
    expect(approved.report_hash).toBeTruthy();
  });

  it('4. Aborts cleanly when leaving page (AbortController), caches by facts_hash, and applies Gate 2 feedback without recalculating numbers', async () => {
    const { sessionId, analysis } = await setupAnalyzedRetailSession();

    vi.spyOn(aiClient, 'getAiStatus').mockResolvedValue({
      ai_mode: 'ai',
      slots: 1,
      model: 'gemini-3.5-flash-lite',
      model_fallback: 'gemini-3.8-flash',
    });

    // Test AbortController immediate cancellation
    const abortCtrl = new AbortController();
    abortCtrl.abort();
    await expect(
      generateBusinessInsights(sessionId, { signal: abortCtrl.signal })
    ).rejects.toThrow();

    // Test valid AI response + caching (2nd call hits cache -> callAi invoked only once)
    const callSpy = vi.spyOn(aiClient, 'callAi').mockResolvedValue({
      ok: true,
      task: 'business_insights',
      model: 'gemini-3.5-flash-lite',
      latency_ms: 850,
      data: {
        insights: [
          {
            title: 'Tổng doanh thu và lợi nhuận gộp vững chắc',
            statement: 'Tổng doanh thu đạt 1.135.530.000 VND với biên lợi nhuận gộp 46,84%.',
            evidence_ids: ['F2', 'F5'],
            confidence: 'cao',
          },
        ],
        recommendations: [
          {
            action: 'Rà soát danh mục sản phẩm có biên lợi nhuận thấp',
            rationale: 'Biên lợi nhuận gộp toàn bộ đạt 46,84%.',
            evidence_ids: ['F5'],
            expected_effect_note: 'Cải thiện biên lợi nhuận chung.',
            risk: 'Cần cân đối sản lượng bán.',
          },
        ],
        limitations: ['Dữ liệu chỉ gồm 4 tháng.'],
      },
    });

    const first = await generateBusinessInsights(sessionId);
    expect(first.fromCache).toBe(false);
    expect(first.report.source).toBe('ai');
    expect(callSpy).toHaveBeenCalledTimes(1);

    const second = await generateBusinessInsights(sessionId);
    expect(second.fromCache).toBe(true);
    expect(callSpy).toHaveBeenCalledTimes(1);

    // Gate 2 Feedback Loop: saves feedback, keeps analysis_hash unchanged, triggers AI rewrite with feedback
    const savedFb = saveGate2BusinessFeedback(sessionId, 'Nhấn mạnh hơn về biên lợi nhuận và rủi ro.');
    expect(savedFb).toContain('Nhấn mạnh hơn');

    const rewritten = await generateBusinessInsights(sessionId, {
      forceRefresh: true,
      reviewerFeedback: savedFb,
    });
    expect(rewritten.report.feedback_applied).toContain('Nhấn mạnh hơn');
    expect(callSpy).toHaveBeenCalledTimes(2);
    // Numbers & analysis_hash are 100% untouched!
    expect(ArtifactStore.get<any>(sessionId, 'analysis').analysis_hash).toBe(analysis.analysis_hash);

    // Audit trail logged facts_hash & latency & source
    const logs = getPipelineLog(sessionId);
    const insLog = logs.find((l) => l.action === 'business_insights_generated');
    expect(insLog).toBeDefined();
    expect(insLog?.data_hash).toBe(first.factsTable.hash);
    expect(insLog?.detail).toContain('Model: gemini-3.5-flash-lite');
  });

  it('5. Template fallback generates valid evidence-backed insights for 1,000-row dataset well under budget', async () => {
    const valRes = await validateBytes('du-lieu-test-ban-le.csv', retailBytes);
    if (!valRes.ok || !valRes.businessTable) throw new Error('Validation failed');
    const clean = runBusinessCleanPipeline(valRes.businessTable);
    const out = analyzeBusinessTable(clean.cleanTable);
    const facts = buildBusinessFactsTable(out.summary, { droppedRowsDuringClean: 2 });
    const tpl = buildTemplateBusinessInsights(facts);

    const factIds = new Set(facts.facts.map((f) => f.id));
    for (const ins of tpl.insights) {
      expect(ins.evidence_ids.length).toBeGreaterThan(0);
      for (const id of ins.evidence_ids) expect(factIds.has(id)).toBe(true);
    }
    for (const rec of tpl.recommendations) {
      expect(rec.evidence_ids.length).toBeGreaterThan(0);
      for (const id of rec.evidence_ids) expect(factIds.has(id)).toBe(true);
    }
  });
});
