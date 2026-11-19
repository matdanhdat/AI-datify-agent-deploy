import React, { useState } from 'react';
import type { NarrativeSection, NarrativeParagraph } from '../../core/schemas';
import { PixelBadge } from '../pixel/PixelBadge';
import { PixelButton } from '../pixel/PixelButton';
import { PixelIcon } from '../pixel/PixelIcon';
import { EvidenceChip } from './EvidenceChip';
import { ConfirmDialog } from '../pixel/PixelModal';

export interface NarrativeSectionViewProps {
  section: NarrativeSection;
  isApproved: boolean;
  onNavigateToTarget: (targetKey: string, symbol: string | null) => void;
  onUpdateParagraph: (sectionId: string, paragraphId: string, text: string) => void;
  onRevertParagraph: (sectionId: string, paragraphId: string) => void;
  onDeleteParagraph: (sectionId: string, paragraphId: string) => void;
  onRegenerateSection: (sectionId: string, style: 'concise' | 'detailed' | 'plain') => void;
  onUseTemplateForSection: (sectionId: string) => void;
  isRegenerating?: boolean;
}

export const NarrativeSectionView: React.FC<NarrativeSectionViewProps> = ({
  section,
  isApproved,
  onNavigateToTarget,
  onUpdateParagraph,
  onRevertParagraph,
  onDeleteParagraph,
  onRegenerateSection,
  onUseTemplateForSection,
  isRegenerating = false,
}) => {
  const [editingParaId, setEditingParaId] = useState<string | null>(null);
  const [editText, setEditText] = useState<string>('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showStyleMenu, setShowStyleMenu] = useState<boolean>(false);

  const startEdit = (p: NarrativeParagraph) => {
    if (isApproved) return;
    setEditingParaId(p.id);
    setEditText(p.text);
  };

  const cancelEdit = () => {
    setEditingParaId(null);
    setEditText('');
  };

  const handleSave = (pId: string) => {
    if (editText.trim().length === 0) return;
    onUpdateParagraph(section.id, pId, editText);
    setEditingParaId(null);
  };

  return (
    <div
      className="narrative-section print-avoid-break"
      style={{
        marginBottom: 'var(--space-6)',
        paddingBottom: 'var(--space-4)',
        borderBottom: '1px solid var(--border-soft)',
      }}
    >
      {/* Section Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 'var(--space-2)',
          marginBottom: 'var(--space-3)',
        }}
      >
        <h3
          className="font-pixel"
          style={{
            fontSize: '18px',
            color: 'var(--ink)',
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span style={{ color: 'var(--accent)' }}>▶</span>
          {section.title_vi}
        </h3>

        {/* Section Actions (Hidden when approved or during print) */}
        {!isApproved && (
          <div className="no-print" style={{ display: 'flex', gap: 'var(--space-2)', position: 'relative' }}>
            <div style={{ position: 'relative' }}>
              <PixelButton
                variant="secondary"
                size="sm"
                onClick={() => setShowStyleMenu(!showStyleMenu)}
                disabled={isRegenerating}
              >
                {isRegenerating ? 'Đang viết...' : 'Viết lại mục này ▼'}
              </PixelButton>

              {showStyleMenu && (
                <div
                  className="px-shadow"
                  style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    zIndex: 50,
                    backgroundColor: 'var(--panel)',
                    border: '2px solid var(--ink)',
                    padding: '4px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    minWidth: '150px',
                    marginTop: '4px',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setShowStyleMenu(false);
                      onRegenerateSection(section.id, 'concise');
                    }}
                    style={{
                      textAlign: 'left',
                      padding: '6px 8px',
                      fontSize: '12px',
                      fontFamily: 'var(--font-pixel)',
                      backgroundColor: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    1. Ngắn gọn (Concise)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowStyleMenu(false);
                      onRegenerateSection(section.id, 'detailed');
                    }}
                    style={{
                      textAlign: 'left',
                      padding: '6px 8px',
                      fontSize: '12px',
                      fontFamily: 'var(--font-pixel)',
                      backgroundColor: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    2. Chi tiết (Detailed)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowStyleMenu(false);
                      onRegenerateSection(section.id, 'plain');
                    }}
                    style={{
                      textAlign: 'left',
                      padding: '6px 8px',
                      fontSize: '12px',
                      fontFamily: 'var(--font-pixel)',
                      backgroundColor: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    3. Dễ hiểu cho người mới
                  </button>
                </div>
              )}
            </div>

            <PixelButton
              variant="secondary"
              size="sm"
              onClick={() => onUseTemplateForSection(section.id)}
              disabled={isRegenerating}
            >
              Dùng mẫu câu
            </PixelButton>
          </div>
        )}
      </div>

      {/* Paragraphs List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {section.paragraphs.map((p) => {
          const isEditing = editingParaId === p.id;
          const hasIssues = p.check_issues && p.check_issues.length > 0;

          return (
            <div
              key={p.id}
              className="narrative-paragraph print-avoid-break"
              style={{
                backgroundColor: isEditing ? 'var(--panel-alt)' : 'transparent',
                padding: isEditing ? 'var(--space-3)' : '0px',
                border: isEditing ? '2px solid var(--accent)' : 'none',
              }}
            >
              {/* Paragraph Metadata Toolbar (Hidden in print) */}
              <div
                className="no-print"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 'var(--space-2)',
                  marginBottom: 'var(--space-2)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <PixelBadge
                    variant={p.source === 'ai' ? 'info' : p.source === 'edited' ? 'warn' : 'neutral'}
                    size="sm"
                  >
                    {p.source === 'ai'
                      ? 'AI viết'
                      : p.source === 'edited'
                      ? 'Đã chỉnh sửa'
                      : 'Mẫu câu'}
                  </PixelBadge>

                  {/* Evidence Chips */}
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {p.evidence.map((evKey) => (
                      <EvidenceChip
                        key={evKey}
                        evidenceKey={evKey}
                        onNavigateToTarget={onNavigateToTarget}
                      />
                    ))}
                  </div>
                </div>

                {!isApproved && !isEditing && (
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <PixelButton
                      variant="secondary"
                      size="sm"
                      onClick={() => startEdit(p)}
                    >
                      Sửa đoạn
                    </PixelButton>
                    {p.original_text && (
                      <PixelButton
                        variant="secondary"
                        size="sm"
                        onClick={() => onRevertParagraph(section.id, p.id)}
                        title="Hoàn tác về bản gốc trước khi sửa"
                      >
                        Hoàn tác
                      </PixelButton>
                    )}
                    {section.paragraphs.length > 1 && (
                      <PixelButton
                        variant="danger"
                        size="sm"
                        onClick={() => setConfirmDeleteId(p.id)}
                        title="Xóa đoạn này"
                      >
                        Xóa
                      </PixelButton>
                    )}
                  </div>
                )}
              </div>

              {/* Editing Mode */}
              {isEditing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <textarea
                    className="analysis-text"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={4}
                    maxLength={700}
                    style={{
                      width: '100%',
                      padding: '10px',
                      backgroundColor: 'var(--panel)',
                      border: '2px solid var(--ink)',
                      borderRadius: '0px',
                      resize: 'vertical',
                    }}
                  />

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '11px',
                      color: 'var(--ink-soft)',
                    }}
                  >
                    <span>{editText.length}/700 ký tự</span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <PixelButton
                        variant="primary"
                        size="sm"
                        onClick={() => handleSave(p.id)}
                        disabled={editText.trim().length === 0}
                      >
                        Lưu đoạn
                      </PixelButton>
                      <PixelButton
                        variant="secondary"
                        size="sm"
                        onClick={cancelEdit}
                      >
                        Hủy
                      </PixelButton>
                    </div>
                  </div>
                </div>
              ) : (
                /* Display Mode */
                <div className="analysis-text" style={{ margin: 0 }}>
                  <p style={{ margin: 0 }}>{p.text}</p>
                </div>
              )}

              {/* Number Check Warnings (Visible if issues exist) */}
              {hasIssues && (
                <div
                  className="no-print"
                  style={{
                    marginTop: '8px',
                    padding: '8px',
                    backgroundColor: 'var(--bad-bg)',
                    border: '1px solid var(--bad)',
                    fontSize: '12px',
                    color: 'var(--bad)',
                  }}
                >
                  <strong style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <PixelIcon name="warning" size={14} />
                    <span>Cảnh báo đối chiếu số liệu:</span>
                  </strong>
                  <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                    {p.check_issues.map((iss, i) => (
                      <li key={i}>{iss.detail_vi}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Delete Paragraph Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!confirmDeleteId}
        title="Xác nhận xóa đoạn văn"
        message="Bạn có chắc chắn muốn xóa đoạn văn này khỏi báo cáo? Thao tác này không thể hoàn tác trực tiếp."
        confirmLabel="Xóa đoạn"
        danger={true}
        onConfirm={() => {
          if (confirmDeleteId) {
            onDeleteParagraph(section.id, confirmDeleteId);
            setConfirmDeleteId(null);
          }
        }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
};
