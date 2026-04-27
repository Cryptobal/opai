'use client';

import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell, AppSidebar } from '@/components/opai';
import { type RolePermissions } from '@/lib/permissions';
import { RoleSimulationProvider, useRoleSimulation } from '@/contexts/RoleSimulationContext';
import { NotificationProvider } from '@/contexts/NotificationContext';
import { useTenantModules } from '@/contexts/TenantModulesContext';
import { ChatSidePanelProvider } from '@/components/chat/ChatFloatingProvider';
import { NotificationSidePanelProvider } from '@/components/notifications/NotificationSidePanelContext';
import { PushPermissionPrompt } from '@/components/pwa/PushPermissionPrompt';
import { InAppNotificationProvider } from '@/components/notifications/InAppNotificationProvider';
import { PanicAlertProvider } from '@/components/ops/PanicAlertProvider';
import { buildNavItems } from '@/components/opai/role-nav-builder';

interface AppLayoutClientProps {
  children: ReactNode;
  userName?: string;
  userEmail?: string;
  userRole: string;
  permissions: RolePermissions;
  currentUserId?: string;
  tenantId?: string;
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
}: AppLayoutClientProps) {
  const { isSimulating, effectivePermissions } = useRoleSimulation();
  // Use simulated permissions when active, otherwise real permissions
  const permissions = isSimulating ? effectivePermissions : realPermissions;
  const isAdmin = userRole === 'owner' || userRole === 'admin';
  const isComplianceVisible = userRole === 'owner' || userRole === 'admin' || userRole === 'rrhh';
  const { isModuleEnabled } = useTenantModules();

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
    fetchOtherCounters();
    const interval = setInterval(fetchOtherCounters, 30000);
    const onRefresh = () => fetchOtherCounters();
    window.addEventListener('opai-note-seen', onRefresh as EventListener);
    return () => {
      clearInterval(interval);
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
        badges: { unreadMentionNotesCount, notesByModule },
      }),
    [permissions, isAdmin, isComplianceVisible, isModuleEnabled, unreadMentionNotesCount, notesByModule],
  );

  return (
    <InAppNotificationProvider
      pusherKey={process.env.NEXT_PUBLIC_PUSHER_KEY!}
      pusherCluster={process.env.NEXT_PUBLIC_PUSHER_CLUSTER!}
      pusherAuthEndpoint="/api/chat/pusher/auth"
      tenantId={tenantId ?? ""}
      userType="ADMIN"
      userId={currentUserId ?? ""}
      chatUrlPrefix="/chat"
    >
      <PanicAlertProvider tenantId={tenantId ?? ""}>
      <NotificationSidePanelProvider>
      <ChatSidePanelProvider currentUserId={currentUserId ?? ''} userRole={userRole}>
        <AppShell
          sidebar={
            <AppSidebar
              navItems={navItems}
              userName={userName ?? undefined}
              userEmail={userEmail ?? undefined}
            />
          }
          userName={userName ?? undefined}
          userEmail={userEmail ?? undefined}
          userRole={userRole}
        >
          {currentUserId && tenantId && (
            <PushPermissionPrompt
              portalType="app"
              userType="admin"
              userId={currentUserId}
              tenantId={tenantId}
            />
          )}
          {children}
        </AppShell>
      </ChatSidePanelProvider>
      </NotificationSidePanelProvider>
      </PanicAlertProvider>
    </InAppNotificationProvider>
  );
}
