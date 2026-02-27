import Link from 'next/link';
import { timeAgo } from '@/lib/utils';
import { ChevronRight } from 'lucide-react';
import type { HubNotificationsProps, NotificationType } from '../_lib/hub-types';

const typeColors: Record<NotificationType, string> = {
  comercial: 'bg-purple-500',
  operaciones: 'bg-emerald-500',
  finanzas: 'bg-amber-500',
  leads: 'bg-blue-500',
};

export function HubNotifications({ notifications }: HubNotificationsProps) {
  if (notifications.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <span>Notificaciones</span>
        </h3>
        <Link
          href="/opai/notificaciones"
          className="text-xs font-medium text-primary hover:underline"
        >
          Ver todas
          <ChevronRight className="inline h-3 w-3" />
        </Link>
      </div>
      <div className="space-y-2">
        {notifications.map((notif) => (
          <Link
            key={notif.id}
            href={notif.href}
            className="flex items-start gap-2.5 rounded-lg p-2 transition-colors hover:bg-accent/30"
          >
            <span
              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${typeColors[notif.type]}`}
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-foreground line-clamp-2">{notif.text}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {timeAgo(notif.timestamp)}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
