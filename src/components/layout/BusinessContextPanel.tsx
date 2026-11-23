import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PixelPanel } from '../pixel/PixelPanel';
import { PixelButton } from '../pixel/PixelButton';
import { getBusinessContext } from '../../services/readers';
import type { Session } from '../../types/contract';
import { BUSINESS_METRIC_CATALOG } from '../../core/metrics/businessCatalog';
import { mapQuestionsToMetrics } from '../../core/metrics/questionToMetrics';

interface BusinessContextPanelProps {
  session: Session | null;
}

export const BusinessContextPanel: React.FC<BusinessContextPanelProps> = ({ session }) => {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  if (!session) return null;

  // Prompt 5B: In business mode, render "CÂU HỎI CỦA BẠN" if session.business_questions is present
  const isBusiness = session.dataset?.kind === 'business' || !session.dataset;
  if (isBusiness) {
    const questions = session.business_questions;
    if (!questions || questions.length === 0) {
      return null;
    }

    const feasibilityRecord: Record<string, { feasible: boolean; reason?: string }> = {};
    BUSINESS_METRIC_CATALOG.forEach((m) => {
      feasibilityRecord[m.id] = { feasible: true };
    });
    const labelById: Record<string, string> = {};
    BUSINESS_METRIC_CATALOG.forEach((m) => {
      labelById[m.id] = m.name;
    });

    const mapped = mapQuestionsToMetrics(questions, feasibilityRecord, labelById);

    return (
      <div data-testid="business-questions-panel" style={{ marginBottom: 'var(--space-4)' }}>
        <PixelPanel
          title="CÂU HỎI CỦA BẠN"
          headerAction={
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <PixelButton
                variant="ghost"
                size="sm"
                onClick={() => navigate('/trao-doi')}
              >
                Sửa câu hỏi
              </PixelButton>
              <button
                onClick={() => setCollapsed(!collapsed)}
                aria-label={collapsed ? 'Mở rộng khung câu hỏi' : 'Thu gọn khung câu hỏi'}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--ink)',
                  padding: '2px 4px',
                }}
              >
                <span style={{ fontSize: '11px', fontWeight: 'bold' }}>{collapsed ? '▼' : '▲'}</span>
              </button>
            </div>
          }
        >
          {!collapsed && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
              {mapped.perQuestion.map((q) => {
                const tickLabels = q.tickIds.map((id) => labelById[id] || id);
                return (
                  <div
                    key={q.index}
                    data-testid={`report-question-item-${q.index}`}
                    style={{
                      padding: '8px 10px',
                      borderLeft: '3px solid var(--blue)',
                      backgroundColor: 'var(--sand-light, #fbfbf9)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <div>
                      <strong>Câu {q.index + 1}:</strong> &ldquo;{q.text}&rdquo;
                    </div>
                    {tickLabels.length > 0 && (
                      <div style={{ color: '#047857', fontSize: '12px' }}>
                        <strong>Chỉ số liên quan:</strong> {tickLabels.join(', ')}
                      </div>
                    )}
                    {q.unanswerable && (
                      <div style={{ color: '#d97706', fontSize: '12px', fontWeight: 600 }}>
                        {q.unanswerable}
                      </div>
                    )}
                    {q.blockedIds.length > 0 && (
                      <div style={{ color: '#b91c1c', fontSize: '12px' }}>
                        <strong>Chưa tính được:</strong>{' '}
                        {q.blockedIds.map((b) => `${labelById[b.id] || b.id} (${b.reason})`).join(', ')}
                      </div>
                    )}
                    {q.note && (
                      <div style={{ color: '#4b5563', fontSize: '12px', fontStyle: 'italic' }}>
                        {q.note}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </PixelPanel>
      </div>
    );
  }

  const context = getBusinessContext(session.id);
  if (!context || !context.analysis_questions || context.analysis_questions.length === 0) {
    return null;
  }

  return (
    <PixelPanel
      title="YÊU CẦU PHÂN TÍCH CỦA BẠN"
      headerAction={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <PixelButton
            variant="ghost"
            size="sm"
            icon="upload"
            onClick={() => navigate('/nap-du-lieu')}
          >
            Sửa yêu cầu
          </PixelButton>
          <button
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Mở rộng khung yêu cầu' : 'Thu gọn khung yêu cầu'}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--ink)',
              padding: '2px 4px',
            }}
          >
            <span style={{ fontSize: '11px', fontWeight: 'bold' }}>{collapsed ? '▼' : '▲'}</span>
          </button>
        </div>
      }
    >
      {!collapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {(context.company_name || context.role) && (
            <div
              style={{
                fontSize: '13px',
                color: 'var(--ink)',
                borderBottom: '1px dashed var(--chart-grid)',
                paddingBottom: '6px',
                display: 'flex',
                gap: '16px',
                flexWrap: 'wrap',
              }}
            >
              {context.company_name && (
                <span>
                  <strong>Doanh nghiệp:</strong> {context.company_name}
                </span>
              )}
              {context.role && (
                <span>
                  <strong>Chức vụ:</strong> {context.role}
                </span>
              )}
            </div>
          )}

          <div style={{ fontSize: '13px', color: 'var(--ink)' }}>
            <div style={{ fontWeight: 600, marginBottom: '4px', color: 'var(--ink-soft)' }}>
              Mục tiêu phân tích ({context.analysis_questions.length} câu):
            </div>
            <ol style={{ paddingLeft: '20px', margin: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {context.analysis_questions.map((q, idx) => (
                <li key={idx} style={{ lineHeight: 1.4 }}>
                  {q}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </PixelPanel>
  );
};
