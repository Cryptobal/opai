import { getGreeting } from '../_lib/hub-utils';
import type { HubGreetingProps } from '../_lib/hub-types';

export function HubGreeting({ firstName, pendingFollowUpsCount }: HubGreetingProps) {
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
  );
}
