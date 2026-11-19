import React from 'react';

export interface ApprovedStampProps {
  reviewerName: string;
  approvedAt: string;
  reportHash: string;
}

export const ApprovedStamp: React.FC<ApprovedStampProps> = ({
  reviewerName,
  approvedAt,
  reportHash,
}) => {
  const shortHash = reportHash ? reportHash.slice(0, 10).toUpperCase() : 'N/A';
  const formattedDate = approvedAt
    ? new Date(approvedAt).toLocaleString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  return (
    <div
      className="approved-stamp px-shadow"
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '8px 16px',
        border: '3px double var(--good)',
        outline: '2px solid var(--ink)',
        backgroundColor: 'var(--panel)',
        color: 'var(--good)',
        fontFamily: 'var(--font-pixel)',
        transform: 'rotate(-2deg)',
        userSelect: 'none',
      }}
      aria-label={`Dấu phê duyệt của ${reviewerName}`}
    >
      <div
        style={{
          fontSize: '18px',
          letterSpacing: '2px',
          textTransform: 'uppercase',
          borderBottom: '2px dashed var(--good)',
          paddingBottom: '2px',
          marginBottom: '4px',
        }}
      >
        [ ĐÃ PHÊ DUYỆT ]
      </div>
      <div style={{ fontSize: '11px', color: 'var(--ink)' }}>
        Người duyệt: <strong>{reviewerName}</strong>
      </div>
      <div style={{ fontSize: '10px', color: 'var(--ink-soft)' }}>
        Thời gian (Giờ VN): {formattedDate}
      </div>
      <div style={{ fontSize: '9px', color: 'var(--ink-soft)', letterSpacing: '1px', marginTop: '2px' }}>
        HASH: [{shortHash}]
      </div>
    </div>
  );
};

