import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { LoadingState } from '../pixel/PixelStates';
import type { Session } from '../../types/contract';
import { getCurrentStepPath, getLockExplanation, type LockExplanation } from '../../utils/navigation';

interface RouteGuardProps {
  pageKey: string;
  session: Session | null;
  loading: boolean;
  children: React.ReactNode;
  onLockedAccess: (explanation: LockExplanation) => void;
}

export const RouteGuard: React.FC<RouteGuardProps> = ({
  pageKey,
  session,
  loading,
  children,
  onLockedAccess,
}) => {
  const location = useLocation();
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    setBlocked(false);
  }, [pageKey, location.pathname]);

  // During session initial load, render loading state to prevent flash
  if (loading) {
    return <LoadingState message="Đang nạp trạng thái phiên làm việc..." />;
  }

  // Base unlocked pages that are always accessible
  const isBasePage = pageKey === 'home' || pageKey === 'config';
  const isUnlocked = isBasePage || (session && session.unlocked_pages.includes(pageKey));

  if (!isUnlocked && session) {
    const explanation = getLockExplanation(pageKey, session.state);
    const redirectTarget = getCurrentStepPath(session.state);

    // Trigger explanation dialog upon attempt
    if (!blocked) {
      setBlocked(true);
      setTimeout(() => {
        onLockedAccess(explanation);
      }, 0);
    }

    // Redirect to nearest valid step
    return <Navigate to={redirectTarget} replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
};
