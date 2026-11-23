/**
 * Non-Blocking Verified Business Insights & Recommendations Panel (Prompt M3-B1, B6, 3B & 5A).
 * Renders structured 4-Layer Findings & Action Priorities:
 * 1. KẾT LUẬN CHÍNH (Max 3)
 * 2. ƯU TIÊN HÀNH ĐỘNG (Max 3)
 * 3. PHÁT HIỆN CHI TIẾT (Max 6 cards, each with 4 distinct visual layers):
 *    - Tầng 1: Số liệu thực tế [kèm chip dẫn chứng F#]
 *    - Tầng 2: Ý nghĩa kinh doanh
 *    - Tầng 3: Cơ hội & Rủi ro
 *    - Tầng 4: Hành động đề xuất (KPI & check_after)
 * Strictly plain text rendering (zero dangerouslySetInnerHTML).
 */

import React, { useState } from 'react';
import { PixelPanel } from '../pixel/PixelPanel';
import { PixelBadge } from '../pixel/PixelBadge';
import { PixelButton } from '../pixel/PixelButton';
import { PixelIcon } from '../pixel/PixelIcon';
import type { FactItem, FactsTable } from '../../core/narrative/factsBuilder';
import type { BusinessInsightsReport } from '../../core/narrative/businessInsights';
import { BUSINESS_METRIC_CATALOG } from '../../core/metrics/businessCatalog';

export interface BusinessInsightsPanelProps {
  loading: boolean;
  factsTable: FactsTable | null;
  report: BusinessInsightsReport | null;
  onRegenerate?: () => void;
  onSelectChartId?: (chartId: string) => void;
}

export function stripDataTags(text: string): string {
  if (!text) return '';
  return text.replace(/\[DATA:\s*([^\]]+)\]/g, '$1');
}

export const BusinessInsightsPanel: React.FC<BusinessInsightsPanelProps> = ({
  loading,
  factsTable,
  report,
  onRegenerate,
  onSelectChartId,
}) => {
  const [selectedFactId, setSelectedFactId] = useState<string | null>(null);

  const factMap = new Map<string, FactItem>(
    (factsTable?.facts || []).map((f) => [f.id, f])
  );
  const activeFact = selectedFactId ? factMap.get(selectedFactId) || null : null;

  const handleEvidenceClick = (factId: string) => {
    setSelectedFactId((prev) => (prev === factId ? null : factId));
    const fact = factMap.get(factId);
    if (fact?.chart_id && onSelectChartId) {
      onSelectChartId(fact.chart_id);
    }
  };

  const getMetricName = (metricId: string, ruleId?: string): string => {
    if (!metricId) return '';
    const item = BUSINESS_METRIC_CATALOG.find((m) => m.id === metricId);
    const baseName = item?.name || (item as any)?.label_vi || metricId;
    const isCodeOnly =
      ruleId === 'R-NO-MARGIN' ||
      ruleId === 'R-FEW-ROWS' ||
      ruleId === 'R-UNLABELED';
    if (isCodeOnly) {
      const metricRes = factsTable?.metrics_result?.[metricId];
      if (metricRes && !metricRes.feasible && metricRes.reason) {
        return `${baseName} (chưa đo được: ${metricRes.reason})`;
      }
      if (ruleId === 'R-NO-MARGIN') {
        const reason = metricRes?.reason || 'Thiếu cột Giá vốn hoặc Lợi nhuận gộp.';
        return `${baseName} (chưa đo được: ${reason})`;
      }
    }
    return baseName;
  };

  const hasFindingsData = report && report.findings && report.findings.length > 0;
  const hasTwoTierData =
    report &&
    ((report.summary && report.summary.length > 0) ||
      (report.by_metric && Object.keys(report.by_metric).length > 0));

  return (
    <PixelPanel
      title="3. NHẬN ĐỊNH & ĐỀ XUẤT DỰA TRÊN SỐ LIỆU CỦA CODE (CÓ KIỂM CHỨNG)"
      headerAction={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {report && (
            <PixelBadge variant={report.source === 'ai' ? 'success' : 'info'} size="sm">
              {report.source === 'ai'
                ? 'AI TRÌNH BÀY (ĐÃ KIỂM ĐỊNH MÃ NGUỒN)'
                : 'TỰ ĐỘNG (THEO LUẬT MÃ NGUỒN)'}
            </PixelBadge>
          )}
          {onRegenerate && !loading && (
            <PixelButton variant="secondary" font="content" size="sm" onClick={onRegenerate}>
              Viết lại nhận định
            </PixelButton>
          )}
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {/* Non-blocking AI progress indicator */}
        {loading && (
          <div
            role="status"
            aria-live="polite"
            data-testid="ai-insights-loading"
            style={{
              padding: '10px 14px',
              backgroundColor: 'var(--warn-bg)',
              border: '2px solid var(--ink)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--ink)',
            }}
          >
            <PixelIcon name="info" size={16} color="var(--blue)" />
            <span>
              AI đang viết nhận định… (Toàn bộ chỉ số, bảng chiều và biểu đồ phía trên đã sẵn sàng, bạn có thể xem ngay trong lúc chờ.)
            </span>
          </div>
        )}

        {/* Active clicked evidence inspector */}
        {activeFact && (
          <div
            data-testid="evidence-fact-inspector"
            style={{
              padding: '10px 14px',
              backgroundColor: 'var(--good-bg)',
              border: '2px solid var(--good-d)',
              color: 'var(--ink)',
              fontSize: '13px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: '12px',
            }}
          >
            <div>
              <div style={{ fontWeight: 700, color: 'var(--good-d)', marginBottom: '2px' }}>
                Bằng chứng [{activeFact.id}] — {activeFact.label_vi.replace(/\[DATA:|\]/g, '')}
              </div>
              <div>
                Giá trị do code tính: <strong>{activeFact.display}</strong> ({activeFact.unit})
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedFactId(null)}
              style={{
                background: 'var(--white)',
                border: '1px solid var(--ink)',
                padding: '2px 8px',
                cursor: 'pointer',
                fontSize: '11px',
              }}
            >
              Đóng
            </button>
          </div>
        )}

        {/* Verified Report Content */}
        {report && (
          <>
            {/* Metadata bar */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '12px',
                fontSize: '11px',
                color: 'var(--ink-soft)',
                paddingBottom: '8px',
                borderBottom: '1px dashed var(--chart-grid)',
              }}
            >
              <span>
                Nguồn:{' '}
                <strong>
                  {report.source === 'ai'
                    ? `AI TRÌNH BÀY (ĐÃ KIỂM ĐỊNH MÃ NGUỒN) (${report.model})`
                    : 'TỰ ĐỘNG (THEO LUẬT MÃ NGUỒN)'}
                </strong>
              </span>
              <span>
                Thời gian tạo: <strong>{report.latency_ms} ms</strong>
              </span>
              <span>
                Mã băm bảng sự kiện: <code>{report.facts_hash.slice(0, 12)}...</code>
              </span>
              {factsTable && (
                <span>
                  Kích thước bảng sự kiện: <strong>{(factsTable.byte_size / 1024).toFixed(2)} KB</strong> ({factsTable.facts.length} sự kiện)
                </span>
              )}
              {report.rejected_count > 0 && (
                <span style={{ color: 'var(--warn-text)', fontWeight: 600 }}>
                  Đã lọc bỏ {report.rejected_count} mục không khớp bằng chứng
                </span>
              )}
              {report.feedback_applied && (
                <span style={{ color: 'var(--blue)', fontWeight: 600 }}>
                  Đã áp dụng góp ý Cổng 2: &quot;{report.feedback_applied}&quot;
                </span>
              )}
            </div>

            {/* PROMPT 5A: 4-LAYER FINDINGS VIEW */}
            {hasFindingsData ? (
              <>
                {/* 1. KẾT LUẬN CHÍNH */}
                {report.key_takeaways && report.key_takeaways.length > 0 && (
                  <div data-testid="key-takeaways">
                    <h4 style={{ margin: '0 0 8px', fontSize: '14px', color: 'var(--ink)', textTransform: 'uppercase' }}>
                      1. KẾT LUẬN CHÍNH ({report.key_takeaways.length})
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {report.key_takeaways.map((takeaway, idx) => (
                        <div
                          key={idx}
                          style={{
                            padding: '10px 12px',
                            backgroundColor: 'var(--white)',
                            border: '2px solid var(--ink)',
                            fontSize: '13px',
                            lineHeight: 1.5,
                            color: 'var(--ink)',
                          }}
                        >
                          <strong>{idx + 1}.</strong> {stripDataTags(takeaway)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 2. ƯU TIÊN HÀNH ĐỘNG */}
                {report.priority_actions && report.priority_actions.length > 0 && (
                  <div data-testid="priority-actions">
                    <h4 style={{ margin: '0 0 8px', fontSize: '14px', color: 'var(--ink)', textTransform: 'uppercase' }}>
                      2. ƯU TIÊN HÀNH ĐỘNG ({report.priority_actions.length})
                    </h4>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                        gap: '10px',
                      }}
                    >
                      {report.priority_actions.map((act, aIdx) => (
                        <div
                          key={aIdx}
                          style={{
                            padding: '12px',
                            backgroundColor: 'var(--white)',
                            border: '2px solid var(--good-d, #16a34a)',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            gap: '8px',
                          }}
                        >
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                              <span
                                className="font-pixel"
                                style={{
                                  backgroundColor: 'var(--good-d, #16a34a)',
                                  color: 'var(--white)',
                                  padding: '2px 6px',
                                  fontSize: '11px',
                                }}
                              >
                                HÀNH ĐỘNG #{aIdx + 1}
                              </span>
                            </div>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)', lineHeight: 1.4 }}>
                              {stripDataTags(act.action)}
                            </div>
                          </div>

                          <div style={{ fontSize: '11px', color: 'var(--ink-soft)', borderTop: '1px dashed var(--border)', paddingTop: '6px' }}>
                            {act.kpi_metric_id ? (
                              <div>Đo lường bằng: <strong>{getMetricName(act.kpi_metric_id, act.rule_id)}</strong></div>
                            ) : null}
                            <div>Thời hạn kiểm tra: <strong>{act.check_after}</strong></div>
                            {act.source_refs && act.source_refs.length > 0 && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                                <span>Nguồn:</span>
                                {act.source_refs.map((fid) => (
                                  <button
                                    key={fid}
                                    type="button"
                                    onClick={() => handleEvidenceClick(fid)}
                                    style={{
                                      padding: '1px 5px',
                                      fontSize: '10px',
                                      fontFamily: 'monospace',
                                      backgroundColor: selectedFactId === fid ? 'var(--ink)' : 'var(--panel)',
                                      color: selectedFactId === fid ? 'var(--white)' : 'var(--blue)',
                                      border: '1px solid var(--ink)',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    [{fid}]
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. PHÁT HIỆN CHI TIẾT */}
                {report.findings && report.findings.length > 0 && (
                  <div data-testid="detailed-findings">
                    <h4 style={{ margin: '0 0 8px', fontSize: '14px', color: 'var(--ink)', textTransform: 'uppercase' }}>
                      3. PHÁT HIỆN CHI TIẾT ({report.findings.length} phát hiện)
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {report.findings.map((f, fIdx) => (
                        <div
                          key={f.rule_id || fIdx}
                          data-testid={`finding-card-${f.rule_id}`}
                          style={{
                            padding: '14px',
                            backgroundColor: 'var(--white)',
                            border: '2px solid var(--blue)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '10px',
                          }}
                        >
                          {/* Header of finding card */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                            <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--blue)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <span>{fIdx + 1}. {stripDataTags(f.title)}</span>
                              {f.isQuestionRelated && (
                                <span
                                  data-testid="question-related-badge"
                                  style={{
                                    backgroundColor: '#fef3c7',
                                    color: '#92400e',
                                    border: '1px solid #f59e0b',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    padding: '1px 6px',
                                  }}
                                >
                                  LIÊN QUAN CÂU HỎI
                                </span>
                              )}
                            </div>
                            <PixelBadge variant="info" size="sm">
                              {f.rule_id}
                            </PixelBadge>
                          </div>

                          {/* 4 distinct visual layers */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
                            {/* Layer 1: Evidence */}
                            <div style={{ backgroundColor: 'var(--surface-subtle, #f8fafc)', padding: '8px 10px', borderLeft: '3px solid var(--blue)' }}>
                              <span style={{ fontWeight: 700, color: 'var(--ink-soft)', fontSize: '11px', textTransform: 'uppercase', display: 'block' }}>
                                Số liệu thực tế & Bằng chứng:
                              </span>
                              <div style={{ margin: '2px 0 6px 0', color: 'var(--ink)' }}>
                                {stripDataTags(f.evidence)}
                              </div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px' }}>
                                <span style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>Mã dẫn chứng:</span>
                                {f.source_refs.map((fid) => (
                                  <button
                                    key={fid}
                                    type="button"
                                    onClick={() => handleEvidenceClick(fid)}
                                    style={{
                                      padding: '1px 6px',
                                      fontSize: '11px',
                                      fontFamily: 'monospace',
                                      fontWeight: 700,
                                      backgroundColor: selectedFactId === fid ? 'var(--ink)' : 'var(--panel)',
                                      color: selectedFactId === fid ? 'var(--white)' : 'var(--blue)',
                                      border: '1px solid var(--ink)',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    [{fid}]
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Layer 2: Meaning */}
                            <div style={{ padding: '6px 10px', borderLeft: '3px solid #8b5cf6', backgroundColor: '#faf5ff' }}>
                              <span style={{ fontWeight: 700, color: '#6d28d9', fontSize: '11px', textTransform: 'uppercase', display: 'block' }}>
                                Ý nghĩa kinh doanh:
                              </span>
                              <div style={{ marginTop: '2px', color: 'var(--ink)' }}>
                                {stripDataTags(f.meaning)}
                              </div>
                            </div>

                            {/* Layer 3: Opportunity & Risk */}
                            <div style={{ padding: '6px 10px', borderLeft: '3px solid #f59e0b', backgroundColor: '#fffbeb' }}>
                              <span style={{ fontWeight: 700, color: '#b45309', fontSize: '11px', textTransform: 'uppercase', display: 'block' }}>
                                Cơ hội & Rủi ro:
                              </span>
                              <div style={{ marginTop: '2px', color: 'var(--ink)' }}>
                                {stripDataTags(f.opportunity_risk)}
                              </div>
                            </div>

                            {/* Layer 4: Action */}
                            <div style={{ padding: '6px 10px', borderLeft: '3px solid var(--good-d, #16a34a)', backgroundColor: '#f0fdf4' }}>
                              <span style={{ fontWeight: 700, color: 'var(--good-d, #16a34a)', fontSize: '11px', textTransform: 'uppercase', display: 'block' }}>
                                Hành động đề xuất:
                              </span>
                              <div style={{ marginTop: '2px', fontWeight: 600, color: 'var(--ink)' }}>
                                {stripDataTags(f.action)}
                              </div>
                              <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--ink-soft)' }}>
                                {f.kpi_metric_id ? (
                                  <span>Đo lường bằng: <strong>{getMetricName(f.kpi_metric_id, f.rule_id)}</strong> • </span>
                                ) : null}
                                <span>Thời hạn kiểm tra: <strong>{f.check_after}</strong></span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : hasTwoTierData ? (
              /* TWO-TIER FALLBACK VIEW */
              <>
                {report.summary && report.summary.length > 0 && (
                  <div>
                    <h4 style={{ margin: '0 0 8px', fontSize: '14px', color: 'var(--ink)', textTransform: 'uppercase' }}>
                      TẦNG 1: TÓM TẮT TỔNG QUAN ({report.summary.length} câu)
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {report.summary.map((sentence, idx) => (
                        <div
                          key={idx}
                          style={{
                            padding: '10px 12px',
                            backgroundColor: 'var(--white)',
                            border: '2px solid var(--ink)',
                            fontSize: '13px',
                            lineHeight: 1.5,
                            color: 'var(--ink)',
                          }}
                        >
                          <strong>{idx + 1}.</strong> {stripDataTags(sentence)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {report.by_metric && Object.keys(report.by_metric).length > 0 && (
                  <div>
                    <h4 style={{ margin: '0 0 8px', fontSize: '14px', color: 'var(--ink)', textTransform: 'uppercase' }}>
                      TẦNG 2: NHẬN ĐỊNH THEO TỪNG CHỈ SỐ ({Object.keys(report.by_metric).length} chỉ số)
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {Object.entries(report.by_metric).map(([mId, sentences], mIdx) => (
                        <div
                          key={mId}
                          style={{
                            padding: '12px',
                            backgroundColor: 'var(--white)',
                            border: '2px solid var(--blue)',
                          }}
                        >
                          <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--blue)', marginBottom: '8px' }}>
                            {mIdx + 1}. {getMetricName(mId)}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {sentences.map((s, sIdx) => (
                              <div key={sIdx} style={{ fontSize: '13px', lineHeight: 1.5, color: 'var(--ink)' }}>
                                <div style={{ marginBottom: '4px' }}>- {stripDataTags(s.text)}</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>Bằng chứng:</span>
                                  {s.refs.map((fid) => (
                                    <button
                                      key={fid}
                                      type="button"
                                      onClick={() => handleEvidenceClick(fid)}
                                      style={{
                                        padding: '2px 6px',
                                        fontSize: '11px',
                                        fontFamily: 'monospace',
                                        fontWeight: 700,
                                        backgroundColor: selectedFactId === fid ? 'var(--ink)' : 'var(--panel)',
                                        color: selectedFactId === fid ? 'var(--white)' : 'var(--blue)',
                                        border: '1px solid var(--ink)',
                                        cursor: 'pointer',
                                      }}
                                    >
                                      [{fid}]
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : report.insights && report.insights.length > 0 ? (
              /* LEGACY VIEW FOR OLD SESSIONS */
              <>
                <div>
                  <h4 style={{ margin: '0 0 8px', fontSize: '14px', color: 'var(--ink)' }}>
                    A. Nhận định trọng tâm ({report.insights?.length || 0})
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {(report.insights || []).map((ins, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '10px 12px',
                          backgroundColor: 'var(--white)',
                          border: '2px solid var(--ink)',
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--ink)', marginBottom: '4px' }}>
                          {ins.title}
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--ink-soft)' }}>{ins.statement}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              /* FALLBACK WHEN 0 RULES FIRE */
              <div
                data-testid="no-insights-fallback"
                style={{
                  padding: '16px',
                  backgroundColor: 'var(--white)',
                  border: '2px dashed var(--ink)',
                  fontSize: '13px',
                  lineHeight: 1.6,
                  color: 'var(--ink)',
                }}
              >
                Chưa có phát hiện nổi bật với các chỉ số đã chọn; hãy chọn thêm chỉ số theo kênh, sản phẩm hoặc thời gian để có nhận định sâu hơn.
              </div>
            )}
          </>
        )}
      </div>
    </PixelPanel>
  );
};
