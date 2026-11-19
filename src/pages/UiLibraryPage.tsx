import React, { useState } from 'react';
import { ConfirmDialog, PixelModal } from '../components/pixel/PixelModal';
import { PixelBadge } from '../components/pixel/PixelBadge';
import { PixelButton } from '../components/pixel/PixelButton';
import { PixelCheckbox, PixelRadio, PixelSwitch } from '../components/pixel/PixelFormControls';
import { PixelIcon } from '../components/pixel/PixelIcon';
import { PixelInput } from '../components/pixel/PixelInput';
import { PixelPanel } from '../components/pixel/PixelPanel';
import { PixelProgress, PixelTabs } from '../components/pixel/PixelProgressAndTabs';
import { PixelSelect } from '../components/pixel/PixelSelect';
import { PixelSprite, type MascotMood } from '../components/pixel/PixelSprite';
import { EmptyState, ErrorState, LoadingState, SuccessState } from '../components/pixel/PixelStates';
import { PixelTable } from '../components/pixel/PixelTable';
import { PixelTextarea } from '../components/pixel/PixelTextarea';
import { useToast } from '../components/pixel/PixelToast';
import { PixelTooltip } from '../components/pixel/PixelTooltip';
import { ExcelCard } from '../components/pixel/ExcelCard';
import type { IconName } from '../components/pixel/icons';

const ALL_ICONS: IconName[] = [
  'home', 'upload', 'pulse', 'checklist', 'chart', 'clean', 'shield-check', 'report',
  'clock', 'gear', 'lock', 'check', 'cross', 'warning', 'info', 'chat',
  'trash', 'plus', 'arrow-right', 'file', 'folder', 'robot-head', 'magnifier',
  'download', 'refresh', 'eye',
];

const MASCOT_MOODS: MascotMood[] = ['idle', 'thinking', 'working', 'success', 'error', 'search'];

export const UiLibraryPage: React.FC = () => {
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState('components');
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [switchVal, setSwitchVal] = useState(true);
  const [checkboxVal, setCheckboxVal] = useState(true);
  const [radioVal, setRadioVal] = useState<'a' | 'b'>('a');

  // Contrast ratios table data
  const contrastPairs = [
    { pair: 'Ink trên White (Nền trắng)', fg: '#14214D', bg: '#FFFFFF', ratio: '15.50:1', normal: 'ĐẠT (AAA)', large: 'ĐẠT (AAA)' },
    { pair: 'Ink trên Panel (Nền khung)', fg: '#14214D', bg: '#EAF0F6', ratio: '13.51:1', normal: 'ĐẠT (AAA)', large: 'ĐẠT (AAA)' },
    { pair: 'Ink trên Bg (Nền trời)', fg: '#14214D', bg: '#CFE6F7', ratio: '12.05:1', normal: 'ĐẠT (AAA)', large: 'ĐẠT (AAA)' },
    { pair: 'Ink-soft trên White', fg: '#3C4A78', bg: '#FFFFFF', ratio: '8.60:1', normal: 'ĐẠT (AAA)', large: 'ĐẠT (AAA)' },
    { pair: 'Ink trên Warn (Nền vàng)', fg: '#14214D', bg: '#F5A524', ratio: '7.60:1', normal: 'ĐẠT (AAA)', large: 'ĐẠT (AAA)' },
    { pair: 'White trên Accent-d (Hover)', fg: '#FFFFFF', bg: '#B8470F', ratio: '5.32:1', normal: 'ĐẠT (AA)', large: 'ĐẠT (AAA)' },
    { pair: 'Ink trên Accent (--accent-text)', fg: '#14214D', bg: '#F26B21', ratio: '5.09:1', normal: 'ĐẠT (AA)', large: 'ĐẠT (AAA)' },
    { pair: 'White trên Bad (Nền đỏ)', fg: '#FFFFFF', bg: '#D93025', ratio: '4.77:1', normal: 'ĐẠT (AA)', large: 'ĐẠT (AAA)' },
    { pair: 'White trên Blue (Nền xanh)', fg: '#FFFFFF', bg: '#3B7BD1', ratio: '4.25:1', normal: 'Cỡ lớn đạt', large: 'ĐẠT (AA)' },
    { pair: 'White trên Accent (Nút cam thường)', fg: '#FFFFFF', bg: '#F26B21', ratio: '3.04:1', normal: 'Chưa đạt', large: 'ĐẠT (AA)' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
      {/* Header */}
      <div>
        <PixelBadge variant="info" icon="gear" size="md">
          Design System & UI Kit
        </PixelBadge>
        <h1 className="font-pixel" style={{ fontSize: '36px', color: 'var(--ink)', marginTop: 'var(--space-2)' }}>
          THƯ VIỆN LINH KIỆN PIXEL ART (UI KIT)
        </h1>
        <p className="font-content" style={{ color: 'var(--ink-soft)', marginTop: '4px' }}>
          Trang kiểm định toàn diện màu sắc, phông chữ tiếng Việt, linh kiện, biểu tượng và tương thích hiển thị.
        </p>
      </div>

      {/* Tabs */}
      <PixelTabs
        tabs={[
          { id: 'components', label: 'Linh kiện & Nút bấm' },
          { id: 'typography', label: 'Phông chữ & Bảng màu' },
          { id: 'icons', label: 'Biểu tượng & Linh vật' },
          { id: 'excel-analysis', label: 'ExcelCard & AI Text' },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {/* TAB 1: COMPONENTS */}
      {activeTab === 'components' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          {/* Buttons Showcase */}
          <PixelPanel title="NÚT BẤM (PIXEL BUTTON)">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
                <PixelButton variant="primary" icon="arrow-right">Primary (Cam)</PixelButton>
                <PixelButton variant="secondary" icon="check">Secondary (Trắng)</PixelButton>
                <PixelButton variant="danger" icon="warning">Danger (Đỏ)</PixelButton>
                <PixelButton variant="ghost">Ghost Button</PixelButton>
                <PixelButton variant="primary" loading>Loading</PixelButton>
                <PixelButton variant="primary" disabled>Disabled</PixelButton>
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
                <PixelButton size="sm" variant="secondary">Cỡ Nhỏ (sm)</PixelButton>
                <PixelButton size="md" variant="secondary">Cỡ Vừa (md)</PixelButton>
                <PixelButton size="lg" variant="secondary">Cỡ Lớn (lg)</PixelButton>
              </div>
            </div>
          </PixelPanel>

          {/* Form Controls */}
          <PixelPanel title="Ô NHẬP LIỆU (INPUTS & FORM CONTROLS)">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-4)' }}>
              <PixelInput label="Mã cổ phiếu" placeholder="Nhập mã (ví dụ: TMA)" hint="Nhập tối đa 10 mã" />
              <PixelInput label="Giá đóng cửa (Có lỗi)" value="abc" error="Giá trị không phải số hợp lệ" />
              <PixelSelect
                label="Chọn sàn niêm yết"
                options={[
                  { value: 'HOSE', label: 'HOSE - Sở GDCK TP.HCM' },
                  { value: 'HNX', label: 'HNX - Sở GDCK Hà Nội' },
                  { value: 'UPCOM', label: 'UPCOM - Thị trường đăng ký' },
                ]}
              />
              <PixelTextarea label="Ghi chú nhận định" placeholder="Nhập tóm tắt..." />
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-6)', marginTop: 'var(--space-4)', flexWrap: 'wrap' }}>
              <PixelSwitch checked={switchVal} onChange={setSwitchVal} label="Chế độ nghiêm ngặt (Switch)" />
              <PixelCheckbox checked={checkboxVal} onChange={setCheckboxVal} label="Tự động sửa lỗi (Checkbox)" />
              <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                <PixelRadio checked={radioVal === 'a'} onChange={() => setRadioVal('a')} label="Tùy chọn A" />
                <PixelRadio checked={radioVal === 'b'} onChange={() => setRadioVal('b')} label="Tùy chọn B" />
              </div>
            </div>
          </PixelPanel>

          {/* Feedback & Modals */}
          <PixelPanel title="PHẢN HỒI: BADGE, TOAST, MODAL & TOOLTIP">
            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
              <PixelBadge variant="success" icon="check">Thành công</PixelBadge>
              <PixelBadge variant="warn" icon="warning">Cảnh báo</PixelBadge>
              <PixelBadge variant="danger" icon="cross">Nguy hiểm</PixelBadge>
              <PixelBadge variant="info" icon="info">Thông tin</PixelBadge>
              <PixelBadge variant="neutral">Trung tính</PixelBadge>
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <PixelButton
                variant="secondary"
                icon="chat"
                onClick={() => showToast({ type: 'success', title: 'Thành công', message: 'Tệp dữ liệu đã nạp hợp lệ!' })}
              >
                Toast Thành công (5s)
              </PixelButton>

              <PixelButton
                variant="danger"
                icon="warning"
                onClick={() => showToast({ type: 'error', title: 'Lỗi nạp file', message: 'Tệp vượt quá 10MB tối đa.' })}
              >
                Toast Lỗi (8s)
              </PixelButton>

              <PixelButton variant="primary" onClick={() => setModalOpen(true)}>
                Mở PixelModal
              </PixelButton>

              <PixelButton variant="danger" onClick={() => setConfirmOpen(true)}>
                Mở ConfirmDialog
              </PixelButton>

              <PixelTooltip content="Đây là Pixel Tooltip chuẩn mực!" position="top">
                <PixelButton variant="secondary">Rê chuột hoặc Focus vào đây</PixelButton>
              </PixelTooltip>
            </div>

            <div style={{ marginTop: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>Thanh tiến trình pixel (PixelProgress):</div>
              <PixelProgress value={65} color="var(--good)" />
              <PixelProgress color="var(--accent)" />
            </div>
          </PixelPanel>

          {/* State Indicators */}
          <PixelPanel title="TRẠNG THÁI HỆ THỐNG (EMPTY, LOADING, ERROR, SUCCESS)">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 'var(--space-4)' }}>
              <EmptyState message="Chưa có dữ liệu giao dịch." actionLabel="Tải lên ngay" onAction={() => {}} />
              <LoadingState message="Đang xử lý thuật toán..." />
              <ErrorState message="Không thể kết nối đến nguồn dữ liệu." retryLabel="Thử lại" onRetry={() => {}} />
              <SuccessState message="Toàn bộ chỉ số đã sẵn sàng." actionLabel="Xem báo cáo" onAction={() => {}} />
            </div>
          </PixelPanel>
        </div>
      )}

      {/* TAB 2: TYPOGRAPHY & COLORS */}
      {activeTab === 'typography' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          {/* Vietnamese Font Proofing (Section 4.2) */}
          <PixelPanel title="KIỂM TRA DẤU TIẾNG VIỆT (PHÔNG CHỮ PIXEL VT323 & BE VIETNAM PRO)">
            <div style={{ backgroundColor: 'var(--white)', padding: 'var(--space-4)', border: '2px solid var(--ink)' }}>
              <div style={{ color: 'var(--ink-soft)', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                CHUỖI THỬ BẮT BUỘC THEO ĐẶC TẢ MỤC 4.2:
              </div>
              <div className="font-pixel" style={{ fontSize: '28px', color: 'var(--ink)', lineHeight: 1.3 }}>
                Hiệu suất · Phân tích · Duyệt · Nạp dữ liệu · Đồng ý · Thể hiện · Quyết định · Ưu tiên
              </div>
              <div className="font-pixel" style={{ fontSize: '22px', color: 'var(--accent-d)', marginTop: '6px' }}>
                ÀÁẢÃẠ ĂẰẮẲẴẶ ÂẦẤẨẪẬ Đ ÈÉẺẼẸ ÊỀẾỂỄỆ ÌÍỈĨỊ ÒÓỎÕỌ ÔỒỐỔỖỘ ƠỜỚỞỠỢ ÙÚỦŨỤ ƯỪỨỬỮỰ ỲÝỶỸỴ
              </div>
              <div className="font-content" style={{ fontSize: '15px', color: 'var(--ink)', marginTop: '12px' }}>
                <strong>Font nội dung (Be Vietnam Pro):</strong> Hệ thống AI Agent phân tích dữ liệu giao dịch chứng khoán, tự động kiểm tra cấu hình, làm sạch dữ liệu khuyết thiếu và đối chiếu nhận định.
              </div>
            </div>
          </PixelPanel>

          {/* Color Palette & Contrast Ratios */}
          <PixelPanel title="BẢNG MÀU & TỶ LỆ TƯƠNG PHẢN (WCAG 2.1 CONFORMANCE)">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
              <div style={{ backgroundColor: '#CFE6F7', padding: '10px', border: '2px solid var(--ink)', textAlign: 'center' }}>
                <span className="font-pixel" style={{ fontSize: '16px' }}>--bg</span>
                <div style={{ fontSize: '11px' }}>#CFE6F7</div>
              </div>
              <div style={{ backgroundColor: '#EAF0F6', padding: '10px', border: '2px solid var(--ink)', textAlign: 'center' }}>
                <span className="font-pixel" style={{ fontSize: '16px' }}>--panel</span>
                <div style={{ fontSize: '11px' }}>#EAF0F6</div>
              </div>
              <div style={{ backgroundColor: '#14214D', color: '#FFF', padding: '10px', border: '2px solid var(--ink)', textAlign: 'center' }}>
                <span className="font-pixel" style={{ fontSize: '16px' }}>--ink</span>
                <div style={{ fontSize: '11px' }}>#14214D</div>
              </div>
              <div style={{ backgroundColor: '#F26B21', color: 'var(--accent-text)', padding: '10px', border: '2px solid var(--ink)', textAlign: 'center' }}>
                <span className="font-pixel" style={{ fontSize: '16px' }}>--accent</span>
                <div style={{ fontSize: '11px' }}>#F26B21</div>
              </div>
              <div style={{ backgroundColor: '#3B7BD1', color: '#FFF', padding: '10px', border: '2px solid var(--ink)', textAlign: 'center' }}>
                <span className="font-pixel" style={{ fontSize: '16px' }}>--blue</span>
                <div style={{ fontSize: '11px' }}>#3B7BD1</div>
              </div>
              <div style={{ backgroundColor: '#1E9E4A', color: '#FFF', padding: '10px', border: '2px solid var(--ink)', textAlign: 'center' }}>
                <span className="font-pixel" style={{ fontSize: '16px' }}>--good</span>
                <div style={{ fontSize: '11px' }}>#1E9E4A</div>
              </div>
              <div style={{ backgroundColor: '#D93025', color: '#FFF', padding: '10px', border: '2px solid var(--ink)', textAlign: 'center' }}>
                <span className="font-pixel" style={{ fontSize: '16px' }}>--bad</span>
                <div style={{ fontSize: '11px' }}>#D93025</div>
              </div>
              <div style={{ backgroundColor: '#F5A524', color: 'var(--warn-text)', padding: '10px', border: '2px solid var(--ink)', textAlign: 'center' }}>
                <span className="font-pixel" style={{ fontSize: '16px' }}>--warn</span>
                <div style={{ fontSize: '11px' }}>#F5A524</div>
              </div>
            </div>

            <PixelTable
              columns={[
                { key: 'pair', header: 'Cặp màu chữ / nền' },
                { key: 'ratio', header: 'Tỷ lệ tương phản', align: 'center' },
                { key: 'normal', header: 'Chữ thường (≥ 4.5:1)', align: 'center' },
                { key: 'large', header: 'Chữ lớn đậm (≥ 3:1)', align: 'center' },
              ]}
              data={contrastPairs}
              keyExtractor={(r) => r.pair}
            />
          </PixelPanel>
        </div>
      )}

      {/* TAB 3: ICONS & MASCOT */}
      {activeTab === 'icons' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          {/* All 26 Icons Showcase */}
          <PixelPanel title="TOÀN BỘ 26 BIỂU TƯỢNG PIXEL (CỠ 1× VÀ 2×)">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 'var(--space-3)' }}>
              {ALL_ICONS.map((icon) => (
                <div
                  key={icon}
                  style={{
                    backgroundColor: 'var(--white)',
                    border: '1px solid var(--chart-grid)',
                    padding: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <PixelIcon name={icon} size={16} />
                    <PixelIcon name={icon} size={32} />
                  </div>
                  <span className="font-pixel" style={{ fontSize: '13px', color: 'var(--ink)' }}>
                    {icon}
                  </span>
                </div>
              ))}
            </div>
          </PixelPanel>

          {/* Robot Mascot Moods */}
          <PixelPanel title="LINH VẬT ROBOT TRADING (TÂM TRẠNG & HOẠT ẢNH STEPS)">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--space-4)' }}>
              {MASCOT_MOODS.map((mood) => (
                <div
                  key={mood}
                  style={{
                    backgroundColor: 'var(--white)',
                    border: '2px solid var(--ink)',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <PixelSprite mood={mood} size={64} />
                  <span className="font-pixel" style={{ fontSize: '18px', textTransform: 'uppercase', color: 'var(--ink)' }}>
                    {mood}
                  </span>
                </div>
              ))}
            </div>
          </PixelPanel>
        </div>
      )}

      {/* TAB 4: EXCEL CARD & AI NARRATIVE TEXT */}
      {activeTab === 'excel-analysis' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          {/* Section 7.6: ExcelCard Demo */}
          <div>
            <h3 className="font-pixel" style={{ fontSize: '22px', marginBottom: 'var(--space-2)' }}>
              KHUNG BIỂU ĐỒ & THẺ KPI EXCEL (EXCELCARD - MỤC 7.6)
            </h3>
            <p className="font-content" style={{ fontSize: '13px', color: 'var(--ink-soft)', marginBottom: 'var(--space-4)' }}>
              Vỏ bọc ngoài mang phong cách Pixel Art, bên trong hiển thị sạch sẽ theo chuẩn Microsoft Excel với phông chữ Calibri/Arial.
            </p>

            <ExcelCard
              title="LỢI SUẤT THEO KỲ & ĐƯỜNG GIÁ ĐÓNG CỬA (VÍ DỤ)"
              subtitle="Dữ liệu mẫu mã cổ phiếu TMA - Kỳ quan sát 252 phiên"
              onViewTable={() => showToast({ type: 'info', message: 'Mở bảng số liệu thô' })}
              onDownloadPng={() => showToast({ type: 'info', message: 'Tải biểu đồ PNG' })}
            >
              {/* Fake SVG line chart demonstrating Excel clean lines inside */}
              <div style={{ padding: '16px 0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                  <div style={{ border: '1px solid var(--chart-grid)', padding: '10px', backgroundColor: '#F8F9FA' }}>
                    <div style={{ fontSize: '12px', color: 'var(--chart-text)' }}>Lợi suất cả kỳ:</div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--excel-blue)' }}>+24,56%</div>
                  </div>
                  <div style={{ border: '1px solid var(--chart-grid)', padding: '10px', backgroundColor: '#F8F9FA' }}>
                    <div style={{ fontSize: '12px', color: 'var(--chart-text)' }}>Độ biến động năm:</div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--excel-orange)' }}>18,20%</div>
                  </div>
                  <div style={{ border: '1px solid var(--chart-grid)', padding: '10px', backgroundColor: '#F8F9FA' }}>
                    <div style={{ fontSize: '12px', color: 'var(--chart-text)' }}>Sụt giảm tối đa (Max Drawdown):</div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--bad)' }}>-11,40%</div>
                  </div>
                </div>

                <svg viewBox="0 0 500 120" width="100%" height="120" style={{ backgroundColor: '#FFFFFF', border: '1px solid var(--chart-grid)' }}>
                  <line x1="40" y1="20" x2="480" y2="20" stroke="var(--chart-grid)" strokeDasharray="3,3" />
                  <line x1="40" y1="60" x2="480" y2="60" stroke="var(--chart-grid)" strokeDasharray="3,3" />
                  <line x1="40" y1="100" x2="480" y2="100" stroke="var(--chart-grid)" />
                  <polyline
                    fill="none"
                    stroke="var(--excel-blue)"
                    strokeWidth="2.5"
                    points="40,90 90,80 140,85 190,50 240,60 290,40 340,45 390,30 440,35 480,25"
                  />
                </svg>
              </div>
            </ExcelCard>
          </div>

          {/* Section 7.7: .analysis-text Demo */}
          <PixelPanel title="ĐOẠN NHẬN ĐỊNH AI MẪU (.ANALYSIS-TEXT - MỤC 7.7)">
            <div className="analysis-text" style={{ backgroundColor: 'var(--white)', padding: 'var(--space-6)', border: '1px solid var(--chart-grid)' }}>
              <h2>ĐÁNH GIÁ XU HƯỚNG GIAO DỊCH VÀ KHUYẾN NGHỊ</h2>
              <p>
                Dữ liệu giao dịch ghi nhận mức tăng trưởng giá đóng cửa tích cực trong suốt chu kỳ 252 phiên quan sát.
                Lợi suất cả kỳ đạt <strong>24,56%</strong>, vượt trội so với mức trung bình ngành.
                Độ lệch chuẩn tỷ suất sinh lợi duy trì ở mức <strong>18,20%</strong> phản ánh biên độ dao động trong tầm kiểm soát.
              </p>
              <h3>Phân tích khối lượng và rủi ro sụt giảm</h3>
              <p>
                Đợt điều chỉnh lớn nhất diễn ra vào giữa chu kỳ với mức sụt giảm tối đa <strong>-11,40%</strong>,
                tuy nhiên lực cầu bắt đáy quanh vùng hỗ trợ kỹ thuật đã nhanh chóng phục hồi thanh khoản khớp lệnh.
                Mọi nhận định trên đã được đối chiếu trùng khớp 100% với số liệu định lượng do code Python tính toán.
              </p>
            </div>
          </PixelPanel>
        </div>
      )}

      {/* Demo Modal */}
      <PixelModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Cửa sổ thông tin PixelModal"
        actions={
          <PixelButton variant="primary" onClick={() => setModalOpen(false)}>
            Đồng ý đóng
          </PixelButton>
        }
      >
        <p className="font-content">
          Đây là cửa sổ hộp thoại PixelModal hỗ trợ bẫy tiêu điểm bàn phím (Focus Trap), phím Escape để đóng,
          và phục hồi vị trí con trỏ khi đóng cửa sổ.
        </p>
      </PixelModal>

      {/* Demo Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmOpen}
        title="Xác nhận thao tác nguy hiểm"
        message="Hành động này sẽ thực hiện thao tác có tính phá hủy. Bạn có chắc chắn muốn tiếp tục không?"
        onConfirm={() => {
          setConfirmOpen(false);
          showToast({ type: 'warn', message: 'Đã xác nhận hành động nguy hiểm.' });
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
};
