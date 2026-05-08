"use client";

/**
 * Portal supervisor — vista base (el detalle vivo vive en módulos de ops).
 */

export function PortalSupervisorClient() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-lg font-semibold">Portal supervisor</p>
      <p className="text-sm text-white/60">
        Esta vista se irá poblando con el tablero móvil de supervisión. Ya estás autenticado correctamente.
      </p>
    </div>
  );
}
