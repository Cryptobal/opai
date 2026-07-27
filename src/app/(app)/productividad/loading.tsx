/**
 * Esqueleto mínimo del hop `/productividad` → landing.
 * Evita blanco mientras resuelve auth/permisos o mientras el middleware
 * no tiene aún la cookie de landing.
 */
export default function ProductividadLoading() {
  return (
    <div className="min-h-[100dvh] bg-ds-surface-0 p-4 space-y-4">
      <div className="h-11 w-full max-w-sm rounded-xl bg-ds-surface-2" />
      <div className="h-24 rounded-2xl bg-ds-surface-2" />
      <div className="h-24 rounded-2xl bg-ds-surface-2" />
      <div className="h-40 rounded-2xl bg-ds-surface-2" />
    </div>
  );
}
