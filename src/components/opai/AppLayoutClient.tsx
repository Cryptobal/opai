'use client';

import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { AppShell } from '@/components/opai/AppShell';
import { AppSidebar } from '@/components/opai/AppSidebar';
import { BrandThemeSync } from '@/components/opai/BrandThemeSync';
import { type RolePermissions } from '@/lib/permissions';
import { RoleSimulationProvider, useRoleSimulation } from '@/contexts/RoleSimulationContext';
import { NotificationProvider } from '@/contexts/NotificationContext';
import { useTenantModules } from '@/contexts/TenantModulesContext';
import { buildNavItems } from '@/components/opai/role-nav-builder';
import { LandingSurfacePrompt } from '@/components/opai/LandingSurfacePrompt';
import { DEFAULT_SURFACE, type Surface } from '@/lib/surface';

const DeferredHeavyProviders = dynamic(
  () => import('@/components/opai/DeferredHeavyProviders'),
  { ssr: false },
);

const PushPermissionPrompt = dynamic(
  () => import('@/components/pwa/PushPermissionPrompt').then((m) => m.PushPermissionPrompt),
  { ssr: false },
);

interface AppLayoutClientProps {
  children: ReactNode;
  userName?: string;
  userEmail?: string;
  userRole: string;
  permissions: RolePermissions;
  currentUserId?: string;
  tenantId?: string;
  /** Superficie activa leída en el server layout (cookie). Default erp. */
  surface?: Surface;
}

function useIdleReady(timeoutMs = 1200): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const win = window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const activate = () => setReady(true);
    if (win.requestIdleCallback) {
      idleId = win.requestIdleCallback(activate, { timeout: timeoutMs });
    } else {
      timeoutId = setTimeout(activate, timeoutMs);
    }
    return () => {
      if (idleId != null) win.cancelIdleCallback?.(idleId);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [timeoutMs]);

  return ready;
}

export function AppLayoutClient(props: AppLayoutClientProps) {
  return (
    <RoleSimulationProvider realRole={props.userRole} realPermissions={props.permissions}>
      <NotificationProvider>
        <AppLayoutClientInner {...props} />
      </NotificationProvider>
    </RoleSimulationProvider>
  );
}

function AppLayoutClientInner({
  children,
  userName,
  userEmail,
  tenantId,
  userRole,
  permissions: realPermissions,
  currentUserId,
  surface = DEFAULT_SURFACE,
}: AppLayoutClientProps) {
  const idleReady = useIdleReady();
  const { isSimulating, effectivePermissions } = useRoleSimulation();
  const permissions = isSimulating ? effectivePermissions : realPermissions;
  const isAdmin = userRole === 'owner' || userRole === 'admin';
  const isComplianceVisible = userRole === 'owner' || userRole === 'admin' || userRole === 'rrhh';
  const { isModuleEnabled, hasFeatureFlag } = useTenantModules();

  const [unreadMentionNotesCount, setUnreadMentionNotesCount] = useState(0);
  const [notesByModule, setNotesByModule] = useState<Record<string, number>>({});
  const [activityUnreadTotal, setActivityUnreadTotal] = useState(0);

  const fetchOtherCounters = useCallback(() => {
    Promise.all([
      fetch('/api/notifications?limit=1&types=mention,mention_direct,mention_group').then((r) => r.json()),
      fetch('/api/notes/unread-counts', { cache: 'no-store' }).then((r) => r.json()),
    ])
      .then(([noteData, unreadCounts]) => {
        if (noteData?.success && typeof noteData?.meta?.unreadCount === 'number') {
          setUnreadMentionNotesCount(noteData.meta.unreadCount);
        }
        if (unreadCounts?.success && unreadCounts?.data?.byModule) {
          setNotesByModule(unreadCounts.data.byModule);
          setActivityUnreadTotal(typeof unreadCounts.data.total === 'number' ? unreadCounts.data.total : 0);
        }
      })
      .catch(() => { });
  }, []);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      fetchOtherCounters();
      interval = setInterval(fetchOtherCounters, 30000);
    };
    const ric = (
      window as unknown as {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
        cancelIdleCallback?: (id: number) => void;
      }
    ).requestIdleCallback;
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (ric) {
      idleId = ric(start, { timeout: 1200 });
    } else {
      timeoutId = setTimeout(start, 1200);
    }
    const onRefresh = () => fetchOtherCounters();
    window.addEventListener('opai-note-seen', onRefresh as EventListener);
    return () => {
      if (interval) clearInterval(interval);
      if (idleId != null) {
        (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(idleId);
      }
      if (timeoutId) clearTimeout(timeoutId);
      window.removeEventListener('opai-note-seen', onRefresh as EventListener);
    };
  }, [fetchOtherCounters]);

  const navItems = useMemo(
    () =>
      buildNavItems({
        permissions,
        isAdmin,
        isComplianceVisible,
        isModuleEnabled,
        hasTenantFlag: hasFeatureFlag,
        badges: { unreadMentionNotesCount, notesByModule },
        surface,
      }),
    [permissions, isAdmin, isComplianceVisible, isModuleEnabled, hasFeatureFlag, unreadMentionNotesCount, notesByModule, surface],
  );

  const shell = (
    <>
      <BrandThemeSync />
      <AppShell
        sidebar={
          <AppSidebar
            navItems={navItems}
            userName={userName ?? undefined}
            userEmail={userEmail ?? undefined}
            userRole={userRole}
            surface={surface}
          />
        }
        userName={userName ?? undefined}
        userEmail={userEmail ?? undefined}
        userRole={userRole}
        surface={surface}
      >
        {idleReady && currentUserId && tenantId && (
          <PushPermissionPrompt
            portalType="app"
            userType="admin"
            userId={currentUserId}
            tenantId={tenantId}
          />
        )}
        <LandingSurfacePrompt />
        {children}
      </AppShell>
    </>
  );

  if (!idleReady || !tenantId || !currentUserId) {
    return shell;
  }

  return (
    <DeferredHeavyProviders
      tenantId={tenantId}
      currentUserId={currentUserId}
      userRole={userRole}
    >
      {shell}
    </DeferredHeavyProviders>
  );
}
