import React from 'react';

export interface Column<T> {
  key: string;
  header: string;
  align?: 'left' | 'center' | 'right';
  width?: string;
  render?: (item: T, index: number) => React.ReactNode;
}

export interface PixelTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor?: (item: T, index: number) => string | number;
  emptyMessage?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function PixelTable<T extends Record<string, any>>({
  columns,
  data,
  keyExtractor,
  emptyMessage = 'Không có dữ liệu hiển thị.',
  className = '',
  style = {},
}: PixelTableProps<T>) {
  return (
    <div
      className={`pixel-table-container px-shadow-sm ${className}`}
      style={{
        border: '2px solid var(--ink)',
        backgroundColor: 'var(--white)',
        overflowX: 'auto',
        ...style,
      }}
    >
      <table
        className="font-content"
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '13px',
          textAlign: 'left',
        }}
      >
        <thead>
          <tr
            style={{
              backgroundColor: 'var(--ink)',
              color: 'var(--white)',
            }}
          >
            {columns.map((col) => (
              <th
                key={col.key}
                className="font-pixel"
                style={{
                  padding: '8px 12px',
                  textAlign: col.align || 'left',
                  width: col.width,
                  fontSize: '16px',
                  fontWeight: 'normal',
                  letterSpacing: '0.5px',
                  borderRight: '1px solid rgba(255, 255, 255, 0.2)',
                  whiteSpace: 'nowrap',
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                style={{
                  padding: '24px',
                  textAlign: 'center',
                  color: 'var(--ink-soft)',
                  fontStyle: 'italic',
                }}
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((item, rowIdx) => {
              const key = keyExtractor ? keyExtractor(item, rowIdx) : rowIdx;
              const isEven = rowIdx % 2 === 0;

              return (
                <tr
                  key={key}
                  style={{
                    backgroundColor: isEven ? 'var(--white)' : 'var(--panel)',
                    borderBottom: '1px solid var(--chart-grid)',
                  }}
                >
                  {columns.map((col) => {
                    const value = item[col.key];
                    const isNumeric = typeof value === 'number' || (typeof value === 'string' && /^-?\d+(\.\d+)?%?$/.test(value.trim()));
                    const align = col.align || (isNumeric ? 'right' : 'left');

                    return (
                      <td
                        key={col.key}
                        style={{
                          padding: '8px 12px',
                          textAlign: align,
                          borderRight: '1px solid var(--chart-grid)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {col.render ? col.render(item, rowIdx) : (value ?? '-')}
                      </td>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

