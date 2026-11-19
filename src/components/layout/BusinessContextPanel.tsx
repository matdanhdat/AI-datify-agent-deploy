import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PixelPanel } from '../pixel/PixelPanel';
import { PixelButton } from '../pixel/PixelButton';
import { getBusinessContext } from '../../services/readers';
import type { Session } from '../../types/contract';

interface BusinessContextPanelProps {
  session: Session | null;
}

export const BusinessContextPanel: React.FC<BusinessContextPanelProps> = ({ session }) => {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  if (!session) return null;

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
