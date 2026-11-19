/**
 * Custom Workflow Section for AnalyzePage (Prompt P6 Part C).
 * Provides one-off quantitative analysis proposing, previewing, and execution.
 * Pure pixel art styling, zero external UI libraries.
 */

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { PixelPanel } from '../pixel/PixelPanel';
import { PixelButton } from '../pixel/PixelButton';
import { PixelBadge } from '../pixel/PixelBadge';
import { PixelProgress } from '../pixel/PixelProgressAndTabs';
import { PLAN_TEMPLATES } from '../../core/plan/templates';
import { formatStepText, validatePlan, derivePlanTitle } from '../../core/plan/validate';
import {
  proposePlan,
  executePlan,
  deleteCustomPlan,
  getCustomResultsList,
  type ProposePlanResponse,
} from '../../services/planService';
import { ArtifactStore } from '../../core/artifacts';
import type { CleanArtifact, Plan, PlanResult } from '../../core/schemas';

interface CustomWorkflowSectionProps {
  sessionId: string;
}

export const CustomWorkflowSection: React.FC<CustomWorkflowSectionProps> = ({ sessionId }) => {
  const navigate = useNavigate();
  const [requestText, setRequestText] = useState<string>('');
  const [isProposing, setIsProposing] = useState<boolean>(false);
  const [proposeResult, setProposeResult] = useState<ProposePlanResponse | null>(null);
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [execPercent, setExecPercent] = useState<number>(0);
  const [execMessage, setExecMessage] = useState<string>('');
  const [execError, setExecError] = useState<string | null>(null);

  const [resultsList, setResultsList] = useState<Array<{ slot: string; result: PlanResult }>>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Refresh saved custom workflows
  const refreshList = () => {
    setResultsList(getCustomResultsList(sessionId));
  };

  useEffect(() => {
    refreshList();
    if (typeof window !== 'undefined') {
      const search = new URLSearchParams(window.location.search);
      if (search.get('demoPlan') === '1') {
        const tmpl = PLAN_TEMPLATES[0];
        const planObj: Plan = {
          title_vi: 'So sánh hiệu suất giữa hai kỳ',
          steps: [
            {
              op: 'compare_periods',
              params: {
                period_a: { from: '2025-01-02', to: '2025-06-30' },
                period_b: { from: '2025-07-01', to: '2025-12-31' },
                metrics: ['period_return', 'ann_vol', 'avg_volume', 'max_dd'],
              },
            },
          ],
        };
        setRequestText(tmpl.description_vi);
        setActivePlan(planObj);
        setProposeResult({
          feasible: true,
          plan: planObj,
          source: 'fallback',
          message_vi: 'Khớp với mẫu phân tích có sẵn trong hệ thống: ' + tmpl.name_vi,
        });
      }
    }
  }, [sessionId]);

  const handlePropose = async () => {
    if (!requestText.trim()) return;

    setIsProposing(true);
    setValidationError(null);
    setExecError(null);
    setProposeResult(null);

    try {
      const res = await proposePlan(sessionId, requestText);
      setProposeResult(res);
      if (res.feasible && res.plan) {
        setActivePlan(res.plan);
      } else {
        setActivePlan(null);
      }
    } catch (err: any) {
      setExecError(err.message || 'Không thể tạo đề xuất quy trình.');
    } finally {
      setIsProposing(false);
    }
  };

  const handlePickTemplate = (tplId: string) => {
    const tpl = PLAN_TEMPLATES.find((t) => t.id === tplId);
    if (!tpl) return;

    const clean = ArtifactStore.get<CleanArtifact>(sessionId, 'clean');
    if (!clean || !clean.dataset) return;

    const plan = tpl.buildPlan(clean.dataset as any);
    setActivePlan(plan);
    setProposeResult({
      feasible: true,
      plan,
      source: 'fallback',
    });
    setValidationError(null);
    setExecError(null);
  };

  const handleDeleteStep = (stepIdx: number) => {
    if (!activePlan) return;

    const newSteps = activePlan.steps.filter((_, idx) => idx !== stepIdx);
    if (newSteps.length === 0) {
      setValidationError('Kế hoạch phải có ít nhất 1 bước.');
      return;
    }

    const clean = ArtifactStore.get<CleanArtifact>(sessionId, 'clean');
    if (clean && clean.dataset) {
      const tentativePlan: Plan = {
        title_vi: activePlan.title_vi,
        steps: newSteps,
      };
      const check = validatePlan(tentativePlan, clean.dataset as any);
      if (!check.valid) {
        setValidationError(`Không thể xóa bước này: ${check.errors[0]}`);
        return;
      }
    }

    setValidationError(null);
    setActivePlan({
      title_vi: activePlan.title_vi,
      steps: newSteps,
    });
  };

  const handleExecute = async () => {
    if (!activePlan) return;
    if (resultsList.length >= 3) {
      setExecError('Mỗi phiên chỉ được thực hiện tối đa 3 phân tích riêng. Bạn vui lòng xóa bớt một phân tích đã chạy trước khi tiếp tục.');
      return;
    }

    setIsExecuting(true);
    setExecPercent(10);
    setExecMessage('Khởi động tác vụ phân tích riêng...');
    setExecError(null);

    abortControllerRef.current = new AbortController();

    try {
      await executePlan(
        sessionId,
        activePlan,
        {
          onProgress: (p) => {
            setExecPercent(p.percent);
            setExecMessage(p.message);
          },
          signal: abortControllerRef.current.signal,
        }
      );

      refreshList();
      setActivePlan(null);
      setProposeResult(null);
      setRequestText('');
    } catch (err: any) {
      setExecError(err.message || 'Lỗi khi thực thi phân tích riêng.');
    } finally {
      setIsExecuting(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancelExecution = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsExecuting(false);
      setExecMessage('Đã hủy quy trình.');
    }
  };

  const handleDeleteResult = (slot: string) => {
    deleteCustomPlan(sessionId, slot);
    refreshList();
  };

  return (
    <div style={{ marginTop: 'var(--space-6)' }}>
      <PixelPanel title="4. YÊU CẦU PHÂN TÍCH RIÊNG (DÙNG MỘT LẦN - KHÔNG BẮT BUỘC)">
        <div style={{ padding: 'var(--space-4)' }}>
          <p style={{ margin: '0 0 var(--space-3)', fontSize: '13px', color: 'var(--ink-soft)' }}>
            Quy trình chuẩn vẫn chạy bình thường. Phần này hỗ trợ tạo thêm một mục phân tích riêng theo yêu cầu (tối đa 3 phân tích mỗi phiên).
            AI chỉ đóng vai trò lập kế hoạch từ danh mục 13 thao tác cho phép; toàn bộ phép tính do mã nguồn trình duyệt thực thi.
          </p>

          {/* Form input */}
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--ink)' }}>
                Nhập nội dung yêu cầu phân tích riêng:
              </label>
              <span style={{ fontSize: '11px', color: requestText.length > 280 ? 'var(--red)' : 'var(--ink-soft)' }}>
                {requestText.length}/300 ký tự
              </span>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <input
                type="text"
                value={requestText}
                maxLength={300}
                placeholder="Ví dụ: Xếp hạng top mã theo lợi suất kỳ; Biến động 20 phiên..."
                onChange={(e) => setRequestText(e.target.value)}
                disabled={isExecuting || isProposing}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handlePropose();
                }}
                style={{
                  flex: 1,
                  padding: '6px 10px',
                  border: '1px solid var(--chart-grid)',
                  backgroundColor: 'var(--chart-bg)',
                  fontFamily: 'var(--font-excel)',
                  fontSize: '13px',
                  color: 'var(--ink)',
                }}
              />
              <PixelButton
                variant="primary"
                onClick={handlePropose}
                disabled={isProposing || isExecuting || !requestText.trim()}
              >
                {isProposing ? 'Đang lập kế hoạch...' : 'Đề xuất quy trình'}
              </PixelButton>
            </div>
          </div>

          {/* Built-in template buttons */}
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <span style={{ fontSize: '12px', color: 'var(--ink-soft)', display: 'block', marginBottom: '6px' }}>
              Hoặc chọn một mẫu phân tích dựng sẵn (chạy offline không cần AI):
            </span>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {PLAN_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => handlePickTemplate(tpl.id)}
                  disabled={isExecuting}
                  style={{
                    padding: '4px 8px',
                    fontSize: '11px',
                    fontFamily: 'var(--font-pixel)',
                    border: '1px solid var(--ink)',
                    backgroundColor: 'var(--panel)',
                    color: 'var(--ink)',
                    cursor: 'pointer',
                  }}
                  title={tpl.description_vi}
                >
                  + {tpl.name_vi}
                </button>
              ))}
            </div>
          </div>

          {/* Infeasible feedback */}
          {proposeResult && !proposeResult.feasible && (
            <div
              style={{
                padding: 'var(--space-3)',
                backgroundColor: 'rgba(217, 83, 79, 0.1)',
                border: '1px solid var(--red)',
                marginBottom: 'var(--space-4)',
                fontSize: '13px',
                color: 'var(--ink)',
              }}
            >
              <div style={{ fontWeight: 'bold', color: 'var(--red)', marginBottom: '4px' }}>
                [!] Yêu cầu không thể đáp ứng ({proposeResult.reason || 'KHÔNG_KHẢ_THI'}):
              </div>
              <div>{proposeResult.message_vi}</div>
              <div style={{ marginTop: 'var(--space-2)', fontSize: '12px', color: 'var(--ink-soft)' }}>
                Gợi ý: Bạn có thể chọn một trong các mẫu dựng sẵn ở phía trên để tiếp tục.
              </div>
            </div>
          )}

          {/* Active Proposed Plan Cards */}
          {activePlan && (
            <div
              style={{
                padding: 'var(--space-4)',
                backgroundColor: 'var(--chart-bg)',
                border: '2px solid var(--blue)',
                marginBottom: 'var(--space-4)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '14px', color: 'var(--ink)' }}>
                    KẾ HOẠCH ĐỀ XUẤT: {derivePlanTitle(activePlan)}
                  </h4>
                  <span style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
                    {activePlan.steps.length} bước thao tác được kiểm duyệt
                  </span>
                </div>
                <PixelBadge variant="info">ĐÃ KIỂM DUYỆT</PixelBadge>
              </div>

              {/* Step cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: 'var(--space-3)' }}>
                {activePlan.steps.map((step, sIdx) => {
                  const stepText = formatStepText(step, sIdx);
                  return (
                    <div
                      key={sIdx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 10px',
                        backgroundColor: 'var(--panel)',
                        border: '1px solid var(--chart-grid)',
                        fontSize: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="font-pixel" style={{ color: 'var(--blue)', minWidth: '20px' }}>
                          [{sIdx + 1}]
                        </span>
                        <span>{stepText}</span>
                      </div>
                      {activePlan.steps.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleDeleteStep(sIdx)}
                          disabled={isExecuting}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--red)',
                            fontSize: '11px',
                            cursor: 'pointer',
                            padding: '2px 6px',
                          }}
                          title="Xóa bước này khỏi kế hoạch"
                        >
                          [Xóa]
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {validationError && (
                <div style={{ color: 'var(--red)', fontSize: '12px', marginBottom: 'var(--space-2)' }}>
                  {validationError}
                </div>
              )}

              {/* Execution Actions */}
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <PixelButton
                  variant="primary"
                  onClick={handleExecute}
                  disabled={isExecuting || resultsList.length >= 3}
                >
                  {isExecuting ? 'Đang thực thi...' : 'Duyệt kế hoạch và chạy'}
                </PixelButton>
                <PixelButton
                  variant="secondary"
                  onClick={() => {
                    setActivePlan(null);
                    setProposeResult(null);
                  }}
                  disabled={isExecuting}
                >
                  Hủy
                </PixelButton>
              </div>
            </div>
          )}

          {/* Running progress */}
          {isExecuting && (
            <div style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-3)', backgroundColor: 'var(--panel)', border: '1px solid var(--blue)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '12px' }}>
                <span style={{ fontWeight: 'bold' }}>{execMessage}</span>
                <span className="font-pixel">{execPercent}%</span>
              </div>
              <PixelProgress value={execPercent} />
              <div style={{ marginTop: 'var(--space-2)', textAlign: 'right' }}>
                <PixelButton variant="secondary" size="sm" onClick={handleCancelExecution}>
                  Hủy tác vụ
                </PixelButton>
              </div>
            </div>
          )}

          {execError && (
            <div style={{ padding: 'var(--space-3)', backgroundColor: 'rgba(217,83,79,0.1)', border: '1px solid var(--red)', color: 'var(--red)', fontSize: '12px', marginBottom: 'var(--space-3)' }}>
              {execError}
            </div>
          )}

          {/* Executed custom workflows list */}
          {resultsList.length > 0 && (
            <div style={{ marginTop: 'var(--space-4)', borderTop: '1px dashed var(--chart-grid)', paddingTop: 'var(--space-3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--ink)' }}>
                  Các phân tích riêng đã chạy trong phiên ({resultsList.length}/3):
                </span>
                <span style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
                  Được tự động đưa vào Báo cáo & Tệp Excel xuất bản
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {resultsList.map(({ slot, result }) => (
                  <div
                    key={slot}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      backgroundColor: 'var(--panel)',
                      border: '1px solid var(--chart-grid)',
                      fontSize: '13px',
                    }}
                  >
                    <div>
                      <strong>{result.title_vi}</strong>
                      <div style={{ fontSize: '11px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                        {result.steps_text.length} bước • {result.tables.length} bảng • {result.charts.length} biểu đồ
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                      <PixelButton
                        variant="secondary"
                        size="sm"
                        onClick={() => navigate('/bao-cao#custom-analysis')}
                      >
                        Xem trong báo cáo →
                      </PixelButton>
                      <button
                        type="button"
                        onClick={() => handleDeleteResult(slot)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--red)',
                          fontSize: '12px',
                          cursor: 'pointer',
                          padding: '2px 8px',
                          textDecoration: 'underline',
                        }}
                      >
                        Xóa
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </PixelPanel>
    </div>
  );
};
