'use client';

import { AppTopbar } from './AppTopbar';
import { TemplatesDropdown } from './TemplatesDropdown';
import { NotificationBell } from './NotificationBell';

interface Presentation {
  id: string;
  uniqueId: string;
  status: string;
  viewCount: number;
  emailSentAt: Date | null;
  clientData: any;
}

interface DocumentosTopbarProps {
  presentations: Presentation[];
}

/**
 * DocumentosTopbar - Topbar específico para la página de Documentos
 * 
 * Muestra solo:
 * - Templates (dropdown)
 * - Notificaciones (campana)
 */
export function DocumentosTopbar({ presentations }: DocumentosTopbarProps) {
  return (
    <AppTopbar>
      <div className="flex items-center gap-2">
        <TemplatesDropdown />
        <NotificationBell presentations={presentations} />
      </div>
    </AppTopbar>
  );
}
