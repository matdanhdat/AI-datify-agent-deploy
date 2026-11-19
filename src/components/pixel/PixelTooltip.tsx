import React, { useState } from 'react';

export interface PixelTooltipProps {
  content: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  children: React.ReactElement;
}

export const PixelTooltip: React.FC<PixelTooltipProps> = ({
  content,
  position = 'top',
  children,
}) => {
  const [visible, setVisible] = useState(false);

  // Position styles
  const getPosStyles = (): React.CSSProperties => {
    switch (position) {
      case 'bottom':
        return { top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: '6px' };
      case 'left':
        return { right: '100%', top: '50%', transform: 'translateY(-50%)', marginRight: '6px' };
      case 'right':
        return { left: '100%', top: '50%', transform: 'translateY(-50%)', marginLeft: '6px' };
      case 'top':
      default:
        return { bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: '6px' };
    }
  };

  return (
    <div
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && content && (
        <div
          role="tooltip"
          className="px-shadow-sm font-pixel"
          style={{
            position: 'absolute',
            zIndex: 9999,
            backgroundColor: 'var(--ink)',
            color: 'var(--white)',
            padding: '3px 8px',
            fontSize: '14px',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            border: '1px solid var(--white)',
            ...getPosStyles(),
          }}
        >
          {content}
        </div>
      )}
    </div>
  );
};

