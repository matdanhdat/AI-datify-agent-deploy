import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../hooks/useSession';
import { ArtifactStore } from '../core/artifacts';
import { getAnalysisResult } from '../services/analysisService';
import type {
  AnalysisResult,
  ChartSpec,
  Metric,
  ReportArtifact,
} from '../core/schemas';
import { DEFAULT_KPI_IDS } from '../core/metrics/metricSpec';
import { KpiTile } from '../components/charts/KpiTile';
import { PixelChart } from '../components/charts/PixelChart';
import { PixelPanel } from '../components/pixel/PixelPanel';
import { PixelButton } from '../components/pixel/PixelButton';
import { PixelBadge } from '../components/pixel/PixelBadge';
import { PixelIcon } from '../components/pixel/PixelIcon';
import { formatDate, formatNumber, formatPercent } from '../utils/format';
import { MetricCalcModal } from '../components/charts/MetricCalcModal';
import { NarrativeSectionView } from '../components/report/NarrativeSectionView';
import { ApprovedStamp } from '../components/report/ApprovedStamp';
import { PrintHeader } from '../components/report/PrintHeader';
import { CustomAnalysisReportSection } from '../components/report/CustomAnalysisReportSection';
import { ConfirmDialog } from '../components/pixel/PixelModal';
import { useToast } from '../components/pixel/PixelToast';
import { formatAiError } from '../core/aiErrors';
import { BusinessContextPanel } from '../components/layout/BusinessContextPanel';
import { PixelSprite } from '../components/pixel/PixelSprite';
import {
  generateNarrative,
  regenerateSection,
  useTemplateForSection,
} from '../agent/narrator';
import {
  getApprovalBlockingReasons,
  approveReport,
  editApprovedReport,
  updateParagraphText,
  revertParagraph,
  deleteParagraph,
} from '../services/reportService';
import { downloadExcelReport } from '../services/exportExcel';
import { getNarrative, getReportStatus } from '../services/readers';
import { createDemoAnalysisResult } from '../services/demoAnalysis';
import { isM3AnalysisEnabled } from '../services/appConfig';
import {
  generateBusinessInsights,
  getStoredBusinessInsights,
  saveGate2BusinessFeedback,
} from '../agent/businessInsightsAgent';
import type { BusinessAnalysisSummary } from '../core/metrics/businessAnalyzer';
import type { FactsTable } from '../core/narrative/factsBuilder';
import type { BusinessInsightsReport } from '../core/narrative/businessInsights';
import { BusinessInsightsPanel } from '../components/report/BusinessInsightsPanel';

export const ReportPage: React.FC = () => {
  const navigate = useNavigate();
  const { session, refreshSession } = useSession();
  const { showToast } = useToast();

  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [report, setReport] = useState<ReportArtifact | null>(null);
  const [activeTab, setActiveTab] = useState<string>('');
  const [mainChartKind, setMainChartKind] = useState<'price_ma' | 'candle_volume'>('price_ma');
  const [selectedModalMetric, setSelectedModalMetric] = useState<Metric | null>(null);

  // Reviewer & Gate 2 state
  const [reviewerName, setReviewerName] = useState<string>('');
  const [isApproving, setIsApproving] = useState<boolean>(false);
  const [showApproveConfirm, setShowApproveConfirm] = useState<boolean>(false);
  const [showEditApprovedConfirm, setShowEditApprovedConfirm] = useState<boolean>(false);
  const [isGeneratingNarrative, setIsGeneratingNarrative] = useState<boolean>(false);
  const [regeneratingSectionId, setRegeneratingSectionId] = useState<string | null>(null);

  // Excel & PDF exporting state
  const [isExportingExcel, setIsExportingExcel] = useState<boolean>(false);

  // Business Report & Gate 2 Feedback state (Prompt M3-B6)
  const [bizFactsTable, setBizFactsTable] = useState<FactsTable | null>(null);
  const [bizInsightsReport, setBizInsightsReport] = useState<BusinessInsightsReport | null>(null);
  const [bizInsightsLoading, setBizInsightsLoading] = useState<boolean>(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState<boolean>(false);
  const [gate2FeedbackText, setGate2FeedbackText] = useState<string>('');
  const [highlightedBizChartId, setHighlightedBizChartId] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    let res = getAnalysisResult(session.id);
    const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const isDemo = searchParams?.get('sample') || searchParams?.get('demo') || searchParams?.get('forceState') === 'analyzed' || searchParams?.get('forceState') === 'report_approved';

    if (!res && isDemo) {
      res = createDemoAnalysisResult();
      ArtifactStore.put(session.id, 'analysis', res);
    }

    if (res) {
      setAnalysis(res);
      if (res.config.symbols.length >= 2) {
        setActiveTab('overview');
      } else if (res.config.symbols.length === 1) {
        setActiveTab(res.config.symbols[0]);
      }
    }

    // Prefill reviewer name if available from session meta
    if (session.reviewer_name) {
      setReviewerName(session.reviewer_name);
    } else if (searchParams?.get('forceState') === 'report_approved' || searchParams?.get('approved') === 'true') {
      setReviewerName('Trần Kiểm Duyệt');
    }

    // Load existing report or generate new one
    const statusInfo = getReportStatus(session.id);
    const existingNarrative = getNarrative(session.id);
    const isApprovedParam = searchParams?.get('approved') === 'true' || searchParams?.get('forceState') === 'report_approved';

    if (existingNarrative) {
      setReport({
        narrative: existingNarrative,
        analysis_hash: res?.analysis_hash || '',
        status: isApprovedParam || statusInfo?.status === 'approved' ? 'approved' : 'draft',
        reviewer_name: statusInfo?.reviewer_name || (isApprovedParam ? 'Trần Kiểm Duyệt' : undefined),
        approved_at: statusInfo?.approved_at || (isApprovedParam ? new Date().toISOString() : undefined),
        report_hash: statusInfo?.report_hash || (isApprovedParam ? '3a7bd3e2360a3d29eea436fcfb7e44c735d117c42d1c1835420b6b9942dd4f1b' : undefined),
      });
    } else if (res) {
      if (res.kind === 'business' || res.business_analysis) {
        const stored = getStoredBusinessInsights(session.id);
        if (stored) {
          setBizFactsTable(stored.factsTable);
          setBizInsightsReport(stored.report);
          const rep = ArtifactStore.get<ReportArtifact>(session.id, 'report');
          if (rep) setReport(rep);
        } else {
          const controller = new AbortController();
          setBizInsightsLoading(true);
          generateBusinessInsights(session.id, { signal: controller.signal })
            .then((bundle) => {
              if (!controller.signal.aborted) {
                setBizFactsTable(bundle.factsTable);
                setBizInsightsReport(bundle.report);
                const rep = ArtifactStore.get<ReportArtifact>(session.id, 'report');
                if (rep) setReport(rep);
              }
            })
            .catch(() => {})
            .finally(() => {
              if (!controller.signal.aborted) setBizInsightsLoading(false);
            });
          return () => controller.abort();
        }
      } else {
        // First visit (Trading): trigger automatic narrative generation
        setIsGeneratingNarrative(true);
        generateNarrative(session.id)
          .then((n) => {
            setReport({
              narrative: n,
              analysis_hash: res.analysis_hash,
              status: isApprovedParam ? 'approved' : 'draft',
              reviewer_name: isApprovedParam ? 'Trần Kiểm Duyệt' : undefined,
              approved_at: isApprovedParam ? new Date().toISOString() : undefined,
              report_hash: isApprovedParam ? '3a7bd3e2360a3d29eea436fcfb7e44c735d117c42d1c1835420b6b9942dd4f1b' : undefined,
            });
          })
          .catch((err) => {
            const formatted = formatAiError(err);
            showToast({
              type: 'error',
              title: `Lỗi tạo nhận định (${formatted.code})`,
              message: formatted.user_display,
            });
          })
          .finally(() => {
            setIsGeneratingNarrative(false);
          });
      }
    }
    if (res && (res.kind === 'business' || res.business_analysis)) {
      const stored = getStoredBusinessInsights(session.id);
      if (stored) {
        setBizFactsTable(stored.factsTable);
        setBizInsightsReport(stored.report);
      }
    }
  }, [session?.id]);

  // Business Report & Gate 2 View (Prompt M3-B6)
  if (session?.dataset?.kind === 'business' || analysis?.kind === 'business') {
    if (!isM3AnalysisEnabled()) {
      return (
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', paddingBottom: 'var(--space-8)' }}>
          <BusinessContextPanel session={session} />
          <PixelPanel title="CHẾ ĐỘ DỮ LIỆU KINH DOANH">
            <div style={{ padding: 'var(--space-6)', textAlign: 'center' }}>
              <PixelSprite mood="thinking" size={64} />
              <h3 className="font-pixel" style={{ fontSize: '22px', marginTop: 'var(--space-4)', color: 'var(--ink)' }}>
                ĐANG DÙNG CỜ QUAY LUI
              </h3>
              <div style={{ marginTop: 'var(--space-5)' }}>
                <PixelButton variant="primary" onClick={() => navigate('/nap-du-lieu')}>
                  Quay lại nạp dữ liệu
                </PixelButton>
              </div>
            </div>
          </PixelPanel>
        </div>
      );
    }

    const bizSummary = analysis?.business_analysis as BusinessAnalysisSummary | undefined;
    if (!analysis || !bizSummary) {
      return (
        <div style={{ maxWidth: '800px', margin: '0 auto', padding: 'var(--space-6) 0' }}>
          <PixelPanel title="CHƯA CÓ KẾT QUẢ PHÂN TÍCH KINH DOANH">
            <div style={{ padding: 'var(--space-4)', textAlign: 'center' }}>
              <p style={{ color: 'var(--ink-soft)', marginBottom: 'var(--space-4)', fontSize: '14px' }}>
                Vui lòng chạy phân tích dữ liệu kinh doanh ở Bước 3 trước khi xem báo cáo và duyệt Cổng 2.
              </p>
              <PixelButton variant="primary" onClick={() => navigate('/phan-tich')}>
                Đến bước Phân tích dữ liệu
              </PixelButton>
            </div>
          </PixelPanel>
        </div>
      );
    }

    const bizApproved = report?.status === 'approved';
    const handleApproveBusinessGate2 = async () => {
      if (!session) return;
      if (!reviewerName.trim()) {
        showToast({ type: 'warn', title: 'Thiếu tên người duyệt', message: 'Vui lòng nhập tên người duyệt báo cáo.' });
        return;
      }
      setIsApproving(true);
      try {
        const approved = await approveReport(session.id, reviewerName);
        setReport(approved);
        refreshSession();
        showToast({ type: 'success', title: 'Đã phê duyệt Cổng 2', message: 'Báo cáo kinh doanh đã được đóng dấu phê duyệt.' });
      } catch (err: any) {
        showToast({ type: 'error', title: 'Không thể phê duyệt', message: err.message });
      } finally {
        setIsApproving(false);
      }
    };

    const handleSubmitGate2Feedback = () => {
      if (!session) return;
      const fb = gate2FeedbackText.trim();
      if (!fb) {
        showToast({ type: 'warn', title: 'Thiếu nội dung góp ý', message: 'Hãy nhập góp ý để AI viết lại nhận định.' });
        return;
      }
      if (bizApproved) {
        editApprovedReport(session.id);
      }
      saveGate2BusinessFeedback(session.id, fb);
      setShowFeedbackModal(false);
      navigate('/phan-tich?rewriteFeedback=1');
    };

    return (
      <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', paddingBottom: 'var(--space-8)' }}>
        <BusinessContextPanel session={session} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 className="font-pixel" style={{ fontSize: '28px', color: 'var(--ink)', margin: 0 }}>
              BÁO CÁO PHÂN TÍCH KINH DOANH & CỔNG DUYỆT 2
            </h2>
            <p className="font-content" style={{ color: 'var(--ink-soft)', marginTop: '4px', fontSize: '14px' }}>
              Mọi con số do mã nguồn tính từ {bizSummary.total_rows} dòng sạch; bấm mã bằng chứng [F1..Fn] để đối chiếu trực tiếp.
            </p>
          </div>
          {bizApproved && report?.reviewer_name && (
            <ApprovedStamp
              reviewerName={report.reviewer_name}
              approvedAt={report.approved_at || ''}
              reportHash={report.report_hash || ''}
            />
          )}
        </div>

        {/* Incomplete Data Warning Banner (Only displayed when missing columns detected) */}
        {bizSummary.role_resolution?.warnings && bizSummary.role_resolution.warnings.length > 0 && (
          <div
            className="px-shadow-sm"
            style={{
              backgroundColor: '#fffbeb',
              border: '2px solid #f97316',
              padding: '12px 16px',
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
            <div key={kpi.label} className="px-shadow-sm" style={{ backgroundColor: 'var(--white)', border: '2px solid var(--ink)', padding: '12px 14px' }}>
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

        {/* Verified AI / Template Business Insights with Clickable Evidence */}
        <BusinessInsightsPanel
          loading={bizInsightsLoading}
          factsTable={bizFactsTable}
          report={bizInsightsReport}
          onRegenerate={() => {
            if (!session) return;
            setBizInsightsLoading(true);
            generateBusinessInsights(session.id, { forceRefresh: true })
              .then((b) => {
                setBizFactsTable(b.factsTable);
                setBizInsightsReport(b.report);
                const rep = ArtifactStore.get<ReportArtifact>(session.id, 'report');
                if (rep) setReport(rep);
              })
              .finally(() => setBizInsightsLoading(false));
          }}
          onSelectChartId={(cid) => {
            setHighlightedBizChartId(cid);
            document.getElementById(`rep_${cid}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }}
        />

        {/* Charts */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: 'var(--space-4)' }}>
          {analysis.charts.map((chart) => (
            <div
              key={chart.id}
              id={`rep_${chart.id}`}
              style={{
                outline: highlightedBizChartId === chart.id ? '3px solid var(--accent)' : 'none',
                outlineOffset: '2px',
              }}
            >
              <PixelChart spec={chart} height={290} />
            </div>
          ))}
        </div>

        {/* Human Gate 2 Approval & Rejection Feedback Loop */}
        <PixelPanel title="CỔNG DUYỆT 2 — PHÊ DUYỆT BÁO CÁO HOẶC GỬI GÓP Ý VIẾT LẠI">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', alignItems: 'flex-end' }}>
              <div style={{ flex: '1 1 260px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>
                  Tên người duyệt báo cáo (Cổng 2):
                </label>
                <input
                  type="text"
                  value={reviewerName}
                  maxLength={60}
                  disabled={bizApproved}
                  placeholder="Ví dụ: Nguyễn Văn Giám Đốc"
                  onChange={(e) => setReviewerName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    border: '2px solid var(--ink)',
                    backgroundColor: 'var(--white)',
                    fontFamily: 'var(--font-content)',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {!bizApproved ? (
                  <PixelButton
                    variant="primary"
                    disabled={isApproving || bizInsightsLoading || !bizInsightsReport}
                    onClick={handleApproveBusinessGate2}
                  >
                    {isApproving ? 'Đang phê duyệt...' : 'Phê duyệt báo cáo (Cổng 2)'}
                  </PixelButton>
                ) : (
                  <PixelButton variant="secondary" font="content" onClick={() => window.print()}>
                    In / Xuất PDF
                  </PixelButton>
                )}

                <PixelButton
                  variant="secondary"
                  font="content"
                  onClick={() => setShowFeedbackModal((v) => !v)}
                >
                  Không duyệt — nhập góp ý & quay lại Bước 3
                </PixelButton>
              </div>
            </div>

            {showFeedbackModal && (
              <div style={{ padding: '12px', backgroundColor: 'var(--warn-bg)', border: '2px solid var(--ink)' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>
                  Góp ý viết lại nhận định (giữ nguyên toàn bộ số liệu đã tính, chỉ hướng dẫn AI điều chỉnh cách diễn đạt/trọng tâm):
                </div>
                <textarea
                  rows={3}
                  value={gate2FeedbackText}
                  maxLength={360}
                  onChange={(e) => setGate2FeedbackText(e.target.value)}
                  placeholder="Ví dụ: Tập trung nhấn mạnh biên lợi nhuận của sản phẩm thấp nhất và đề xuất xử lý mục Không xác định."
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '2px solid var(--ink)',
                    backgroundColor: 'var(--white)',
                    fontFamily: 'var(--font-content)',
                    fontSize: '13px',
                    marginBottom: '8px',
                  }}
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <PixelButton variant="primary" size="sm" onClick={handleSubmitGate2Feedback}>
                    Gửi góp ý & quay lại Bước 3
                  </PixelButton>
                  <PixelButton variant="ghost" size="sm" onClick={() => setShowFeedbackModal(false)}>
                    Đóng
                  </PixelButton>
                </div>
              </div>
            )}
          </div>
        </PixelPanel>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: 'var(--space-6) 0' }}>
        <PixelPanel title="CHƯA CÓ KẾT QUẢ PHÂN TÍCH (CỔNG 1 ĐÃ DUYỆT)">
          <div style={{ padding: 'var(--space-4)', textAlign: 'center' }}>
            <p style={{ color: 'var(--ink-soft)', marginBottom: 'var(--space-4)', fontSize: '14px' }}>
              Phiên làm việc này chưa thực hiện phân tích định lượng. Vui lòng thiết lập cấu hình và
              bấm &quot;Chạy phân tích định lượng&quot; tại bước Phân tích.
            </p>
            <PixelButton variant="primary" onClick={() => navigate('/phan-tich')}>
              Đến bước Cấu hình Phân tích
            </PixelButton>
          </div>
        </PixelPanel>
      </div>
    );
  }

  const { config, clean_hash, metrics, charts } = analysis;
  const isMultiSymbol = config.symbols.length >= 2;
  const currentSymbol = activeTab === 'overview' ? config.symbols[0] : activeTab;
  const isApproved = report?.status === 'approved';
  const isStale = Boolean(report && report.analysis_hash !== analysis.analysis_hash);

  // Filter metrics for current view
  const currentMetrics = metrics.filter((m) => m.symbol === currentSymbol);

  // Top 8 KPI tiles
  const kpiTiles = DEFAULT_KPI_IDS.map((kpiId) => {
    return (
      currentMetrics.find((m) => m.id === kpiId) || {
        id: kpiId,
        label_vi: kpiId,
        symbol: currentSymbol,
        value: null,
        unit: 'number' as const,
        status: 'insufficient_data' as const,
        polarity: 'neutral' as const,
        formula_vi: '',
        inputs: [],
      }
    );
  });

  // Extract sparkline prices for current symbol
  const priceChartSpec = charts.find(
    (c) => c.id === `chart_price_ma:${currentSymbol}` || (c.id === 'chart_price_ma' && c.symbols.includes(currentSymbol))
  );
  const sparklinePrices: number[] = priceChartSpec?.data?.close || [];

  // Helper to find chart spec
  const findChart = (idPrefix: string, sym?: string): ChartSpec | undefined => {
    const targetId = sym ? `${idPrefix}:${sym}` : idPrefix;
    return charts.find((c) => c.id === targetId || c.id === idPrefix);
  };

  // -------------------------------------------------------------
  // Evidence Chip Target Scrolling & Highlighting
  // -------------------------------------------------------------
  const handleNavigateToEvidence = (targetId: string, sym: string | null) => {
    // If target has a symbol different from current active tab, switch tab first
    if (sym && sym !== activeTab && config.symbols.includes(sym)) {
      setActiveTab(sym);
    } else if (!sym && isMultiSymbol && activeTab !== 'overview') {
      setActiveTab('overview');
    }

    // Scroll and pulse after DOM update
    setTimeout(() => {
      const el =
        document.getElementById(`kpi-${targetId}`) ||
        document.getElementById(`chart-${targetId}`) ||
        document.getElementById(`metric-row-${targetId}`);

      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('px-target-highlight');
        setTimeout(() => el.classList.remove('px-target-highlight'), 2400);
      }
    }, 150);
  };

  // -------------------------------------------------------------
  // Paragraph Editing Handlers
  // -------------------------------------------------------------
  const handleUpdateParagraph = (secId: string, pId: string, text: string) => {
    if (!session) return;
    try {
      const updatedPara = updateParagraphText(session.id, secId, pId, text);
      setReport((prev) => {
        if (!prev) return null;
        const newSecs = prev.narrative.sections.map((s) => {
          if (s.id !== secId) return s;
          return {
            ...s,
            paragraphs: s.paragraphs.map((p) => (p.id === pId ? updatedPara : p)),
          };
        });
        return { ...prev, narrative: { ...prev.narrative, sections: newSecs } };
      });
    } catch (err: any) {
      showToast({ type: 'error', title: 'Lỗi sửa đoạn văn', message: err.message });
    }
  };

  const handleRevertParagraph = (secId: string, pId: string) => {
    if (!session) return;
    try {
      const reverted = revertParagraph(session.id, secId, pId);
      setReport((prev) => {
        if (!prev) return null;
        const newSecs = prev.narrative.sections.map((s) => {
          if (s.id !== secId) return s;
          return {
            ...s,
            paragraphs: s.paragraphs.map((p) => (p.id === pId ? reverted : p)),
          };
        });
        return { ...prev, narrative: { ...prev.narrative, sections: newSecs } };
      });
    } catch (err: any) {
      showToast({ type: 'error', title: 'Lỗi hoàn tác', message: err.message });
    }
  };

  const handleDeleteParagraph = (secId: string, pId: string) => {
    if (!session) return;
    try {
      deleteParagraph(session.id, secId, pId);
      setReport((prev) => {
        if (!prev) return null;
        const newSecs = prev.narrative.sections.map((s) => {
          if (s.id !== secId) return s;
          return {
            ...s,
            paragraphs: s.paragraphs.filter((p) => p.id !== pId),
          };
        });
        return { ...prev, narrative: { ...prev.narrative, sections: newSecs } };
      });
    } catch (err: any) {
      showToast({ type: 'error', title: 'Không thể xóa', message: err.message });
    }
  };

  const handleRegenerateSection = async (secId: string, style: 'concise' | 'detailed' | 'plain') => {
    if (!session) return;
    setRegeneratingSectionId(secId);
    try {
      const newSec = await regenerateSection(session.id, secId, style);
      setReport((prev) => {
        if (!prev) return null;
        const newSecs = prev.narrative.sections.map((s) => (s.id === secId ? newSec : s));
        return { ...prev, narrative: { ...prev.narrative, sections: newSecs } };
      });
      showToast({
        type: 'success',
        title: 'Đã viết lại mục',
        message: `Mục "${newSec.title_vi}" đã được viết lại với phong cách ${style}.`,
      });
    } catch (err: any) {
      showToast({ type: 'error', title: 'Lỗi viết lại', message: err.message });
    } finally {
      setRegeneratingSectionId(null);
    }
  };

  const handleUseTemplateForSection = (secId: string) => {
    if (!session) return;
    try {
      const tSec = useTemplateForSection(session.id, secId);
      setReport((prev) => {
        if (!prev) return null;
        const newSecs = prev.narrative.sections.map((s) => (s.id === secId ? tSec : s));
        return { ...prev, narrative: { ...prev.narrative, sections: newSecs } };
      });
    } catch (err: any) {
      showToast({ type: 'error', title: 'Lỗi chuyển mẫu câu', message: err.message });
    }
  };

  // -------------------------------------------------------------
  // Gate 2 Approval Handlers
  // -------------------------------------------------------------
  const blockingReasons = session ? getApprovalBlockingReasons(session.id, reviewerName) : [];
  const canApprove = blockingReasons.length === 0 && !isGeneratingNarrative;

  const handleApproveConfirm = async () => {
    if (!session) return;
    setIsApproving(true);
    try {
      const approved = await approveReport(session.id, reviewerName);
      setReport(approved);
      setShowApproveConfirm(false);
      refreshSession();
      showToast({
        type: 'success',
        title: 'Đã phê duyệt báo cáo (Cổng 2)',
        message: `Báo cáo đã được phê duyệt thành công bởi ${reviewerName}. Chức năng xuất PDF và Excel đã mở khóa!`,
      });
    } catch (err: any) {
      showToast({ type: 'error', title: 'Phê duyệt thất bại', message: err.message });
    } finally {
      setIsApproving(false);
    }
  };

  const handleEditApprovedConfirm = () => {
    if (!session) return;
    editApprovedReport(session.id);
    setShowEditApprovedConfirm(false);
    refreshSession();
    setReport((prev) => (prev ? { ...prev, status: 'draft' } : null));
    showToast({
      type: 'info',
      title: 'Mở lại báo cáo để sửa',
      message: 'Báo cáo đã chuyển về trạng thái chờ duyệt. Dấu phê duyệt đã được gỡ bỏ.',
    });
  };

  // -------------------------------------------------------------
  // Export Handlers
  // -------------------------------------------------------------
  const handleExportPdf = () => {
    if (!isApproved) {
      showToast({
        type: 'warn',
        title: 'Chưa thể xuất file',
        message: 'Bạn cần phê duyệt báo cáo tại Cổng duyệt 2 trước khi xuất PDF.',
      });
      return;
    }

    showToast({
      type: 'info',
      title: 'Chuẩn bị in báo cáo PDF',
      message: 'Vui lòng chọn "Lưu dưới dạng PDF" (Save as PDF) tại mục Máy in trong hộp thoại.',
    });

    setTimeout(() => {
      window.print();
    }, 400);
  };

  const handleExportExcel = async () => {
    if (!session || !isApproved) {
      showToast({
        type: 'warn',
        title: 'Chưa thể xuất file',
        message: 'Bạn cần phê duyệt báo cáo tại Cổng duyệt 2 trước khi xuất Excel.',
      });
      return;
    }

    setIsExportingExcel(true);
    try {
      const fileName = await downloadExcelReport(session.id);
      showToast({
        type: 'success',
        title: 'Đã xuất file Excel',
        message: `Tệp "${fileName}" (7 sheet kèm công thức sống) đã được tải về máy.`,
      });
    } catch (err: any) {
      showToast({ type: 'error', title: 'Lỗi xuất Excel', message: err.message });
    } finally {
      setIsExportingExcel(false);
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', paddingBottom: 'var(--space-8)' }}>
      <BusinessContextPanel session={session} />
      {/* Print-Only Header Banner */}
      <PrintHeader
        appName="Datify AI Agent"
        fileName={session?.dataset?.filename || 'file-mau-chuan.xlsx'}
        dateRange={`${formatDate(analysis.config.date_from)} - ${formatDate(analysis.config.date_to)}`}
        symbols={config.symbols}
        reviewerName={report?.reviewer_name}
        approvedAt={report?.approved_at}
        cleanHash={clean_hash}
        reportHash={report?.report_hash}
        isApproved={isApproved}
      />

      {/* 1. Header Bar (Hidden in print) */}
      <div
        className="no-print"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-4)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <h2 className="font-pixel" style={{ fontSize: '24px', margin: 0, color: 'var(--ink)' }}>
              BÁO CÁO PHÂN TÍCH GIAO DỊCH
            </h2>
            <PixelBadge variant={isApproved ? 'success' : 'warn'}>
              {isApproved ? 'CỔNG 2: ĐÃ DUYỆT' : 'CHỜ DUYỆT CỔNG 2'}
            </PixelBadge>
          </div>
          <p style={{ margin: '4px 0 0 0', color: 'var(--ink-soft)', fontSize: '13px' }}>
            Khoảng thời gian: <strong>{formatDate(config.date_from)}</strong> đến <strong>{formatDate(config.date_to)}</strong> | Dữ liệu sạch (SHA-256):{' '}
            <code>{clean_hash ? clean_hash.slice(0, 12) : ''}...</code>
          </p>
        </div>

        {/* Export & Action Buttons */}
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <PixelButton
            variant="secondary"
            icon="file"
            onClick={handleExportPdf}
            disabled={!isApproved}
            title={!isApproved ? 'Cần duyệt báo cáo trước khi xuất PDF' : 'In hoặc lưu báo cáo dưới dạng PDF'}
          >
            Xuất PDF
          </PixelButton>

          <PixelButton
            variant="primary"
            icon="chart"
            onClick={handleExportExcel}
            disabled={!isApproved || isExportingExcel}
            title={!isApproved ? 'Cần duyệt báo cáo trước khi xuất Excel' : 'Tải bảng tính Excel 7 sheet có công thức sống'}
          >
            {isExportingExcel ? 'Đang tạo Excel...' : 'Xuất Excel (.xlsx)'}
          </PixelButton>

          <PixelButton variant="secondary" onClick={() => navigate('/phan-tich')}>
            Thiết lập lại
          </PixelButton>
        </div>
      </div>

      {/* Approved Stamp Ribbon (Visible in Web View & Print View) */}
      {isApproved && report?.reviewer_name && report?.approved_at && report?.report_hash && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            marginBottom: 'var(--space-4)',
          }}
        >
          <ApprovedStamp
            reviewerName={report.reviewer_name}
            approvedAt={report.approved_at}
            reportHash={report.report_hash}
          />
        </div>
      )}

      {/* Stale Warning Banner (if analysis was recalculated) */}
      {isStale && (
        <div
          className="no-print px-shadow-sm"
          style={{
            padding: 'var(--space-3)',
            backgroundColor: 'var(--warn-bg)',
            border: '2px solid var(--warn)',
            marginBottom: 'var(--space-4)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <PixelIcon name="warning" size={20} />
            <div style={{ fontSize: '13px', color: 'var(--ink)' }}>
              <strong>Nhận định này được viết cho số liệu cũ:</strong> Bạn vừa thay đổi bộ lọc hoặc tính toán lại chỉ số. Hãy tạo lại nhận định để đối chiếu với số liệu mới nhất trước khi duyệt.
            </div>
          </div>
          <PixelButton
            variant="primary"
            size="sm"
            onClick={() => {
              if (session) {
                setIsGeneratingNarrative(true);
                generateNarrative(session.id)
                  .then((n) => setReport({ narrative: n, analysis_hash: analysis.analysis_hash, status: 'draft' }))
                  .finally(() => setIsGeneratingNarrative(false));
              }
            }}
            disabled={isGeneratingNarrative}
          >
            {isGeneratingNarrative ? 'Đang tạo lại...' : 'Tạo lại nhận định ngay'}
          </PixelButton>
        </div>
      )}

      {/* Analysis Warnings (if any) */}
      {analysis.warnings && analysis.warnings.length > 0 && (
        <div
          className="no-print"
          style={{
            padding: 'var(--space-3)',
            backgroundColor: 'var(--warn-bg)',
            border: '2px solid var(--warn)',
            marginBottom: 'var(--space-4)',
          }}
        >
          {analysis.warnings.map((w, idx) => (
            <div key={idx} style={{ fontSize: '13px', color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
              <PixelIcon name="warning" size={14} />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* 2. Navigation Tabs (Overview + Symbol Tabs) */}
      <div
        className="no-print"
        style={{
          display: 'flex',
          gap: 'var(--space-1)',
          borderBottom: '2px solid var(--ink)',
          marginBottom: 'var(--space-5)',
        }}
      >
        {isMultiSymbol && (
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            style={{
              padding: '8px 16px',
              fontFamily: 'var(--font-pixel)',
              fontSize: '13px',
              borderTop: '2px solid var(--ink)',
              borderLeft: '2px solid var(--ink)',
              borderRight: '2px solid var(--ink)',
              borderBottom: activeTab === 'overview' ? '2px solid var(--panel)' : 'none',
              backgroundColor: activeTab === 'overview' ? 'var(--panel)' : 'var(--panel-alt)',
              color: 'var(--ink)',
              cursor: 'pointer',
              marginBottom: '-2px',
            }}
          >
            TỔNG QUAN DANH MỤC
          </button>
        )}

        {config.symbols.map((sym) => (
          <button
            key={sym}
            type="button"
            onClick={() => setActiveTab(sym)}
            style={{
              padding: '8px 16px',
              fontFamily: 'var(--font-pixel)',
              fontSize: '13px',
              borderTop: '2px solid var(--ink)',
              borderLeft: '2px solid var(--ink)',
              borderRight: '2px solid var(--ink)',
              borderBottom: activeTab === sym ? '2px solid var(--panel)' : 'none',
              backgroundColor: activeTab === sym ? 'var(--panel)' : 'var(--panel-alt)',
              color: 'var(--ink)',
              cursor: 'pointer',
              marginBottom: '-2px',
            }}
          >
            MÃ {sym}
          </button>
        ))}
      </div>

      {/* 3. Top 8 KPI Tiles */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 'var(--space-3)',
          }}
        >
          {kpiTiles.map((tileMetric) => (
            <div id={`kpi-${tileMetric.id}`} key={tileMetric.id}>
              <KpiTile
                metric={tileMetric}
                sparklinePrices={sparklinePrices}
              />
            </div>
          ))}
        </div>
      </div>

      {/* 4. Featured Large Chart */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <PixelPanel
          title={
            activeTab === 'overview'
              ? 'BIỂU ĐỒ TỔNG QUAN HIỆU SUẤT TƯƠNG ĐỐI (QUY CHUẨN VỀ MỐC 100)'
              : `BIỂU ĐỒ KỸ THUẬT NỔI BẬT (MÃ ${currentSymbol})`
          }
          headerAction={
            activeTab !== 'overview' && (
              <div className="no-print" style={{ display: 'flex', gap: '4px' }}>
                <PixelButton
                  variant={mainChartKind === 'price_ma' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setMainChartKind('price_ma')}
                >
                  Giá & MA
                </PixelButton>
                <PixelButton
                  variant={mainChartKind === 'candle_volume' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setMainChartKind('candle_volume')}
                >
                  Nến & KL
                </PixelButton>
              </div>
            )
          }
        >
          <div style={{ padding: 'var(--space-3)' }}>
            {activeTab === 'overview' ? (
              <div id="chart-chart_normalized">
                {findChart('chart_normalized') && (
                  <PixelChart spec={findChart('chart_normalized')!} height="380px" />
                )}
              </div>
            ) : (
              <div>
                {mainChartKind === 'price_ma' && findChart('chart_price_ma', currentSymbol) && (
                  <div id="chart-chart_price_ma">
                    <PixelChart spec={findChart('chart_price_ma', currentSymbol)!} height="380px" />
                  </div>
                )}
                {mainChartKind === 'candle_volume' && findChart('chart_candle_volume', currentSymbol) && (
                  <div id="chart-chart_candle_volume">
                    <PixelChart spec={findChart('chart_candle_volume', currentSymbol)!} height="380px" />
                  </div>
                )}
              </div>
            )}
          </div>
        </PixelPanel>
      </div>

      {/* 5. Secondary Charts Grid */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        {activeTab === 'overview' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))', gap: 'var(--space-4)' }}>
            {findChart('chart_symbol_returns') && (
              <div id="chart-chart_symbol_returns">
                <PixelChart spec={findChart('chart_symbol_returns')!} height="300px" />
              </div>
            )}
            {findChart('chart_risk_return') && (
              <div id="chart-chart_risk_return">
                <PixelChart spec={findChart('chart_risk_return')!} height="300px" />
              </div>
            )}
            {findChart('chart_trade_share') && (
              <div id="chart-chart_trade_share">
                <PixelChart spec={findChart('chart_trade_share')!} height="300px" />
              </div>
            )}
            {findChart('chart_correlation') && (
              <div id="chart-chart_correlation">
                <PixelChart spec={findChart('chart_correlation')!} height="300px" />
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))', gap: 'var(--space-4)' }}>
            {findChart('chart_monthly_returns', currentSymbol) && (
              <div id="chart-chart_monthly_returns">
                <PixelChart spec={findChart('chart_monthly_returns', currentSymbol)!} height="280px" />
              </div>
            )}
            {findChart('chart_return_hist', currentSymbol) && (
              <div id="chart-chart_return_hist">
                <PixelChart spec={findChart('chart_return_hist', currentSymbol)!} height="280px" />
              </div>
            )}
            {findChart('chart_drawdown', currentSymbol) && (
              <div id="chart-chart_drawdown">
                <PixelChart spec={findChart('chart_drawdown', currentSymbol)!} height="280px" />
              </div>
            )}
            {findChart('chart_volume_combo', currentSymbol) && (
              <div id="chart-chart_volume_combo">
                <PixelChart spec={findChart('chart_volume_combo', currentSymbol)!} height="280px" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* 6. Detailed 17 Metrics Table */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <PixelPanel title={`BẢNG CHI TIẾT 17 CHỈ SỐ ĐỊNH LƯỢNG (MÃ ${currentSymbol})`}>
          <div style={{ overflowX: 'auto', padding: 'var(--space-3)' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontFamily: 'var(--font-excel)',
                fontSize: '13px',
                backgroundColor: 'var(--chart-bg)',
                border: '1px solid var(--chart-grid)',
              }}
            >
              <thead>
                <tr style={{ backgroundColor: 'var(--panel)', borderBottom: '2px solid var(--chart-grid)' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--ink)' }}>Tên chỉ số</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--ink)' }}>Giá trị</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--ink)' }}>Kỳ trước / Vị thế</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--ink)' }}>Công thức tóm tắt</th>
                  <th className="no-print" style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--ink)' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {currentMetrics.map((m, idx) => (
                  <tr
                    id={`metric-row-${m.id}`}
                    key={m.id}
                    style={{
                      borderBottom: '1px solid var(--chart-grid)',
                      backgroundColor: idx % 2 === 0 ? 'var(--chart-bg)' : 'var(--panel)',
                    }}
                  >
                    <td style={{ padding: '8px 12px', fontWeight: 'bold', color: 'var(--ink)' }}>
                      {m.label_vi}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'bold', color: 'var(--ink)' }}>
                      {m.status === 'insufficient_data'
                        ? 'Chưa đủ dữ liệu'
                        : m.value !== null && m.value !== undefined
                        ? m.unit === 'ratio'
                          ? formatPercent(m.value)
                          : m.unit === 'currency'
                          ? `${formatNumber(m.value)} đ`
                          : m.unit === 'count'
                          ? formatNumber(m.value, 0)
                          : formatNumber(m.value, 2)
                        : m.text || '-'}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--chart-text)' }}>
                      {m.delta?.value !== null && m.delta?.value !== undefined
                        ? `${m.delta.value > 0 ? '+' : ''}${
                            m.unit === 'ratio'
                              ? formatPercent(m.delta.value)
                              : formatNumber(m.delta.value)
                          } (${m.delta.label_vi})`
                        : m.text || '-'}
                    </td>
                    <td style={{ padding: '8px 12px', color: 'var(--chart-text)', fontSize: '12px' }}>
                      {m.formula_vi}
                    </td>
                    <td className="no-print" style={{ padding: '8px 12px', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => setSelectedModalMetric(m)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--blue)',
                          fontSize: '12px',
                          cursor: 'pointer',
                          textDecoration: 'underline',
                        }}
                      >
                        Xem cách tính
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PixelPanel>
      </div>

      {/* Custom One-Off Analysis Section (Prompt P6 Part C) */}
      {session && <CustomAnalysisReportSection sessionId={session.id} />}

      {/* 7. AI Narrative & Human Review Section */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <PixelPanel
          title="NHẬN ĐỊNH BÁO CÁO PHÂN TÍCH (AI & KIỂM CHỨNG ĐỐI CHIẾU)"
          headerAction={
            report && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <PixelBadge
                  variant={
                    report.narrative.mode === 'ai'
                      ? 'info'
                      : report.narrative.mode === 'mixed'
                      ? 'warn'
                      : 'neutral'
                  }
                >
                  {report.narrative.mode === 'ai'
                    ? '100% Trí tuệ Nhân tạo'
                    : report.narrative.mode === 'mixed'
                    ? 'Hỗn hợp (AI + Mẫu câu)'
                    : 'Mẫu câu (không dùng AI)'}
                </PixelBadge>
              </div>
            )
          }
        >
          <div style={{ padding: 'var(--space-4)' }}>
            {isGeneratingNarrative ? (
              <div style={{ textAlign: 'center', padding: 'var(--space-6)' }}>
                <PixelIcon name="robot-head" size={32} />
                <p className="font-pixel" style={{ fontSize: '16px', marginTop: '12px', color: 'var(--ink)' }}>
                  Trợ lý AI đang viết nhận định và đối chiếu số liệu...
                </p>
                <p style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
                  Mọi con số đang được đối chiếu chéo với 100% kết quả định lượng.
                </p>
              </div>
            ) : report ? (
              <div>
                {/* Narrative Sections */}
                {report.narrative.sections.map((sec) => (
                  <NarrativeSectionView
                    key={sec.id}
                    section={sec}
                    isApproved={isApproved}
                    onNavigateToTarget={handleNavigateToEvidence}
                    onUpdateParagraph={handleUpdateParagraph}
                    onRevertParagraph={handleRevertParagraph}
                    onDeleteParagraph={handleDeleteParagraph}
                    onRegenerateSection={handleRegenerateSection}
                    onUseTemplateForSection={handleUseTemplateForSection}
                    isRegenerating={regeneratingSectionId === sec.id}
                  />
                ))}

                {/* Fixed Legal & Investment Disclaimer */}
                <div
                  style={{
                    marginTop: 'var(--space-4)',
                    padding: 'var(--space-3)',
                    backgroundColor: 'var(--panel-alt)',
                    borderLeft: '3px solid var(--ink)',
                    fontSize: '13px',
                    fontFamily: 'var(--font-analysis)',
                    fontStyle: 'italic',
                    color: 'var(--ink-soft)',
                  }}
                >
                  * {report.narrative.disclaimer_vi}
                </div>
              </div>
            ) : null}
          </div>
        </PixelPanel>
      </div>

      {/* 8. Human Gate 2 Approval Bar (Cổng duyệt 2) */}
      <div className="no-print" style={{ marginBottom: 'var(--space-6)' }}>
        <PixelPanel title="CỔNG DUYỆT 2: PHÊ DUYỆT BÁO CÁO VÀ KHÓA NỘI DUNG">
          <div style={{ padding: 'var(--space-4)' }}>
            {isApproved ? (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 'var(--space-3)',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <PixelIcon name="check" size={18} />
                    <strong style={{ fontSize: '15px', color: 'var(--good)' }}>
                      Báo cáo này đã được phê duyệt chính thức bởi {report?.reviewer_name}.
                    </strong>
                  </div>
                  <p style={{ margin: '4px 0 0 28px', fontSize: '12px', color: 'var(--ink-soft)' }}>
                    Các chức năng xuất PDF và Excel đã mở khóa hoàn toàn. Mọi nội dung đang ở chế độ chỉ-xem (Read-Only).
                  </p>
                </div>

                <PixelButton
                  variant="secondary"
                  onClick={() => setShowEditApprovedConfirm(true)}
                >
                  Sửa lại báo cáo (Mở khóa)
                </PixelButton>
              </div>
            ) : (
              <div>
                <p style={{ fontSize: '13px', color: 'var(--ink)', marginBottom: 'var(--space-3)' }}>
                  Người duyệt vui lòng kiểm tra nội dung, đảm bảo không có cảnh báo số liệu không khớp, nhập tên xác nhận và nhấn nút phê duyệt để cấp dấu kiểm định:
                </p>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 'var(--space-3)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--ink)' }}>
                      Tên người duyệt:
                    </label>
                    <input
                      type="text"
                      value={reviewerName}
                      onChange={(e) => setReviewerName(e.target.value)}
                      placeholder="Nhập họ tên người duyệt..."
                      maxLength={60}
                      style={{
                        padding: '6px 10px',
                        border: '2px solid var(--ink)',
                        fontSize: '13px',
                        fontFamily: 'var(--font-pixel)',
                        backgroundColor: 'var(--panel)',
                        width: '260px',
                      }}
                    />
                  </div>

                  <PixelButton
                    variant="primary"
                    disabled={!canApprove || isApproving}
                    onClick={() => setShowApproveConfirm(true)}
                  >
                    {isApproving ? 'Đang duyệt...' : 'Phê duyệt báo cáo (Cổng 2)'}
                  </PixelButton>
                </div>

                {/* Blocking reasons display */}
                {blockingReasons.length > 0 && (
                  <div style={{ marginTop: 'var(--space-3)', fontSize: '12px', color: 'var(--bad)' }}>
                    <strong>Chưa đủ điều kiện duyệt:</strong>
                    <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                      {blockingReasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </PixelPanel>
      </div>

      {/* Gate 2 Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showApproveConfirm}
        title="Xác nhận phê duyệt báo cáo (Cổng 2)"
        message={`Bạn đang chuẩn bị phê duyệt báo cáo phân tích cho danh mục [${config.symbols.join(', ')}] gồm ${report?.narrative.sections.length} mục nhận định với tư cách người duyệt: "${reviewerName}". Sau khi duyệt, báo cáo sẽ được gắn mã băm xác thực report_hash và mở khóa toàn bộ tính năng xuất file PDF và Excel.`}
        confirmLabel="Xác nhận phê duyệt"
        danger={false}
        onConfirm={handleApproveConfirm}
        onCancel={() => setShowApproveConfirm(false)}
      />

      {/* Edit Approved Report Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showEditApprovedConfirm}
        title="Xác nhận mở lại báo cáo để chỉnh sửa"
        message="Mở lại báo cáo sau khi đã duyệt sẽ gỡ bỏ dấu 'ĐÃ PHÊ DUYỆT', tạm khóa xuất file và đưa phiên làm việc trở lại trạng thái chờ duyệt. Bạn có chắc chắn muốn tiếp tục?"
        confirmLabel="Mở lại báo cáo"
        danger={true}
        onConfirm={handleEditApprovedConfirm}
        onCancel={() => setShowEditApprovedConfirm(false)}
      />

      {/* Modal for detail calculation */}
      <MetricCalcModal
        isOpen={selectedModalMetric !== null}
        onClose={() => setSelectedModalMetric(null)}
        metric={selectedModalMetric}
      />
    </div>
  );
};

export default ReportPage;
