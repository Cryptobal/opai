import { Smartphone } from 'lucide-react';
import { getGreeting } from '../_lib/hub-utils';
import type { HubGreetingProps } from '../_lib/hub-types';

export function HubGreeting({ firstName, pendingFollowUpsCount, showPortalLink }: HubGreetingProps) {
  const greeting = getGreeting();
  const now = new Date();
  const dayOfWeek = now.toLocaleDateString('es-CL', {
    timeZone: 'America/Santiago',
    weekday: 'long',
  });
  const dateStr = now.toLocaleDateString('es-CL', {
    timeZone: 'America/Santiago',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const capitalDay = dayOfWeek.charAt(0).toUpperCase() + dayOfWeek.slice(1);

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
          {greeting}, {firstName}
        </h1>
        <p className="text-xs text-muted-foreground">
          {capitalDay} {dateStr}
          {pendingFollowUpsCount > 0 && (
            <> &middot; {pendingFollowUpsCount} seguimiento{pendingFollowUpsCount !== 1 ? 's' : ''} pendiente{pendingFollowUpsCount !== 1 ? 's' : ''}</>
          )}
        </p>
      </div>
      {showPortalLink && (
        <a
          href="/portal/supervisor"
          className="flex items-center gap-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded-lg transition-colors shrink-0 mt-0.5 shadow-sm"
        >
          <Smartphone size={13} />
          <span>Portal</span>
        </a>
      )}
    </div>
  );
}
