import React, { useState } from 'react';
import { Route, Routes, useNavigate } from 'react-router-dom';
import { useSession } from './hooks/useSession';
import { Sidebar } from './components/layout/Sidebar';
import { Topbar } from './components/layout/Topbar';
import { StepperBar } from './components/layout/StepperBar';
import { RouteGuard } from './components/layout/RouteGuard';
import { ChatDock } from './components/layout/ChatDock';
import { NotFoundPage } from './components/layout/SystemStateBanners';
import { PixelModal } from './components/pixel/PixelModal';
import { PixelSprite } from './components/pixel/PixelSprite';
import { PixelBadge } from './components/pixel/PixelBadge';
import { PixelButton } from './components/pixel/PixelButton';
import type { StepInfo } from './types/contract';
import {
  getLockExplanation,
  getStateBadgeVariant,
  type LockExplanation,
} from './utils/navigation';

import { HomePage } from './pages/HomePage';

function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return React.lazy(async () => {
    try {
      return await factory();
    } catch (err) {
      if (typeof window !== 'undefined') {
        const hasRefreshed = window.sessionStorage.getItem('chunk_load_failed');
        if (!hasRefreshed) {
          window.sessionStorage.setItem('chunk_load_failed', '1');
          window.location.reload();
          return new Promise<{ default: T }>(() => {});
        }
      }
      throw err;
    }
  });
}

const UploadPage = lazyWithRetry(() => import('./pages/UploadPage').then((m) => ({ default: m.UploadPage })));
const CleanPage = lazyWithRetry(() => import('./pages/CleanPage').then((m) => ({ default: m.CleanPage })));
const AnalyzePage = lazyWithRetry(() => import('./pages/AnalyzePage').then((m) => ({ default: m.AnalyzePage })));
const ReportPage = lazyWithRetry(() => import('./pages/ReportPage').then((m) => ({ default: m.ReportPage })));
const AgentPage = lazyWithRetry(() => import('./pages/AgentPage').then((m) => ({ default: m.AgentPage })));
const HistoryPage = lazyWithRetry(() => import('./pages/HistoryPage').then((m) => ({ default: m.HistoryPage })));
const ConfigPage = lazyWithRetry(() => import('./pages/ConfigPage').then((m) => ({ default: m.ConfigPage })));
const UiLibraryPage = lazyWithRetry(() => import('./pages/UiLibraryPage').then((m) => ({ default: m.UiLibraryPage })));

export const AppRouter: React.FC = () => {
  const navigate = useNavigate();
  const { session, loading, createNewSession, isPageUnlocked } = useSession();
  const [lockExplanation, setLockExplanation] = useState<LockExplanation | null>(null);
  const [chatOpen, setChatOpen] = useState(() => typeof window !== 'undefined' && window.location.search.includes('chat=1'));

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const p = new URLSearchParams(window.location.search);
    const scroll = p.get('scroll');
    if (scroll === 'bottom' || scroll === 'home_bottom') {
      setTimeout(() => window.scrollTo(0, 650), 200);
    } else if (scroll === 'upload_bottom') {
      setTimeout(() => window.scrollTo(0, 450), 200);
    } else if (scroll === 'process') {
      setTimeout(() => window.scrollTo(0, 480), 200);
    } else if (scroll === 'roles') {
      setTimeout(() => window.scrollTo(0, 500), 200);
    } else if (scroll === 'preview') {
      setTimeout(() => window.scrollTo(0, 850), 200);
    }
  }, []);

  const handleLockedAccess = (explanation: LockExplanation) => {
    setLockExplanation(explanation);
  };

  const handleLockedStepClick = (step: StepInfo) => {
    const currentState = session ? session.state : 'created';
    const explanation = getLockExplanation(step.key, currentState);
    setLockExplanation(explanation);
  };

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        backgroundColor: 'var(--bg)',
        position: 'relative',
        isolation: 'isolate',
      }}
    >
      {/* 264px Collapsible Sidebar */}
      <Sidebar
        session={session}
        appName="Datify AI Agent"
        isPageUnlocked={isPageUnlocked}
      />

      {/* Main Flow Content */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minWidth: 0,
          minHeight: '100vh',
        }}
      >
        {/* Sticky Topbar */}
        <Topbar
          session={session}
          loading={loading}
          createNewSession={createNewSession}
        />

        {/* 5-Step Stepper Bar */}
        <StepperBar
          session={session}
          onLockedStepClick={handleLockedStepClick}
        />

        {/* Routed Pages with Guards */}
        <main
          style={{
            flex: 1,
            padding: 'var(--space-6)',
            paddingBottom: 'calc(110px + env(safe-area-inset-bottom))',
            overflowY: 'auto',
          }}
        >
          <React.Suspense
            fallback={
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '300px',
                  color: 'var(--ink)',
                  fontFamily: 'var(--font-pixel)',
                  fontSize: '20px',
                }}
              >
                Đang tải trang...
              </div>
            }
          >
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route
                path="/nap-du-lieu"
                element={
                  <RouteGuard
                    pageKey="upload"
                    session={session}
                    loading={loading}
                    onLockedAccess={handleLockedAccess}
                  >
                    <UploadPage />
                  </RouteGuard>
                }
              />
              <Route
                path="/lam-sach"
                element={
                  <RouteGuard
                    pageKey="clean"
                    session={session}
                    loading={loading}
                    onLockedAccess={handleLockedAccess}
                  >
                    <CleanPage />
                  </RouteGuard>
                }
              />
              <Route
                path="/phan-tich"
                element={
                  <RouteGuard
                    pageKey="analyze"
                    session={session}
                    loading={loading}
                    onLockedAccess={handleLockedAccess}
                  >
                    <AnalyzePage />
                  </RouteGuard>
                }
              />
              <Route
                path="/bao-cao"
                element={
                  <RouteGuard
                    pageKey="report"
                    session={session}
                    loading={loading}
                    onLockedAccess={handleLockedAccess}
                  >
                    <ReportPage />
                  </RouteGuard>
                }
              />
              <Route path="/tien-trinh" element={<AgentPage />} />
              <Route path="/lich-su" element={<HistoryPage />} />
              <Route path="/cau-hinh" element={<ConfigPage />} />
              <Route path="/thu-vien-giao-dien" element={<UiLibraryPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </React.Suspense>
        </main>
      </div>

      {/* Floating Chat Dock Assistant */}
      <ChatDock isOpen={chatOpen} onToggle={setChatOpen} />

      {/* Stepper / Route Guard Lock Explanation Modal */}
      <PixelModal
        isOpen={!!lockExplanation}
        onClose={() => setLockExplanation(null)}
        title="Trang đang bị khóa"
        maxWidth="500px"
      >
        {lockExplanation && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <PixelSprite mood="thinking" size={48} />
              <div>
                <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>Mục tiêu truy cập:</div>
                <strong className="font-pixel" style={{ fontSize: '20px', color: 'var(--ink)' }}>
                  {lockExplanation.pageTitle}
                </strong>
              </div>
            </div>

            <div
              style={{
                padding: 'var(--space-3)',
                backgroundColor: 'var(--panel-alt)',
                border: '2px solid var(--ink)',
              }}
            >
              <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>Trạng thái phiên hiện tại:</div>
              <div style={{ marginTop: '4px' }}>
                <PixelBadge variant={getStateBadgeVariant(lockExplanation.currentState)} size="sm">
                  {lockExplanation.currentStateVi}
                </PixelBadge>
              </div>
              <div style={{ marginTop: '10px', fontSize: '14px', color: 'var(--ink)' }}>
                <strong>Điều kiện mở khóa:</strong> {lockExplanation.message}
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 'var(--space-2)',
                marginTop: 'var(--space-2)',
              }}
            >
              {lockExplanation.actionPath && (
                <PixelButton
                  variant="primary"
                  onClick={() => {
                    const path = lockExplanation.actionPath;
                    setLockExplanation(null);
                    navigate(path);
                  }}
                >
                  {lockExplanation.actionLabel}
                </PixelButton>
              )}
              <PixelButton
                variant="secondary"
                onClick={() => setLockExplanation(null)}
              >
                Đã hiểu
              </PixelButton>
            </div>
          </div>
        )}
      </PixelModal>
    </div>
  );
};
