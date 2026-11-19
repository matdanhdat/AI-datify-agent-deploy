import React from 'react';
import { PixelIcon } from './PixelIcon';
import type { IconName } from './icons';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface PixelButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconPosition?: 'left' | 'right';
  loading?: boolean;
  disabled?: boolean;
  font?: 'pixel' | 'content';
  children?: React.ReactNode;
}

export const PixelButton: React.FC<PixelButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  icon,
  iconPosition = 'left',
  loading = false,
  disabled = false,
  font = 'pixel',
  children,
  className = '',
  style = {},
  onClick,
  ...rest
}) => {
  const isDisabled = disabled || loading;

  // Colors based on variant
  const getColors = () => {
    switch (variant) {
      case 'primary':
        return {
          bg: 'var(--accent)',
          color: 'var(--accent-text)',
          border: 'var(--ink)',
          hoverBg: 'var(--accent-d)',
          hoverColor: 'var(--white)',
        };
      case 'danger':
        return {
          bg: 'var(--bad)',
          color: 'var(--white)',
          border: 'var(--ink)',
          hoverBg: '#A61F17',
          hoverColor: 'var(--white)',
        };
      case 'ghost':
        return {
          bg: 'transparent',
          color: 'var(--ink)',
          border: 'transparent',
          hoverBg: 'rgba(20, 33, 77, 0.08)',
          hoverColor: 'var(--ink)',
        };
      case 'secondary':
      default:
        return {
          bg: 'var(--white)',
          color: 'var(--ink)',
          border: 'var(--ink)',
          hoverBg: 'var(--panel)',
          hoverColor: 'var(--ink)',
        };
    }
  };

  const colors = getColors();

  // Size specifications
  const getSizeStyles = () => {
    switch (size) {
      case 'sm':
        return {
          padding: '2px 8px',
          fontSize: '15px',
          iconSize: 14,
        };
      case 'lg':
        return {
          padding: '8px 24px',
          fontSize: '22px',
          iconSize: 20,
        };
      case 'md':
      default:
        return {
          padding: '6px 16px',
          fontSize: '18px',
          iconSize: 16,
        };
    }
  };

  const sizeStyle = getSizeStyles();

  const isContentFont = font === 'content' || className.includes('font-content');
  const resolvedFontSize = isContentFont
    ? (size === 'sm' ? '13px' : size === 'lg' ? '16px' : '14px')
    : sizeStyle.fontSize;

  return (
    <button
      {...rest}
      disabled={isDisabled}
      aria-disabled={isDisabled}
      onClick={(e) => {
        if (!isDisabled && onClick) {
          onClick(e);
        }
      }}
      className={`pixel-btn ${isContentFont ? 'font-content' : 'font-pixel'} ${isDisabled ? 'px-dither' : 'px-shadow-sm'} ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        backgroundColor: colors.bg,
        color: colors.color,
        border: `2px solid ${colors.border}`,
        borderRadius: 0,
        clipPath:
          size === 'sm'
            ? 'polygon(2px 0, calc(100% - 2px) 0, 100% 2px, 100% calc(100% - 2px), calc(100% - 2px) 100%, 2px 100%, 0 calc(100% - 2px), 0 2px)'
            : 'polygon(3px 0, calc(100% - 3px) 0, 100% 3px, 100% calc(100% - 3px), calc(100% - 3px) 100%, 3px 100%, 0 calc(100% - 3px), 0 3px)',
        fontWeight: isContentFont ? 600 : 400,
        textTransform: isContentFont ? 'none' : 'uppercase',
        letterSpacing: isContentFont ? 'normal' : '0.5px',
        textShadow: 'none',
        WebkitTextStroke: '0px transparent',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        userSelect: 'none',
        lineHeight: 1.2,
        ...sizeStyle,
        fontSize: resolvedFontSize,
        ...style,
      }}
    >
      {loading ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '6px', height: '6px', backgroundColor: 'currentColor', animation: 'px-pulse-step 0.6s steps(2) infinite' }} />
          <span style={{ width: '6px', height: '6px', backgroundColor: 'currentColor', animation: 'px-pulse-step 0.6s steps(2) infinite 0.2s' }} />
          <span style={{ width: '6px', height: '6px', backgroundColor: 'currentColor', animation: 'px-pulse-step 0.6s steps(2) infinite 0.4s' }} />
        </span>
      ) : (
        <>
          {icon && iconPosition === 'left' && <PixelIcon name={icon} size={sizeStyle.iconSize} />}
          <span>{children}</span>
          {icon && iconPosition === 'right' && <PixelIcon name={icon} size={sizeStyle.iconSize} />}
        </>
      )}
    </button>
  );
};

