/**
 * Quantitative & Business Analysis Orchestration Service (Prompt P4 & M3-A).
 * Bridges UI, Web Worker, ArtifactStore, and Session State Machine.
 * Includes Watchdog protection (15s inactivity / 30s hard ceiling), concurrency lock,
 * clean-hash idempotency, and optional ?debug=perf instrumentation.
 * Pure TypeScript - zero external dependencies. Zero AI calls.
 */

import { ArtifactStore } from '../core/artifacts';
import { AppError, ERROR_CODES } from '../core/errors';
import type { AnalysisConfig, AnalysisResult } from '../core/schemas';
import { AnalysisConfigSchema } from '../core/schemas';
import { getActiveCleanArtifact } from './cleanService';
import { dispatch } from './sessionService';
import { sessionStore } from './sessionStore';
import { calculateMetrics, extractSymbolSeries } from '../core/metrics/calculator';
import { generateCharts } from '../core/metrics/charts';
import { analyzeBusinessTable } from '../core/metrics/businessAnalyzer';
import { computeAnalysisHash } from '../core/metrics/canonicalAnalysisHash';
import { runInWorker, type WorkerRunnerOptions } from '../workers/workerRunner';
import type {
  AnalysisWorkerInput,
  AnalysisWorkerProgress,
} from '../workers/analysis.worker';

export interface AnalysisServiceOptions extends WorkerRunnerOptions<AnalysisWorkerProgress> {
  /** Test-only option to verify Watchdog terminates hanging worker. */
  __simulateHang?: boolean;
}

export interface AvailableDatasetMeta {
  kind: 'trading' | 'business';
  symbols: string[];
  date_from: string;
  date_to: string;
  total_rows: number;
  total_columns?: number;
  clean_hash?: string;
  dimension_columns?: string[];
  measure_columns?: string[];
}

// Concurrency lock per session to prevent accidental double-triggers / re-render loops
const inFlightAnalysisSessions = new Set<string>();

function isPerfDebugEnabled(): boolean {
  if (typeof window === 'undefined' || typeof performance === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('debug') === 'perf';
  } catch {
    return false;
  }
}

function perfMark(name: string) {
  if (isPerfDebugEnabled() && typeof performance.mark === 'function') {
    performance.mark(name);
  }
}

function perfMeasure(name: string, startMark: string, endMark: string) {
  if (isPerfDebugEnabled() && typeof performance.measure === 'function') {
    try {
      performance.measure(name, startMark, endMark);
    } catch {
      // Ignore missing mark
    }
  }
}

/**
 * Returns whether an analysis run is currently in flight for a given session.
 */
export function isAnalysisInFlight(sessionId: string): boolean {
  return inFlightAnalysisSessions.has(sessionId);
}

/**
 * Returns summary of clean dataset available for configuration on AnalyzePage.
 * Supports both Trading (RawDataset) and Business (BusinessTable).
 */
export function getAvailableDatasetMeta(sessionId: string): AvailableDatasetMeta | undefined {
  const cleanArtifact = getActiveCleanArtifact(sessionId);
  if (!cleanArtifact) return undefined;

  if (cleanArtifact.kind === 'business' || cleanArtifact.businessTable) {
    const table = cleanArtifact.businessTable;
    if (!table) return undefined;

    const timeCol = table.columns.find((c) => c.role === 'time');
    let dateFrom = '';
    let dateTo = '';
    if (timeCol && timeCol.role === 'time') {
      if (timeCol.raw_labels && timeCol.raw_labels.length > 0) {
        const nonEmpty = timeCol.raw_labels.map((s) => s.trim()).filter(Boolean).sort();
        dateFrom = nonEmpty[0] || '';
        dateTo = nonEmpty[nonEmpty.length - 1] || '';
      } else if (timeCol.values.length > 0) {
        let minV = Infinity;
        let maxV = -Infinity;
        for (let i = 0; i < timeCol.values.length; i++) {
          const v = timeCol.values[i];
          if (v >= 0) {
            if (v < minV) minV = v;
            if (v > maxV) maxV = v;
          }
        }
        const fmt = (v: number) => {
          if (timeCol.granularity === 'month') {
            const yr = 1970 + Math.floor(v / 12);
            const mo = (v % 12) + 1;
            return `${yr}-${mo < 10 ? '0' : ''}${mo}`;
          }
          return new Date(v * 86400000).toISOString().slice(0, 10);
        };
        if (minV !== Infinity) dateFrom = fmt(minV);
        if (maxV !== -Infinity) dateTo = fmt(maxV);
      }
    }

    const dimensionColumns = table.columns.filter((c) => c.role === 'dimension').map((c) => c.label);
    const measureColumns = table.columns.filter((c) => c.role === 'measure').map((c) => c.label);

    return {
      kind: 'business',
      symbols: ['BUSINESS'],
      date_from: dateFrom || 'N/A',
      date_to: dateTo || 'N/A',
      total_rows: table.n,
      total_columns: table.columns.length,
      clean_hash: cleanArtifact.hash,
      dimension_columns: dimensionColumns,
      measure_columns: measureColumns,
    };
  }

  const dataset = cleanArtifact.dataset;
  if (!dataset) return undefined;
  let minDays = Infinity;
  let maxDays = -Infinity;

  for (let i = 0; i < dataset.n; i++) {
    const d = dataset.date_days[i];
    if (d < minDays) minDays = d;
    if (d > maxDays) maxDays = d;
  }

  const fromDate =
    minDays !== Infinity
      ? new Date(minDays * 86400000).toISOString().slice(0, 10)
      : '';
  const toDate =
    maxDays !== -Infinity
      ? new Date(maxDays * 86400000).toISOString().slice(0, 10)
      : '';

  return {
    kind: 'trading',
    symbols: [...dataset.symbols],
    date_from: fromDate,
    date_to: toDate,
    total_rows: dataset.n,
    clean_hash: cleanArtifact.hash,
  };
}

/**
 * Runs quantitative (Trading) or business (Retail/Tabular) analysis for a session.
 * Pure TypeScript code-only calculation. Zero AI calls.
 * Enforces concurrency lock and Watchdog (15s inactivity / 30s hard limit).
 */
export async function runAnalysis(
  sessionId: string,
  config: AnalysisConfig,
  options?: AnalysisServiceOptions
): Promise<AnalysisResult> {
  if (inFlightAnalysisSessions.has(sessionId)) {
    throw new AppError(
      ERROR_CODES.STATE_INVALID,
      'Tác vụ phân tích đang chạy cho phiên này. Vui lòng chờ hoàn tất hoặc bấm Hủy.',
      { session_id: sessionId, reason: 'already_running' },
      409
    );
  }

  const record = sessionStore.getRecord(sessionId);
  if (!record) {
    throw new AppError(
      ERROR_CODES.NOT_FOUND,
      `Không tìm thấy phiên làm việc với ID '${sessionId}'.`,
      { session_id: sessionId },
      404
    );
  }

  const allowedStates = ['clean_approved', 'analyzed', 'report_approved'];
  if (!allowedStates.includes(record.state)) {
    throw new AppError(
      ERROR_CODES.STATE_INVALID,
      `Chưa duyệt dữ liệu sạch (Cổng 1). Cần duyệt dữ liệu trước khi phân tích. Trạng thái hiện tại: ${record.state}.`,
      { current_state: record.state, allowed_states: allowedStates },
      409
    );
  }

  const cleanArtifact = getActiveCleanArtifact(sessionId);
  if (!cleanArtifact) {
    throw new AppError(
      ERROR_CODES.NOT_FOUND,
      'Không tìm thấy dữ liệu sạch cho phiên này.',
      { session_id: sessionId },
      404
    );
  }

  const isBusiness = Boolean(cleanArtifact.kind === 'business' || cleanArtifact.businessTable);
  const validConfig = AnalysisConfigSchema.parse(
    isBusiness
      ? {
          symbols: config.symbols?.length ? config.symbols : ['BUSINESS'],
          date_from: config.date_from || 'N/A',
          date_to: config.date_to || 'N/A',
          preset: config.preset || 'all',
        }
      : config
  );

  const rowCount = isBusiness
    ? cleanArtifact.businessTable?.n ?? 0
    : cleanArtifact.dataset?.n ?? 0;

  inFlightAnalysisSessions.add(sessionId);
  perfMark('m3_analyze_start');

  try {
    const runInThreadAnalysis = async (): Promise<AnalysisResult> => {
      if (isBusiness) {
        const table = cleanArtifact.businessTable!;
        options?.onProgress?.({
          stage: 'business_aggregate',
          percent: 20,
          message: 'Đang tổng hợp chỉ số kinh doanh theo chiều...',
        });
        perfMark('m3_metrics_start');
        const bizOut = analyzeBusinessTable(table, (pct, msg) => {
          options?.onProgress?.({ stage: 'business_aggregate', percent: pct, message: msg });
        });
        perfMark('m3_metrics_end');
        perfMeasure('m3_code_compute', 'm3_metrics_start', 'm3_metrics_end');

        options?.onProgress?.({
          stage: 'business_hash',
          percent: 95,
          message: 'Đang tính mã băm chuẩn tắc SHA-256...',
        });
        const analysisHash = await computeAnalysisHash(bizOut.metrics);
        options?.onProgress?.({
          stage: 'done',
          percent: 100,
          message: 'Hoàn thành phân tích dữ liệu kinh doanh.',
        });

        return {
          kind: 'business',
          config: {
            ...validConfig,
            date_from: bizOut.summary.date_from || validConfig.date_from,
            date_to: bizOut.summary.date_to || validConfig.date_to,
          },
          created_at: new Date().toISOString(),
          clean_hash: cleanArtifact.hash,
          analysis_hash: analysisHash,
          metrics: bizOut.metrics,
          charts: bizOut.charts,
          assumptions: {
            trading_days: 252,
            risk_free_rate: 0,
            ma_windows: [20, 50],
            rsi_window: 14,
            volume_spike_rule: 'volume > mean20 + 2*std20',
            return_type: 'simple_close',
          },
          warnings: bizOut.warnings,
          business_analysis: bizOut.summary,
        };
      }

      options?.onProgress?.({
        stage: 'extract_series',
        percent: 15,
        message: 'Đang trích xuất chuỗi dữ liệu...',
      });
      perfMark('m3_metrics_start');
      const extracted = extractSymbolSeries(cleanArtifact, validConfig);

      const { metrics, warnings } = calculateMetrics(
        cleanArtifact,
        validConfig,
        extracted,
        (idx, total, sym) => {
          options?.onProgress?.({
            stage: `metrics:${sym}`,
            percent: 15 + Math.round(((idx + 1) / Math.max(1, total)) * 35),
            message: `Đang tính chỉ số định lượng (${idx + 1}/${total}: ${sym})...`,
            symbol: sym,
          });
        }
      );

      options?.onProgress?.({
        stage: 'build_charts',
        percent: 55,
        message: 'Đang tạo biểu đồ và bảng số liệu...',
      });
      const charts = generateCharts(
        cleanArtifact,
        validConfig,
        metrics,
        extracted.seriesBySymbol,
        (idx, total, sym) => {
          options?.onProgress?.({
            stage: `charts:${sym}`,
            percent: 55 + Math.round(((idx + 1) / Math.max(1, total)) * 35),
            message: `Đang dựng biểu đồ (${idx + 1}/${total}: ${sym})...`,
            symbol: sym,
          });
        }
      );
      perfMark('m3_metrics_end');
      perfMeasure('m3_code_compute', 'm3_metrics_start', 'm3_metrics_end');

      options?.onProgress?.({
        stage: 'analysis_hash',
        percent: 95,
        message: 'Đang tính mã băm chuẩn tắc...',
      });
      const analysisHash = await computeAnalysisHash(metrics);
      options?.onProgress?.({
        stage: 'done',
        percent: 100,
        message: 'Hoàn thành phân tích định lượng.',
      });

      return {
        kind: 'trading',
        config: validConfig,
        created_at: new Date().toISOString(),
        clean_hash: cleanArtifact.hash,
        analysis_hash: analysisHash,
        metrics,
        charts,
        assumptions: {
          trading_days: 252,
          risk_free_rate: 0,
          ma_windows: [20, 50],
          rsi_window: 14,
          volume_spike_rule: 'volume > mean20 + 2*std20',
          return_type: 'simple_close',
        },
        warnings,
      };
    };

    let result: AnalysisResult;

    const isJSDOM =
      typeof navigator !== 'undefined' &&
      navigator.userAgent.toLowerCase().includes('jsdom');
    const isTest =
      isJSDOM ||
      (typeof process !== 'undefined' &&
        (process.env?.NODE_ENV === 'test' || Boolean(process.env?.VITEST)));

    // Execute in Web Worker in real browser environment with Watchdog (15s inactivity / 30s hard ceiling)
    if (typeof Worker !== 'undefined' && (!isTest || options?.__simulateHang)) {
      let receivedProgress = false;
      try {
        const worker = new Worker(
          new URL('../workers/analysis.worker.ts', import.meta.url),
          { type: 'module' }
        );
        const input: AnalysisWorkerInput = {
          cleanArtifact,
          config: validConfig,
          __simulateHang: options?.__simulateHang,
        };
        result = await runInWorker<AnalysisWorkerInput, AnalysisResult, AnalysisWorkerProgress>(
          worker,
          input,
          {
            ...options,
            inactivityTimeoutMs: options?.inactivityTimeoutMs ?? 15000,
            hardTimeoutMs: options?.hardTimeoutMs ?? 30000,
            diagnosticMeta: {
              stage: isBusiness ? 'business_analysis' : 'trading_analysis',
              rows: rowCount,
            },
            onProgress: (p) => {
              receivedProgress = true;
              options?.onProgress?.(p);
            },
          }
        );
      } catch (err: any) {
        if (options?.signal?.aborted || err?.details?.reason === 'aborted') {
          throw err;
        }
        if (err instanceof AppError && err.code === ERROR_CODES.WORKER_TIMEOUT) {
          throw err;
        }
        if (!receivedProgress && err?.details?.reason === 'worker_error') {
          result = await runInThreadAnalysis();
        } else {
          if (err instanceof AppError) throw err;
          throw new AppError(
            ERROR_CODES.INTERNAL,
            err.message || 'Lỗi khi thực thi phân tích trong Web Worker.',
            { stage: isBusiness ? 'business_analysis' : 'trading_analysis', rows: rowCount },
            500
          );
        }
      }
    } else {
      result = await runInThreadAnalysis();
    }

    perfMark('m3_analyze_end');
    perfMeasure('m3_analyze_total', 'm3_analyze_start', 'm3_analyze_end');

    // Atomic commit to ArtifactStore
    ArtifactStore.put(sessionId, 'analysis', result);

    // Update session record meta
    sessionStore.setRecord({
      ...record,
      meta: {
        ...record.meta,
        metrics: result.metrics,
        charts: result.charts,
      },
    });

    // Audit log & state transition to 'analyzed'
    const auditDetail = isBusiness
      ? `Phân tích dữ liệu kinh doanh (${rowCount} dòng sạch) | ${result.metrics.length} chỉ số | ${result.charts.length} biểu đồ`
      : `Phân tích định lượng ${validConfig.symbols.join(', ')} (${validConfig.date_from} đến ${validConfig.date_to}) | ${result.metrics.length} chỉ số | ${result.charts.length} biểu đồ`;

    dispatch(sessionId, 'analysis_done', 'system', auditDetail, result.clean_hash);

    return result;
  } finally {
    inFlightAnalysisSessions.delete(sessionId);
  }
}

/**
 * Retrieves the stored analysis result for a session.
 */
export function getAnalysisResult(sessionId: string): AnalysisResult | undefined {
  return ArtifactStore.get<AnalysisResult>(sessionId, 'analysis');
}
