/**
 * Quantitative & Business Analysis Web Worker (Prompt P4 & M3-A).
 * Computes trading OR business metrics and charts off the main thread with single-pass extraction
 * and granular progress heartbeats to guarantee smooth UI & zero hangs.
 * Zero external dependencies. Zero AI calls.
 */

import type { CleanArtifact, AnalysisConfig, AnalysisResult } from '../core/schemas';
import { calculateMetrics, extractSymbolSeries } from '../core/metrics/calculator';
import { generateCharts } from '../core/metrics/charts';
import { analyzeBusinessTable } from '../core/metrics/businessAnalyzer';
import { computeAnalysisHash } from '../core/metrics/canonicalAnalysisHash';

export interface AnalysisWorkerInput {
  cleanArtifact: CleanArtifact;
  config: AnalysisConfig;
  /** Test-only hook to verify Watchdog terminates infinite loops cleanly. */
  __simulateHang?: boolean;
}

export interface AnalysisWorkerProgress {
  stage?: string;
  percent: number;
  message: string;
  symbol?: string;
}

self.onmessage = async (e: MessageEvent<AnalysisWorkerInput>) => {
  const { cleanArtifact, config, __simulateHang } = e.data;

  try {
    if (__simulateHang) {
      self.postMessage({
        type: 'progress',
        progress: { stage: 'simulated_hang', percent: 5, message: 'Đang mô phỏng tác vụ treo để kiểm thử Watchdog...' },
      });
      // Deliberate infinite loop to verify Watchdog terminates worker cleanly
      // eslint-disable-next-line no-constant-condition
      while (true) {
        // busy loop
      }
    }

    // =========================================================================
    // BRANCH 1: BUSINESS DATASET ANALYSIS (Prompt M3-A)
    // =========================================================================
    if (cleanArtifact.kind === 'business' || cleanArtifact.businessTable) {
      const table = cleanArtifact.businessTable;
      if (!table) {
        self.postMessage({
          type: 'error',
          code: 'NOT_FOUND',
          message_vi: 'Không tìm thấy bảng dữ liệu kinh doanh đã làm sạch trong phiên.',
          details: { stage: 'business_init' },
        });
        return;
      }

      self.postMessage({
        type: 'progress',
        progress: { stage: 'business_aggregate', percent: 15, message: 'Đang tổng hợp chỉ số kinh doanh theo chiều...' },
      });

      const bizOut = analyzeBusinessTable(table, (pct, msg) => {
        self.postMessage({
          type: 'progress',
          progress: { stage: 'business_aggregate', percent: pct, message: msg },
        });
      });

      self.postMessage({
        type: 'progress',
        progress: { stage: 'business_hash', percent: 94, message: 'Đang tính mã băm chuẩn tắc SHA-256...' },
      });

      const analysisHash = await computeAnalysisHash(bizOut.metrics);
      const result: AnalysisResult = {
        kind: 'business',
        config: {
          ...config,
          date_from: bizOut.summary.date_from || config.date_from,
          date_to: bizOut.summary.date_to || config.date_to,
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

      self.postMessage({
        type: 'success',
        data: result,
      });
      return;
    }

    // =========================================================================
    // BRANCH 2: TRADING DATASET ANALYSIS
    // =========================================================================
    self.postMessage({
      type: 'progress',
      progress: { stage: 'extract_series', percent: 10, message: 'Đang trích xuất chuỗi dữ liệu cho các mã...' },
    });

    const extracted = extractSymbolSeries(cleanArtifact, config);

    const { metrics, warnings } = calculateMetrics(
      cleanArtifact,
      config,
      extracted,
      (idx, total, sym) => {
        const pct = 15 + Math.round(((idx + 1) / Math.max(1, total)) * 35);
        self.postMessage({
          type: 'progress',
          progress: {
            stage: `metrics:${sym}`,
            percent: pct,
            message: `Đang tính chỉ số định lượng (${idx + 1}/${total}: ${sym})...`,
            symbol: sym,
          },
        });
      }
    );

    self.postMessage({
      type: 'progress',
      progress: { stage: 'build_charts', percent: 55, message: 'Đang dựng dữ liệu biểu đồ và bảng số liệu...' },
    });

    const charts = generateCharts(
      cleanArtifact,
      config,
      metrics,
      extracted.seriesBySymbol,
      (idx, total, sym) => {
        const pct = 55 + Math.round(((idx + 1) / Math.max(1, total)) * 35);
        self.postMessage({
          type: 'progress',
          progress: {
            stage: `charts:${sym}`,
            percent: pct,
            message: `Đang dựng biểu đồ (${idx + 1}/${total}: ${sym})...`,
            symbol: sym,
          },
        });
      }
    );

    self.postMessage({
      type: 'progress',
      progress: { stage: 'analysis_hash', percent: 94, message: 'Đang tính mã băm chuẩn tắc SHA-256...' },
    });

    const now = new Date().toISOString();
    const analysisHash = await computeAnalysisHash(metrics);

    const result: AnalysisResult = {
      kind: 'trading',
      config,
      created_at: now,
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

    self.postMessage({
      type: 'success',
      data: result,
    });
  } catch (err: any) {
    self.postMessage({
      type: 'error',
      code: 'INTERNAL',
      message_vi: err?.message || 'Lỗi không xác định khi tính toán chỉ số trong Web Worker.',
      details: { stage: 'worker_exception', stack: err?.stack },
    });
  }
};
