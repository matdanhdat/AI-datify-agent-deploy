import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PixelButton } from '../components/pixel/PixelButton';
import { PixelIcon } from '../components/pixel/PixelIcon';
import { PixelPanel } from '../components/pixel/PixelPanel';
import { useSession } from '../hooks/useSession';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { session, createNewSession } = useSession();

  const handleStart = async () => {
    if (!session) {
      await createNewSession();
    }
    navigate('/nap-du-lieu');
  };

  const scrollToWorkflow = () => {
    const el = document.getElementById('workflow-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="home-container" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
      {/* Hero Section: Left Text + Right SVG Pixel Art Landscape */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
          gap: 'var(--space-6)',
          alignItems: 'center',
        }}
      >
        {/* Left: Headlines & Value Propositions */}
        <div>
          {/* Badge nhỏ phía trên */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              backgroundColor: 'var(--white)',
              border: '2px solid var(--ink)',
              borderRadius: 0,
              boxShadow: '2px 2px 0 var(--ink)',
              fontFamily: 'var(--font-pixel)',
              fontSize: '15px',
              color: 'var(--ink)',
              letterSpacing: '0.5px',
              textTransform: 'uppercase',
            }}
          >
            DATIFY AI AGENT DASHBOARD
          </div>

          {/* Khẩu hiệu 2 dòng với đổ bóng khối 3D rõ nét, dấu thanh chuẩn 100% */}
          <h1
            className="font-pixel"
            style={{
              fontSize: 'clamp(52px, 5.5vw, 76px)',
              lineHeight: 1.2,
              paddingTop: '8px',
              marginTop: 'var(--space-4)',
              marginBottom: 0,
              letterSpacing: '1px',
            }}
          >
            <span
              style={{
                display: 'block',
                color: '#E8431B',
                textShadow: '2px 2px 0 #8A1F0B, 4px 4px 0 #8A1F0B',
              }}
            >
              SỐ LIỆU ĐÁNG TIN,
            </span>
            <span
              style={{
                display: 'block',
                color: '#2F6FD0',
                marginTop: '6px',
                textShadow: '2px 2px 0 #14316B, 4px 4px 0 #14316B',
              }}
            >
              AGENT CHÍNH XÁC
            </span>
          </h1>

          {/* Đoạn mô tả chính xác */}
          <p
            className="font-content"
            style={{
              fontSize: '15px',
              color: 'var(--ink-soft)',
              lineHeight: 1.6,
              marginTop: 'var(--space-4)',
              maxWidth: '540px',
            }}
          >
            Agent nạp tệp giao dịch của bạn, tự động làm sạch bất thường, tính chỉ số định lượng bằng code,
            dựng biểu đồ chuyên nghiệp và luôn dừng lại chờ bạn phê duyệt tại hai cổng kiểm soát bắt buộc.
          </p>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-6)', flexWrap: 'wrap' }}>
            <PixelButton variant="primary" size="lg" icon="arrow-right" iconPosition="right" onClick={handleStart}>
              BẮT ĐẦU PHÂN TÍCH
            </PixelButton>
            <PixelButton variant="secondary" size="lg" icon="eye" onClick={scrollToWorkflow}>
              XEM QUY TRÌNH
            </PixelButton>
          </div>

          {/* Ba dòng cam kết có dấu tích */}
          <div style={{ marginTop: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>
              <PixelIcon name="check" size={16} />
              <span>Số liệu do code tính, AI không đoán mò</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>
              <PixelIcon name="check" size={16} />
              <span>Mọi kết luận có căn cứ đối chiếu số thực</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>
              <PixelIcon name="check" size={16} />
              <span>Có hai điểm dừng bắt buộc để người duyệt phê duyệt</span>
            </div>
          </div>
        </div>

        {/* Right: Rich Procedural SVG Pixel Art Landscape */}
        <div
          className="px-shadow-lg"
          style={{
            backgroundColor: 'var(--ink)',
            padding: '4px',
            clipPath:
              'polygon(6px 0, calc(100% - 6px) 0, 100% 6px, 100% calc(100% - 6px), calc(100% - 6px) 100%, 6px 100%, 0 calc(100% - 6px), 0 6px)',
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--bg)',
              position: 'relative',
              overflow: 'hidden',
              height: '320px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* Native 320x180 SVG Pixel Art Viewbox */}
            <svg
              viewBox="0 0 320 180"
              width="100%"
              height="100%"
              preserveAspectRatio="xMidYMid slice"
              shapeRendering="crispEdges"
              style={{ imageRendering: 'pixelated', width: '100%', height: '100%', display: 'block' }}
            >
              {/* Sky Backdrop */}
              <rect x="0" y="0" width="320" height="180" fill="#CFE6F7" />

              {/* Distant Mountains (Dark Navy) */}
              <polygon points="0,180 30,120 70,150 120,100 170,160 230,110 280,145 320,115 320,180" fill="#7FA9D6" />
              {/* Mountain Snowy Peaks */}
              <polygon points="28,124 30,120 32,124 30,126" fill="#FFFFFF" />
              <polygon points="116,104 120,100 124,104 120,108" fill="#FFFFFF" />
              <polygon points="226,114 230,110 234,114 230,118" fill="#FFFFFF" />

              {/* Rolling Hills (Midground) */}
              <path d="M0,150 Q80,135 160,150 T320,145 L320,180 L0,180 Z" fill="#99C2EC" />
              <path d="M0,160 Q100,150 200,165 T320,158 L320,180 L0,180 Z" fill="#4472C4" />

              {/* Drifting Pixel Clouds with steps animation */}
              <g style={{ animation: 'px-cloud-step 24s steps(80) infinite' }}>
                {/* Cloud 1 */}
                <rect x="20" y="25" width="40" height="10" fill="#FFFFFF" />
                <rect x="25" y="18" width="28" height="10" fill="#FFFFFF" />
                <rect x="32" y="12" width="16" height="8" fill="#FFFFFF" />
                {/* Cloud 2 */}
                <rect x="180" y="40" width="48" height="12" fill="#FFFFFF" />
                <rect x="188" y="32" width="32" height="10" fill="#FFFFFF" />
                <rect x="196" y="26" width="18" height="8" fill="#FFFFFF" />
              </g>

              {/* Foreground Ground Plane */}
              <rect x="0" y="165" width="320" height="15" fill="#14214D" />
              {/* Green grass strip */}
              <rect x="0" y="162" width="320" height="3" fill="#1E9E4A" />

              {/* Pixel Art Robot Mascot carrying data box */}
              <g transform="translate(130, 125)">
                {/* Head */}
                <rect x="4" y="0" width="12" height="10" fill="#3B7BD1" />
                <rect x="6" y="2" width="8" height="5" fill="#14214D" />
                {/* Glowing Eyes */}
                <rect x="7" y="3" width="2" height="2" fill="#00FFCC" />
                <rect x="11" y="3" width="2" height="2" fill="#00FFCC" />
                {/* Antenna */}
                <rect x="9" y="-3" width="2" height="3" fill="#14214D" />
                <rect x="8" y="-5" width="4" height="2" fill="#F26B21" />
                {/* Body */}
                <rect x="5" y="11" width="10" height="8" fill="#3B7BD1" />
                {/* Orange Data Box */}
                <rect x="14" y="10" width="8" height="7" fill="#F26B21" />
                <rect x="16" y="12" width="4" height="3" fill="#FFFFFF" />
                {/* Legs */}
                <rect x="6" y="19" width="3" height="4" fill="#14214D" />
                <rect x="11" y="19" width="3" height="4" fill="#14214D" />
              </g>

              {/* Idle Mascot near flag */}
              <g transform="translate(240, 118)">
                <rect x="4" y="0" width="12" height="10" fill="#3B7BD1" />
                <rect x="6" y="2" width="8" height="5" fill="#14214D" />
                <rect x="7" y="3" width="2" height="2" fill="#FFFFFF" />
                <rect x="11" y="3" width="2" height="2" fill="#FFFFFF" />
                <rect x="5" y="11" width="10" height="8" fill="#3B7BD1" />
                <rect x="6" y="19" width="3" height="4" fill="#14214D" />
                <rect x="11" y="19" width="3" height="4" fill="#14214D" />
                {/* Antigravity Balloon Flag */}
                <rect x="20" y="5" width="2" height="28" fill="#14214D" />
                <polygon points="22,5 34,9 22,13" fill="#1E9E4A" />
              </g>

              {/* Floating Pixel Particles */}
              <rect x="220" y="30" width="3" height="3" fill="#F26B21" />
              <rect x="270" y="55" width="2" height="2" fill="#3B7BD1" />
              <rect x="80" y="45" width="2" height="2" fill="#FFC000" />
              <rect x="110" y="70" width="3" height="3" fill="#1E9E4A" />
            </svg>
          </div>
        </div>
      </section>

      {/* Section 2: 5-Step Workflow with Gate 1 & Gate 2 Checkpoints */}
      <section id="workflow-section" style={{ marginTop: 'var(--space-6)' }}>
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
          <h2 className="font-pixel" style={{ fontSize: '32px', color: 'var(--ink)', margin: 0 }}>
            QUY TRÌNH PHÂN TÍCH CHẶT CHẼ 5 BƯỚC
          </h2>
          <p className="font-content" style={{ color: 'var(--ink-soft)', marginTop: '8px', fontSize: '14px' }}>
            Không đi tắt đón đầu: mọi giai đoạn đều được kiểm tra và có người duyệt ở hai cổng.
          </p>
        </div>

        {/* 5 Workflow Cards Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
            gap: 'var(--space-4)',
          }}
        >
          {/* Step 1 */}
          <PixelPanel title="1. NẠP DỮ LIỆU" className="workflow-card">
            <div style={{ textAlign: 'center', padding: 'var(--space-2)' }}>
              <PixelIcon name="upload" size={32} />
              <h4 className="font-pixel" style={{ fontSize: '18px', marginTop: 'var(--space-2)' }}>
                Tệp CSV / Excel
              </h4>
              <p className="font-content" style={{ fontSize: '13px', color: 'var(--ink-soft)', marginTop: '4px', lineHeight: 1.5 }}>
                Kiểm tra định dạng, từ chối sớm nếu thiếu cột bắt buộc.
              </p>
            </div>
          </PixelPanel>

          {/* Step 2 + GATE 1 */}
          <PixelPanel
            title="2. LÀM SẠCH (CỔNG 1)"
            variant="warning"
            className="workflow-card"
            borderColor="var(--accent)"
          >
            <div style={{ textAlign: 'center', padding: 'var(--space-2)' }}>
              <PixelIcon name="shield-check" size={32} />
              <h4 className="font-pixel" style={{ fontSize: '18px', marginTop: 'var(--space-2)', color: 'var(--accent-d)' }}>
                Cổng duyệt 1
              </h4>
              <p className="font-content" style={{ fontSize: '13px', color: 'var(--ink)', marginTop: '4px', lineHeight: 1.5 }}>
                Đề xuất xử lý dữ liệu khuyết và bất thường. Chỉ dùng dữ liệu sau khi người duyệt đồng ý.
              </p>
            </div>
          </PixelPanel>

          {/* Step 3 */}
          <PixelPanel title="3. TÍNH CHỈ SỐ" className="workflow-card">
            <div style={{ textAlign: 'center', padding: 'var(--space-2)' }}>
              <PixelIcon name="chart" size={32} />
              <h4 className="font-pixel" style={{ fontSize: '18px', marginTop: 'var(--space-2)' }}>
                Code tính toán
              </h4>
              <p className="font-content" style={{ fontSize: '13px', color: 'var(--ink-soft)', marginTop: '4px', lineHeight: 1.5 }}>
                Chỉ số định lượng, thẻ KPI và biểu đồ do code tính 100%.
              </p>
            </div>
          </PixelPanel>

          {/* Step 4 + GATE 2 */}
          <PixelPanel
            title="4. NHẬN ĐỊNH (CỔNG 2)"
            variant="warning"
            className="workflow-card"
            borderColor="var(--accent)"
          >
            <div style={{ textAlign: 'center', padding: 'var(--space-2)' }}>
              <PixelIcon name="shield-check" size={32} />
              <h4 className="font-pixel" style={{ fontSize: '18px', marginTop: 'var(--space-2)', color: 'var(--accent-d)' }}>
                Cổng duyệt 2
              </h4>
              <p className="font-content" style={{ fontSize: '13px', color: 'var(--ink)', marginTop: '4px', lineHeight: 1.5 }}>
                AI viết nhận định, đối chiếu số với dữ liệu. Người duyệt đọc, sửa và đóng dấu.
              </p>
            </div>
          </PixelPanel>

          {/* Step 5 */}
          <PixelPanel title="5. XUẤT BẢN" className="workflow-card">
            <div style={{ textAlign: 'center', padding: 'var(--space-2)' }}>
              <PixelIcon name="report" size={32} />
              <h4 className="font-pixel" style={{ fontSize: '18px', marginTop: 'var(--space-2)' }}>
                Báo cáo hoàn chỉnh
              </h4>
              <p className="font-content" style={{ fontSize: '13px', color: 'var(--ink-soft)', marginTop: '4px', lineHeight: 1.5 }}>
                Xem báo cáo trên web, xuất PDF và Excel có công thức tự kiểm chứng.
              </p>
            </div>
          </PixelPanel>
        </div>

        {/* Section 3: ILC Architecture Framework Strip */}
        <div
          className="px-shadow"
          style={{
            marginTop: 'var(--space-6)',
            backgroundColor: 'var(--ink)',
            color: 'var(--white)',
            padding: 'var(--space-4) var(--space-6)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 'var(--space-4)',
          }}
        >
          <div>
            <div className="font-pixel" style={{ fontSize: '20px', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <PixelIcon name="checklist" size={18} />
              <span>INTENT (Ý định)</span>
            </div>
            <p className="font-content" style={{ fontSize: '13px', marginTop: '4px', opacity: 0.9 }}>
              Phân tích và hiểu mục tiêu giao dịch của người dùng theo từ vựng cho phép.
            </p>
          </div>
          <div>
            <div className="font-pixel" style={{ fontSize: '20px', color: '#A0E8AF', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <PixelIcon name="gear" size={18} />
              <span>LOGIC (Quy trình)</span>
            </div>
            <p className="font-content" style={{ fontSize: '13px', marginTop: '4px', opacity: 0.9 }}>
              Thực thi kế hoạch gồm các thao tác trong danh sách trắng (whitelist).
            </p>
          </div>
          <div>
            <div className="font-pixel" style={{ fontSize: '20px', color: 'var(--blue)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <PixelIcon name="shield-check" size={18} />
              <span>CONTROL (Kiểm soát)</span>
            </div>
            <p className="font-content" style={{ fontSize: '13px', marginTop: '4px', opacity: 0.9 }}>
              Đối chiếu số liệu, chặn lỗi tự động, trao quyền quyết định cuối cùng cho con người.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};
