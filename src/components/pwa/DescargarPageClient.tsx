'use client';
import { useEffect, useState } from 'react';
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
  const [wasInstalledBefore, setWasInstalledBefore] = useState(false);

  useEffect(() => {
    const key = `pwa-installed-${redirectTo}`;
    if (isInstalled) {
      const prev = localStorage.getItem(key);
      if (prev) {
        setWasInstalledBefore(true);
      } else {
        localStorage.setItem(key, 'true');
      }
    }
  }, [isInstalled, redirectTo]);

  useEffect(() => {
    if (wasInstalledBefore) {
      window.location.href = redirectTo;
    }
  }, [wasInstalledBefore, redirectTo]);

  if (wasInstalledBefore) {
    return (
      <div className="fixed inset-0 z-50 bg-[#0a0a0f] flex items-center justify-center">
        <div className="animate-pulse text-zinc-400 text-sm">Redirigiendo...</div>
      </div>
    );
  }

  return (
    <PWAInstallBanner
      appName={appName}
      appDescription={appDescription}
      iconSrc={iconSrc}
      variant="fullscreen"
    />
  );
}
