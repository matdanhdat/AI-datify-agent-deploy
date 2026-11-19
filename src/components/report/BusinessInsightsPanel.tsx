/**
 * Non-Blocking Verified Business Insights & Recommendations Panel (Prompt M3-B1 & B6).
 * Renders structured Insights, Recommendations, Limitations with clickable Evidence [F1..Fn]
 * that reveal exact code-computed Facts and jump to related charts.
 * Strictly plain text rendering (zero dangerouslySetInnerHTML).
 */

import React, { useState } from 'react';
import { PixelPanel } from '../pixel/PixelPanel';
import { PixelBadge } from '../pixel/PixelBadge';
import { PixelButton } from '../pixel/PixelButton';
import { PixelIcon } from '../pixel/PixelIcon';
import type { FactItem, FactsTable } from '../../core/narrative/factsBuilder';
import type { BusinessInsightsReport } from '../../core/narrative/businessInsights';

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

  return (
    <PixelPanel
      title="3. NHẬN ĐỊNH & ĐỀ XUẤT DỰA TRÊN SỐ LIỆU CỦA CODE (CÓ KIỂM CHỨNG)"
      headerAction={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {report && (
            <PixelBadge variant={report.source === 'ai' ? 'success' : 'info'} size="sm">
              {report.source === 'ai' ? 'Nhận định AI (kiểm chứng số)' : 'Nhận định tự động theo mẫu'}
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
                Nguồn: <strong>{report.source === 'ai' ? `AI (${report.model})` : 'Nhận định tự động theo mẫu'}</strong>
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

            {/* 1. Insights */}
            <div>
              <h4 style={{ margin: '0 0 8px', fontSize: '14px', color: 'var(--ink)' }}>
                A. Nhận định trọng tâm ({report.insights.length})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {report.insights.map((ins, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '10px 12px',
                      backgroundColor: 'var(--white)',
                      border: '2px solid var(--ink)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '6px',
                        marginBottom: '4px',
                      }}
                    >
                      <strong style={{ fontSize: '13px', color: 'var(--ink)' }}>
                        {idx + 1}. {stripDataTags(ins.title)}
                      </strong>
                      <PixelBadge
                        variant={ins.confidence === 'cao' ? 'success' : ins.confidence === 'vừa' ? 'info' : 'warn'}
                        size="sm"
                      >
                        Độ tin cậy: {ins.confidence}
                      </PixelBadge>
                    </div>
                    <p style={{ margin: '0 0 8px', fontSize: '13px', lineHeight: 1.5, color: 'var(--ink)' }}>
                      {stripDataTags(ins.statement)}
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>Bằng chứng:</span>
                      {ins.evidence_ids.map((fid) => (
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

            {/* 2. Recommendations */}
            {report.recommendations.length > 0 && (
              <div>
                <h4 style={{ margin: '0 0 8px', fontSize: '14px', color: 'var(--ink)' }}>
                  B. Đề xuất hành động có căn cứ ({report.recommendations.length})
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {report.recommendations.map((rec, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '10px 12px',
                        backgroundColor: 'var(--white)',
                        border: '2px solid var(--blue)',
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--ink)', marginBottom: '4px' }}>
                        {idx + 1}. {stripDataTags(rec.action)}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--ink)', marginBottom: '4px', lineHeight: 1.45 }}>
                        <strong>Căn cứ:</strong> {stripDataTags(rec.rationale)}
                      </div>
                      {rec.expected_effect_note && (
                        <div style={{ fontSize: '12px', color: 'var(--good-d)', marginBottom: '4px' }}>
                          <strong>Kỳ vọng:</strong> {stripDataTags(rec.expected_effect_note)}
                        </div>
                      )}
                      {rec.risk && (
                        <div style={{ fontSize: '12px', color: 'var(--warn-text)', marginBottom: '6px' }}>
                          <strong>Lưu ý rủi ro:</strong> {stripDataTags(rec.risk)}
                        </div>
                      )}
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>Bằng chứng:</span>
                        {rec.evidence_ids.map((fid) => (
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
            )}

            {/* 3. Limitations */}
            {report.limitations.length > 0 && (
              <div
                style={{
                  padding: '10px 12px',
                  backgroundColor: 'var(--panel)',
                  border: '1px solid var(--ink)',
                  fontSize: '12px',
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: '4px', color: 'var(--ink)' }}>
                  C. Giới hạn của dữ liệu & phạm vi phân tích:
                </div>
                <ul style={{ margin: 0, paddingLeft: '18px', color: 'var(--ink-soft)', lineHeight: 1.5 }}>
                  {report.limitations.map((lim, idx) => (
                    <li key={idx}>{stripDataTags(lim)}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </PixelPanel>
  );
};
