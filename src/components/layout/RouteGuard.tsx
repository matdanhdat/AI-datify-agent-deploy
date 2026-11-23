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
    const isBusiness = session.dataset
      ? session.dataset.kind === 'business'
      : Boolean(session.business_context);
    const metricConfirmed = Boolean(session.metric_selection_confirmed);
    const explanation = getLockExplanation(pageKey, session.state, isBusiness, metricConfirmed);
    let redirectTarget = getCurrentStepPath(session.state, isBusiness, metricConfirmed);
    if (pageKey === 'analyze' && isBusiness && !metricConfirmed && session.state === 'clean_approved') {
      redirectTarget = '/trao-doi';
    }
    if (pageKey === 'exchange' && !isUnlocked) {
      redirectTarget = '/lam-sach';
    }

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
