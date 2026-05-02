'use client';

import { useRouter } from 'next/navigation';

export function ImpersonateBanner() {
  const router = useRouter();
  const handleExit = async () => {
    await fetch('/api/platform/impersonate', { method: 'DELETE' });
    router.push('/platform/dashboard');
    router.refresh();
  };

  return (
    <div className="flex items-center justify-center gap-3 bg-status-warn px-4 py-2 text-sm font-medium text-white">
      <span>Sesión de soporte — estás viendo como administrador del tenant</span>
      <button
        onClick={handleExit}
        className="rounded bg-status-warn-fg px-3 py-0.5 text-xs font-semibold text-white hover:brightness-110"
      >
        Salir
      </button>
    </div>
  );
}
