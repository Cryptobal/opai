'use client';

export function ImpersonateBanner() {
  const handleExit = async () => {
    await fetch('/api/platform/impersonate', { method: 'DELETE' });
    window.location.href = '/platform/dashboard';
  };

  return (
    <div className="flex items-center justify-center gap-3 bg-amber-400 px-4 py-2 text-sm font-medium text-amber-900">
      <span>Sesión de soporte — estás viendo como administrador del tenant</span>
      <button
        onClick={handleExit}
        className="rounded bg-amber-600 px-3 py-0.5 text-xs font-semibold text-white hover:bg-amber-700"
      >
        Salir
      </button>
    </div>
  );
}
