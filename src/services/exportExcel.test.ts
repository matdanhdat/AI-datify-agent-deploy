import { describe, it, expect } from 'vitest';
import { ArtifactStore } from '../core/artifacts';
import { sessionStore } from './sessionStore';
import { sanitizeFormulaString, buildExcelReportBuffer } from './exportExcel';
import type { AnalysisResult, CleanArtifact, ReportArtifact } from '../core/schemas';
import type { SessionRecord } from '../core/state';
import ExcelJS from 'exceljs';

describe('P5 exportExcel - 7-Sheet Audit-Ready Excel Export', () => {
  const sessionId = '99999999-8888-7777-6666-555555555555';

  it('sanitizes formula injection prefixes correctly', () => {
    expect(sanitizeFormulaString('=CMD()')).toBe("'=CMD()");
    expect(sanitizeFormulaString('+1234')).toBe("'+1234");
    expect(sanitizeFormulaString('-alert(1)')).toBe("'-alert(1)");
    expect(sanitizeFormulaString('@SUM(A1:A10)')).toBe("'@SUM(A1:A10)");
    expect(sanitizeFormulaString('Normal String')).toBe('Normal String');
    expect(sanitizeFormulaString(12345)).toBe('12345');
    expect(sanitizeFormulaString(null)).toBe('');
  });

  it('builds a complete 7-sheet workbook with live formulas in Sheet Kiểm chứng', async () => {
    const analysis: AnalysisResult = {
      config: {
        symbols: ['TMA'],
        date_from: '2025-01-02',
        date_to: '2025-12-31',
        preset: 'all',
      },
      created_at: '2026-11-14T10:00:00Z',
      clean_hash: 'mock-clean-hash-excel-12345',
      analysis_hash: 'mock-analysis-hash-excel-67890',
      assumptions: {
        trading_days: 252,
        risk_free_rate: 0,
        ma_windows: [20, 50],
        rsi_window: 14,
        volume_spike_rule: 'volume > mean20 + 2*std20',
        return_type: 'simple_close',
      },
      warnings: [],
      metrics: [
        {
          id: 'sessions',
          label_vi: 'Số phiên',
          symbol: 'TMA',
          value: 3,
          text: '3',
          unit: 'count',
          polarity: 'neutral',
          status: 'ok',
          formula_vi: 'Đếm số dòng',
          inputs: [],
        },
        {
          id: 'avg_volume',
          label_vi: 'KLGD trung bình',
          symbol: 'TMA',
          value: 1500000,
          text: '1.500.000',
          unit: 'count',
          polarity: 'neutral',
          status: 'ok',
          formula_vi: 'Trung bình cộng khối lượng',
          inputs: [],
          excel_hint: '=AVERAGE(G2:G4)',
        },
      ],
      charts: [
        {
          id: 'chart_price_ma',
          title_vi: 'Biểu đồ Giá và MA',
          kind: 'line',
          symbols: ['TMA'],
          data: {},
          table: {
            columns: ['date', 'close', 'ma20'],
            rows: [
              ['2025-01-02', 70000, 70000],
              ['2025-01-03', 71000, 70500],
              ['2025-01-04', 72000, 71000],
            ],
          },
        },
      ],
    };

    const cleanArtifact: CleanArtifact = {
      dataset: {
        n: 3,
        symbols: ['TMA'],
        symbol_idx: new Uint16Array([0, 0, 0]),
        date_days: new Int32Array([20090, 20091, 20092]),
        open: new Float64Array([69000, 70000, 71000]),
        high: new Float64Array([71000, 71500, 72500]),
        low: new Float64Array([68500, 69500, 70500]),
        close: new Float64Array([70000, 71000, 72000]),
        volume: new Float64Array([1000000, 1500000, 2000000]),
        source_row: new Int32Array([1, 2, 3]),
      },
      outlier_flags: new Uint8Array([0, 0, 0]),
      decisions: {},
      hash: analysis.clean_hash,
      approved_at: '2026-11-14T09:00:00Z',
      reviewer_name: 'Duyệt Viên 1',
    };

    const report: ReportArtifact = {
      narrative: {
        analysis_hash: analysis.analysis_hash,
        generated_at: '2026-11-14T11:00:00Z',
        mode: 'ai',
        disclaimer_vi: 'Khuyến cáo miễn trừ trách nhiệm phân tích.',
        sections: [
          {
            id: 'overview',
            title_vi: 'Tổng quan kỳ phân tích',
            source: 'ai',
            paragraphs: [
              {
                id: 'overview-1',
                text: 'Kỳ phân tích gồm 3 phiên giao dịch.',
                evidence: ['m:sessions:TMA'],
                source: 'ai',
                check_issues: [],
              },
            ],
          },
        ],
      },
      analysis_hash: analysis.analysis_hash,
      status: 'approved',
      reviewer_name: 'Người Duyệt Báo Cáo',
      approved_at: '2026-11-14T11:30:00Z',
      report_hash: 'mock-report-hash-0123456789abcdef',
    };

    const record: SessionRecord = {
      id: sessionId,
      state: 'report_approved',
      created_at: '2026-11-14T10:00:00Z',
      updated_at: '2026-11-14T11:30:00Z',
      meta: {
        dataset: {
          filename: 'test-dataset.xlsx',
          rows: 3,
          symbols: ['TMA'],
          date_from: '2025-01-02',
          date_to: '2025-01-04',
        },
        clean_version: 1,
        report_status: 'approved',
      },
      log: [],
    };

    sessionStore.setRecord(record);
    sessionStore.setActiveSessionId(sessionId);
    ArtifactStore.put(sessionId, 'analysis', analysis);
    ArtifactStore.put(sessionId, 'clean_v1', cleanArtifact);
    ArtifactStore.put(sessionId, 'report', report);

    const { buffer, fileName } = await buildExcelReportBuffer(sessionId);

    expect(buffer).toBeDefined();
    expect(buffer.byteLength).toBeGreaterThan(1000);
    expect(fileName).toMatch(/^Bao-cao-Pixel-Trading-.*\.xlsx$/);

    // Parse the generated buffer with ExcelJS to verify all 7 sheets
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(buffer) as any);

    const sheetNames = workbook.worksheets.map((ws) => ws.name);
    expect(sheetNames).toEqual([
      'Tóm tắt',
      'Chỉ số',
      'Dữ liệu sạch',
      'Số liệu biểu đồ',
      'Nhận định',
      'Nhật ký',
      'Kiểm chứng',
    ]);

    // Verify Sheet 7: Kiểm chứng contains live formula and relative tolerance
    const wsKiemChung = workbook.getWorksheet('Kiểm chứng');
    expect(wsKiemChung).toBeDefined();

    // Check conclusion formula in column G uses relative tolerance 1E-9*MAX(1,ABS(...))
    const conclusionCell = wsKiemChung?.getCell('G2');
    const conclusionVal = (conclusionCell?.value as any)?.formula || conclusionCell?.value;
    expect(String(conclusionVal)).toContain('1E-9*MAX(1,ABS(');

    // Verify Sheet 1: Tóm tắt contains Vietnam timezone approval timestamp
    const wsSummary = workbook.getWorksheet('Tóm tắt');
    let approvalTimeText = '';
    wsSummary?.eachRow((row) => {
      if (String(row.getCell(1).value).includes('Thời gian duyệt')) {
        approvalTimeText = String(row.getCell(2).value);
      }
    });
    expect(approvalTimeText).toContain('Asia/Ho_Chi_Minh');
    expect(approvalTimeText).toContain('14/11/2026'); // Converted to VN time (+7)
  });

  it('A3: verifies multi-symbol separate cell ranges and formula evaluation', async () => {
    const multiSessionId = 'multi-symbol-session-excel';
    const analysis: AnalysisResult = {
      config: {
        symbols: ['TMA', 'TMB'],
        date_from: '2025-01-02',
        date_to: '2025-01-04',
        preset: 'all',
      },
      created_at: '2026-11-14T10:00:00Z',
      clean_hash: 'mock-clean-multi',
      analysis_hash: 'mock-analysis-multi',
      assumptions: {
        trading_days: 252,
        risk_free_rate: 0,
        ma_windows: [20, 50],
        rsi_window: 14,
        volume_spike_rule: 'volume > mean20 + 2*std20',
        return_type: 'simple_close',
      },
      warnings: [],
      metrics: [
        { id: 'period_return', label_vi: 'Lợi suất', symbol: 'TMA', value: 0.05, unit: 'ratio', status: 'ok', polarity: 'higher_better', formula_vi: '', inputs: [] },
        { id: 'ann_vol', label_vi: 'Biến động', symbol: 'TMA', value: 0.15, unit: 'ratio', status: 'ok', polarity: 'lower_better', formula_vi: '', inputs: [] },
        { id: 'sharpe', label_vi: 'Sharpe', symbol: 'TMA', value: 1.2, unit: 'number', status: 'ok', polarity: 'higher_better', formula_vi: '', inputs: [] },
        { id: 'max_dd', label_vi: 'MDD', symbol: 'TMA', value: -0.04, unit: 'ratio', status: 'ok', polarity: 'lower_better', formula_vi: '', inputs: [] },
        { id: 'win_rate', label_vi: 'Tỷ lệ tăng', symbol: 'TMA', value: 0.66, unit: 'ratio', status: 'ok', polarity: 'higher_better', formula_vi: '', inputs: [] },
        { id: 'period_return', label_vi: 'Lợi suất', symbol: 'TMB', value: -0.02, unit: 'ratio', status: 'ok', polarity: 'higher_better', formula_vi: '', inputs: [] },
        { id: 'ann_vol', label_vi: 'Biến động', symbol: 'TMB', value: 0.22, unit: 'ratio', status: 'ok', polarity: 'lower_better', formula_vi: '', inputs: [] },
        { id: 'sharpe', label_vi: 'Sharpe', symbol: 'TMB', value: -0.5, unit: 'number', status: 'ok', polarity: 'higher_better', formula_vi: '', inputs: [] },
        { id: 'max_dd', label_vi: 'MDD', symbol: 'TMB', value: -0.08, unit: 'ratio', status: 'ok', polarity: 'lower_better', formula_vi: '', inputs: [] },
        { id: 'win_rate', label_vi: 'Tỷ lệ tăng', symbol: 'TMB', value: 0.33, unit: 'ratio', status: 'ok', polarity: 'higher_better', formula_vi: '', inputs: [] },
      ],
      charts: [],
    };

    const cleanArtifact: CleanArtifact = {
      dataset: {
        n: 6,
        symbols: ['TMA', 'TMB'],
        symbol_idx: new Uint16Array([0, 0, 0, 1, 1, 1]),
        date_days: new Int32Array([20090, 20091, 20092, 20090, 20091, 20092]),
        open: new Float64Array([100, 102, 104, 50, 49, 48]),
        high: new Float64Array([105, 106, 107, 52, 51, 50]),
        low: new Float64Array([99, 101, 103, 49, 48, 47]),
        close: new Float64Array([100, 103, 105, 50, 48, 49]),
        volume: new Float64Array([1000, 1200, 1500, 500, 600, 700]),
        source_row: new Int32Array([1, 2, 3, 4, 5, 6]),
      },
      outlier_flags: new Uint8Array([0, 0, 0, 0, 0, 0]),
      decisions: {},
      hash: 'mock-clean-multi',
      approved_at: '2026-11-14T09:00:00Z',
      reviewer_name: 'Duyệt Viên Multi',
    };

    const report: ReportArtifact = {
      narrative: {
        analysis_hash: 'mock-analysis-multi',
        generated_at: '2026-11-14T11:00:00Z',
        mode: 'template',
        disclaimer_vi: 'Miễn trừ',
        sections: [],
      },
      analysis_hash: 'mock-analysis-multi',
      status: 'approved',
      reviewer_name: 'Người Duyệt Báo Cáo',
      approved_at: '2026-11-14T11:30:00Z',
      report_hash: 'hash-multi-report',
    };

    const record: SessionRecord = {
      id: multiSessionId,
      state: 'report_approved',
      created_at: '2026-11-14T10:00:00Z',
      updated_at: '2026-11-14T11:30:00Z',
      meta: {
        dataset: { filename: 'multi.xlsx', rows: 6, symbols: ['TMA', 'TMB'], date_from: '2025-01-02', date_to: '2025-01-04' },
        clean_version: 1,
        report_status: 'approved',
      },
      log: [],
    };

    sessionStore.setRecord(record);
    sessionStore.setActiveSessionId(multiSessionId);
    ArtifactStore.put(multiSessionId, 'analysis', analysis);
    ArtifactStore.put(multiSessionId, 'clean_v1', cleanArtifact);
    ArtifactStore.put(multiSessionId, 'report', report);

    const { buffer } = await buildExcelReportBuffer(multiSessionId);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(buffer) as any);

    const wsKiemChung = workbook.getWorksheet('Kiểm chứng');
    expect(wsKiemChung).toBeDefined();

    // Verify row ranges: TMA rows in Dữ liệu sạch are 2:4, TMB are 5:7
    // Find formulas for TMA and TMB
    const tmaFormulas: string[] = [];
    const tmbFormulas: string[] = [];

    wsKiemChung?.eachRow((row, rowIdx) => {
      if (rowIdx === 1) return;
      const sym = row.getCell(1).value;
      const fText = row.getCell(4).value;
      if (sym === 'TMA') tmaFormulas.push(String(fText));
      if (sym === 'TMB') tmbFormulas.push(String(fText));
    });

    expect(tmaFormulas.length).toBe(5);
    expect(tmbFormulas.length).toBe(5);

    // TMA uses rows 2 to 4
    expect(tmaFormulas[0]).toContain('F4');
    expect(tmaFormulas[0]).toContain('F2');

    // TMB uses rows 5 to 7
    expect(tmbFormulas[0]).toContain('F7');
    expect(tmbFormulas[0]).toContain('F5');
  });

  it('adds Sheet 8 "Phân tích riêng" when custom analysis results exist', async () => {
    const customSessionId = 'custom-analysis-session-123';
    const analysis: AnalysisResult = {
      config: { symbols: ['TMA'], date_from: '2025-01-02', date_to: '2025-01-04', preset: 'all' },
      created_at: '2026-11-14T10:00:00Z',
      clean_hash: 'mock-clean-hash',
      analysis_hash: 'mock-analysis-hash',
      assumptions: { trading_days: 252, risk_free_rate: 0, ma_windows: [20, 50], rsi_window: 14, volume_spike_rule: '', return_type: 'simple_close' },
      warnings: [],
      metrics: [],
      charts: [],
    };
    const cleanArtifact: CleanArtifact = {
      dataset: {
        n: 3,
        symbols: ['TMA'],
        symbol_idx: new Uint16Array([0, 0, 0]),
        date_days: new Int32Array([20090, 20091, 20092]),
        open: new Float64Array([10, 11, 12]),
        high: new Float64Array([11, 12, 13]),
        low: new Float64Array([9, 10, 11]),
        close: new Float64Array([10.5, 11.5, 12.5]),
        volume: new Float64Array([100, 200, 300]),
        source_row: new Int32Array([1, 2, 3]),
      },
      outlier_flags: new Uint8Array([0, 0, 0]),
      decisions: {},
      hash: 'mock-clean-hash',
      approved_at: '2026-11-14T10:00:00Z',
      reviewer_name: 'Test Reviewer',
    };
    const report: ReportArtifact = {
      narrative: { analysis_hash: 'mock-analysis-hash', generated_at: '2026-11-14T11:00:00Z', mode: 'template', disclaimer_vi: 'Miễn trừ', sections: [] },
      analysis_hash: 'mock-analysis-hash',
      status: 'approved',
      reviewer_name: 'Test Reviewer',
      approved_at: '2026-11-14T11:30:00Z',
      report_hash: 'mock-custom-report-hash',
    };

    ArtifactStore.put(customSessionId, 'analysis', analysis);
    ArtifactStore.put(customSessionId, 'clean_v1', cleanArtifact);
    ArtifactStore.put(customSessionId, 'report', report);
    sessionStore.setRecord({
      id: customSessionId,
      state: 'report_approved',
      created_at: '2026-11-14T10:00:00Z',
      updated_at: '2026-11-14T11:30:00Z',
      meta: {
        dataset: { filename: 'custom.xlsx', rows: 3, symbols: ['TMA'], date_from: '2025-01-02', date_to: '2025-01-04' },
        clean_version: 1,
        report_status: 'approved',
      },
      log: [],
    });

    // Put a custom plan result in custom_1
    ArtifactStore.put(customSessionId, 'custom_1', {
      id: 'custom_test_123',
      title_vi: 'Xếp hạng top mã',
      steps_text: ['Bước 1: Lọc dữ liệu', 'Bước 2: Xếp hạng top mã'],
      tables: [
        {
          id: 'tbl_rank',
          title_vi: 'Bảng xếp hạng',
          columns: ['Hạng', 'Mã CP', 'Giá trị'],
          rows: [[1, 'TMA', 12.5]],
        },
      ],
      charts: [],
      summary_lines: ['Mã TMA dẫn đầu với giá trị 12.5.'],
    });

    const { buffer } = await buildExcelReportBuffer(customSessionId);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(buffer) as any);

    const wsCustom = workbook.getWorksheet('Phân tích riêng');
    expect(wsCustom).toBeDefined();

    const textRows: string[] = [];
    wsCustom?.eachRow((row) => {
      textRows.push(String(row.getCell(1).value));
    });
    expect(textRows.some((r) => r.includes('Xếp hạng top mã'))).toBe(true);
  });
});
