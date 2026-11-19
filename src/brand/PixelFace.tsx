import React from 'react';

export interface PixelFaceProps {
  rows: string[];
  palette: Record<string, string>;
  px?: number; // pixel unit size in px (default 6)
  className?: string;
  style?: React.CSSProperties;
  antenna?: boolean; // Renders 2x1 antenna block on top
  'aria-hidden'?: boolean | 'true' | 'false';
  role?: string;
}

interface SpanRect {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

export const PixelFace: React.FC<PixelFaceProps> = ({
  rows,
  palette,
  px = 6,
  className = '',
  style = {},
  antenna = false,
  'aria-hidden': ariaHidden = true,
  role = 'img',
}) => {
  const rowCount = rows.length;
  const colCount = rows[0]?.length || 8;

  // If antenna is rendered, we add extra rows on top: 1 row for antenna stem (k), 1 row for orange light (o)
  const extraTopRows = antenna ? 2 : 0;
  const totalWidth = colCount * px;
  const totalHeight = (rowCount + extraTopRows) * px;

  const rects: SpanRect[] = [];

  // 1. Antenna rendering if requested
  if (antenna) {
    const lightColor = palette.o || '#F26B21';
    const stemColor = palette.k || '#14214D';
    // Row 0: Antenna light (2x1 at cols 3, 4)
    rects.push({
      x: 3 * px,
      y: 0,
      width: 2 * px,
      height: px,
      color: lightColor,
    });
    // Row 1: Antenna stem (2x1 at cols 3, 4)
    rects.push({
      x: 3 * px,
      y: px,
      width: 2 * px,
      height: px,
      color: stemColor,
    });
  }

  // 2. Face rows rendering with contiguous run merge
  for (let r = 0; r < rowCount; r++) {
    const rowStr = rows[r];
    const y = (r + extraTopRows) * px;

    let c = 0;
    while (c < rowStr.length) {
      const char = rowStr[c];
      const color = palette[char] || '#000000';
      let runLength = 1;

      while (c + runLength < rowStr.length && rowStr[c + runLength] === char) {
        runLength++;
      }

      rects.push({
        x: c * px,
        y,
        width: runLength * px,
        height: px,
        color,
      });

      c += runLength;
    }
  }

  return (
    <svg
      width={totalWidth}
      height={totalHeight}
      viewBox={`0 0 ${totalWidth} ${totalHeight}`}
      xmlns="http://www.w3.org/2000/svg"
      shapeRendering="crispEdges"
      className={className}
      style={{ display: 'inline-block', verticalAlign: 'middle', ...style }}
      aria-hidden={ariaHidden}
      role={role}
    >
      {rects.map((r, i) => (
        <rect
          key={i}
          x={r.x}
          y={r.y}
          width={r.width}
          height={r.height}
          fill={r.color}
        />
      ))}
    </svg>
  );
};
