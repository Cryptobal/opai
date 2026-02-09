'use client';

import { useState } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';

interface Presentation {
  id: string;
  uniqueId: string;
  status: string;
  viewCount: number;
  emailSentAt: Date | null;
  clientData: any;
}

interface NotificationBellProps {
  presentations: Presentation[];
}

/**
 * NotificationBell - Campana de notificaciones
 * 
 * Muestra presentaciones enviadas hace más de 3 días sin vistas.
 */
export function NotificationBell({ presentations }: NotificationBellProps) {
  const [open, setOpen] = useState(false);

  // Calcular notificaciones (docs sin abrir hace 3+ días)
  const notifications = presentations.filter((p) => {
    if (p.status !== 'sent' || p.viewCount > 0 || !p.emailSentAt) return false;
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    return new Date(p.emailSentAt) <= threeDaysAgo;
  });

  const hasNotifications = notifications.length > 0;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="relative">
          <Bell className="h-4 w-4" />
          {hasNotifications && (
            <Badge 
              variant="destructive" 
              className="absolute -right-1 -top-1 h-5 w-5 rounded-full p-0 text-xs flex items-center justify-center animate-pulse"
            >
              {notifications.length}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 max-h-[70vh] overflow-y-auto">
        {hasNotifications ? (
          <div className="space-y-1">
            <div className="border-b border-border p-3">
              <h3 className="text-sm font-semibold">Notificaciones</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Presentaciones sin ver hace más de 3 días
              </p>
            </div>
            <div className="p-2 space-y-2">
              {notifications.map((presentation) => {
                const clientData = presentation.clientData as any;
                const companyName = clientData?.account?.Account_Name || 'Sin nombre';
                const daysAgo = Math.floor(
                  (Date.now() - new Date(presentation.emailSentAt!).getTime()) / (1000 * 60 * 60 * 24)
                );

                return (
                  <div
                    key={presentation.id}
                    className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 hover:bg-destructive/20 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">
                          {companyName}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Enviado hace <strong>{daysAgo} días</strong>
                        </p>
                        <p className="text-xs text-destructive mt-1">⚠️ Sin vistas aún</p>
                      </div>
                      <a
                        href={`/p/${presentation.uniqueId}?preview=true`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2 py-1 rounded-md bg-primary/20 text-primary text-xs font-medium hover:bg-primary/30 transition-colors flex-shrink-0"
                      >
                        Ver
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="p-8 text-center bg-muted/20">
            <Bell className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">
              No hay notificaciones pendientes
            </p>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
