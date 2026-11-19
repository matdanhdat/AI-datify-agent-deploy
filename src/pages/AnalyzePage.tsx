import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../hooks/useSession';
import { PixelPanel } from '../components/pixel/PixelPanel';
import { PixelButton } from '../components/pixel/PixelButton';
import { PixelProgress } from '../components/pixel/PixelProgressAndTabs';
import { PixelBadge } from '../components/pixel/PixelBadge';
import { PixelIcon } from '../components/pixel/PixelIcon';
import { ConfirmDialog } from '../components/pixel/PixelModal';
import { PixelChart } from '../components/charts/PixelChart';
import { ArtifactStore } from '../core/artifacts';
import { editApprovedReport } from '../services/reportService';
import {
  getAvailableDatasetMeta,
  getAnalysisResult,
  runAnalysis,
  type AvailableDatasetMeta,
} from '../services/analysisService';
import type { AnalysisPreset, AnalysisResult } from '../core/schemas';
import type { BusinessAnalysisSummary } from '../core/metrics/businessAnalyzer';
import { formatDate, formatNumber, formatPercent } from '../utils/format';
import { CustomWorkflowSection } from '../components/plan/CustomWorkflowSection';
import { BusinessContextPanel } from '../components/layout/BusinessContextPanel';
import { useToast } from '../components/pixel/PixelToast';
import { validateBytes } from '../core/validator';
import { runBusinessCleanPipeline, computeBusinessCanonicalHash } from '../core/cleaner/businessCleaner';
import { sessionStore } from '../services/sessionStore';
import { isM3AnalysisEnabled } from '../services/appConfig';
import {
  generateBusinessInsights,
  getGate2BusinessFeedback,
  getStoredBusinessInsights,
} from '../agent/businessInsightsAgent';
import type { FactsTable } from '../core/narrative/factsBuilder';
import type { BusinessInsightsReport } from '../core/narrative/businessInsights';
import { BusinessInsightsPanel } from '../components/report/BusinessInsightsPanel';

export const AnalyzePage: React.FC = () => {
  const navigate = useNavigate();
  const { session, refreshSession } = useSession();
  const { showToast } = useToast();

  const [meta, setMeta] = useState<AvailableDatasetMeta | null>(null);
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [preset, setPreset] = useState<AnalysisPreset>('all');
  const [showAssumptions, setShowAssumptions] = useState<boolean>(true);

  // Analysis Execution States
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [progressMessage, setProgressMessage] = useState<string>('');
  const [lastDurationMs, setLastDurationMs] = useState<number | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorDiagnostic, setErrorDiagnostic] = useState<{
    code?: string;
    stage?: string;
    elapsed_ms?: number;
    rows?: number | null;
  } | null>(null);
  const [showReanalyzeConfirm, setShowReanalyzeConfirm] = useState<boolean>(false);
  const [aiInsightsLoading, setAiInsightsLoading] = useState<boolean>(false);
  const [bizFactsTable, setBizFactsTable] = useState<FactsTable | null>(null);
  const [bizInsightsReport, setBizInsightsReport] = useState<BusinessInsightsReport | null>(null);
  const [highlightedChartId, setHighlightedChartId] = useState<string | null>(null);
  const analysisAbortRef = useRef<AbortController | null>(null);
  const insightsAbortRef = useRef<AbortController | null>(null);
  const inFlightLockRef = useRef<boolean>(false);

  // Cancel any in-flight analysis or AI insights call on unmount
  useEffect(() => {
    return () => {
      analysisAbortRef.current?.abort();
      insightsAbortRef.current?.abort();
    };
  }, []);

  const triggerBusinessInsightsAsync = (
    sid: string,
    opts?: { forceRefresh?: boolean; reviewerFeedback?: string; forceFallback?: boolean }
  ) => {
    insightsAbortRef.current?.abort();
    const aiController = new AbortController();
    insightsAbortRef.current = aiController;
    setAiInsightsLoading(true);

    generateBusinessInsights(sid, {
      signal: aiController.signal,
      forceRefresh: opts?.forceRefresh,
      reviewerFeedback: opts?.reviewerFeedback,
      forceFallback: opts?.forceFallback,
    })
      .then((bundle) => {
        if (!aiController.signal.aborted) {
          setBizFactsTable(bundle.factsTable);
          setBizInsightsReport(bundle.report);
        }
      })
      .catch(() => {
        // Aborted or safely handled inside agent
      })
      .finally(() => {
        if (!aiController.signal.aborted) {
          setAiInsightsLoading(false);
        }
      });
  };

  // Load available clean dataset metadata (never triggers analysis on re-render)
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const sampleParam = searchParams?.get('sample');
    const autoRun = searchParams?.get('autoRun') === '1';

    let available = getAvailableDatasetMeta(session.id);

    // Demo bootstrap for ?sample=business (used for real-Chrome M3-A verification & screenshots)
    if (!available && sampleParam === 'business') {
      (async () => {
        try {
          const resp = await fetch('/samples/business/du-lieu-test-ban-le.csv');
          if (!resp.ok || cancelled) return;
          const bytes = new Uint8Array(await resp.arrayBuffer());
          const valRes = await validateBytes('du-lieu-test-ban-le.csv', bytes);
          if (!valRes.ok || !valRes.businessTable || cancelled) return;

          const cleaned = runBusinessCleanPipeline(valRes.businessTable, {
            remove_blank_rows: true,
            trim_whitespace: true,
            drop_exact_duplicates: true,
            fill_blank_dimension_label: true,
            sort_natural: true,
          });
          const cleanHash = await computeBusinessCanonicalHash(cleaned.cleanTable);
          if (cancelled) return;

          ArtifactStore.put(session.id, 'raw', valRes.businessTable);
          ArtifactStore.put(session.id, 'clean_v1', {
            kind: 'business',
            businessTable: cleaned.cleanTable,
            decisions: cleaned.decisions,
            hash: cleanHash,
            approved_at: new Date().toISOString(),
            reviewer_name: 'Kiểm thử M3',
          });
          const rec = sessionStore.getRecord(session.id);
          if (rec) {
            rec.state = 'clean_approved';
            rec.meta.clean_version = 1;
            rec.meta.dataset = valRes.meta;
            sessionStore.setRecord(rec);
          }

          const freshMeta = getAvailableDatasetMeta(session.id);
          if (freshMeta && !cancelled) {
            setMeta(freshMeta);
            setSelectedSymbols([...freshMeta.symbols]);
            setDateFrom(freshMeta.date_from);
            setDateTo(freshMeta.date_to);

            if (autoRun) {
              const t0 = performance.now();
              const res = await runAnalysis(session.id, {
                symbols: freshMeta.symbols,
                date_from: freshMeta.date_from,
                date_to: freshMeta.date_to,
                preset: 'all',
              });
              if (!cancelled) {
                setLastDurationMs(Math.max(1, Math.round(performance.now() - t0)));
                setAnalysisResult(res);
              }
            }
            refreshSession();
          }
        } catch (err) {
          console.error('[M3-A sample=business bootstrap error]', err);
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    const isDemo =
      (sampleParam && sampleParam !== 'business') ||
      searchParams?.get('demo') ||
      searchParams?.get('forceState') === 'clean_approved';
    if (!available && isDemo) {
      available = {
        kind: 'trading',
        symbols: ['TMA', 'TMB', 'TMC'],
        date_from: '2025-01-02',
        date_to: '2025-12-31',
        total_rows: 750,
      };
    }
    if (available) {
      setMeta(available);
      setSelectedSymbols([...available.symbols]);
      setDateFrom(available.date_from);
      setDateTo(available.date_to);

      const existing = getAnalysisResult(session.id);
      if (existing && (!available.clean_hash || existing.clean_hash === available.clean_hash)) {
        setAnalysisResult(existing);
        if (available.kind === 'business') {
          const stored = getStoredBusinessInsights(session.id);
          if (stored) {
            setBizFactsTable(stored.factsTable);
            setBizInsightsReport(stored.report);
          }
          // Gate 2 feedback return: keep computed numbers unchanged, ONLY rewrite AI narrative with feedback!
          const rewriteFlag = searchParams?.get('rewriteFeedback') === '1';
          const pendingFeedback = getGate2BusinessFeedback(session.id);
          if (rewriteFlag && pendingFeedback) {
            triggerBusinessInsightsAsync(session.id, {
              forceRefresh: true,
              reviewerFeedback: pendingFeedback,
            });
          }
        }
      }
    }

    return () => {
      cancelled = true;
    };
  }, [session?.id]);

  // Handle Preset changes
  const handlePresetChange = (newPreset: AnalysisPreset) => {
    setPreset(newPreset);
    if (!meta) return;

    if (newPreset === 'all') {
      setDateFrom(meta.date_from);
      setDateTo(meta.date_to);
      return;
    }

    const endMs = Date.parse(`${meta.date_to}T00:00:00Z`);
    let daysToSubtract = 180;
    if (newPreset === '3m') daysToSubtract = 90;
    if (newPreset === '1m') daysToSubtract = 30;

    const startMs = endMs - daysToSubtract * 86400000;
    const minMs = Date.parse(`${meta.date_from}T00:00:00Z`);
    const actualStartMs = Math.max(minMs, startMs);

    setDateFrom(new Date(actualStartMs).toISOString().slice(0, 10));
    setDateTo(meta.date_to);
  };

  const handleToggleSymbol = (symbol: string) => {
    if (selectedSymbols.includes(symbol)) {
      if (selectedSymbols.length === 1) {
        setErrorMsg('Phải chọn tối thiểu 1 mã cổ phiếu để phân tích.');
        return;
      }
      setErrorMsg(null);
      setSelectedSymbols(selectedSymbols.filter((s) => s !== symbol));
    } else {
      if (selectedSymbols.length >= 10) {
        setErrorMsg('Hệ thống hỗ trợ phân tích tối đa 10 mã đồng thời.');
        return;
      }
      setErrorMsg(null);
      setSelectedSymbols([...selectedSymbols, symbol]);
    }
  };

  const handleSelectAllSymbols = () => {
    if (!meta) return;
    setSelectedSymbols([...meta.symbols]);
    setErrorMsg(null);
  };

  const handleDeselectAllSymbols = () => {
    if (!meta || meta.symbols.length === 0) return;
    setSelectedSymbols([meta.symbols[0]]); // keep first
    setErrorMsg('Đã giữ lại 1 mã tối thiểu.');
  };

  const handleExecuteAnalysis = async () => {
    if (!session || !meta || inFlightLockRef.current) return;

    const isBiz = meta.kind === 'business';
    if (!isBiz) {
      if (selectedSymbols.length === 0) {
        setErrorMsg('Vui lòng chọn ít nhất 1 mã cổ phiếu.');
        return;
      }
      if (!dateFrom || !dateTo) {
        setErrorMsg('Vui lòng chọn đầy đủ ngày bắt đầu và ngày kết thúc.');
        return;
      }
      if (dateFrom > dateTo) {
        setErrorMsg('Ngày bắt đầu không được lớn hơn ngày kết thúc.');
        return;
      }
    }

    inFlightLockRef.current = true;
    setErrorMsg(null);
    setErrorDiagnostic(null);
    setIsAnalyzing(true);
    setLastDurationMs(null);
    setProgressPercent(10);
    setProgressMessage(isBiz ? 'Khởi động tác vụ phân tích kinh doanh...' : 'Khởi động tác vụ phân tích...');

    const controller = new AbortController();
    analysisAbortRef.current = controller;
    const tStart = performance.now();

    try {
      const result = await runAnalysis(
        session.id,
        {
          symbols: isBiz ? ['BUSINESS'] : selectedSymbols,
          date_from: isBiz ? meta.date_from || 'N/A' : dateFrom,
          date_to: isBiz ? meta.date_to || 'N/A' : dateTo,
          preset,
        },
        {
          signal: controller.signal,
          onProgress: (p) => {
            setProgressPercent(p.percent);
            setProgressMessage(p.message);
          },
        }
      );

      const elapsed = Math.max(1, Math.round(performance.now() - tStart));
      setLastDurationMs(elapsed);
      setAnalysisResult(result);
      setProgressPercent(100);
      setProgressMessage(`Phân tích hoàn tất trong ${elapsed.toLocaleString('vi-VN')} ms!`);
      refreshSession();

      // Non-blocking AI insights launch right after code numbers & charts are displayed (Prompt M3-B1)
      if (isBiz) {
        const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
        const forceFallbackParam = params?.get('forceFallback') === '1';
        triggerBusinessInsightsAsync(session.id, { forceFallback: forceFallbackParam });
      }
    } catch (err: any) {
      const elapsed = Math.max(1, Math.round(performance.now() - tStart));
      if (controller.signal.aborted || err?.details?.reason === 'aborted') {
        setErrorMsg('Tác vụ phân tích đã được hủy theo yêu cầu.');
      } else {
        setErrorMsg(err.message || 'Lỗi khi thực thi phân tích.');
        setErrorDiagnostic({
          code: err?.code || 'INTERNAL',
          stage: err?.details?.stage || (isBiz ? 'business_analysis' : 'trading_analysis'),
          elapsed_ms: err?.details?.elapsed_ms ?? elapsed,
          rows: err?.details?.rows ?? meta.total_rows,
        });
      }
    } finally {
      inFlightLockRef.current = false;
      setIsAnalyzing(false);
      analysisAbortRef.current = null;
    }
  };

  const handleCopyDiagnostic = async () => {
    const diagPayload = {
      step: 'analyze',
      kind: meta?.kind || 'unknown',
      code: errorDiagnostic?.code || 'INTERNAL',
      stage: errorDiagnostic?.stage || 'unknown',
      elapsed_ms: errorDiagnostic?.elapsed_ms ?? 0,
      rows: errorDiagnostic?.rows ?? meta?.total_rows ?? 0,
      timestamp: new Date().toISOString(),
    };
    const text = JSON.stringify(diagPayload, null, 2);
    try {
      await navigator.clipboard?.writeText(text);
      showToast({ type: 'success', title: 'Đã sao chép chẩn đoán', message: 'Không chứa dữ liệu thô của người dùng.' });
    } catch {
      showToast({ type: 'info', title: 'Chẩn đoán', message: `Mã: ${diagPayload.code} | Giai đoạn: ${diagPayload.stage} | ${diagPayload.elapsed_ms}ms | ${diagPayload.rows} dòng` });
    }
  };

  const handleCancelAnalysis = () => {
    if (analysisAbortRef.current) {
      analysisAbortRef.current.abort();
    }
  };

  const handleExecuteClick = () => {
    if (!session) return;
    const existingReport = ArtifactStore.get(session.id, 'report');
    if (existingReport) {
      setShowReanalyzeConfirm(true);
    } else {
      handleExecuteAnalysis();
    }
  };

  const handleConfirmReanalyze = async () => {
    setShowReanalyzeConfirm(false);
    if (session) {
      if (session.state === 'report_approved') {
        editApprovedReport(session.id);
      }
      ArtifactStore.clearAfter(session.id, 'reclean');
    }
    await handleExecuteAnalysis();
  };

  // Business Dataset Analysis View (Prompt M3-A: fast single-pass code analysis, zero AI blocking)
  if (meta?.kind === 'business' || session?.dataset?.kind === 'business') {
    if (!isM3AnalysisEnabled()) {
      return (
        <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', paddingBottom: 'var(--space-8)' }}>
          <BusinessContextPanel session={session} />
          <PixelPanel title="CHẾ ĐỘ DỮ LIỆU KINH DOANH (ĐANG DÙNG CỜ QUAY LUI)">
            <div style={{ padding: 'var(--space-6)', textAlign: 'center' }}>
              <p className="font-content" style={{ color: 'var(--ink-soft)' }}>
                Chế độ phân tích M3 đang tạm tắt qua cấu hình dự phòng.
              </p>
              <PixelButton variant="primary" onClick={() => navigate('/nap-du-lieu')}>
                Quay lại nạp dữ liệu
              </PixelButton>
            </div>
          </PixelPanel>
        </div>
      );
    }
    const bizSummary = analysisResult?.business_analysis as BusinessAnalysisSummary | undefined;

    return (
      <div style={{ maxWidth: '1160px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', paddingBottom: 'var(--space-8)' }}>
        <BusinessContextPanel session={session} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          <div>
            <h2 className="font-pixel" style={{ fontSize: '28px', color: 'var(--ink)', margin: 0 }}>
              PHÂN TÍCH DỮ LIỆU KINH DOANH
            </h2>
            <p className="font-content" style={{ color: 'var(--ink-soft)', marginTop: '4px', fontSize: '14px' }}>
              Tổng hợp một lượt O(n) toàn bộ chỉ số doanh thu, lợi nhuận gộp, biên lợi nhuận và cơ cấu theo kênh, tháng, khu vực, sản phẩm.
            </p>
          </div>
          {bizSummary && (
            <PixelBadge variant="success">
              ĐÃ PHÂN TÍCH ({bizSummary.total_rows} DÒNG • {analysisResult?.charts.length || 0} BIỂU ĐỒ)
            </PixelBadge>
          )}
        </div>

        {/* Error & Watchdog Recovery Box */}
        {errorMsg && (
          <div
            role="alert"
            style={{
              backgroundColor: 'var(--warn-bg)',
              border: '2px solid var(--bad)',
              color: 'var(--ink)',
              padding: 'var(--space-4)',
              fontSize: '13px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 'var(--space-3)',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, color: 'var(--bad)' }}>
              <PixelIcon name="warning" size={16} color="var(--bad)" />
              <span>{errorMsg}</span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <PixelButton variant="secondary" font="content" size="sm" onClick={handleCopyDiagnostic}>
                Sao chép chẩn đoán
              </PixelButton>
              {!isAnalyzing && (
                <PixelButton variant="primary" font="content" size="sm" onClick={handleExecuteClick}>
                  Thử lại
                </PixelButton>
              )}
            </div>
          </div>
        )}

        {/* Dataset Summary + Trigger Bar */}
        {!meta ? (
          <PixelPanel title="CHƯA CÓ DỮ LIỆU KINH DOANH SẠCH (CỔNG 1)">
            <div style={{ padding: 'var(--space-4)', textAlign: 'center' }}>
              <p style={{ color: 'var(--ink-soft)', marginBottom: 'var(--space-4)', fontSize: '14px' }}>
                Bạn cần hoàn thành phê duyệt dữ liệu sạch tại Cổng duyệt 1 trước khi chạy phân tích kinh doanh.
              </p>
              <PixelButton variant="primary" onClick={() => navigate('/lam-sach')}>
                Đến bước Làm sạch dữ liệu (Cổng 1)
              </PixelButton>
            </div>
          </PixelPanel>
        ) : (
          <PixelPanel title="1. TỔNG QUAN TẬP DỮ LIỆU SẠCH & KHỞI CHẠY PHÂN TÍCH">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-3)' }}>
                <div style={{ padding: '10px 12px', backgroundColor: 'var(--white)', border: '2px solid var(--ink)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>SỐ DÒNG SẠCH</div>
                  <div className="font-pixel" style={{ fontSize: '22px', color: 'var(--ink)' }}>{formatNumber(meta.total_rows, 0)}</div>
                </div>
                <div style={{ padding: '10px 12px', backgroundColor: 'var(--white)', border: '2px solid var(--ink)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>SỐ CỘT</div>
                  <div className="font-pixel" style={{ fontSize: '22px', color: 'var(--blue)' }}>{meta.total_columns || 0} cột</div>
                </div>
                <div style={{ padding: '10px 12px', backgroundColor: 'var(--white)', border: '2px solid var(--ink)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>KỲ THỜI GIAN</div>
                  <div className="font-pixel" style={{ fontSize: '20px', color: 'var(--ink)' }}>{meta.date_from} → {meta.date_to}</div>
                </div>
                <div style={{ padding: '10px 12px', backgroundColor: 'var(--white)', border: '2px solid var(--ink)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>MÃ BĂM DỮ LIỆU SẠCH</div>
                  <div style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--good-d)', marginTop: '4px' }}>
                    {meta.clean_hash ? `${meta.clean_hash.slice(0, 12)}...` : 'N/A'}
                  </div>
                </div>
              </div>

              {isAnalyzing && (
                <div style={{ padding: 'var(--space-3)', backgroundColor: 'var(--white)', border: '2px solid var(--ink)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>{progressMessage}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span className="font-pixel" style={{ fontSize: '16px', color: 'var(--blue)' }}>{progressPercent}%</span>
                      <PixelButton variant="danger" font="content" size="sm" onClick={handleCancelAnalysis}>
                        Hủy phân tích
                      </PixelButton>
                    </div>
                  </div>
                  <PixelProgress value={progressPercent} />
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
                <div style={{ fontSize: '13px', color: 'var(--ink-soft)' }}>
                  {bizSummary
                    ? lastDurationMs !== null
                      ? `Tính toán số liệu & biểu đồ hoàn tất trong ${lastDurationMs.toLocaleString('vi-VN')} ms (100% mã nguồn trình duyệt, 0 gọi AI).`
                      : 'Đã có kết quả phân tích cho phiên bản dữ liệu sạch hiện tại.'
                    : 'Bấm nút bên phải để tính toàn bộ chỉ số tổng, bảng chiều và biểu đồ.'}
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                  <PixelButton variant="primary" onClick={handleExecuteClick} disabled={isAnalyzing}>
                    {isAnalyzing
                      ? 'Đang phân tích...'
                      : bizSummary
                      ? 'Chạy phân tích lại'
                      : 'Chạy phân tích dữ liệu kinh doanh'}
                  </PixelButton>
                  {bizSummary && (
                    <PixelButton variant="primary" onClick={() => navigate('/bao-cao')}>
                      Xem báo cáo & Nhận định AI →
                    </PixelButton>
                  )}
                </div>
              </div>
            </div>
          </PixelPanel>
        )}

        {/* Instant Business KPIs, Dimension Tables & Charts */}
        {bizSummary && analysisResult && (
          <>
            {/* Incomplete Data Warning Banner (Only displayed when missing columns detected) */}
            {bizSummary.role_resolution?.warnings && bizSummary.role_resolution.warnings.length > 0 && (
              <div
                className="px-shadow-sm"
                style={{
                  backgroundColor: '#fffbeb',
                  border: '2px solid #f97316',
                  padding: '12px 16px',
                  marginBottom: 'var(--space-4)',
                  color: '#9a3412',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '13px' }}>
                  <PixelIcon name="warning" size={16} />
                  <span>Dữ liệu chưa đầy đủ</span>
                </div>
                <ul style={{ margin: '8px 0 0 20px', padding: 0, fontSize: '12px', lineHeight: 1.6 }}>
                  {bizSummary.role_resolution.warnings.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* 6 Core Business KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: 'var(--space-3)' }}>
              {[
                {
                  label: 'TỔNG DOANH THU',
                  value: `${formatNumber(bizSummary.totals.revenue, 0)} VND`,
                  reason: undefined,
                  tone: 'var(--blue)',
                },
                {
                  label: 'LỢI NHUẬN GỘP',
                  value: bizSummary.totals.profit !== null ? `${formatNumber(bizSummary.totals.profit, 0)} VND` : 'KHÔNG ĐỦ DỮ LIỆU',
                  reason: bizSummary.totals.profit === null ? bizSummary.unavailable?.find((u) => u.id === 'gross_profit_total')?.reason_vi || 'Thiếu cột Giá vốn/Lợi nhuận' : undefined,
                  tone: bizSummary.totals.profit !== null ? 'var(--good-d)' : 'var(--ink-soft)',
                },
                {
                  label: 'BIÊN LỢI NHUẬN GỘP',
                  value: bizSummary.totals.gross_margin_pct !== null ? formatPercent(bizSummary.totals.gross_margin_pct / 100) : 'KHÔNG ĐỦ DỮ LIỆU',
                  reason: bizSummary.totals.gross_margin_pct === null ? bizSummary.unavailable?.find((u) => u.id === 'gross_margin_pct')?.reason_vi || 'Thiếu cột Giá vốn/Lợi nhuận' : undefined,
                  tone: bizSummary.totals.gross_margin_pct !== null ? 'var(--good-d)' : 'var(--ink-soft)',
                },
                {
                  label: 'TỔNG SỐ ĐƠN HÀNG',
                  value: bizSummary.totals.orders !== null ? `${formatNumber(bizSummary.totals.orders, 0)} đơn` : 'KHÔNG ĐỦ DỮ LIỆU',
                  reason: bizSummary.totals.orders === null ? bizSummary.unavailable?.find((u) => u.id === 'orders_total')?.reason_vi || 'Thiếu cột Số đơn hàng' : undefined,
                  tone: bizSummary.totals.orders !== null ? 'var(--ink)' : 'var(--ink-soft)',
                },
                {
                  label: 'TỔNG GIÁ VỐN',
                  value: bizSummary.totals.cogs !== null ? `${formatNumber(bizSummary.totals.cogs, 0)} VND` : 'KHÔNG ĐỦ DỮ LIỆU',
                  reason: bizSummary.totals.cogs === null ? bizSummary.unavailable?.find((u) => u.id === 'cogs_total')?.reason_vi || 'Thiếu cột Giá vốn' : undefined,
                  tone: bizSummary.totals.cogs !== null ? 'var(--ink)' : 'var(--ink-soft)',
                },
                {
                  label: 'GIÁ TRỊ ĐƠN TB (AOV)',
                  value: bizSummary.totals.aov !== null ? `${formatNumber(bizSummary.totals.aov, 2)} VND` : 'KHÔNG ĐỦ DỮ LIỆU',
                  reason: bizSummary.totals.aov === null ? bizSummary.unavailable?.find((u) => u.id === 'aov')?.reason_vi || 'Thiếu cột Số đơn hàng' : undefined,
                  tone: bizSummary.totals.aov !== null ? 'var(--ink)' : 'var(--ink-soft)',
                },
              ].map((kpi) => (
                <div
                  key={kpi.label}
                  className="px-shadow-sm"
                  style={{ backgroundColor: 'var(--white)', border: '2px solid var(--ink)', padding: '12px 14px' }}
                >
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-soft)' }}>{kpi.label}</div>
                  <div className="font-pixel" style={{ fontSize: kpi.value === 'KHÔNG ĐỦ DỮ LIỆU' ? '14px' : '20px', color: kpi.tone, marginTop: '4px' }}>
                    {kpi.value}
                  </div>
                  {kpi.reason && (
                    <div style={{ fontSize: '10px', color: 'var(--ink-soft)', marginTop: '4px', lineHeight: 1.3 }}>
                      {kpi.reason}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* 4 Dimension Breakdown Tables (only rendered for present dimensions) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: 'var(--space-4)' }}>
              {[
                { title: '2A. PHÂN TÍCH THEO KÊNH BÁN', rows: bizSummary.by_channel, showMom: false },
                { title: '2B. PHÂN TÍCH THEO THÁNG', rows: bizSummary.by_month, showMom: true },
                { title: '2C. PHÂN TÍCH THEO KHU VỰC', rows: bizSummary.by_region, showMom: false },
                { title: '2D. PHÂN TÍCH THEO SẢN PHẨM', rows: bizSummary.by_product, showMom: false },
              ]
                .filter((tbl) => tbl.rows && tbl.rows.length > 0)
                .map((tbl) => {
                  const hasOrders = tbl.rows.some((r) => r.orders !== null);
                  const hasProfit = tbl.rows.some((r) => r.profit !== null);
                  const hasMargin = !tbl.showMom && tbl.rows.some((r) => r.margin_pct !== null);

                  const hiddenCols: string[] = [];
                  if (!hasOrders) hiddenCols.push('Số đơn');
                  if (!hasProfit) hiddenCols.push('Lợi nhuận');
                  if (!tbl.showMom && !hasMargin) hiddenCols.push('Biên LN');

                  return (
                    <PixelPanel key={tbl.title} title={tbl.title}>
                      {hiddenCols.length > 0 && (
                        <div
                          style={{
                            fontSize: '11px',
                            color: 'var(--ink-soft)',
                            marginBottom: '6px',
                            fontStyle: 'italic',
                          }}
                        >
                          Không hiển thị cột {hiddenCols.join(', ')} vì file không có dữ liệu tương ứng.
                        </div>
                      )}
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                          <thead>
                            <tr style={{ backgroundColor: 'var(--ink)', color: 'var(--white)' }}>
                              <th style={{ padding: '6px 8px', textAlign: 'left' }}>Nhóm</th>
                              {hasOrders && <th style={{ padding: '6px 8px', textAlign: 'right' }}>Số đơn</th>}
                              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Doanh thu</th>
                              {hasProfit && <th style={{ padding: '6px 8px', textAlign: 'right' }}>Lợi nhuận</th>}
                              {tbl.showMom && <th style={{ padding: '6px 8px', textAlign: 'right' }}>MoM %</th>}
                              {!tbl.showMom && hasMargin && <th style={{ padding: '6px 8px', textAlign: 'right' }}>Biên LN</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {tbl.rows.map((item) => (
                              <tr key={item.key} style={{ borderBottom: '1px solid var(--chart-grid)', backgroundColor: 'var(--white)' }}>
                                <td style={{ padding: '6px 8px', fontWeight: 600 }}>{item.key}</td>
                                {hasOrders && (
                                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                                    {item.orders !== null ? formatNumber(item.orders, 0) : 'KHÔNG ĐỦ DỮ LIỆU'}
                                  </td>
                                )}
                                <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>{formatNumber(item.revenue, 0)}</td>
                                {hasProfit && (
                                  <td style={{ padding: '6px 8px', textAlign: 'right', color: item.profit !== null ? 'var(--good-d)' : 'var(--ink-soft)' }}>
                                    {item.profit !== null ? formatNumber(item.profit, 0) : 'KHÔNG ĐỦ DỮ LIỆU'}
                                  </td>
                                )}
                                {tbl.showMom && (
                                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                                    {item.mom_revenue_pct !== null && item.mom_revenue_pct !== undefined
                                      ? `${item.mom_revenue_pct > 0 ? '+' : ''}${formatPercent(item.mom_revenue_pct / 100)}`
                                      : '-'}
                                  </td>
                                )}
                                {!tbl.showMom && hasMargin && (
                                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                                    {item.margin_pct !== null ? formatPercent(item.margin_pct / 100) : 'KHÔNG ĐỦ DỮ LIỆU'}
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </PixelPanel>
                  );
                })}
            </div>

            {/* Interactive Charts */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: 'var(--space-4)' }}>
              {analysisResult.charts.map((chart) => (
                <div
                  key={chart.id}
                  id={chart.id}
                  style={{
                    outline: highlightedChartId === chart.id ? '3px solid var(--accent)' : 'none',
                    outlineOffset: '2px',
                  }}
                >
                  <PixelChart spec={chart} height={290} />
                </div>
              ))}
            </div>

            {/* Non-blocking AI Verified Insights & Recommendations (Prompt M3-B) */}
            <BusinessInsightsPanel
              loading={aiInsightsLoading}
              factsTable={bizFactsTable}
              report={bizInsightsReport}
              onRegenerate={() =>
                session && triggerBusinessInsightsAsync(session.id, { forceRefresh: true })
              }
              onSelectChartId={(cid) => {
                setHighlightedChartId(cid);
                const el = document.getElementById(cid);
                el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }}
            />
          </>
        )}

        <ConfirmDialog
          isOpen={showReanalyzeConfirm}
          title="Xác nhận phân tích lại"
          message="Chạy phân tích lại sẽ cập nhật bộ số liệu và yêu cầu duyệt lại báo cáo. Bạn có muốn tiếp tục?"
          confirmLabel="Tiếp tục phân tích"
          danger={true}
          onConfirm={handleConfirmReanalyze}
          onCancel={() => setShowReanalyzeConfirm(false)}
        />
      </div>
    );
  }

  if (!meta) {
    return (
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: 'var(--space-6) 0' }}>
        <PixelPanel title="CHƯA CÓ DỮ LIỆU SẠCH (CỔNG 1)">
          <div style={{ padding: 'var(--space-4)', textAlign: 'center' }}>
            <p style={{ color: 'var(--ink-soft)', marginBottom: 'var(--space-4)', fontSize: '14px' }}>
              Bạn cần nạp tệp dữ liệu giao dịch và hoàn thành phê duyệt dữ liệu sạch tại Cổng duyệt 1
              trước khi tiến hành phân tích định lượng.
            </p>
            <PixelButton variant="primary" onClick={() => navigate('/clean')}>
              Đến bước Làm sạch dữ liệu (Cổng 1)
            </PixelButton>
          </div>
        </PixelPanel>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', paddingBottom: 'var(--space-8)' }}>
      <BusinessContextPanel session={session} />
      {/* Header */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 className="font-pixel" style={{ fontSize: '28px', color: 'var(--ink)', margin: 0 }}>
              CẤU HÌNH PHÂN TÍCH ĐỊNH LƯỢNG
            </h2>
            <p className="font-content" style={{ color: 'var(--ink-soft)', marginTop: '4px', fontSize: '14px' }}>
              Chọn mã cổ phiếu, khoảng thời gian và xem các giả định tính toán trước khi khởi chạy Web Worker.
            </p>
          </div>
          {analysisResult && (
            <PixelBadge variant="success">
              ĐÃ PHÂN TÍCH ({analysisResult.metrics.length} CHỈ SỐ)
            </PixelBadge>
          )}
        </div>
      </div>

      {errorMsg && (
        <div
          role="alert"
          style={{
            backgroundColor: 'var(--warn-bg)',
            border: '2px solid var(--bad)',
            color: 'var(--bad)',
            padding: 'var(--space-3) var(--space-4)',
            marginBottom: 'var(--space-4)',
            fontSize: '13px',
            fontWeight: 'bold',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 'var(--space-3)',
            flexWrap: 'wrap',
          }}
        >
          <span>{errorMsg}</span>
          {!isAnalyzing && (
            <PixelButton variant="secondary" font="content" size="sm" onClick={handleExecuteClick}>
              Thử lại
            </PixelButton>
          )}
        </div>
      )}

      {/* Main Configuration Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)', marginBottom: 'var(--space-6)' }}>
        {/* Symbol Selection Card */}
        <PixelPanel title="1. CHỌN MÃ CỔ PHIẾU PHÂN TÍCH">
          <div style={{ padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
              <span style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
                Đã chọn: <strong>{selectedSymbols.length}</strong> / {meta.symbols.length} mã
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={handleSelectAllSymbols}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--blue)',
                    fontSize: '12px',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  Chọn tất cả
                </button>
                <span style={{ color: 'var(--chart-axis)' }}>|</span>
                <button
                  type="button"
                  onClick={handleDeselectAllSymbols}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--blue)',
                    fontSize: '12px',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  Bỏ chọn bớt
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
              {meta.symbols.map((sym) => {
                const isSelected = selectedSymbols.includes(sym);
                return (
                  <button
                    key={sym}
                    type="button"
                    onClick={() => handleToggleSymbol(sym)}
                    className="font-pixel"
                    style={{
                      padding: '8px 16px',
                      fontSize: '16px',
                      border: '2px solid var(--ink)',
                      backgroundColor: isSelected ? 'var(--blue)' : 'var(--panel)',
                      color: isSelected ? 'var(--white)' : 'var(--ink)',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: isSelected ? '2px 2px 0 var(--ink)' : 'none',
                      transition: 'all 0.1s ease',
                    }}
                  >
                    <span>{isSelected ? '[X]' : '[ ]'}</span>
                    <span>{sym}</span>
                  </button>
                );
              })}
            </div>

            <div style={{ marginTop: 'var(--space-3)', fontSize: '11px', color: 'var(--chart-text)' }}>
              * Khi chọn từ 2 mã trở lên, hệ thống tự động kích hoạt bộ biểu đồ so sánh đa mã và ma trận tương quan giá.
            </div>
          </div>
        </PixelPanel>

        {/* Date Range Selection Card */}
        <PixelPanel title="2. KHOẢNG THỜI GIAN PHÂN TÍCH">
          <div style={{ padding: 'var(--space-4)' }}>
            {/* Presets */}
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <span style={{ fontSize: '12px', color: 'var(--ink-soft)', display: 'block', marginBottom: 'var(--space-2)' }}>
                Chọn nhanh chu kỳ:
              </span>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {(['all', '6m', '3m', '1m', 'custom'] as AnalysisPreset[]).map((p) => {
                  const labels: Record<AnalysisPreset, string> = {
                    all: 'Toàn bộ',
                    '6m': '6 tháng',
                    '3m': '3 tháng',
                    '1m': '1 tháng',
                    custom: 'Tùy chỉnh',
                  };
                  const active = preset === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => handlePresetChange(p)}
                      style={{
                        padding: '4px 10px',
                        fontSize: '12px',
                        fontWeight: active ? 'bold' : 'normal',
                        border: '1px solid var(--ink)',
                        backgroundColor: active ? 'var(--ink)' : 'var(--panel)',
                        color: active ? 'var(--white)' : 'var(--ink)',
                        cursor: 'pointer',
                      }}
                    >
                      {labels[p]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Date Inputs */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--ink)', display: 'block', marginBottom: '4px' }}>
                  Từ ngày:
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  min={meta.date_from}
                  max={dateTo || meta.date_to}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    setPreset('custom');
                  }}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    border: '1px solid var(--chart-grid)',
                    backgroundColor: 'var(--chart-bg)',
                    fontFamily: 'var(--font-excel)',
                    fontSize: '13px',
                    color: 'var(--ink)',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--ink)', display: 'block', marginBottom: '4px' }}>
                  Đến ngày:
                </label>
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom || meta.date_from}
                  max={meta.date_to}
                  onChange={(e) => {
                    setDateTo(e.target.value);
                    setPreset('custom');
                  }}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    border: '1px solid var(--chart-grid)',
                    backgroundColor: 'var(--chart-bg)',
                    fontFamily: 'var(--font-excel)',
                    fontSize: '13px',
                    color: 'var(--ink)',
                  }}
                />
              </div>
            </div>

            <div style={{ marginTop: 'var(--space-3)', fontSize: '11px', color: 'var(--chart-text)' }}>
              Khoảng dữ liệu sạch khả dụng: {formatDate(meta.date_from)} đến {formatDate(meta.date_to)} ({meta.total_rows} dòng).
            </div>
          </div>
        </PixelPanel>
      </div>

      {/* Assumptions Panel */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <PixelPanel
          title="3. GIẢ ĐỊNH TÍNH TOÁN ĐỊNH LƯỢNG (CHUẨN TOÁN & EXCEL)"
          headerAction={
            <button
              type="button"
              onClick={() => setShowAssumptions(!showAssumptions)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--blue)',
                fontSize: '12px',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              {showAssumptions ? 'Thu gọn' : 'Xem chi tiết'}
            </button>
          }
        >
          {showAssumptions && (
            <div style={{ padding: 'var(--space-4)', fontSize: '13px', color: 'var(--ink)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-4)' }}>
                <div style={{ padding: 'var(--space-3)', backgroundColor: 'var(--panel)', border: '1px solid var(--chart-grid)' }}>
                  <strong>Năm hóa lợi suất & rủi ro:</strong>
                  <div style={{ color: 'var(--ink-soft)', marginTop: '4px' }}>
                    Quy ước <strong>252 phiên</strong> giao dịch/năm. Lãi suất phi rủi ro: <strong>0,0%</strong>.
                  </div>
                </div>

                <div style={{ padding: 'var(--space-3)', backgroundColor: 'var(--panel)', border: '1px solid var(--chart-grid)' }}>
                  <strong>Chỉ báo kỹ thuật (MA & RSI):</strong>
                  <div style={{ color: 'var(--ink-soft)', marginTop: '4px' }}>
                    Đường <strong>MA20 & MA50</strong>. RSI <strong>14 phiên</strong> làm mượt J. Welles Wilder.
                  </div>
                </div>

                <div style={{ padding: 'var(--space-3)', backgroundColor: 'var(--panel)', border: '1px solid var(--chart-grid)' }}>
                  <strong>Quy tắc đột biến thanh khoản:</strong>
                  <div style={{ color: 'var(--ink-soft)', marginTop: '4px' }}>
                    Khối lượng vượt <strong>TB 20 phiên + 2*ĐLC</strong> của chính 20 phiên trước.
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 'var(--space-3)', fontSize: '11px', color: 'var(--chart-text)' }}>
                * Bấm vào bất kỳ thẻ KPI nào trong trang Báo cáo để xem từng phép tính với số liệu thực tế tương ứng.
              </div>
            </div>
          )}
        </PixelPanel>
      </div>

      {/* Progress Indicator when running */}
      {isAnalyzing && (
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <PixelPanel
            title="TIẾN TRÌNH TÍNH TOÁN TRONG WEB WORKER"
            headerAction={
              <PixelButton variant="danger" font="content" size="sm" onClick={handleCancelAnalysis}>
                Hủy phân tích
              </PixelButton>
            }
          >
            <div style={{ padding: 'var(--space-4)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                <span style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--ink)' }}>
                  {progressMessage}
                </span>
                <span className="font-pixel" style={{ fontSize: '16px', color: 'var(--blue)' }}>
                  {progressPercent}%
                </span>
              </div>
              <PixelProgress value={progressPercent} />
            </div>
          </PixelPanel>
        </div>
      )}

      {/* Run Action Area */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--space-4)',
          backgroundColor: 'var(--panel)',
          border: '2px solid var(--ink)',
        }}
      >
        <div>
          <span style={{ fontWeight: 'bold', color: 'var(--ink)', fontSize: '14px' }}>
            {analysisResult
              ? lastDurationMs !== null
                ? `Đã hoàn tất phân tích trong ${lastDurationMs.toLocaleString('vi-VN')} ms.`
                : 'Đã hoàn tất phân tích cho cấu hình hiện tại.'
              : 'Sẵn sàng tính toán số liệu định lượng.'}
          </span>
          <p style={{ margin: '2px 0 0', color: 'var(--ink-soft)', fontSize: '12px' }}>
            Chạy 100% trong trình duyệt (Web Worker), không làm đơ giao diện.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <PixelButton
            variant="primary"
            onClick={handleExecuteClick}
            disabled={isAnalyzing}
          >
            {isAnalyzing
              ? 'Đang tính toán...'
              : analysisResult
              ? 'Chạy phân tích lại'
              : 'Chạy phân tích định lượng'}
          </PixelButton>

          {analysisResult && (
            <PixelButton
              variant="primary"
              onClick={() => navigate('/bao-cao')}
            >
              Xem báo cáo & biểu đồ →
            </PixelButton>
          )}
        </div>
      </div>

      {/* Custom One-Off Workflow Section (Prompt P6 Part C) */}
      {session && <CustomWorkflowSection sessionId={session.id} />}

      {/* Confirmation Dialog when recalculating with existing report */}
      <ConfirmDialog
        isOpen={showReanalyzeConfirm}
        title="Xác nhận phân tích lại"
        message="Đổi bộ lọc sẽ viết lại phần nhận định; các chỉnh sửa tay sẽ mất."
        confirmLabel="Tiếp tục phân tích"
        danger={true}
        onConfirm={handleConfirmReanalyze}
        onCancel={() => setShowReanalyzeConfirm(false)}
      />
    </div>
  );
};
