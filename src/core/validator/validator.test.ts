import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { ArtifactStore } from '../artifacts';
import { createSession, getLog, getSession, setBusinessContext } from '../../services/sessionService';
import { sessionStore } from '../../services/sessionStore';
import {
  buildErrorCsv,
  precheckFile,
  runUpload,
} from '../../services/uploadService';
import { validateBytes, type ValidationOutcome } from './index';
import { detectFileFormat } from './detect';
import { parseCsvText } from './readCsv';
import { parseDateCell, parseNumber } from './parseCells';
import { DEFAULT_LIMITS } from './schemaSpec';

const TEST_CASES_DIR = path.resolve(__dirname, '../../../samples/test-cases');
const MANIFEST_PATH = path.join(TEST_CASES_DIR, 'MANIFEST.json');

describe('P2 Validator - Manifest-Driven Automated Test Suite (34 Test Cases)', () => {
  const manifestRaw = fs.readFileSync(MANIFEST_PATH, 'utf8');
  const manifest = JSON.parse(manifestRaw) as Array<{
    id: string;
    filename: string;
    description: string;
    expected_ok: boolean;
    expected_code?: string;
    expected_warning?: string;
  }>;

  it('contains test cases in MANIFEST.json', () => {
    expect(manifest.length).toBe(55);
  });

  for (const tc of manifest) {
    it(`[${tc.id}] ${tc.filename} -> ${tc.expected_ok ? 'PASS' : 'REJECT (' + tc.expected_code + ')'}`, async () => {
      const filePath = path.join(TEST_CASES_DIR, tc.filename);
      const fileBytes = new Uint8Array(fs.readFileSync(filePath));

      const outcome = await validateBytes(tc.filename, fileBytes, DEFAULT_LIMITS);

      expect(outcome.ok).toBe(tc.expected_ok);

      if (!outcome.ok) {
        expect(outcome.issues.length).toBeGreaterThan(0);
        if (tc.expected_code) {
          const hasExpectedCode = outcome.issues.some((i) => i.code === tc.expected_code);
          expect(hasExpectedCode).toBe(true);
        }
      } else {
        if (tc.expected_warning) {
          expect(outcome.warnings).toBeDefined();
          const hasWarning = outcome.warnings?.some((w) => w.code === tc.expected_warning);
          expect(hasWarning).toBe(true);
        }
      }
    });
  }
});

describe('P2 Validator - Unit Tests: File Detection (S1)', () => {
  it('detects 0-byte file as UPLOAD_EMPTY', () => {
    const res = detectFileFormat('test.csv', new Uint8Array(0), DEFAULT_LIMITS);
    expect(res.ok).toBe(false);
    expect(res.issue?.code).toBe('UPLOAD_EMPTY');
  });

  it('rejects unsupported file extension as UPLOAD_EXTENSION_UNSUPPORTED', () => {
    const res = detectFileFormat('report.docx', new Uint8Array([1, 2, 3]), DEFAULT_LIMITS);
    expect(res.ok).toBe(false);
    expect(res.issue?.code).toBe('UPLOAD_EXTENSION_UNSUPPORTED');
  });

  it('detects fake PNG with .xlsx extension as UPLOAD_CONTENT_MISMATCH', () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 1]);
    const res = detectFileFormat('fake.xlsx', pngBytes, DEFAULT_LIMITS);
    expect(res.ok).toBe(false);
    expect(res.issue?.code).toBe('UPLOAD_CONTENT_MISMATCH');
  });

  it('detects fake PDF with .csv extension as UPLOAD_CONTENT_MISMATCH', () => {
    const pdfBytes = new TextEncoder().encode('%PDF-1.4\n%âãÏÓ\n');
    const res = detectFileFormat('fake.csv', pdfBytes, DEFAULT_LIMITS);
    expect(res.ok).toBe(false);
    expect(res.issue?.code).toBe('UPLOAD_CONTENT_MISMATCH');
  });
});

describe('P2 Validator - Unit Tests: CSV RFC 4180 Parsing (S2)', () => {
  it('handles multiline cells, escaped quotes, and tracks physical row numbers', () => {
    const csv = `ColA,ColB\r\n"Multi\r\nLine","Normal"\r\n"Escaped ""quotes"" here",123`;
    const res = parseCsvText(csv, ',');

    expect(res.records.length).toBe(3);
    // Header
    expect(res.records[0].rowNumber).toBe(1);
    expect(res.records[0].cells).toEqual(['ColA', 'ColB']);
    // Multiline row starts at row 2
    expect(res.records[1].rowNumber).toBe(2);
    expect(res.records[1].cells[0]).toBe('Multi\r\nLine');
    // Third row starts at physical line 4
    expect(res.records[2].rowNumber).toBe(4);
    expect(res.records[2].cells[0]).toBe('Escaped "quotes" here');
  });

  it('counts and skips blank rows properly', () => {
    const csv = `A,B\n\n1,2\n   \n3,4\n\n`;
    const res = parseCsvText(csv, ',');

    expect(res.records.length).toBe(3); // Header + 2 data rows
    expect(res.skippedBlankRows).toBe(3);
  });
});

describe('P2 Validator - Unit Tests: Cell Parsing & Formats (S4)', () => {
  it('parses numbers under dot and comma conventions', () => {
    expect(parseNumber('1234.56', 'dot')).toBe(1234.56);
    expect(parseNumber('1,234.56', 'dot')).toBe(1234.56);
    expect(parseNumber('1234,56', 'comma')).toBe(1234.56);
    expect(parseNumber('1.234,56', 'comma')).toBe(1234.56);

    // Rejects currency symbols
    expect(parseNumber('100.00 VND', 'dot')).toBeNull();
    expect(parseNumber('$50.00', 'dot')).toBeNull();
    // Rejects boolean
    expect(parseNumber(true, 'dot')).toBeNull();
  });

  it('parses dates with UTC invariance', () => {
    // 2025-01-02 -> days since 1970-01-01
    const d1 = parseDateCell('2025-01-02');
    expect(d1.dateDays).not.toBeNull();
    expect(new Date(d1.dateDays! * 86400000).toISOString().slice(0, 10)).toBe('2025-01-02');

    // dd/mm/yyyy format
    const d2 = parseDateCell('15/08/2025');
    expect(d2.dateDays).not.toBeNull();
    expect(new Date(d2.dateDays! * 86400000).toISOString().slice(0, 10)).toBe('2025-08-15');

    // Invalid dates
    expect(parseDateCell('32/01/2025').dateDays).toBeNull();
    expect(parseDateCell('29/02/2025').dateDays).toBeNull(); // 2025 is not a leap year
  });
});

describe('P2 Validator - Unit Tests: Precheck & Formula Injection Defense', () => {
  it('precheckFile rejects multiple files and files exceeding size limit', () => {
    const f1 = new File(['123'], 'f1.csv');
    const f2 = new File(['456'], 'f2.csv');

    const multi = precheckFile([f1, f2]);
    expect(multi.ok).toBe(false);
    expect(multi.error?.code).toBe('FILE_MULTIPLE');

    const fakeBig = { name: 'big.csv', size: 10 * 1024 * 1024 } as File;
    const tooLarge = precheckFile([fakeBig], { ...DEFAULT_LIMITS, max_file_mb: 5 });
    expect(tooLarge.ok).toBe(false);
    expect(tooLarge.error?.code).toBe('FILE_TOO_LARGE');
  });

  it('neutralizes formula injection characters (=, +, -, @) in error CSV export', () => {
    const mockRejection: ValidationOutcome & { ok: false } = {
      ok: false,
      filename: 'test.csv',
      total_errors: 2,
      total_warnings: 0,
      truncated: false,
      issues: [
        {
          code: 'DATA_BAD_SYMBOL',
          severity: 'error',
          row: 5,
          column: 'Ma',
          value: '=CMD|"/C calc"!A0',
          message_vi: 'Formula trigger test',
          fix_vi: '+TestPlus',
        },
        {
          code: 'DATA_BAD_NUMBER',
          severity: 'error',
          row: 6,
          column: 'Mo',
          value: '@SUM(A1:A10)',
          message_vi: '-MinusNotice',
          fix_vi: 'Standard fix',
        },
      ],
    };

    const csv = buildErrorCsv(mockRejection);

    // Must start with UTF-8 BOM
    expect(csv.charCodeAt(0)).toBe(0xfeff);

    // Formula injection values must be prefixed with single quote '
    expect(csv).toContain("\"'=CMD|\"\"/C calc\"\"!A0\"");
    expect(csv).toContain("\"'@SUM(A1:A10)\"");
    expect(csv).toContain("\"'+TestPlus\"");
    expect(csv).toContain("\"'-MinusNotice\"");
  });
});

describe('P2 Validator - Atomic Session Updates on Upload', () => {
  beforeEach(() => {
    sessionStore.clearAll();
    ArtifactStore.clearAll();
  });

  it('rejects upload with CONTEXT_REQUIRED if business context is missing (Prompt D3)', async () => {
    const s = createSession('Phiên Thiếu Bối Cảnh');
    const validBytes = fs.readFileSync(path.join(TEST_CASES_DIR, 'TC28_file_utf8_bom.csv'));
    const validFile = new File([validBytes], 'TC28_file_utf8_bom.csv', { type: 'text/csv' });

    await expect(runUpload(s.id, validFile)).rejects.toThrow('Bạn cần nhập ít nhất một yêu cầu phân tích');
    const sAfter = getSession(s.id);
    expect(sAfter.state).toBe('created');
  });

  it('preserves previous session dataset and state if re-upload fails', async () => {
    const s = createSession('Phiên Kiểm Tra');
    setBusinessContext(s.id, {
      company_name: 'Công ty Test',
      analysis_questions: ['Mã nào sinh lời tốt nhất?'],
    });

    // 1. Successful first upload with valid file
    const validBytes = fs.readFileSync(path.join(TEST_CASES_DIR, 'TC28_file_utf8_bom.csv'));
    const validFile = new File([validBytes], 'TC28_file_utf8_bom.csv', { type: 'text/csv' });

    const outcome1 = await runUpload(s.id, validFile);
    expect(outcome1.ok).toBe(true);

    const sAfter1 = getSession(s.id);
    expect(sAfter1.state).toBe('uploaded');
    expect(sAfter1.dataset?.rows).toBeGreaterThan(0);
    expect(ArtifactStore.has(s.id, 'raw')).toBe(true);

    const originalRows = sAfter1.dataset?.rows;
    const originalHash = sAfter1.dataset?.sha256;

    // 2. Failed second upload with invalid file (negative price)
    const badBytes = fs.readFileSync(path.join(TEST_CASES_DIR, 'TC11_gia_am.csv'));
    const badFile = new File([badBytes], 'TC11_gia_am.csv', { type: 'text/csv' });

    const outcome2 = await runUpload(s.id, badFile);
    expect(outcome2.ok).toBe(false);

    // 3. Verify session state, dataset meta, and raw artifacts were NOT destroyed
    const sAfter2 = getSession(s.id);
    expect(sAfter2.state).toBe('uploaded');
    expect(sAfter2.dataset?.rows).toBe(originalRows);
    expect(sAfter2.dataset?.sha256).toBe(originalHash);
    expect(ArtifactStore.has(s.id, 'raw')).toBe(true);

    // Verify audit log has upload_rejected entry
    const log = getLog(s.id);
    const lastAudit = log[log.length - 1];
    expect(lastAudit.action).toBe('upload_rejected');
  });
});
