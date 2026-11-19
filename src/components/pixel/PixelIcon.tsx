import React, { useMemo } from 'react';
import { COLOR_MAP, ICON_MATRICES, type IconName } from './icons';

export interface PixelIconProps {
  name: IconName;
  size?: number; // multiple of 16 (default: 16)
  color?: string; // override main '#' color if provided
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}

export const PixelIcon: React.FC<PixelIconProps> = ({
  name,
  size = 16,
  color,
  className = '',
  style = {},
  title,
}) => {
  const matrix = ICON_MATRICES[name] || ICON_MATRICES.info;

  // Pre-generate rectangles for crisp SVG rendering
  const rects = useMemo(() => {
    const elements: React.ReactNode[] = [];
    for (let y = 0; y < 16; y++) {
      const row = matrix[y] || '................';
      for (let x = 0; x < 16; x++) {
        const char = row[x] || '.';
        if (char !== '.') {
          const fill = (char === '#' && color) ? color : (COLOR_MAP[char] || 'currentColor');
          elements.push(
            <rect
              key={`${x}-${y}`}
              x={x}
              y={y}
              width={1}
              height={1}
              fill={fill}
            />
          );
        }
      }
    }
    return elements;
  }, [matrix, color]);

  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={`pixel-icon ${className}`}
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        flexShrink: 0,
        ...style,
      }}
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
    >
      {title && <title>{title}</title>}
      {rects}
    </svg>
  );
};

