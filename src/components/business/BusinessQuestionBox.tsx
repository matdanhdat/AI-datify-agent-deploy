import React, { useState, useEffect } from 'react';
import { PixelPanel } from '../pixel/PixelPanel';
import { PixelButton } from '../pixel/PixelButton';
import {
  sanitizeQuestions,
} from '../../core/metrics/questionToMetrics';
import type {
  BusinessQuestionAnalysisResult,
} from '../../services/businessQuestionService';

export interface BusinessQuestionBoxProps {
  initialQuestions?: string[];
  analysisResult: BusinessQuestionAnalysisResult | null;
  isAnalyzing: boolean;
  canUndo: boolean;
  onSendQuestions: (cleanedQuestions: string[]) => Promise<void>;
  onClearQuestions: () => void;
  onUndoSelection: () => void;
  labelById: Record<string, string>;
  availableRoleNames?: string[];
}

export const BusinessQuestionBox: React.FC<BusinessQuestionBoxProps> = ({
  initialQuestions,
  analysisResult,
  isAnalyzing,
  canUndo,
  onSendQuestions,
  onClearQuestions,
  onUndoSelection,
  labelById,
  availableRoleNames,
}) => {
  const [inputText, setInputText] = useState(
    initialQuestions && initialQuestions.length > 0
      ? initialQuestions.join('\n')
      : ''
  );
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    if (initialQuestions && initialQuestions.length > 0) {
      setInputText(initialQuestions.join('\n'));
    }
  }, [initialQuestions]);

  const rawLines = inputText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const lineCount = rawLines.length;

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputText(val);

    const check = sanitizeQuestions(val);
    if (check.hasWarnings) {
      setWarning(check.warningMessage || 'Chỉ nhận tối đa 3 câu, mỗi câu tối đa 200 ký tự');
    } else {
      setWarning(null);
    }
  };

  const handleSend = async () => {
    const sanitized = sanitizeQuestions(inputText);
    if (sanitized.questions.length === 0) {
      return;
    }
    if (sanitized.hasWarnings) {
      setWarning(sanitized.warningMessage || 'Chỉ nhận tối đa 3 câu, mỗi câu tối đa 200 ký tự');
    } else {
      setWarning(null);
    }
    await onSendQuestions(sanitized.questions);
  };

  const handleClear = () => {
    setInputText('');
    setWarning(null);
    onClearQuestions();
  };

  // Build dynamic placeholder based on available roles
  const roleHint = availableRoleNames && availableRoleNames.length > 0
    ? ` (dữ liệu có ${availableRoleNames.join(', ')})`
    : '';
  const placeholder = `Gõ tối đa 3 câu hỏi phân tích${roleHint}, mỗi dòng một câu.\nVí dụ:\n- Kênh nào lời nhất?\n- Sản phẩm nào nên đẩy mạnh?`;

  return (
    <div data-testid="business-question-box" style={{ marginBottom: 'var(--space-4)' }}>
      <PixelPanel
        title="HỎI VỀ DỮ LIỆU CỦA BẠN"
        headerAction={
          analysisResult?.source ? (
            <span
              data-testid="question-source-badge"
              style={{
                fontSize: '11px',
                fontWeight: 700,
                padding: '2px 8px',
                border: '1px solid var(--ink)',
                backgroundColor: analysisResult.source.includes('AI')
                  ? '#e0f2fe'
                  : '#fef3c7',
                color: 'var(--ink)',
              }}
            >
              {analysisResult.source}
            </span>
          ) : undefined
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div style={{ fontSize: '13px', color: 'var(--ink-soft)' }}>
            Hệ thống tự động hiểu câu hỏi và đánh dấu các chỉ số phù hợp trong danh mục bên dưới. Bạn có thể kiểm tra và điều chỉnh lại trước khi phân tích.
          </div>

          <div>
            <textarea
              data-testid="question-input-textarea"
              rows={3}
              value={inputText}
              onChange={handleInputChange}
              placeholder={placeholder}
              disabled={isAnalyzing}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '8px 10px',
                fontFamily: 'inherit',
                fontSize: '13px',
                lineHeight: 1.5,
                border: '2px solid var(--ink)',
                backgroundColor: 'var(--white)',
                color: 'var(--ink)',
                resize: 'vertical',
              }}
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: '4px',
                fontSize: '12px',
              }}
            >
              <div>
                {warning && (
                  <span
                    data-testid="question-warning"
                    style={{ color: '#b91c1c', fontWeight: 600 }}
                  >
                    {warning}
                  </span>
                )}
              </div>
              <div
                data-testid="question-counter"
                style={{
                  color: lineCount > 3 ? '#b91c1c' : 'var(--ink-soft)',
                  fontWeight: lineCount > 3 ? 700 : 500,
                }}
              >
                {lineCount}/3 câu
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              gap: 'var(--space-2)',
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <PixelButton
              variant="primary"
              size="sm"
              onClick={handleSend}
              disabled={isAnalyzing || lineCount === 0}
            >
              {isAnalyzing ? 'Đang hiểu câu hỏi...' : 'GỬI CÂU HỎI'}
            </PixelButton>

            <PixelButton
              variant="secondary"
              size="sm"
              onClick={handleClear}
              disabled={isAnalyzing || (!inputText && !analysisResult)}
            >
              XÓA CÂU HỎI
            </PixelButton>

            {canUndo && (
              <PixelButton
                variant="ghost"
                size="sm"
                onClick={onUndoSelection}
                disabled={isAnalyzing}
              >
                HOÀN TÁC LỰA CHỌN
              </PixelButton>
            )}
          </div>

          {/* Analysis Results Display */}
          {analysisResult && analysisResult.perQuestion.length > 0 && (
            <div
              data-testid="question-results-list"
              style={{
                marginTop: 'var(--space-2)',
                padding: '12px',
                backgroundColor: 'var(--sand-light, #fbfbf9)',
                border: '1px solid var(--ink)',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--ink)' }}>
                KẾT QUẢ HIỂU CÂU HỎI ({analysisResult.perQuestion.length} câu):
              </div>

              {analysisResult.perQuestion.map((q) => {
                const tickLabels = q.tickIds.map((id) => labelById[id] || id);
                return (
                  <div
                    key={q.index}
                    data-testid={`question-item-${q.index}`}
                    style={{
                      padding: '8px 10px',
                      backgroundColor: 'var(--white)',
                      border: '1px solid var(--chart-grid, #e5e7eb)',
                      fontSize: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <div style={{ fontWeight: 600, color: 'var(--ink)' }}>
                      Câu {q.index + 1}: &ldquo;{q.text}&rdquo;
                    </div>

                    {tickLabels.length > 0 && (
                      <div style={{ color: '#047857' }}>
                        <strong>Đã chọn chỉ số:</strong> {tickLabels.join(', ')}
                      </div>
                    )}

                    {q.blockedIds.length > 0 && (
                      <div style={{ color: '#b91c1c' }}>
                        <strong>Chưa tính được do thiếu dữ liệu:</strong>
                        <ul style={{ margin: '2px 0 0 16px', padding: 0 }}>
                          {q.blockedIds.map((b) => (
                            <li key={b.id}>
                              {labelById[b.id] || b.id}: {b.reason}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {q.unanswerable && (
                      <div style={{ color: '#d97706', fontWeight: 600 }}>
                        {q.unanswerable}
                      </div>
                    )}

                    {q.note && (
                      <div style={{ color: '#4b5563', fontStyle: 'italic' }}>
                        {q.note}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </PixelPanel>
    </div>
  );
};
