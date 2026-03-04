'use client';
import { useEffect } from 'react';
import { useInstallPrompt } from '@/lib/pwa/use-install-prompt';
import { PWAInstallBanner } from './PWAInstallBanner';

interface Props {
  appName: string;
  appDescription: string;
  iconSrc: string;
  redirectTo: string;
}

export function DescargarPageClient({ appName, appDescription, iconSrc, redirectTo }: Props) {
  const { isInstalled } = useInstallPrompt();

  useEffect(() => {
    if (isInstalled) {
      window.location.href = redirectTo;
    }
  }, [isInstalled, redirectTo]);

  return (
    <PWAInstallBanner
      appName={appName}
      appDescription={appDescription}
      iconSrc={iconSrc}
      variant="fullscreen"
    />
  );
}
