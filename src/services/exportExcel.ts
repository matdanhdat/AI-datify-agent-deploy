/**
 * Excel (.xlsx) Export Service with Live Verification Formulas (Prompt P5 Section 12).
 * Generates an audit-ready 7-sheet workbook with live Excel formulas verifying application metrics.
 * Uses dynamic import of exceljs to keep the initial client bundle lightweight.
 * Implements formula injection defense and logs export_xlsx audit entry.
 */

import { ArtifactStore } from '../core/artifacts';
import { appendLog } from '../core/audit';
import { sessionStore } from './sessionStore';
import type {
  AnalysisResult,
  CleanArtifact,
  ReportArtifact,
  PlanResult,
} from '../core/schemas';
import { formatDateTime } from '../utils/format';

/**
 * Sanitizes user-provided string against CSV/Excel Formula Injection.
 * Prefixes strings starting with =, +, -, @ with a single quote (').
 */
export function sanitizeFormulaString(val: unknown): string {
  if (val === null || val === undefined) return '';
  const s = String(val).trim();
  if (s.startsWith('=') || s.startsWith('+') || s.startsWith('-') || s.startsWith('@')) {
    return `'${s}`;
  }
  return s;
}

export interface ExportExcelOptions {
  sessionId: string;
}

/**
 * Exports session data to an Excel workbook with live formulas.
 * Returns the generated Uint8Array buffer.
 */
export async function buildExcelReportBuffer(sessionId: string): Promise<{ buffer: Uint8Array; fileName: string }> {
  const analysis = ArtifactStore.get<AnalysisResult>(sessionId, 'analysis');
  const report = ArtifactStore.get<ReportArtifact>(sessionId, 'report');
  const record = sessionStore.getRecord(sessionId);

  if (!analysis || !report) {
    throw new Error('Chưa có kết quả phân tích hoặc báo cáo để xuất Excel.');
  }

  // Retrieve clean dataset
  const cleanV = record?.meta.clean_version;
  const cleanArtifact = cleanV ? ArtifactStore.get<CleanArtifact>(sessionId, `clean_v${cleanV}`) : undefined;
  if (!cleanArtifact) {
    throw new Error('Không tìm thấy dữ liệu sạch của phiên.');
  }

  // Dynamically load exceljs
  const ExcelJS = await import('exceljs');
  const WorkbookClass = (ExcelJS as any).Workbook || (ExcelJS as any).default?.Workbook || ExcelJS;
  const workbook = new WorkbookClass();

  // Ensure full formula calculation on load in Microsoft Excel
  workbook.calcProperties.fullCalcOnLoad = true;

  const symbols = analysis.config.symbols;
  const symbolsSlug = symbols.join('_');
  const dateStamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const fileName = `Bao-cao-Pixel-Trading-${symbolsSlug}-${dateStamp}.xlsx`;

  // -------------------------------------------------------------
  // Sheet 1: Tóm tắt
  // -------------------------------------------------------------
  const wsSummary = workbook.addWorksheet('Tóm tắt');
  wsSummary.columns = [
    { header: 'Hạng mục', key: 'key', width: 28 },
    { header: 'Thông tin chi tiết', key: 'value', width: 65 },
  ];

  wsSummary.addRow({ key: 'TIÊU ĐỀ', value: 'BÁO CÁO PHÂN TÍCH GIAO DỊCH - DATIFY AI AGENT' });
  wsSummary.addRow({ key: 'Tên tệp nguồn', value: sanitizeFormulaString(record?.meta.dataset?.filename || 'file-mau-chuan.xlsx') });
  wsSummary.addRow({ key: 'Khoảng thời gian', value: `${analysis.config.date_from} đến ${analysis.config.date_to}` });
  wsSummary.addRow({ key: 'Danh sách mã', value: symbols.join(', ') });
  wsSummary.addRow({ key: 'Trạng thái phê duyệt', value: report.status === 'approved' ? 'ĐÃ PHÊ DUYỆT (CỔNG DUYỆT 2)' : 'BẢN THẢO (CHỜ DUYỆT)' });
  wsSummary.addRow({ key: 'Người duyệt', value: sanitizeFormulaString(report.reviewer_name || 'Chưa duyệt') });
  wsSummary.addRow({ key: 'Thời gian duyệt (Giờ Việt Nam)', value: report.approved_at ? `${formatDateTime(report.approved_at)} (Asia/Ho_Chi_Minh)` : 'Chưa duyệt' });
  wsSummary.addRow({ key: 'Mã băm dữ liệu sạch (clean_hash)', value: analysis.clean_hash });
  wsSummary.addRow({ key: 'Mã băm phân tích (analysis_hash)', value: analysis.analysis_hash });
  wsSummary.addRow({ key: 'Mã băm báo cáo (report_hash)', value: report.report_hash || 'N/A' });
  wsSummary.addRow({ key: 'Giả định tính toán', value: '252 phiên/năm; Lãi suất phi rủi ro = 0; MA20; MA50; RSI14; Đột biến KL > mean20 + 2*std20' });
  wsSummary.addRow({ key: 'Miễn trừ trách nhiệm', value: report.narrative.disclaimer_vi });

  // -------------------------------------------------------------
  // Sheet 2: Chỉ số
  // -------------------------------------------------------------
  const wsMetrics = workbook.addWorksheet('Chỉ số');
  wsMetrics.columns = [
    { header: 'Mã CK', key: 'symbol', width: 12 },
    { header: 'Mã ID', key: 'id', width: 20 },
    { header: 'Tên chỉ số', key: 'name', width: 28 },
    { header: 'Giá trị', key: 'value', width: 16 },
    { header: 'Đơn vị', key: 'unit', width: 12 },
    { header: 'Trạng thái', key: 'status', width: 16 },
    { header: 'Công thức toán học', key: 'formula', width: 45 },
    { header: 'Gợi ý Excel', key: 'excel', width: 35 },
    { header: 'Ghi chú / Lý do nếu thiếu', key: 'reason', width: 40 },
  ];

  for (const m of analysis.metrics) {
    const isRatio = m.unit === 'ratio';
    const isCurrency = m.unit === 'currency';
    const numVal = m.value !== null && m.value !== undefined ? m.value : null;

    const row = wsMetrics.addRow({
      symbol: m.symbol || 'TOÀN BỘ',
      id: m.id,
      name: m.label_vi,
      value: numVal !== null ? numVal : m.text || 'Chưa đủ dữ liệu',
      unit: m.unit,
      status: m.status === 'ok' ? 'Hợp lệ' : 'Chưa đủ dữ liệu',
      formula: m.formula_vi,
      excel: m.excel_hint,
      reason: m.reason_vi || '',
    });

    // Formatting
    if (numVal !== null) {
      const cell = row.getCell('value');
      if (isRatio) {
        cell.numFmt = '0.00%';
      } else if (isCurrency) {
        cell.numFmt = '#,##0.00';
      } else if (m.unit === 'count' || m.unit === 'number') {
        cell.numFmt = '#,##0';
      }
    }
  }

  // -------------------------------------------------------------
  // Sheet 3: Dữ liệu sạch (Sắp xếp theo Mã rồi Ngày)
  // -------------------------------------------------------------
  const wsClean = workbook.addWorksheet('Dữ liệu sạch');
  wsClean.columns = [
    { header: 'Ngày', key: 'date', width: 14 },
    { header: 'Mã CK', key: 'symbol', width: 10 },
    { header: 'Giá mở', key: 'open', width: 12 },
    { header: 'Giá cao', key: 'high', width: 12 },
    { header: 'Giá thấp', key: 'low', width: 12 },
    { header: 'Giá đóng', key: 'close', width: 12 },
    { header: 'Khối lượng', key: 'volume', width: 16 },
    { header: 'Bất thường', key: 'outlier', width: 14 },
    // Excel live formulas columns
    { header: 'Lợi suất ngày (Excel)', key: 'ret', width: 20 },
    { header: 'Đỉnh lũy kế (Excel)', key: 'peak', width: 20 },
    { header: 'Sụt giảm (Excel)', key: 'drawdown', width: 20 },
  ];

  // Extract and sort rows by Symbol then Date
  const ds = cleanArtifact.dataset;
  interface RowData {
    symbol: string;
    dateDays: number;
    isoDate: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    outlier: boolean;
  }

  const allRows: RowData[] = [];
  if (ds) {
    for (let i = 0; i < ds.n; i++) {
      const sName = ds.symbols[ds.symbol_idx[i]];
      if (!symbols.includes(sName)) continue;
      const dDays = ds.date_days[i];
      allRows.push({
        symbol: sName,
        dateDays: dDays,
        isoDate: new Date(dDays * 86400000).toISOString().slice(0, 10),
        open: ds.open[i],
        high: ds.high[i],
        low: ds.low[i],
        close: ds.close[i],
        volume: ds.volume[i],
        outlier: false,
      });
    }
  }

  allRows.sort((a, b) => {
    if (a.symbol !== b.symbol) return a.symbol.localeCompare(b.symbol);
    return a.dateDays - b.dateDays;
  });

  // Track start and end row for each symbol in Dữ liệu sạch for Sheet 7 (Kiểm chứng)
  const symbolRowRanges = new Map<string, { startRow: number; endRow: number }>();

  let currentRowIdx = 2; // header is row 1
  for (let i = 0; i < allRows.length; i++) {
    const r = allRows[i];
    const prevR = i > 0 ? allRows[i - 1] : null;
    const isNewSymbol = !prevR || prevR.symbol !== r.symbol;

    if (!symbolRowRanges.has(r.symbol)) {
      symbolRowRanges.set(r.symbol, { startRow: currentRowIdx, endRow: currentRowIdx });
    } else {
      symbolRowRanges.get(r.symbol)!.endRow = currentRowIdx;
    }

    const rowNum = currentRowIdx;
    const prevRowNum = rowNum - 1;

    // Daily Return formula: IF(B{row}=B{prev}, F{row}/F{prev}-1, "")
    // Peak formula: IF(B{row}=B{prev}, MAX(J{prev}, F{row}), F{row})
    // Drawdown formula: F{row}/J{row}-1
    const retFormula = isNewSymbol ? '' : `IF(B${rowNum}=B${prevRowNum}, F${rowNum}/F${prevRowNum}-1, "")`;
    const peakFormula = isNewSymbol ? `F${rowNum}` : `IF(B${rowNum}=B${prevRowNum}, MAX(J${prevRowNum}, F${rowNum}), F${rowNum})`;
    const ddFormula = `F${rowNum}/J${rowNum}-1`;

    const addedRow = wsClean.addRow({
      date: r.isoDate,
      symbol: r.symbol,
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      volume: r.volume,
      outlier: r.outlier ? 'Có' : 'Không',
      ret: retFormula ? { formula: retFormula } : '',
      peak: { formula: peakFormula },
      drawdown: { formula: ddFormula },
    });

    // Format cells
    addedRow.getCell('open').numFmt = '#,##0.00';
    addedRow.getCell('high').numFmt = '#,##0.00';
    addedRow.getCell('low').numFmt = '#,##0.00';
    addedRow.getCell('close').numFmt = '#,##0.00';
    addedRow.getCell('volume').numFmt = '#,##0';
    addedRow.getCell('ret').numFmt = '0.00%';
    addedRow.getCell('peak').numFmt = '#,##0.00';
    addedRow.getCell('drawdown').numFmt = '0.00%';

    currentRowIdx++;
  }

  // -------------------------------------------------------------
  // Sheet 4: Số liệu biểu đồ
  // -------------------------------------------------------------
  const wsCharts = workbook.addWorksheet('Số liệu biểu đồ');
  for (const c of analysis.charts) {
    wsCharts.addRow([`[BIỂU ĐỒ] ${c.title_vi} (${c.id})`]);
    if (c.table && c.table.columns.length > 0) {
      wsCharts.addRow(c.table.columns);
      for (const rowData of c.table.rows) {
        wsCharts.addRow(rowData);
      }
    }
    wsCharts.addRow([]); // Blank line separation
  }

  // -------------------------------------------------------------
  // Sheet 5: Nhận định
  // -------------------------------------------------------------
  const wsNarrative = workbook.addWorksheet('Nhận định');
  wsNarrative.columns = [
    { header: 'Mục', key: 'section', width: 25 },
    { header: 'Đoạn ID', key: 'id', width: 14 },
    { header: 'Nguồn', key: 'source', width: 12 },
    { header: 'Căn cứ (Evidence)', key: 'evidence', width: 35 },
    { header: 'Nội dung nhận định', key: 'text', width: 85 },
  ];

  for (const sec of report.narrative.sections) {
    for (const p of sec.paragraphs) {
      wsNarrative.addRow({
        section: sec.title_vi,
        id: p.id,
        source: p.source === 'ai' ? 'Trí tuệ Nhân tạo' : p.source === 'edited' ? 'Đã chỉnh sửa' : 'Mẫu câu',
        evidence: p.evidence.join(', '),
        text: sanitizeFormulaString(p.text),
      });
    }
  }

  // -------------------------------------------------------------
  // Sheet 6: Nhật ký
  // -------------------------------------------------------------
  const wsAudit = workbook.addWorksheet('Nhật ký');
  wsAudit.columns = [
    { header: 'ID', key: 'id', width: 8 },
    { header: 'Thời gian (UTC)', key: 'ts', width: 22 },
    { header: 'Bước', key: 'step', width: 12 },
    { header: 'Tác nhân', key: 'actor', width: 12 },
    { header: 'Hành động', key: 'action', width: 25 },
    { header: 'Chi tiết hành động', key: 'detail', width: 65 },
    { header: 'Mã băm liên quan', key: 'data_hash', width: 25 },
  ];

  if (record?.log) {
    for (const entry of record.log) {
      wsAudit.addRow({
        id: entry.id,
        ts: entry.ts,
        step: entry.step,
        actor: entry.actor,
        action: entry.action,
        detail: sanitizeFormulaString(entry.detail),
        data_hash: entry.data_hash || '',
      });
    }
  }

  // -------------------------------------------------------------
  // Sheet 7: Kiểm chứng (Live Verification Formulas)
  // -------------------------------------------------------------
  const wsVerify = workbook.addWorksheet('Kiểm chứng');
  wsVerify.columns = [
    { header: 'Mã CK', key: 'symbol', width: 12 },
    { header: 'Chỉ số kiểm chứng', key: 'name', width: 25 },
    { header: 'Giá trị Ứng dụng', key: 'app_val', width: 18 },
    { header: 'Công thức Excel Sống', key: 'formula_text', width: 45 },
    { header: 'Kết quả Excel Tính', key: 'excel_calc', width: 18 },
    { header: 'Chênh lệch tuyệt đối', key: 'diff', width: 20 },
    { header: 'Kết luận Đối chiếu', key: 'conclusion', width: 18 },
  ];

  let verifyRowIdx = 2; // header is row 1
  for (const sym of symbols) {
    const range = symbolRowRanges.get(sym);
    if (!range) continue;

    const rStart = range.startRow;
    const rEnd = range.endRow;

    // Collect app values
    const getVal = (id: string) =>
      analysis.metrics.find((m) => m.symbol === sym && m.id === id)?.value ?? 0;

    const checks = [
      {
        name: 'Lợi suất cả kỳ',
        appVal: getVal('period_return'),
        isRatio: true,
        formula: `=('Dữ liệu sạch'!F${rEnd}-'Dữ liệu sạch'!F${rStart})/'Dữ liệu sạch'!F${rStart}`,
      },
      {
        name: 'Biến động năm hóa',
        appVal: getVal('ann_vol'),
        isRatio: true,
        formula: `=STDEV.S('Dữ liệu sạch'!I${rStart + 1}:I${rEnd})*SQRT(252)`,
      },
      {
        name: 'Chỉ số Sharpe (Rf=0)',
        appVal: getVal('sharpe'),
        isRatio: false,
        formula: `=(AVERAGE('Dữ liệu sạch'!I${rStart + 1}:I${rEnd})/STDEV.S('Dữ liệu sạch'!I${rStart + 1}:I${rEnd}))*SQRT(252)`,
      },
      {
        name: 'Sụt giảm tối đa (MDD)',
        appVal: getVal('max_dd'),
        isRatio: true,
        formula: `=MIN('Dữ liệu sạch'!K${rStart}:K${rEnd})`,
      },
      {
        name: 'Tỷ lệ phiên tăng',
        appVal: getVal('win_rate'),
        isRatio: true,
        formula: `=COUNTIF('Dữ liệu sạch'!I${rStart + 1}:I${rEnd}, ">0")/COUNT('Dữ liệu sạch'!I${rStart + 1}:I${rEnd})`,
      },
    ];

    for (const c of checks) {
      const rowNum = verifyRowIdx;
      const diffFormula = `=ABS(C${rowNum}-E${rowNum})`;
      const conclusionFormula = `=IF(F${rowNum}<=1E-9*MAX(1,ABS(E${rowNum})), "Khớp", "Lệch")`;

      const added = wsVerify.addRow({
        symbol: sym,
        name: c.name,
        app_val: c.appVal,
        formula_text: c.formula,
        excel_calc: { formula: c.formula.replace(/^=/, '') },
        diff: { formula: diffFormula.replace(/^=/, '') },
        conclusion: { formula: conclusionFormula.replace(/^=/, '') },
      });

      if (c.isRatio) {
        added.getCell('app_val').numFmt = '0.00%';
        added.getCell('excel_calc').numFmt = '0.00%';
      } else {
        added.getCell('app_val').numFmt = '#,##0.00';
        added.getCell('excel_calc').numFmt = '#,##0.00';
      }
      added.getCell('diff').numFmt = '0.0000';

      verifyRowIdx++;
    }
  }

  // -------------------------------------------------------------
  // Sheet 8: Phân tích riêng (Prompt P6 Section 9.3)
  // Included only when custom analysis results exist in session
  // -------------------------------------------------------------
  const customResults: PlanResult[] = [];
  for (let i = 1; i <= 3; i++) {
    const cr = ArtifactStore.get<PlanResult>(sessionId, `custom_${i}`);
    if (cr) customResults.push(cr);
  }

  if (customResults.length > 0) {
    const wsCustom = workbook.addWorksheet('Phân tích riêng');
    for (const cr of customResults) {
      wsCustom.addRow([`[PHÂN TÍCH RIÊNG] ${sanitizeFormulaString(cr.title_vi)} (${cr.id})`]);
      wsCustom.addRow(['Các bước đã thực thi:']);
      for (let sIdx = 0; sIdx < cr.steps_text.length; sIdx++) {
        wsCustom.addRow([`  ${sIdx + 1}. ${sanitizeFormulaString(cr.steps_text[sIdx])}`]);
      }
      wsCustom.addRow([]);

      for (const tbl of cr.tables) {
        wsCustom.addRow([`Bảng: ${sanitizeFormulaString(tbl.title_vi)}`]);
        wsCustom.addRow(tbl.columns);
        for (const row of tbl.rows) {
          const rowVals = tbl.columns.map((_, cIdx) => {
            const raw = Array.isArray(row) ? row[cIdx] : (row as any)[tbl.columns[cIdx]];
            if (typeof raw === 'number') return raw;
            if (typeof raw === 'string') {
              const trimmed = raw.trim();
              if (/^[+-]?[\d.,]+%$/.test(trimmed)) {
                const num = parseFloat(trimmed.replace('%', '').replace(',', '.'));
                if (!isNaN(num)) return num / 100;
              }
              const numVal = parseFloat(trimmed.replace(/\./g, '').replace(',', '.'));
              if (!isNaN(numVal) && !/^[0-9]{4}-[0-9]{2}-[0-9]{2}/.test(trimmed)) {
                return numVal;
              }
              return sanitizeFormulaString(raw);
            }
            return '';
          });
          wsCustom.addRow(rowVals);
        }
        wsCustom.addRow([]);
      }

      if (cr.summary_lines && cr.summary_lines.length > 0) {
        wsCustom.addRow(['Dòng tóm tắt (do hệ thống tạo):']);
        for (const line of cr.summary_lines) {
          wsCustom.addRow([`  * ${sanitizeFormulaString(line)}`]);
        }
        wsCustom.addRow([]);
      }
      wsCustom.addRow(['------------------------------------------------------------']);
    }
  }

  // Generate buffer
  const rawBuffer = await workbook.xlsx.writeBuffer();
  const buffer = new Uint8Array(rawBuffer);

  // Log export_xlsx audit entry
  if (record) {
    record.log = appendLog(record.log, {
      step: 'report',
      actor: 'user',
      action: 'export_xlsx',
      detail: `Xuất tệp báo cáo Excel 7 sheet kèm công thức sống kiểm chứng: ${fileName}`,
      data_hash: report.report_hash || analysis.analysis_hash,
    });
    sessionStore.setRecord(record);
  }

  return { buffer, fileName };
}

/**
 * Triggers browser download for Excel file.
 */
export async function downloadExcelReport(sessionId: string): Promise<string> {
  const { buffer, fileName } = await buildExcelReportBuffer(sessionId);
  const blob = new Blob([buffer.buffer as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return fileName;
}
