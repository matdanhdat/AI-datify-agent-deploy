import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../hooks/useSession';
import { PixelPanel } from '../components/pixel/PixelPanel';
import { PixelButton } from '../components/pixel/PixelButton';
import { PixelBadge } from '../components/pixel/PixelBadge';
import { PixelIcon } from '../components/pixel/PixelIcon';
import { useToast } from '../components/pixel/PixelToast';
import { BUSINESS_METRIC_CATALOG } from '../core/metrics/businessCatalog';
import { buildBusinessFacts, checkFeasibility, type FeasibilityResult } from '../core/metrics/businessFeasibility';
import { resolveBusinessRoles } from '../core/metrics/businessRoles';
import { applyManualBusinessRoles } from '../core/validator/business';
import { computeSelected, type ConfidenceInfo, translateBusinessRoleId } from '../core/metrics/businessComputeSelected';
import { getActiveCleanArtifact } from '../services/cleanService';
import { setSessionMetricSelection } from '../services/sessionService';
import { fetchMetricSuggestions } from '../services/metricSuggestionService';
import type { MetricSuggestionResult } from '../core/metrics/metricSuggestionValidator';
import { ArtifactStore } from '../core/artifacts';
import type { BusinessTable } from '../core/businessTable';
import { BusinessQuestionBox } from '../components/business/BusinessQuestionBox';
import {
  analyzeBusinessQuestions,
  type BusinessQuestionAnalysisResult,
} from '../services/businessQuestionService';
import { mapQuestionsToMetrics } from '../core/metrics/questionToMetrics';

interface MetricGroup {
  key: string;
  title: string;
  description: string;
  metricIds: string[];
}

const METRIC_GROUPS: MetricGroup[] = [
  {
    key: 'summary',
    title: '1. TỔNG QUAN HIỆU QUẢ KINH DOANH',
    description: 'Các chỉ số tổng hợp quy mô doanh số, chi phí vốn và hiệu quả tổng thể.',
    metricIds: ['total_revenue', 'total_orders', 'aov', 'gross_profit', 'gross_margin'],
  },
  {
    key: 'dimension',
    title: '2. PHÂN TÍCH THEO CHIỀU NGHIỆP VỤ',
    description: 'Cơ cấu và phân bổ doanh thu theo các phân khúc kênh bán, sản phẩm, địa bàn, thời gian.',
    metricIds: ['revenue_by_channel', 'revenue_by_product', 'revenue_by_region', 'revenue_by_month'],
  },
  {
    key: 'growth',
    title: '3. TĂNG TRƯỞNG & XU HƯỚNG',
    description: 'Tốc độ tăng trưởng doanh thu liên kỳ tháng (Month-over-Month).',
    metricIds: ['revenue_growth'],
  },
  {
    key: 'margin',
    title: '4. HIỆU QUẢ & TỶ SUẤT LỢI NHUẬN',
    description: 'Biên lợi nhuận gộp theo từng chiều và ma trận tương tác 2 chiều Kênh × Sản phẩm.',
    metricIds: ['margin_by_channel', 'margin_by_product', 'channel_product_matrix'],
  },
];

const METRIC_UNITS: Record<string, string> = {
  total_revenue: 'VND',
  total_orders: 'đơn',
  aov: 'VND/đơn',
  gross_profit: 'VND',
  gross_margin: '%',
  revenue_by_channel: 'VND',
  revenue_by_product: 'VND',
  revenue_by_region: 'VND',
  revenue_by_month: 'VND',
  revenue_growth: '%',
  margin_by_channel: '%',
  margin_by_product: '%',
  channel_product_matrix: '%',
};

export const ExchangePage: React.FC = () => {
  const navigate = useNavigate();
  const { session, refreshSession } = useSession();
  const { showToast } = useToast();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [suggestionResult, setSuggestionResult] = useState<MetricSuggestionResult | null>(null);
  const [suggestionLoading, setSuggestionLoading] = useState<boolean>(false);
  const [isSuggestionDismissed, setIsSuggestionDismissed] = useState<boolean>(false);
  const [questionAnalysisResult, setQuestionAnalysisResult] = useState<BusinessQuestionAnalysisResult | null>(null);
  const [isAnalyzingQuestions, setIsAnalyzingQuestions] = useState<boolean>(false);
  const [previousSelectedIds, setPreviousSelectedIds] = useState<string[] | null>(null);

  // Retrieve clean business table
  const table = useMemo<BusinessTable | null>(() => {
    if (!session?.id) return null;
    const artifact = getActiveCleanArtifact(session.id) || ArtifactStore.get<any>(session.id, 'clean');
    let tbl: BusinessTable | null = artifact?.businessTable || null;
    if (!tbl) {
      tbl = ArtifactStore.get<BusinessTable>(session.id, 'clean_dataset') || null;
    }
    if (!tbl) {
      const raw = ArtifactStore.get<BusinessTable>(session.id, 'raw');
      if (raw && (raw as any).kind === 'business') {
        tbl = raw;
      }
    }
    return tbl;
  }, [session, session?.id, session?.clean_version]);

  // Resolve roles & facts for feasibility checks
  const { roles, feasibilityMap } = useMemo(() => {
    if (!table) {
      return {
        roles: null,
        facts: null,
        feasibilityMap: new Map<string, FeasibilityResult>(),
      };
    }
    let r = resolveBusinessRoles(table);
    r = applyManualBusinessRoles(r, table);
    const f = buildBusinessFacts(table, r);

    const fMap = new Map<string, FeasibilityResult>();
    for (const def of BUSINESS_METRIC_CATALOG) {
      fMap.set(def.id, checkFeasibility(def.id, f));
    }
    return { roles: r, facts: f, feasibilityMap: fMap };
  }, [table]);

  const labelById = useMemo(() => {
    const map: Record<string, string> = {};
    BUSINESS_METRIC_CATALOG.forEach((m) => {
      map[m.id] = m.name;
    });
    return map;
  }, []);

  const feasibilityRecord = useMemo(() => {
    const rec: Record<string, { feasible: boolean; reason?: string }> = {};
    BUSINESS_METRIC_CATALOG.forEach((m) => {
      const res = feasibilityMap.get(m.id);
      rec[m.id] = {
        feasible: res?.feasible === true,
        reason: res?.feasible ? undefined : (res as any)?.reason,
      };
    });
    return rec;
  }, [feasibilityMap]);

  const availableRoleNames = useMemo(() => {
    if (!roles) return [];
    const roleKeys: Array<keyof Omit<typeof roles, 'warnings'>> = [
      'revenue',
      'cogs',
      'profit',
      'orders',
      'channel',
      'region',
      'product',
      'time',
    ];
    const names: string[] = [];
    const roleLabels: Record<string, string> = {
      revenue: 'doanh thu',
      cogs: 'giá vốn',
      profit: 'lợi nhuận',
      orders: 'đơn hàng',
      channel: 'kênh',
      region: 'khu vực',
      product: 'sản phẩm',
      time: 'thời gian',
    };
    for (const k of roleKeys) {
      if (roles[k]?.status !== 'thiếu') {
        names.push(roleLabels[k] || k);
      }
    }
    return names;
  }, [roles]);

  // Restore question analysis if business_questions already in session
  useEffect(() => {
    if (
      session?.business_questions &&
      session.business_questions.length > 0 &&
      !questionAnalysisResult &&
      feasibilityMap.size > 0
    ) {
      const res = mapQuestionsToMetrics(
        session.business_questions,
        feasibilityRecord,
        labelById
      );
      setQuestionAnalysisResult({
        ...res,
        source: 'HIỂU THEO TỪ KHÓA (DỰ PHÒNG)',
        latency_ms: 0,
      });
    }
  }, [session?.business_questions, feasibilityRecord, labelById, feasibilityMap.size, questionAnalysisResult]);

  // Initial selection logic (Prompt 1.B & 1.C)
  useEffect(() => {
    if (!table || isInitialized) return;

    const feasibleMetricIds = BUSINESS_METRIC_CATALOG.filter(
      (m) => feasibilityMap.get(m.id)?.feasible
    ).map((m) => m.id);

    // If session already has saved selection, preserve only those that are still feasible
    const existing = session?.selected_metric_ids;
    if (existing && Array.isArray(existing) && existing.length > 0) {
      const validExisting = existing.filter((id) => feasibilityMap.get(id)?.feasible);
      setSelectedIds(validExisting.length > 0 ? validExisting : feasibleMetricIds);
    } else {
      // Default: check ALL feasible metrics
      setSelectedIds(feasibleMetricIds);
    }
    setIsInitialized(true);
  }, [table, feasibilityMap, session?.selected_metric_ids, isInitialized]);

  // Persist draft metric selection so returning from other steps preserves selection (Case 6)
  useEffect(() => {
    if (!session?.id || !isInitialized) return;
    try {
      setSessionMetricSelection(session.id, selectedIds, false);
    } catch {
      // Ignore if session not found
    }
  }, [session?.id, selectedIds, isInitialized]);

  // Feasible metrics list & count
  const allFeasibleIds = useMemo(() => {
    return BUSINESS_METRIC_CATALOG.filter((m) => feasibilityMap.get(m.id)?.feasible).map((m) => m.id);
  }, [feasibilityMap]);

  // Live Confidence & Data Limits preview via computeSelected
  const previewInfo = useMemo<{
    confidence: ConfidenceInfo;
    dataLimits: string[];
  }>(() => {
    if (!table || selectedIds.length === 0) {
      return {
        confidence: { level: 'LOW', level_vi: 'THẤP', reasons: ['Chưa chọn chỉ số nào'] },
        dataLimits: [],
      };
    }
    const computed = computeSelected(table, selectedIds);
    return {
      confidence: computed.confidence,
      dataLimits: computed.dataLimits,
    };
  }, [table, selectedIds]);

  // Toggle single metric
  const handleToggleMetric = (id: string) => {
    if (!feasibilityMap.get(id)?.feasible) return;
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((mId) => mId !== id) : [...prev, id]
    );
  };

  // Quick Action: Select All Feasible
  const handleSelectAllFeasible = () => {
    setSelectedIds([...allFeasibleIds]);
    showToast({ message: `Đã chọn tất cả ${allFeasibleIds.length} chỉ số tính được`, type: 'info' });
  };

  // Quick Action: Deselect All
  const handleDeselectAll = () => {
    setSelectedIds([]);
    showToast({ message: 'Đã bỏ chọn toàn bộ chỉ số', type: 'info' });
  };

  // AI Metric Suggestion logic (Prompt 3A)
  useEffect(() => {
    if (!table || allFeasibleIds.length === 0) return;

    let active = true;
    setSuggestionLoading(true);

    const confirmedRolesList: string[] = [];
    if (roles) {
      for (const [rId, item] of Object.entries(roles)) {
        if ((item as any)?.status === 'xác nhận' || (item as any)?.userChosen || (item as any)?.columnIndex >= 0) {
          confirmedRolesList.push(translateBusinessRoleId(rId));
        }
      }
    }

    const catalogMetrics = BUSINESS_METRIC_CATALOG.map((m) => {
      const feas = feasibilityMap.get(m.id);
      return {
        id: m.id,
        name: m.name,
        feasible: feas?.feasible ?? false,
        reason: feas && !feas.feasible ? feas.reason : undefined,
      };
    });

    fetchMetricSuggestions({
      cleanRowCount: table.n,
      confirmedRoles: confirmedRolesList,
      catalogMetrics,
      confidenceLevel: previewInfo.confidence.level_vi || 'CAO',
    })
      .then((res) => {
        if (active) {
          setSuggestionResult(res);
          setSuggestionLoading(false);
        }
      })
      .catch((_err) => {
        if (active) {
          setSuggestionLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [table, allFeasibleIds.length, previewInfo.confidence.level_vi]);

  const handleApplySuggestions = () => {
    if (!suggestionResult) return;
    const validSuggested = suggestionResult.suggested_ids.filter((id) =>
      feasibilityMap.get(id)?.feasible
    );
    setSelectedIds(validSuggested);
    showToast({
      message: `Đã áp dụng ${validSuggested.length} chỉ số gợi ý từ AI`,
      type: 'success',
    });
  };

  const handleDismissSuggestions = () => {
    setIsSuggestionDismissed(true);
  };

  const handleSendQuestions = async (cleanedQuestions: string[]) => {
    if (!session?.id) return;
    setPreviousSelectedIds([...selectedIds]);
    setIsAnalyzingQuestions(true);

    try {
      const res = await analyzeBusinessQuestions({
        questions: cleanedQuestions,
        feasibilityById: feasibilityRecord,
        labelById,
      });
      setQuestionAnalysisResult(res);

      if (res.tickUnion.length > 0) {
        setSelectedIds(res.tickUnion);
        setSessionMetricSelection(session.id, res.tickUnion, false, cleanedQuestions);
        showToast({
          message: `Đã chọn ${res.tickUnion.length} chỉ số liên quan đến câu hỏi!`,
          type: 'success',
        });
      } else {
        // No feasible metrics matched: retain current selection
        setSessionMetricSelection(session.id, selectedIds, false, cleanedQuestions);
        showToast({
          message: 'Không có chỉ số khả thi khớp câu hỏi; giữ nguyên lựa chọn hiện tại.',
          type: 'info',
        });
      }
    } catch (err: any) {
      showToast({
        message: err.message || 'Lỗi xử lý câu hỏi',
        type: 'error',
      });
    } finally {
      setIsAnalyzingQuestions(false);
    }
  };

  const handleUndoSelection = () => {
    if (!previousSelectedIds || !session?.id) return;
    setSelectedIds(previousSelectedIds);
    setSessionMetricSelection(
      session.id,
      previousSelectedIds,
      false,
      session.business_questions || null
    );
    setPreviousSelectedIds(null);
    showToast({
      message: 'Đã hoàn tác lựa chọn chỉ số về trạng thái trước đó.',
      type: 'info',
    });
  };

  const handleClearQuestions = () => {
    if (!session?.id) return;
    setQuestionAnalysisResult(null);
    setPreviousSelectedIds(null);
    setSelectedIds(allFeasibleIds);
    setSessionMetricSelection(session.id, allFeasibleIds, false, null);
    showToast({
      message: 'Đã xóa câu hỏi và khôi phục lựa chọn tất cả chỉ số khả thi.',
      type: 'info',
    });
  };

  // Primary Action: Confirm and Proceed to Analyze
  const handleConfirmAndAnalyze = async () => {
    if (!session || selectedIds.length === 0) return;
    try {
      const questionsToPersist =
        questionAnalysisResult && questionAnalysisResult.perQuestion.length > 0
          ? questionAnalysisResult.perQuestion.map((q) => q.text)
          : session.business_questions || null;
      setSessionMetricSelection(session.id, selectedIds, true, questionsToPersist);
      await refreshSession();
      showToast({ message: `Đã lưu ${selectedIds.length} chỉ số và chuyển sang Phân tích!`, type: 'success' });
      navigate('/phan-tich?autoRun=1');
    } catch (err: any) {
      showToast({ message: err.message || 'Lỗi lưu chỉ số phân tích', type: 'error' });
    }
  };

  if (!table) {
    return (
      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: 'var(--space-6)' }}>
        <PixelPanel title="CHƯA CÓ DỮ LIỆU ĐÃ DUYỆT (CỔNG 1)">
          <div style={{ padding: 'var(--space-6)', textAlign: 'center' }}>
            <p style={{ color: 'var(--ink-soft)', marginBottom: 'var(--space-4)', fontSize: '15px' }}>
              Bạn cần hoàn tất phê duyệt dữ liệu sạch tại Cổng duyệt 1 trước khi tiến hành trao đổi và lựa chọn chỉ số phân tích.
            </p>
            <PixelButton variant="primary" onClick={() => navigate('/lam-sach')}>
              Quay lại Làm sạch dữ liệu (Cổng 1)
            </PixelButton>
          </div>
        </PixelPanel>
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: '1160px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-6)',
        paddingBottom: 'var(--space-8)',
      }}
    >
      {/* Page Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 'var(--space-3)',
          borderBottom: '2px solid var(--ink)',
          paddingBottom: 'var(--space-4)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              className="font-pixel"
              style={{
                backgroundColor: 'var(--blue)',
                color: 'var(--white)',
                padding: '2px 8px',
                fontSize: '12px',
              }}
            >
              BƯỚC 4 / 6
            </span>
            <h2 className="font-pixel" style={{ fontSize: '26px', color: 'var(--ink)', margin: 0 }}>
              TRAO ĐỔI & CHỌN CHỈ SỐ PHÂN TÍCH
            </h2>
          </div>
          <p className="font-content" style={{ color: 'var(--ink-soft)', marginTop: '4px', fontSize: '14px' }}>
            Lựa chọn danh mục chỉ số phù hợp với mục tiêu kinh doanh của bạn. Hệ thống tự động thẩm định tính khả thi trên tập dữ liệu đã duyệt.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <PixelButton variant="ghost" size="sm" onClick={() => navigate('/lam-sach')}>
            ← Mở lại Cổng 1 để sửa
          </PixelButton>
          <PixelButton
            variant="primary"
            size="md"
            icon="arrow-right"
            disabled={selectedIds.length === 0}
            onClick={handleConfirmAndAnalyze}
          >
            PHÂN TÍCH CÁC CHỈ SỐ ĐÃ CHỌN ({selectedIds.length})
          </PixelButton>
        </div>
      </div>

      {/* Prompt 5B: User Analysis Questions Chat Box */}
      <BusinessQuestionBox
        initialQuestions={session?.business_questions || undefined}
        analysisResult={questionAnalysisResult}
        isAnalyzing={isAnalyzingQuestions}
        canUndo={previousSelectedIds !== null}
        onSendQuestions={handleSendQuestions}
        onClearQuestions={handleClearQuestions}
        onUndoSelection={handleUndoSelection}
        labelById={labelById}
        availableRoleNames={availableRoleNames}
      />

      {/* Control Toolbar + Live Preview Box */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 'var(--space-4)',
        }}
      >
        {/* Quick Selection Card */}
        <PixelPanel title="LỰA CHỌN NHANH CHỈ SỐ">
          <div style={{ padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '13px', color: 'var(--ink)' }}>
                Tính được trên file: <strong>{allFeasibleIds.length} / 13</strong> chỉ số
              </span>
              <span style={{ fontSize: '13px', color: 'var(--blue)', fontWeight: 600 }}>
                Đang chọn: <strong>{selectedIds.length}</strong> chỉ số
              </span>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <PixelButton variant="secondary" size="sm" onClick={handleSelectAllFeasible}>
                CHỌN TẤT CẢ CHỈ SỐ TÍNH ĐƯỢC
              </PixelButton>
              <PixelButton variant="ghost" size="sm" onClick={handleDeselectAll}>
                BỎ CHỌN HẾT
              </PixelButton>
            </div>
          </div>
        </PixelPanel>

        {/* Live Preview: Confidence & Limits */}
        <PixelPanel title="DỰ KIẾN ĐỘ TIN CẬY & GIỚI HẠN DỮ LIỆU">
          <div style={{ padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink-soft)' }}>
                ĐỘ TIN CẬY DỰ KIẾN:
              </span>
              <PixelBadge
                data-testid="exchange-confidence-badge"
                variant={
                  previewInfo.confidence.level === 'HIGH'
                    ? 'success'
                    : previewInfo.confidence.level === 'MEDIUM'
                    ? 'warn'
                    : 'danger'
                }
              >
                {previewInfo.confidence.level_vi}
              </PixelBadge>
            </div>

            {previewInfo.confidence.reasons && previewInfo.confidence.reasons.length > 0 && (
              <div
                data-testid="exchange-confidence-reasons"
                style={{
                  backgroundColor: '#fffbeb',
                  border: '1px solid #f59e0b',
                  padding: '6px 10px',
                  fontSize: '11px',
                  color: '#92400e',
                }}
              >
                <strong>Lý do:</strong> {previewInfo.confidence.reasons.join('; ')}
              </div>
            )}

            {previewInfo.dataLimits.length > 0 && (
              <div
                style={{
                  backgroundColor: 'var(--surface-subtle)',
                  border: '1px solid var(--border)',
                  padding: '6px 10px',
                  fontSize: '11px',
                  color: 'var(--ink-soft)',
                }}
              >
                <strong style={{ color: 'var(--ink)' }}>Giới hạn dữ liệu:</strong>
                <ul style={{ margin: '2px 0 0 16px', padding: 0 }}>
                  {previewInfo.dataLimits.map((lim, lIdx) => (
                    <li key={lIdx}>{lim}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </PixelPanel>
      </div>

      {/* Prompt 3A: Khung Gợi ý Chỉ số từ AI */}
      {suggestionLoading && (
        <div data-testid="ai-suggestion-box">
          <PixelPanel title="GỢI Ý CHỈ SỐ TỪ AI">
            <div style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--ink-soft)', fontSize: '13px' }}>
              <span className="font-pixel" style={{ animation: 'pulse 1.5s infinite' }}>
                Đang phân tích cấu trúc cột dữ liệu và tạo gợi ý chỉ số phù hợp...
              </span>
            </div>
          </PixelPanel>
        </div>
      )}

      {!suggestionLoading && suggestionResult && !isSuggestionDismissed && (
        <div data-testid="ai-suggestion-box">
          <PixelPanel
            title="GỢI Ý CHỈ SỐ TỪ AI"
            headerAction={
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <PixelBadge
                  data-testid="ai-suggestion-badge"
                  variant={suggestionResult.source === 'fallback' ? 'warn' : 'success'}
                >
                  {suggestionResult.source === 'fallback' ? 'GỢI Ý TỰ ĐỘNG (DỰ PHÒNG)' : 'AI GỢI Ý'}
                </PixelBadge>
                <span style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
                  ({suggestionResult.latency_ms}ms)
                </span>
              </div>
            }
          >
            <div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ fontSize: '13px', color: 'var(--ink)' }}>
                  Dựa trên <strong>{table.n}</strong> dòng dữ liệu và các vai trò cột đã xác thực, hệ thống gợi ý <strong>{suggestionResult.suggested_ids.length}</strong> chỉ số tối ưu:
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <PixelButton
                    variant="primary"
                    size="sm"
                    data-testid="ai-suggestion-apply-btn"
                    onClick={handleApplySuggestions}
                  >
                    ÁP DỤNG GỢI Ý ({suggestionResult.suggested_ids.length})
                  </PixelButton>
                  <PixelButton
                    variant="ghost"
                    size="sm"
                    data-testid="ai-suggestion-dismiss-btn"
                    onClick={handleDismissSuggestions}
                  >
                    BỎ QUA
                  </PixelButton>
                </div>
              </div>

              {/* List of Suggested Metrics with Reasons */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                  gap: 'var(--space-2)',
                }}
              >
                {suggestionResult.suggested_ids.map((id) => {
                  const def = BUSINESS_METRIC_CATALOG.find((m) => m.id === id);
                  const reason = suggestionResult.reasons[id] || 'Phù hợp với tập dữ liệu.';
                  const isChecked = selectedIds.includes(id);

                  return (
                    <div
                      key={id}
                      style={{
                        padding: '8px 12px',
                        backgroundColor: isChecked ? '#f0fdf4' : 'var(--panel)',
                        border: `1px solid ${isChecked ? 'var(--good)' : 'var(--border)'}`,
                        borderRadius: '2px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <strong className="font-pixel" style={{ fontSize: '14px', color: 'var(--ink)' }}>
                          {def?.name || 'Chỉ số'}
                        </strong>
                        <span style={{ fontSize: '11px', fontFamily: 'monospace', color: isChecked ? 'var(--good)' : 'var(--ink-soft)' }}>
                          {isChecked ? '✓ Đang chọn' : '○ Chưa chọn'}
                        </span>
                      </div>
                      <div
                        data-testid={`ai-suggestion-reason-${id}`}
                        style={{ fontSize: '12px', color: 'var(--ink-soft)' }}
                      >
                        {reason}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Notes section */}
              {suggestionResult.notes && suggestionResult.notes.length > 0 && (
                <div
                  data-testid="ai-suggestion-notes"
                  style={{
                    backgroundColor: 'var(--surface-subtle)',
                    borderLeft: '3px solid var(--blue)',
                    padding: '8px 12px',
                    fontSize: '12px',
                    color: 'var(--ink-soft)',
                  }}
                >
                  <strong style={{ color: 'var(--ink)' }}>LƯU Ý:</strong>
                  <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                    {suggestionResult.notes.map((note, nIdx) => (
                      <li key={nIdx}>{note}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </PixelPanel>
        </div>
      )}

      {/* 4 Groups of Metrics */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        {METRIC_GROUPS.map((group) => {
          const groupDefs = BUSINESS_METRIC_CATALOG.filter((m) => group.metricIds.includes(m.id));

          return (
            <div key={group.key} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '6px' }}>
                <h3 className="font-pixel" style={{ fontSize: '18px', color: 'var(--ink)', margin: 0 }}>
                  {group.title}
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--ink-soft)', margin: '2px 0 0 0' }}>
                  {group.description}
                </p>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                  gap: 'var(--space-3)',
                }}
              >
                {groupDefs.map((def) => {
                  const feas = feasibilityMap.get(def.id) || { feasible: false, reason: 'Chưa kiểm tra' };
                  const isChecked = selectedIds.includes(def.id);
                  const isFeasible = feas.feasible;
                  const unit = METRIC_UNITS[def.id] || 'VND';

                  return (
                    <div
                      key={def.id}
                      data-testid={`metric-card-${def.id}`}
                      onClick={() => isFeasible && handleToggleMetric(def.id)}
                      style={{
                        padding: '12px',
                        backgroundColor: !isFeasible
                          ? 'var(--surface-subtle, #f3f4f6)'
                          : isChecked
                          ? '#f0fdf4'
                          : 'var(--white)',
                        border: `2px solid ${
                          !isFeasible
                            ? 'var(--border, #d1d5db)'
                            : isChecked
                            ? 'var(--good, #16a34a)'
                            : 'var(--ink)'
                        }`,
                        boxShadow: isChecked ? '2px 2px 0 var(--good, #16a34a)' : '2px 2px 0 var(--ink)',
                        cursor: isFeasible ? 'pointer' : 'not-allowed',
                        opacity: isFeasible ? 1 : 0.65,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '8px',
                        transition: 'all 0.1s ease',
                      }}
                    >
                      {/* Top Header of Card */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input
                            id={`metric-check-${def.id}`}
                            data-testid={`metric-check-${def.id}`}
                            type="checkbox"
                            checked={isChecked}
                            disabled={!isFeasible}
                            onChange={() => handleToggleMetric(def.id)}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              width: '18px',
                              height: '18px',
                              cursor: isFeasible ? 'pointer' : 'not-allowed',
                            }}
                          />
                          <div>
                            <div className="font-pixel" style={{ fontSize: '15px', color: isFeasible ? 'var(--ink)' : 'var(--ink-soft)' }}>
                              {def.name}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
                              Đơn vị: {unit}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {(def.id === 'gross_profit' || def.id === 'gross_margin') && roles?.profit?.status === 'suy luận' && (
                            <PixelBadge variant="info" size="sm">tự tính</PixelBadge>
                          )}
                          <PixelBadge variant={isFeasible ? 'success' : 'neutral'} size="sm">
                            {isFeasible ? 'TÍNH ĐƯỢC' : 'KHÔNG TÍNH ĐƯỢC'}
                          </PixelBadge>
                        </div>
                      </div>

                      {/* Description / Sample Question */}
                      <div style={{ fontSize: '12px', color: 'var(--ink-soft)', lineHeight: 1.4 }}>
                        {def.sampleQuestion}
                      </div>

                      {/* Feasibility Notice / Infeasible Reason */}
                      {!isFeasible ? (
                        <div
                          style={{
                            backgroundColor: '#fee2e2',
                            border: '1px solid var(--bad, #ef4444)',
                            padding: '4px 8px',
                            fontSize: '11px',
                            color: '#991b1b',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <PixelIcon name="warning" size={12} color="#991b1b" />
                          <span>{feas.reason || 'Thiếu cột dữ liệu cần thiết'}</span>
                        </div>
                      ) : (
                        <div style={{ fontSize: '11px', color: 'var(--good-d, #15803d)', fontWeight: 600 }}>
                          ✓ Sẵn sàng tính toán
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Sticky Action Bar */}
      <div
        style={{
          position: 'sticky',
          bottom: '16px',
          backgroundColor: 'var(--panel)',
          border: '3px solid var(--ink)',
          boxShadow: '4px 4px 0 var(--ink)',
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span className="font-pixel" style={{ fontSize: '16px', color: 'var(--ink)' }}>
            ĐÃ CHỌN {selectedIds.length} / {allFeasibleIds.length} CHỈ SỐ
          </span>
          {selectedIds.length === 0 && (
            <span style={{ fontSize: '12px', color: 'var(--bad)', fontWeight: 600 }}>
              (Cần chọn ít nhất 1 chỉ số để phân tích)
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <PixelButton variant="secondary" size="sm" onClick={handleSelectAllFeasible}>
            Chọn tất cả
          </PixelButton>
          <PixelButton
            variant="primary"
            size="md"
            icon="arrow-right"
            disabled={selectedIds.length === 0}
            onClick={handleConfirmAndAnalyze}
          >
            PHÂN TÍCH CÁC CHỈ SỐ ĐÃ CHỌN
          </PixelButton>
        </div>
      </div>
    </div>
  );
};
