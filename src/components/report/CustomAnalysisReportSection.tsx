/**
 * Custom Analysis Section for ReportPage (Prompt P6 Section 9.3).
 * Renders custom workflows executed in the session.
 * Displays executed steps, result tables, Excel-style charts, and system summary lines.
 */

import React from 'react';
import { PixelPanel } from '../pixel/PixelPanel';
import { PixelBadge } from '../pixel/PixelBadge';
import { PixelChart } from '../charts/PixelChart';
import { getCustomResults } from '../../services/readers';
import type { PlanResult } from '../../core/schemas';

interface CustomAnalysisReportSectionProps {
  sessionId: string;
}

export const CustomAnalysisReportSection: React.FC<CustomAnalysisReportSectionProps> = ({ sessionId }) => {
  let customResults: PlanResult[] = getCustomResults(sessionId);

  if (typeof window !== 'undefined' && (!customResults || customResults.length === 0)) {
    const search = new URLSearchParams(window.location.search);
    if (search.get('demoCustom') === '1' || search.get('sample') === '1') {
      customResults = [
        {
          id: 'custom_demo_vol',
          title_vi: 'So sánh khối lượng giao dịch trung bình giữa các mã',
          steps_text: [
            'Gom nhóm theo mã và tính trung bình khối lượng',
            'Sắp xếp giảm dần theo khối lượng trung bình',
            'Đóng gói bảng kết quả',
          ],
          tables: [
            {
              id: 'demo_tbl',
              title_vi: 'Bảng khối lượng giao dịch trung bình',
              columns: ['Mã', 'Khối lượng TB (cp)'],
              rows: [
                ['TMA', 1245800],
                ['TMB', 985400],
                ['TMC', 654100],
              ],
            },
          ],
          charts: [],
          summary_lines: [
            'Đã hoàn tất tính toán qua 3 bước: gom nhóm theo mã và tính trung bình khối lượng, sắp xếp giảm dần, và xuất bảng tổng hợp.',
          ],
          created_at: '2026-11-15T04:00:00Z',
        },
      ];
    }
  }

  if (!customResults || customResults.length === 0) {
    return null;
  }

  return (
    <div id="custom-analysis" style={{ marginBottom: 'var(--space-6)' }} className="print-section">
      <PixelPanel
        title="PHÂN TÍCH RIÊNG (DÙNG MỘT LẦN)"
        headerAction={
          <PixelBadge variant="info">
            Phân tích riêng, không thuộc quy trình chuẩn
          </PixelBadge>
        }
      >
        <div style={{ padding: 'var(--space-4)' }}>
          <p style={{ margin: '0 0 var(--space-4)', fontSize: '13px', color: 'var(--ink-soft)' }}>
            Mục này tổng hợp các phân tích riêng do người dùng yêu cầu và đã được phê duyệt thực thi trong phiên.
            Tất cả các phép tính được thực thi trực tiếp bằng mã nguồn định lượng nội bộ trong trình duyệt.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            {customResults.map((item, idx) => (
              <div
                key={item.id || idx}
                style={{
                  border: '1px solid var(--chart-grid)',
                  backgroundColor: 'var(--panel)',
                  padding: 'var(--space-4)',
                }}
              >
                {/* Workflow Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                  <h4 style={{ margin: 0, fontSize: '15px', color: 'var(--ink)' }}>
                    {idx + 1}. {item.title_vi}
                  </h4>
                  <span style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
                    Mã quy trình: {item.id}
                  </span>
                </div>

                {/* Executed Steps List */}
                <div
                  style={{
                    backgroundColor: 'var(--chart-bg)',
                    border: '1px solid var(--chart-grid)',
                    padding: 'var(--space-3)',
                    marginBottom: 'var(--space-4)',
                    fontSize: '12px',
                  }}
                >
                  <strong style={{ display: 'block', marginBottom: '6px', color: 'var(--ink)' }}>
                    Các bước đã thực thi:
                  </strong>
                  <ul style={{ margin: 0, paddingLeft: '20px', color: 'var(--ink-soft)' }}>
                    {item.steps_text.map((stepText, sIdx) => (
                      <li key={sIdx} style={{ marginBottom: '2px' }}>
                        {stepText}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Result Tables */}
                {item.tables && item.tables.length > 0 && (
                  <div style={{ marginBottom: 'var(--space-4)' }}>
                    {item.tables.map((tbl) => (
                      <div key={tbl.id} style={{ marginBottom: 'var(--space-3)' }}>
                        <div style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--ink)', marginBottom: '6px' }}>
                          {tbl.title_vi}
                        </div>
                        <div style={{ overflowX: 'auto', border: '1px solid var(--chart-grid)' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', fontFamily: 'var(--font-excel)' }}>
                            <thead>
                              <tr style={{ backgroundColor: 'var(--ink)', color: 'var(--white)' }}>
                                {tbl.columns.map((col, cIdx) => (
                                  <th
                                    key={cIdx}
                                    style={{
                                      padding: '6px 10px',
                                      textAlign: cIdx === 0 ? 'left' : 'right',
                                      border: '1px solid var(--chart-grid)',
                                      fontWeight: 'bold',
                                    }}
                                  >
                                    {col}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {tbl.rows.map((row, rIdx) => (
                                <tr
                                  key={rIdx}
                                  style={{
                                    backgroundColor: rIdx % 2 === 0 ? 'var(--chart-bg)' : 'var(--panel)',
                                  }}
                                >
                                  {tbl.columns.map((col, cIdx) => {
                                    const val = Array.isArray(row) ? row[cIdx] : (row as any)[col];
                                    return (
                                      <td
                                        key={cIdx}
                                        style={{
                                          padding: '5px 10px',
                                          textAlign: cIdx === 0 ? 'left' : 'right',
                                          border: '1px solid var(--chart-grid)',
                                          color: 'var(--ink)',
                                        }}
                                      >
                                        {val !== undefined && val !== null ? String(val) : '-'}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Result Charts */}
                {item.charts && item.charts.length > 0 && (
                  <div style={{ marginBottom: 'var(--space-4)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: item.charts.length > 1 ? '1fr 1fr' : '1fr', gap: 'var(--space-4)' }}>
                      {item.charts.map((chartSpec) => (
                        <div key={chartSpec.id} style={{ height: '360px' }}>
                          <PixelChart spec={chartSpec} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Summary Lines */}
                {item.summary_lines && item.summary_lines.length > 0 && (
                  <div
                    style={{
                      padding: 'var(--space-3)',
                      backgroundColor: 'rgba(51, 122, 183, 0.08)',
                      borderLeft: '4px solid var(--blue)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <PixelBadge variant="info">Tóm tắt do hệ thống tạo</PixelBadge>
                    </div>
                    {item.summary_lines.map((line, lIdx) => (
                      <p key={lIdx} style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--ink)', lineHeight: '1.4' }}>
                        {line}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </PixelPanel>
    </div>
  );
};
