'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PlatformAiProvidersConfig } from '@/components/platform/PlatformAiProvidersConfig';

export default function PlatformAiPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetch('/api/platform/ai-providers')
      .then((res) => {
        if (res.status === 401) {
          router.push('/platform/login');
          return;
        }
        setReady(true);
      })
      .catch(() => {
        router.push('/platform/login');
      });
  }, [router]);

  if (!ready) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-48 animate-pulse rounded-xl border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-gray-900"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          IA / Providers
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Configura el proveedor de IA centralizado para toda la plataforma. Todos los tenants y el sitio de marketing usan esta configuración.
        </p>
      </div>
      <PlatformAiProvidersConfig />
    </div>
  );
}
