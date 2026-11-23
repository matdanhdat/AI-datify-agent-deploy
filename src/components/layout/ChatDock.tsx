/**
 * Pixel Chat Dock Assistant (Prompt P6 Section 7).
 * Strictly read-only floating assistant dock adhering to the 8-bit Pixel Art design system.
 * Features:
 * - 3-tier pipeline integration via askAssistant
 * - Strict verification & canned fallbacks for hallucinations
 * - Dynamic contextual suggestions based on session state and page
 * - Evidence chips with navigation
 * - Rate limiting (2s), AbortController cancel button, clear chat, and keyboard shortcuts (Esc, Enter).
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PixelIcon } from '../pixel/PixelIcon';
import { PixelSprite } from '../pixel/PixelSprite';
import { useSession } from '../../hooks/useSession';
import { askAssistant } from '../../agent/chat';
import { formatAiError } from '../../core/aiErrors';
import { ChatLauncher } from './ChatLauncher';

export interface ChatMessageItem {
  id: string;
  sender: 'ai' | 'user' | 'system';
  text: string;
  source?: 'local' | 'ai' | 'system';
  evidence?: string[];
  targetPage?: string;
  time?: string;
}

export interface ChatDockProps {
  isOpen?: boolean;
  onToggle?: (open: boolean) => void;
  sessionId?: string;
  page?: string;
  activeSymbol?: string;
}

const WELCOME_MESSAGE: ChatMessageItem = {
  id: 'welcome-1',
  sender: 'ai',
  source: 'local',
  text: 'Xin chào! Tôi là Trợ lý Datify (chế độ Chỉ-Đọc). Tôi có thể hỗ trợ giải thích các chỉ số tài chính, công thức tính toán, quy tắc làm sạch dữ liệu và hướng dẫn các bước thực hiện tiếp theo.',
  time: 'Bây giờ',
  evidence: [],
};

export const ChatDock: React.FC<ChatDockProps> = ({
  isOpen: controlledIsOpen,
  onToggle,
  sessionId: propSessionId,
  page: propPage,
  activeSymbol,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { session } = useSession();

  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalOpen;

  const currentSessionId = propSessionId || session?.id || 'demo-session';
  const currentPage = propPage || location.pathname;
  const currentState = session?.state || 'created';

  const [messages, setMessages] = useState<ChatMessageItem[]>([WELCOME_MESSAGE]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleToggle = useCallback(
    (open: boolean) => {
      if (onToggle) onToggle(open);
      else setInternalOpen(open);
    },
    [onToggle]
  );

  // Demo URL parameter handler for automated screenshots and preview
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const search = new URLSearchParams(window.location.search);
      if (search.get('chat') === 'open' || search.has('demoChat')) {
        setInternalOpen(true);
      }
      const demo = search.get('demoChat');
      if (demo === 'metric') {
        setMessages([
          WELCOME_MESSAGE,
          {
            id: 'demo-q1',
            sender: 'user',
            text: 'Chỉ số RSI 14 phiên của TMA được tính như thế nào và có ý nghĩa gì?',
            time: '10:02',
          },
          {
            id: 'demo-a1',
            sender: 'ai',
            source: 'local',
            text: 'Chỉ số RSI 14 phiên của mã TMA hiện tại là 65,42. Công thức: Wilder RSI 14 phiên tính trên chuỗi thay đổi giá đóng cửa. Ý nghĩa: Đo lường xung lượng dao động giá trong khoảng 0-100 (vùng > 70 là quá mua, < 30 là quá bán).',
            evidence: ['m:rsi14:TMA'],
            time: '10:02',
          },
        ]);
      } else if (demo === 'mutation') {
        setMessages([
          WELCOME_MESSAGE,
          {
            id: 'demo-q2',
            sender: 'user',
            text: 'Hãy sửa giá đóng cửa của TMA thành 100',
            time: '10:05',
          },
          {
            id: 'demo-a2',
            sender: 'ai',
            source: 'local',
            text: 'Tôi là trợ lý chỉ-đọc và không có quyền sửa đổi dữ liệu hay trạng thái hệ thống. Mọi số liệu được bảo vệ toàn vẹn.',
            time: '10:05',
          },
        ]);
      } else if (demo === 'rejection') {
        setMessages([
          WELCOME_MESSAGE,
          {
            id: 'demo-q3',
            sender: 'user',
            text: 'Vì sao file của tôi bị từ chối?',
            time: '10:08',
          },
          {
            id: 'demo-a3',
            sender: 'ai',
            source: 'local',
            text: 'Tệp gần nhất bị từ chối với mã lỗi DATA_BAD_NUMBER: Cột "close" tại dòng 15 chứa ký tự không thể chuyển thành số. Cách sửa: Mở tệp Excel/CSV, kiểm tra ô tại dòng 15 cột close, xóa các ký tự chữ hoặc dấu cách thừa và nhập số hợp lệ.',
            time: '10:08',
          },
        ]);
      }
    }
  }, []);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    if (isOpen && typeof messagesEndRef.current?.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // Focus input when opened & attach Esc shortcut
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleToggle(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleToggle]);

  // Determine dynamic suggested prompts according to session state & page
  const getSuggestedPrompts = (): string[] => {
    if (currentState === 'created') {
      return ['Tôi nên bắt đầu từ đâu?', 'File cần có những cột nào?', 'Vì sao file của tôi bị từ chối?'];
    }
    if (currentState === 'uploaded' || currentState === 'cleaning_review') {
      return [
        'Điền khối lượng bằng 0 nghĩa là gì?',
        'Điểm bất thường được phát hiện thế nào?',
        'Tôi nên làm gì tiếp theo?',
      ];
    }
    if (currentState === 'clean_approved') {
      return [
        'Tôi nên làm gì tiếp theo?',
        'Giả định tính toán gồm những gì?',
        'Chỉ số Sharpe là gì?',
      ];
    }
    if (currentState === 'analyzed') {
      return [
        'Sụt giảm tối đa được tính thế nào?',
        'Chỉ số Sharpe là gì?',
        'Vì sao chỉ số có màu đỏ hoặc xanh?',
      ];
    }
    if (currentState === 'report_approved') {
      return [
        'Tôi xuất file bằng cách nào?',
        'Dấu phê duyệt có ý nghĩa gì?',
        'Công thức sống trong Excel hoạt động ra sao?',
      ];
    }
    return ['Tôi nên bắt đầu từ đâu?', 'Chỉ số Sharpe là gì?', 'Sụt giảm tối đa là gì?'];
  };

  const handleSend = async (textToSend?: string) => {
    const raw = textToSend !== undefined ? textToSend : inputText;
    const q = raw.trim();
    if (!q || isLoading) return;

    setInputText('');
    setStatusNotice(null);

    const userMsg: ChatMessageItem = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: q,
      time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    };

    // Keep history capped at 50 messages
    setMessages((prev) => [...prev.slice(-49), userMsg]);
    setIsLoading(true);

    const abortCtrl = new AbortController();
    abortControllerRef.current = abortCtrl;

    try {
      const historyTurns = messages
        .filter((m) => m.sender === 'user' || m.sender === 'ai')
        .slice(-6)
        .map((m) => ({
          sender: m.sender as 'user' | 'ai',
          text: m.text,
        }));

      const res = await askAssistant({
        sessionId: currentSessionId,
        question: q,
        page: currentPage,
        activeSymbol,
        history: historyTurns,
        signal: abortCtrl.signal,
      });

      const assistantMsg: ChatMessageItem = {
        id: `ai-${Date.now()}`,
        sender: res.source === 'system' ? 'system' : 'ai',
        source: res.source,
        text: res.answer_vi,
        evidence: res.evidence,
        targetPage: res.targetPage,
        time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev.slice(-49), assistantMsg]);
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        const formatted = formatAiError(err);
        const errorMsg: ChatMessageItem = {
          id: `err-${Date.now()}`,
          sender: 'system',
          source: 'system',
          text: `Trợ lý gặp gián đoạn tạm thời (mã ${formatted.code}).\n${formatted.message_vi}\nGợi ý: ${formatted.hint_vi}`,
          time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev.slice(-49), errorMsg]);
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
      setStatusNotice('Đã dừng phản hồi.');
    }
  };

  const handleClearHistory = () => {
    setMessages([WELCOME_MESSAGE]);
    setStatusNotice('Đã xóa cuộc trò chuyện.');
    setTimeout(() => setStatusNotice(null), 3000);
  };

  const handleEvidenceClick = (evKey: string, targetPage?: string) => {
    if (targetPage && location.pathname !== targetPage) {
      navigate(targetPage);
    }

    if (evKey.startsWith('m:')) {
      const parts = evKey.split(':');
      const metricId = parts[1];
      if (location.pathname !== '/report') {
        navigate('/report');
      }
      setTimeout(() => {
        const el = document.getElementById(`metric-${metricId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('px-highlight');
          setTimeout(() => el.classList.remove('px-highlight'), 2000);
        }
      }, 300);
    }
  };

  // Prompt 1C-2a-UI Section D: Elevate chat button when fixed bottom bar exists (CleanPage)
  // Bottom bar height is ~56px. Elevating to 84px ensures at least 28px (> 16px) clearance above bottom bar.
  const hasBottomBar = location.pathname.startsWith('/lam-sach') || location.pathname.startsWith('/clean');
  const chatBottom = hasBottomBar ? '84px' : '24px';

  return (
    <div
      className="no-print"
      style={{
        position: 'fixed',
        bottom: chatBottom,
        right: '24px',
        zIndex: 'var(--z-launcher, 9999)' as any,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: '12px',
      }}
      role="region"
      aria-label="Khung trợ lý Datify"
    >
      {/* Floating Chat Dock Panel */}
      {isOpen && (
        <div
          id="datify-chat-dock"
          className="px-shadow-lg"
          style={{
            width: '380px',
            maxWidth: 'calc(100vw - 48px)',
            maxHeight: 'min(70vh, 580px)',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: 'var(--ink)',
            padding: '3px',
            clipPath:
              'polygon(4px 0, calc(100% - 4px) 0, 100% 4px, 100% calc(100% - 4px), calc(100% - 4px) 100%, 4px 100%, 0 calc(100% - 4px), 0 4px)',
          }}
        >
          <div
            className="px-inner"
            style={{
              backgroundColor: 'var(--panel)',
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              maxHeight: 'calc(min(70vh, 580px) - 6px)',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: 'var(--ink)',
                color: 'var(--white)',
                padding: '8px 12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <PixelIcon name="robot-head" size={18} />
                <span className="font-pixel" style={{ fontSize: '16px' }}>
                  Trợ lý Datify (Chỉ-Đọc)
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={handleClearHistory}
                  title="Xóa lịch sử cuộc trò chuyện"
                  aria-label="Xóa cuộc trò chuyện"
                  className="font-pixel"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--ink-soft)',
                    fontSize: '12px',
                    cursor: 'pointer',
                    padding: '2px 4px',
                  }}
                >
                  Xóa
                </button>
                <button
                  onClick={() => handleToggle(false)}
                  aria-label="Đóng khung chat (Esc)"
                  title="Đóng (Esc)"
                  className="font-pixel"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--white)',
                    fontSize: '14px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <PixelIcon name="cross" size={14} />
                </button>
              </div>
            </div>

            {/* Offline / Mode Banner */}
            <div
              style={{
                backgroundColor: 'rgba(20, 33, 77, 0.06)',
                borderBottom: '1px solid var(--border-soft)',
                padding: '4px 12px',
                fontSize: '11px',
                color: 'var(--ink-soft)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <PixelIcon name="lock" size={12} />
                <span>Chế độ Chỉ-Đọc: Không sửa dữ liệu</span>
              </span>
              {statusNotice && <span style={{ color: 'var(--accent)' }}>{statusNotice}</span>}
            </div>

            {/* Messages Body */}
            <div
              style={{
                flex: 1,
                padding: '12px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
              aria-live="polite"
            >
              {messages.map((m) => {
                const isUser = m.sender === 'user';

                return (
                  <div
                    key={m.id}
                    style={{
                      display: 'flex',
                      flexDirection: isUser ? 'row-reverse' : 'row',
                      gap: '8px',
                      alignItems: 'flex-start',
                    }}
                  >
                    {!isUser && (
                      <PixelSprite
                        mood={m.source === 'ai' ? 'working' : 'idle'}
                        size={28}
                      />
                    )}
                    <div
                      style={{
                        maxWidth: '85%',
                        backgroundColor: isUser ? 'var(--blue)' : 'var(--white)',
                        color: isUser ? 'var(--white)' : 'var(--ink)',
                        border: '1px solid var(--ink)',
                        padding: '8px 10px',
                        fontSize: '13px',
                        lineHeight: 1.5,
                        clipPath:
                          'polygon(2px 0, calc(100% - 2px) 0, 100% 2px, 100% calc(100% - 2px), calc(100% - 2px) 100%, 2px 100%, 0 calc(100% - 2px), 0 2px)',
                      }}
                    >
                      {/* Role Source Badge for Assistant */}
                      {!isUser && (
                        <div
                          style={{
                            fontSize: '10px',
                            fontWeight: 'bold',
                            fontFamily: 'var(--font-pixel)',
                            color: m.source === 'ai' ? 'var(--blue)' : 'var(--good)',
                            marginBottom: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <PixelIcon name="shield-check" size={12} />
                          {m.source === 'ai'
                            ? 'Trợ lý AI'
                            : m.source === 'system'
                            ? 'Thông báo hệ thống'
                            : 'Trả lời từ tài liệu & số liệu'}
                        </div>
                      )}

                      <div style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                        {m.text}
                      </div>

                      {/* Evidence Chips */}
                      {m.evidence && m.evidence.length > 0 && (
                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '4px',
                            marginTop: '6px',
                            paddingTop: '6px',
                            borderTop: '1px dashed var(--border-soft)',
                          }}
                        >
                          {m.evidence.map((ev) => (
                            <button
                              key={ev}
                              onClick={() => handleEvidenceClick(ev, m.targetPage)}
                              title={`Xem căn cứ số liệu: ${ev}`}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                padding: '1px 6px',
                                fontSize: '10px',
                                backgroundColor: 'var(--panel)',
                                border: '1px solid var(--blue)',
                                color: 'var(--blue)',
                                cursor: 'pointer',
                                fontFamily: 'var(--font-mono)',
                              }}
                            >
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <PixelIcon name="file" size={11} />
                                <span>{ev}</span>
                              </span>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Target Page Navigation Link */}
                      {m.targetPage && (
                        <div style={{ marginTop: '6px' }}>
                          <button
                            onClick={() => {
                              navigate(m.targetPage!);
                            }}
                            style={{
                              fontSize: '11px',
                              color: 'var(--accent)',
                              background: 'none',
                              border: 'none',
                              padding: 0,
                              textDecoration: 'underline',
                              cursor: 'pointer',
                              fontWeight: 600,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <PixelIcon name="arrow-right" size={12} />
                            <span>Chuyển đến trang {m.targetPage}</span>
                          </button>
                        </div>
                      )}

                      {m.time && (
                        <div
                          style={{
                            fontSize: '9px',
                            color: isUser ? 'rgba(255,255,255,0.7)' : 'var(--ink-soft)',
                            textAlign: 'right',
                            marginTop: '4px',
                          }}
                        >
                          {m.time}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Thinking Robot Indicator */}
              {isLoading && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px',
                    backgroundColor: 'rgba(20, 33, 77, 0.04)',
                    border: '1px dashed var(--ink-soft)',
                  }}
                >
                  <PixelSprite mood="thinking" size={24} />
                  <span className="font-pixel" style={{ fontSize: '12px', color: 'var(--ink)' }}>
                    Trợ lý đang tra cứu và đối chiếu số liệu...
                  </span>
                  <button
                    onClick={handleStop}
                    className="font-pixel"
                    style={{
                      marginLeft: 'auto',
                      padding: '2px 8px',
                      fontSize: '11px',
                      backgroundColor: 'var(--bad)',
                      color: 'var(--white)',
                      border: '1px solid var(--ink)',
                      cursor: 'pointer',
                    }}
                  >
                    Dừng
                  </button>
                </div>
              )}

              {/* Contextual Suggested Prompts */}
              {!isLoading && (
                <div style={{ marginTop: '8px' }}>
                  <div
                    style={{
                      fontSize: '11px',
                      color: 'var(--ink-soft)',
                      marginBottom: '6px',
                      fontWeight: 600,
                    }}
                  >
                    GỢI Ý CÂU HỎI THEO BƯỚC NÀY:
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {getSuggestedPrompts().map((prompt) => (
                      <button
                        key={prompt}
                        onClick={() => handleSend(prompt)}
                        className="font-content"
                        style={{
                          textAlign: 'left',
                          fontSize: '12px',
                          padding: '4px 8px',
                          backgroundColor: 'var(--white)',
                          border: '1px solid var(--border-soft)',
                          color: 'var(--blue)',
                          cursor: 'pointer',
                          borderRadius: 0,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <PixelIcon name="info" size={11} />
                        <span>{prompt}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Footer */}
            <div
              style={{
                padding: '8px 10px',
                borderTop: '2px solid var(--ink)',
                backgroundColor: 'rgba(20, 33, 77, 0.04)',
              }}
            >
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}
              >
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value.slice(0, 500))}
                    placeholder={
                      isLoading
                        ? 'Đang trả lời...'
                        : 'Hỏi về chỉ số, công thức, bước tiếp theo...'
                    }
                    disabled={isLoading}
                    className="font-content"
                    style={{
                      flex: 1,
                      padding: '6px 8px',
                      fontSize: '12px',
                      border: '1px solid var(--ink-soft)',
                      outline: 'none',
                      backgroundColor: 'var(--white)',
                      color: 'var(--ink)',
                    }}
                    maxLength={500}
                  />
                  {isLoading ? (
                    <button
                      type="button"
                      onClick={handleStop}
                      className="font-pixel"
                      style={{
                        padding: '4px 10px',
                        fontSize: '13px',
                        backgroundColor: 'var(--bad)',
                        color: 'var(--white)',
                        border: '1px solid var(--ink)',
                        cursor: 'pointer',
                      }}
                    >
                      DỪNG
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!inputText.trim()}
                      className="font-pixel"
                      style={{
                        padding: '4px 10px',
                        fontSize: '13px',
                        backgroundColor: inputText.trim() ? 'var(--accent)' : 'var(--panel)',
                        color: inputText.trim() ? 'var(--accent-text)' : 'var(--ink-soft)',
                        border: '1px solid var(--ink)',
                        cursor: inputText.trim() ? 'pointer' : 'default',
                      }}
                    >
                      GỬI
                    </button>
                  )}
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '10px',
                    color: 'var(--ink-soft)',
                  }}
                >
                  <span>Chỉ-đọc: trợ lý không thể sửa dữ liệu hay báo cáo</span>
                  <span>{inputText.length}/500</span>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Floating Bot Face Launcher Button */}
      <ChatLauncher
        isOpen={isOpen}
        onToggle={handleToggle}
        chatDockId="datify-chat-dock"
      />
    </div>
  );
};
