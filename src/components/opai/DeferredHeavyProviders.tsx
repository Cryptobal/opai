'use client';

import type { ReactNode } from 'react';
import { ChatSidePanelProvider } from '@/components/chat/ChatFloatingProvider';
import { NotificationSidePanelProvider } from '@/components/notifications/NotificationSidePanelContext';
import { IntelligenceSidePanelProvider } from '@/components/opai/IntelligenceSidePanelContext';
import { InAppNotificationProvider } from '@/components/notifications/InAppNotificationProvider';
import { PanicAlertProvider } from '@/components/ops/PanicAlertProvider';

interface DeferredHeavyProvidersProps {
  children: ReactNode;
  tenantId: string;
  currentUserId: string;
  userRole: string;
}

/** Providers pesados (Pusher, paneles laterales) — chunk separado, idle. */
export default function DeferredHeavyProviders({
  children,
  tenantId,
  currentUserId,
  userRole,
}: DeferredHeavyProvidersProps) {
  return (
    <InAppNotificationProvider
      pusherKey={process.env.NEXT_PUBLIC_PUSHER_KEY!}
      pusherCluster={process.env.NEXT_PUBLIC_PUSHER_CLUSTER!}
      pusherAuthEndpoint="/api/chat/pusher/auth"
      tenantId={tenantId}
      userType="ADMIN"
      userId={currentUserId}
      chatUrlPrefix="/chat"
    >
      <PanicAlertProvider tenantId={tenantId}>
        <NotificationSidePanelProvider>
          <IntelligenceSidePanelProvider>
            <ChatSidePanelProvider currentUserId={currentUserId} userRole={userRole}>
              {children}
            </ChatSidePanelProvider>
          </IntelligenceSidePanelProvider>
        </NotificationSidePanelProvider>
      </PanicAlertProvider>
    </InAppNotificationProvider>
  );
}
