import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { PixelIcon } from '../pixel/PixelIcon';
import { PixelTooltip } from '../pixel/PixelTooltip';
import type { IconName } from '../pixel/icons';
import type { Session } from '../../types/contract';
import { PixelFace } from '../../brand/PixelFace';
import { FACE_ANALYST, PALETTE_ANALYST } from '../../brand/sprites';

interface SidebarProps {
  session: Session | null;
  appName?: string;
  isPageUnlocked: (key: string) => boolean;
}

interface MenuItem {
  path: string;
  key: string;
  label: string;
  icon: IconName;
  badgeCondition?: (session: Session | null) => boolean;
}

const MENU_ITEMS: MenuItem[] = [
  { path: '/', key: 'home', label: 'Trang chủ', icon: 'home' },
  { path: '/nap-du-lieu', key: 'upload', label: 'Nạp dữ liệu', icon: 'upload' },
  {
    path: '/lam-sach',
    key: 'clean',
    label: 'Làm sạch & Duyệt',
    icon: 'clean',
    badgeCondition: (s) => s?.state === 'cleaning_review',
  },
  { path: '/phan-tich', key: 'analyze', label: 'Phân tích', icon: 'chart' },
  {
    path: '/bao-cao',
    key: 'report',
    label: 'Báo cáo',
    icon: 'report',
    badgeCondition: (s) => s?.state === 'analyzed',
  },
  { path: '/tien-trinh', key: 'agent', label: 'Tiến trình Agent', icon: 'pulse' },
  { path: '/lich-su', key: 'history', label: 'Lịch sử', icon: 'clock' },
];

export const Sidebar: React.FC<SidebarProps> = ({
  session,
  appName = 'Datify AI Agent',
  isPageUnlocked,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const isBusiness = session?.dataset
    ? session.dataset.kind === 'business'
    : Boolean(session?.business_context);

  const menuItems = React.useMemo(() => {
    if (!isBusiness) return MENU_ITEMS;
    const items = [...MENU_ITEMS];
    const analyzeIdx = items.findIndex((i) => i.key === 'analyze');
    if (analyzeIdx !== -1) {
      items.splice(analyzeIdx, 0, {
        path: '/trao-doi',
        key: 'exchange',
        label: 'Trao đổi',
        icon: 'checklist',
      });
    }
    return items;
  }, [isBusiness]);

  return (
    <aside
      className="pixel-sidebar"
      style={{
        width: collapsed ? '72px' : '264px',
        backgroundColor: 'var(--sidebar-bg)',
        borderRight: '3px solid var(--ink)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        flexShrink: 0,
        height: '100vh',
        position: 'sticky',
        top: 0,
        zIndex: 'var(--z-sidebar)',
        userSelect: 'none',
      }}
    >
      {/* Top Brand & Collapse Toggle */}
      <div>
        <div
          style={{
            padding: '16px 14px',
            borderBottom: '2px solid var(--ink)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'space-between',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
            {/* Voxel Logo Face (48x48) in 4px Black Border & Hard Shadow */}
            <div
              style={{
                width: '48px',
                height: '48px',
                border: '4px solid var(--ink)',
                boxShadow: '4px 4px 0 var(--ink)',
                backgroundColor: 'var(--ink)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
              title="Datify AI Agent"
            >
              <PixelFace rows={FACE_ANALYST} palette={PALETTE_ANALYST} px={6} aria-hidden />
            </div>

            {!collapsed && (
              <div style={{ minWidth: 0 }}>
                <div
                  className="font-pixel"
                  style={{
                    fontSize: '22px',
                    lineHeight: 1.05,
                    color: 'var(--ink)',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                    overflow: 'hidden',
                  }}
                >
                  {appName}
                </div>
                <div
                  className="font-content"
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--ink-soft)',
                    marginTop: '2px',
                    letterSpacing: '0.2px',
                  }}
                >
                  Trading AI Agent
                </div>
              </div>
            )}
          </div>
          <button
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? 'Mở rộng thanh menu' : 'Thu gọn thanh menu'}
            className="font-pixel"
            style={{
              background: 'var(--white)',
              border: '1px solid var(--ink)',
              padding: '2px 6px',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            {collapsed ? '▶' : '◀'}
          </button>
        </div>

        {/* Navigation Menu */}
        <nav style={{ padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {menuItems.map((item) => {
            const unlocked = isPageUnlocked(item.key);
            const showDot = item.badgeCondition ? item.badgeCondition(session) : false;

            const linkContent = (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                style={({ isActive }) => ({
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: collapsed ? '10px' : '8px 12px',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  backgroundColor: isActive ? 'var(--accent)' : 'transparent',
                  color: isActive ? 'var(--accent-text)' : (unlocked ? 'var(--ink)' : 'var(--ink-soft)'),
                  border: isActive ? '2px solid var(--ink)' : '2px solid transparent',
                  opacity: unlocked ? 1 : 0.5,
                  textDecoration: 'none',
                  position: 'relative',
                  fontWeight: isActive ? 700 : 500,
                  clipPath: isActive
                    ? 'polygon(3px 0, calc(100% - 3px) 0, 100% 3px, 100% calc(100% - 3px), calc(100% - 3px) 100%, 3px 100%, 0 calc(100% - 3px), 0 3px)'
                    : undefined,
                })}
              >
                <div style={{ position: 'relative' }}>
                  <PixelIcon name={item.icon} size={20} />
                  {showDot && (
                    <span
                      style={{
                        position: 'absolute',
                        top: '-2px',
                        right: '-2px',
                        width: '8px',
                        height: '8px',
                        backgroundColor: 'var(--accent)',
                        border: '1px solid var(--ink)',
                      }}
                    />
                  )}
                </div>

                {!collapsed && (
                  <span className="font-pixel" style={{ fontSize: '17px', flex: 1 }}>
                    {item.label}
                  </span>
                )}

                {!collapsed && !unlocked && (
                  <PixelIcon name="lock" size={14} color="var(--ink-soft)" />
                )}
              </NavLink>
            );

            return collapsed ? (
              <PixelTooltip key={item.path} content={item.label} position="right">
                {linkContent}
              </PixelTooltip>
            ) : (
              linkContent
            );
          })}
        </nav>
      </div>

      {/* Bottom Config Link */}
      <div style={{ padding: '12px 8px', borderTop: '2px solid var(--ink)' }}>
        {collapsed ? (
          <PixelTooltip content="Cấu hình hệ thống" position="right">
            <NavLink
              to="/cau-hinh"
              style={({ isActive }) => ({
                display: 'flex',
                justifyContent: 'center',
                padding: '10px',
                backgroundColor: isActive ? 'var(--blue)' : 'var(--white)',
                color: isActive ? 'var(--white)' : 'var(--ink)',
                border: '2px solid var(--ink)',
              })}
            >
              <PixelIcon name="gear" size={20} />
            </NavLink>
          </PixelTooltip>
        ) : (
          <NavLink
            to="/cau-hinh"
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 12px',
              backgroundColor: isActive ? 'var(--blue)' : 'var(--white)',
              color: isActive ? 'var(--white)' : 'var(--ink)',
              border: '2px solid var(--ink)',
              textDecoration: 'none',
              clipPath:
                'polygon(3px 0, calc(100% - 3px) 0, 100% 3px, 100% calc(100% - 3px), calc(100% - 3px) 100%, 3px 100%, 0 calc(100% - 3px), 0 3px)',
            })}
          >
            <PixelIcon name="gear" size={20} />
            <span className="font-pixel" style={{ fontSize: '17px', flex: 1 }}>
              Cấu hình
            </span>
          </NavLink>
        )}
      </div>
    </aside>
  );
};

