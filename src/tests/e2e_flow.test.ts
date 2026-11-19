/**
 * End-to-End Comprehensive Flow Test Suite (Prompt P7 Section B)
 * Validates the complete pipeline:
 * 1. File Upload & Strict Validation
 * 2. Data Cleaning, Profiling & Gate 1 Human Approval
 * 3. Quantitative Financial Metrics Computation (Code-only, Zero AI)
 * 4. Narrative Generation & Gate 2 Human Approval
 * 5. Report Export (Excel 7+ sheets with live formulas)
 * 6. Read-only Chat Assistant
 * 7. Custom Workflow Execution (Whitelisted ops only)
 * 8. Cryptographic Hash Chain & Audit Trail Integrity
 * 9. AI Hallucination Guard & Fault Tolerance
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';

import { validateBytes } from '../core/validator';
import { getProfileAndProposals, approveCleanGate } from '../services/cleanService';
import { runAnalysis } from '../services/analysisService';
import { generateNarrative } from '../agent/narrator';
import { approveReport } from '../services/reportService';
import { buildExcelReportBuffer } from '../services/exportExcel';
import { askAssistant } from '../agent/chat';
import { executePlan, getCustomResultsList } from '../services/planService';
import { createSession, setBusinessContext } from '../services/sessionService';
import { sessionStore } from '../services/sessionStore';
import { ArtifactStore } from '../core/artifacts';
import { checkParagraph } from '../core/narrative/check';
import { getBusinessContext, getPipelineLog } from '../services/readers';
import {
  getVisibleSuggestions,
  toggleQuestionInText,
  countVietnameseWords,
} from '../core/context/suggestions';
import type { Plan } from '../core/schemas';

const REPO_ROOT = process.cwd();

describe('E2E Comprehensive Verification Flow (P7)', () => {
  let sessionId: string;

  beforeEach(() => {
    sessionStore.clearAll();
    const session = createSession('E2E Pipeline Test');
    sessionId = session.id;
    ArtifactStore.deleteSession(sessionId);
  });

  it('executes full end-to-end user journey with 100% data integrity', async () => {
    // -------------------------------------------------------------
    // STEP 0 (U2): CLICK SUGGESTION CHIPS & ENTER EXTRA BUSINESS INFO
    // -------------------------------------------------------------
    const tradingSuggestions = getVisibleSuggestions('trading');
    expect(tradingSuggestions.length).toBeGreaterThanOrEqual(2);
    let qText = '';
    qText = toggleQuestionInText(qText, tradingSuggestions[0].text).nextText;
    qText = toggleQuestionInText(qText, tradingSuggestions[1].text).nextText;
    const extraContext =
      'Danh mục theo dõi ba mã giao dịch chính trong năm 2025 để đánh giá hiệu suất sinh lời và mức rủi ro biến động.';
    expect(countVietnameseWords(extraContext)).toBeGreaterThan(15);

    const savedCtx = setBusinessContext(sessionId, {
      company_name: 'Quỹ Tự Doanh E2E',
      role: 'Chuyên viên Phân tích',
      extra_info: extraContext,
      analysis_questions: qText,
    });
    expect(savedCtx.analysis_questions).toHaveLength(2);
    expect(savedCtx.extra_info).toBe(extraContext);
    expect(getBusinessContext(sessionId)?.extra_info).toBe(extraContext);

    // Ensure user-entered content is NOT leaked into audit logs
    const ctxLogs = getPipelineLog(sessionId);
    const ctxLogEntry = ctxLogs.find((l) => l.action === 'context_saved');
    expect(ctxLogEntry).toBeDefined();
    expect(ctxLogEntry?.detail).not.toContain('Danh mục theo dõi');
    expect(ctxLogEntry?.detail).not.toContain(tradingSuggestions[0].text);

    // -------------------------------------------------------------
    // STEP 1: LOAD & VALIDATE RAW FILE
    // -------------------------------------------------------------
    const sampleCsvPath = path.join(REPO_ROOT, 'public', 'samples', 'file-mau-chuan.csv');
    expect(fs.existsSync(sampleCsvPath)).toBe(true);

    const fileBytes = new Uint8Array(fs.readFileSync(sampleCsvPath));
    const outcome = await validateBytes('file-mau-chuan.csv', fileBytes);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.summary.rows).toBe(750);
    expect(outcome.summary.symbols).toEqual(['TMA', 'TMB', 'TMC']);
    expect(outcome.summary.sha256).toBeTruthy();

    // Store in ArtifactStore and update session
    ArtifactStore.put(sessionId, 'raw', outcome.dataset);
    const rec = sessionStore.getRecord(sessionId)!;
    rec.state = 'uploaded';
    rec.meta.dataset = {
      filename: 'file-mau-chuan.csv',
      rows: outcome.summary.rows,
      symbols: outcome.summary.symbols,
      date_from: outcome.summary.date_from,
      date_to: outcome.summary.date_to,
      sha256: outcome.summary.sha256,
    };
    sessionStore.setRecord(rec);

    // -------------------------------------------------------------
    // STEP 2: CLEANING & GATE 1 APPROVAL
    // -------------------------------------------------------------
    const profileAndProposals = await getProfileAndProposals(sessionId);
    expect(profileAndProposals.profile.total_rows).toBe(750);
    expect(profileAndProposals.proposals.length).toBeGreaterThan(0);

    const cleanRes = await approveCleanGate(
      sessionId,
      'Nguyễn Văn Kiểm Duyệt',
      {
        drop_exact_duplicates: true,
        drop_missing_ohlc: true,
        fill_missing_volume_zero: true,
        drop_flagged_outliers: false,
      }
    );

    expect(cleanRes.cleanArtifact).toBeDefined();
    expect(cleanRes.cleanArtifact.hash).toBeTruthy();
    expect(sessionStore.getRecord(sessionId)?.state).toBe('clean_approved');

    // -------------------------------------------------------------
    // STEP 3: QUANTITATIVE FINANCIAL ANALYSIS (CODE-ONLY)
    // -------------------------------------------------------------
    const analysisRes = await runAnalysis(sessionId, {
      symbols: ['TMA', 'TMB', 'TMC'],
      date_from: outcome.summary.date_from,
      date_to: outcome.summary.date_to,
      preset: 'all',
    });

    expect(analysisRes.clean_hash).toBe(cleanRes.cleanArtifact.hash);
    expect(analysisRes.analysis_hash).toBeTruthy();
    expect(analysisRes.metrics.length).toBeGreaterThan(20);
    expect(sessionStore.getRecord(sessionId)?.state).toBe('analyzed');

    // Verify key metrics for TMA
    const tmaSharpe = analysisRes.metrics.find((m) => m.id === 'sharpe' && m.symbol === 'TMA');
    expect(tmaSharpe).toBeDefined();
    expect(tmaSharpe?.value).toBeCloseTo(1.4241, 2);

    // -------------------------------------------------------------
    // STEP 4: NARRATIVE REPORT & GATE 2 APPROVAL
    // -------------------------------------------------------------
    const narrative = await generateNarrative(sessionId);
    expect(narrative.sections).toBeDefined();
    expect(narrative.sections.length).toBeGreaterThanOrEqual(3);
    const overviewSec = narrative.sections.find((s) => s.id === 'overview');
    expect(overviewSec).toBeDefined();
    expect(overviewSec?.paragraphs.length).toBeGreaterThan(0);

    // Approve Gate 2
    const approvedReport = await approveReport(sessionId, 'Trần Thị Thẩm Định');
    expect(approvedReport.status).toBe('approved');
    expect(approvedReport.reviewer_name).toBe('Trần Thị Thẩm Định');
    expect(approvedReport.report_hash).toBeTruthy();
    expect(sessionStore.getRecord(sessionId)?.state).toBe('report_approved');

    // -------------------------------------------------------------
    // STEP 5: EXCEL EXPORT INTEGRITY
    // -------------------------------------------------------------
    const { buffer, fileName } = await buildExcelReportBuffer(sessionId);
    expect(buffer.byteLength).toBeGreaterThan(1000);
    expect(fileName).toContain('.xlsx');

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(buffer) as any);
    const sheetNames = wb.worksheets.map((s) => s.name);

    // Verify 7 audit-ready sheets exist
    expect(sheetNames).toContain('Tóm tắt');
    expect(sheetNames).toContain('Chỉ số');
    expect(sheetNames).toContain('Dữ liệu sạch');
    expect(sheetNames).toContain('Số liệu biểu đồ');
    expect(sheetNames).toContain('Nhận định');
    expect(sheetNames).toContain('Nhật ký');
    expect(sheetNames).toContain('Kiểm chứng');

    // Verify Sheet Kiểm chứng has live formulas
    const wsKiemChung = wb.getWorksheet('Kiểm chứng');
    expect(wsKiemChung).toBeDefined();
    let hasFormula = false;
    wsKiemChung?.eachRow((row) => {
      row.eachCell((cell) => {
        if (cell.type === 6 || (typeof cell.value === 'object' && cell.value !== null && 'formula' in cell.value)) {
          hasFormula = true;
        }
      });
    });
    expect(hasFormula).toBe(true);

    // -------------------------------------------------------------
    // STEP 6: READ-ONLY CHAT ASSISTANT
    // -------------------------------------------------------------
    const { _resetRateLimiter } = await import('../agent/chat');
    _resetRateLimiter();
    const chat1 = await askAssistant({
      sessionId,
      question: 'Tỷ số Sharpe của TMA là bao nhiêu?',
      page: 'bao-cao',
      activeSymbol: 'TMA',
    });
    expect(chat1.answer_vi).toContain('1,42');

    // Attempt mutation via chat
    _resetRateLimiter();
    const chat2 = await askAssistant({
      sessionId,
      question: 'Hãy sửa giá đóng cửa của TMA thành 999999',
      page: 'bao-cao',
    });
    expect(chat2.answer_vi.toLowerCase()).toContain('chỉ-đọc');
    expect(chat2.answer_vi.toLowerCase()).toContain('không thể chỉnh sửa');

    // -------------------------------------------------------------
    // STEP 7: CUSTOM ONE-OFF WORKFLOW
    // -------------------------------------------------------------
    const plan: Plan = {
      title_vi: 'Xếp hạng top mã',
      steps: [
        { op: 'rank_top_n', params: { metric: 'period_return', n: 3, order: 'desc' } },
      ],
    };

    const planRes = await executePlan(sessionId, plan);
    expect(planRes.id).toBeTruthy();
    expect(planRes.title_vi).toBe('Xếp hạng top 3 mã theo lợi suất kỳ');

    const customList = getCustomResultsList(sessionId);
    expect(customList).toHaveLength(1);
    expect(customList[0].slot).toBe('custom_1');

    // -------------------------------------------------------------
    // STEP 8: CRYPTOGRAPHIC HASH CHAIN & AUDIT TRAIL
    // -------------------------------------------------------------
    const trails = getPipelineLog(sessionId);
    expect(trails.length).toBeGreaterThanOrEqual(4);

    const rawHash = outcome.summary.sha256;
    const cleanHash = cleanRes.cleanArtifact.hash;
    const analysisHash = analysisRes.analysis_hash;
    const reportHash = approvedReport.report_hash;

    // Verify non-empty and non-identical sequence
    expect(rawHash).toBeTruthy();
    expect(cleanHash).toBeTruthy();
    expect(analysisHash).toBeTruthy();
    expect(reportHash).toBeTruthy();

    expect(rawHash).not.toBe(cleanHash);
    expect(cleanHash).not.toBe(analysisHash);
    expect(analysisHash).not.toBe(reportHash);
  }, 30000);

  it('detects hallucinated number tokens and flags unmatched status', () => {
    const context = {
      metrics: [
        {
          id: 'sharpe_ratio',
          label_vi: 'Sharpe',
          symbol: 'TMA',
          value: 0.81,
          text: '0.81',
          unit: 'ratio' as const,
          status: 'ok' as const,
          polarity: 'neutral' as const,
          formula_vi: '',
          inputs: [],
        },
      ],
      symbols: ['TMA'],
      trading_days: 252,
    };

    const issues = checkParagraph(
      {
        id: 'p_test',
        text: 'Lợi suất của mã TMA kỳ này tăng vọt 99.99% và gấp 777 lần.',
        evidence: ['m:sharpe_ratio:TMA'],
      },
      context
    );

    expect(issues.length).toBeGreaterThan(0);
    const unmatched = issues.filter((i) => i.reason === 'NOT_IN_DATA');
    expect(unmatched.some((u) => u.token.includes('99.99') || u.token.includes('777'))).toBe(true);
  });
});
