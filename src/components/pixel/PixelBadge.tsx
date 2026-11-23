import React from 'react';
import { PixelIcon } from './PixelIcon';
import type { IconName } from './icons';

export type BadgeVariant = 'success' | 'warn' | 'danger' | 'info' | 'neutral';

export interface PixelBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  icon?: IconName;
  size?: 'sm' | 'md';
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}

export const PixelBadge: React.FC<PixelBadgeProps> = ({
  variant = 'neutral',
  icon,
  size = 'md',
  children,
  className = '',
  style = {},
  title,
  ...rest
}) => {
  const getStyle = () => {
    switch (variant) {
      case 'success':
        return { bg: 'var(--good-d)', color: 'var(--white)' };
      case 'warn':
        return { bg: 'var(--warn)', color: 'var(--warn-text)' };
      case 'danger':
        return { bg: 'var(--bad)', color: 'var(--white)' };
      case 'info':
        return { bg: 'var(--blue-d)', color: 'var(--white)' };
      case 'neutral':
      default:
        return { bg: 'var(--panel)', color: 'var(--ink)' };
    }
  };

  const current = getStyle();

  return (
    <span
      {...rest}
      title={title}
      className={`pixel-badge font-pixel ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        backgroundColor: current.bg,
        color: current.color,
        border: '1px solid var(--ink)',
        padding: size === 'sm' ? '1px 6px' : '2px 8px',
        fontSize: size === 'sm' ? '13px' : '15px',
        lineHeight: 1.1,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        userSelect: 'none',
        clipPath: 'polygon(2px 0, calc(100% - 2px) 0, 100% 2px, 100% calc(100% - 2px), calc(100% - 2px) 100%, 2px 100%, 0 calc(100% - 2px), 0 2px)',
        ...style,
      }}
    >
      {icon && <PixelIcon name={icon} size={size === 'sm' ? 12 : 14} color={current.color} />}
      <span>{children}</span>
    </span>
  );
};

