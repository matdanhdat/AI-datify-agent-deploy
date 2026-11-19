import React from 'react';
import { ApprovedStamp } from './ApprovedStamp';

export interface PrintHeaderProps {
  appName: string;
  fileName: string;
  dateRange: string;
  symbols: string[];
  reviewerName?: string | null;
  approvedAt?: string | null;
  cleanHash: string;
  reportHash?: string | null;
  isApproved: boolean;
}

export const PrintHeader: React.FC<PrintHeaderProps> = ({
  appName,
  fileName,
  dateRange,
  symbols,
  reviewerName,
  approvedAt,
  cleanHash,
  reportHash,
  isApproved,
}) => {
  return (
    <div className="print-only-header">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1
            style={{
              fontSize: '22px',
              fontFamily: 'var(--font-analysis)',
              fontWeight: 'bold',
              margin: '0 0 6px 0',
              color: '#1A1A1A',
            }}
          >
            BÁO CÁO PHÂN TÍCH DỮ LIỆU GIAO DỊCH
          </h1>
          <div style={{ fontSize: '13px', color: '#555555', marginBottom: '4px' }}>
            Hệ thống: <strong>{appName}</strong> | Tệp nguồn: <strong>{fileName}</strong>
          </div>
          <div style={{ fontSize: '12px', color: '#555555' }}>
            Khoảng thời gian: <strong>{dateRange}</strong> | Danh mục theo dõi: <strong>{symbols.join(', ')}</strong>
          </div>
          <div style={{ fontSize: '11px', color: '#777777', marginTop: '6px' }}>
            Mã băm dữ liệu sạch: <code>{cleanHash ? cleanHash.slice(0, 16) : 'N/A'}...</code>
            {reportHash && (
              <> | Mã băm báo cáo: <code>{reportHash.slice(0, 16)}...</code></>
            )}
          </div>
        </div>

        {isApproved && reviewerName && approvedAt && reportHash && (
          <div>
            <ApprovedStamp
              reviewerName={reviewerName}
              approvedAt={approvedAt}
              reportHash={reportHash}
            />
          </div>
        )}
      </div>
    </div>
  );
};

