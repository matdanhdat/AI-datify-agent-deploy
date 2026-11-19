import React, { useState, useEffect, useRef } from 'react';
import { PixelFace } from '../../brand/PixelFace';
import { FACE_BOT, PALETTE_BOT } from '../../brand/sprites';
import { PixelIcon } from '../pixel/PixelIcon';

export interface ChatLauncherProps {
  isOpen: boolean;
  onToggle: (nextState: boolean) => void;
  chatDockId: string;
}

// In-memory tab session storage (zero localStorage usage)
let tabSessionBubbleDismissed = false;

export const ChatLauncher: React.FC<ChatLauncherProps> = ({
  isOpen,
  onToggle,
  chatDockId,
}) => {
  const [bubbleDismissed, setBubbleDismissed] = useState(tabSessionBubbleDismissed);
  const [bubbleVisible, setBubbleVisible] = useState(!tabSessionBubbleDismissed);
  const [isNarrowScreen, setIsNarrowScreen] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 900 : false
  );
  const autoHideTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Monitor screen width (< 900px responsive breakpoint)
  useEffect(() => {
    const handleResize = () => {
      setIsNarrowScreen(window.innerWidth < 900);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Check URL query parameters for demo/test states
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const search = new URLSearchParams(window.location.search);
      if (search.get('noBubble') === '1' || search.get('dismissBubble') === '1') {
        setBubbleDismissed(true);
        setBubbleVisible(false);
      }
    }
  }, []);

  // 12s auto-hide timer for speech bubble
  useEffect(() => {
    if (bubbleVisible && !bubbleDismissed && !isOpen) {
      autoHideTimerRef.current = setTimeout(() => {
        setBubbleVisible(false);
      }, 12000);
    }
    return () => {
      if (autoHideTimerRef.current) {
        clearTimeout(autoHideTimerRef.current);
      }
    };
  }, [bubbleVisible, bubbleDismissed, isOpen]);

  // Hide bubble when user scrolls page or chat opens
  useEffect(() => {
    const handleScroll = () => {
      if (bubbleVisible) {
        setBubbleVisible(false);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [bubbleVisible]);

  // When chat opens, hide speech bubble
  useEffect(() => {
    if (isOpen) {
      setBubbleVisible(false);
    }
  }, [isOpen]);

  const handleDismissBubble = (e: React.MouseEvent) => {
    e.stopPropagation();
    tabSessionBubbleDismissed = true;
    setBubbleDismissed(true);
    setBubbleVisible(false);
  };

  const handleMouseEnter = () => {
    if (!bubbleDismissed && !isOpen) {
      setBubbleVisible(true);
    }
  };

  const handleFocus = () => {
    if (!bubbleDismissed && !isOpen) {
      setBubbleVisible(true);
    }
  };

  const showBubble = bubbleVisible && !bubbleDismissed && !isOpen;

  return (
    <div
      className="no-print"
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onMouseEnter={handleMouseEnter}
      onFocus={handleFocus}
    >
      {/* Speech Bubble Tooltip */}
      {showBubble && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'absolute',
            ...(isNarrowScreen
              ? {
                  bottom: '76px',
                  right: '0px',
                  maxWidth: '240px',
                }
              : {
                  bottom: '12px',
                  right: '76px',
                  whiteSpace: 'nowrap',
                }),
            backgroundColor: 'var(--cream)',
            border: '3px solid var(--ink)',
            boxShadow: '3px 3px 0 var(--ink)',
            padding: '8px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            zIndex: 'var(--z-launcher)',
            userSelect: 'none',
          }}
        >
          <span
            className="font-content"
            style={{
              fontSize: isNarrowScreen ? '12px' : '14px',
              fontWeight: 600,
              color: 'var(--ink)',
              lineHeight: 1.3,
            }}
          >
            Tôi có thể giúp gì cho bạn?
          </span>

          {/* Dismiss button X */}
          <button
            type="button"
            onClick={handleDismissBubble}
            aria-label="Ẩn lời chào"
            title="Ẩn lời chào"
            style={{
              width: '24px',
              height: '24px',
              padding: 0,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--ink-soft)',
              flexShrink: 0,
            }}
          >
            <PixelIcon name="cross" size={12} />
          </button>

          {/* Pixel Stepped Arrow pointing toward Bot */}
          {!isNarrowScreen && (
            <div
              style={{
                position: 'absolute',
                top: '50%',
                right: '-8px',
                transform: 'translateY(-50%)',
                width: 0,
                height: 0,
                borderTop: '6px solid transparent',
                borderBottom: '6px solid transparent',
                borderLeft: '8px solid var(--ink)',
              }}
            />
          )}
        </div>
      )}

      {/* 64x64 Voxel Bot Face Button */}
      <div
        style={{
          filter: 'drop-shadow(4px 4px 0 var(--ink))',
        }}
      >
        <button
          type="button"
          onClick={() => onToggle(!isOpen)}
          aria-expanded={isOpen}
          aria-controls={chatDockId}
          aria-label={isOpen ? 'Đóng trợ lý Datify' : 'Mở trợ lý Datify'}
          title={isOpen ? 'Đóng trợ lý Datify (Esc)' : 'Mở trợ lý Datify'}
          style={{
            width: '64px',
            height: '64px',
            backgroundColor: 'var(--ink)',
            border: '4px solid var(--ink)',
            cursor: 'pointer',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            clipPath:
              'polygon(4px 0, calc(100% - 4px) 0, 100% 4px, 100% calc(100% - 4px), calc(100% - 4px) 100%, 4px 100%, 0 calc(100% - 4px), 0 4px)',
            transition: 'transform 0.05s ease',
          }}
        >
          {/* Voxel bot face with orange antenna light */}
          <PixelFace
            rows={FACE_BOT}
            palette={PALETTE_BOT}
            px={6}
            antenna={true}
            aria-hidden={true}
          />
        </button>
      </div>
    </div>
  );
};
