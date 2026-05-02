import { LayoutDashboard } from 'lucide-react';
import { PageHero } from '@/components/opai-ds';
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

  const subtitleParts = [`${capitalDay} ${dateStr}`];
  if (pendingFollowUpsCount > 0) {
    subtitleParts.push(
      `${pendingFollowUpsCount} seguimiento${pendingFollowUpsCount !== 1 ? 's' : ''} pendiente${pendingFollowUpsCount !== 1 ? 's' : ''}`,
    );
  }

  return (
    <PageHero
      icon={<LayoutDashboard />}
      iconTone="primary"
      title={`${greeting}, ${firstName}`}
      subtitle={subtitleParts.join(' · ')}
    />
  );
}
