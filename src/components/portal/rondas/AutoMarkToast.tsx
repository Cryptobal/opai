"use client";

interface AutoMarkToastProps {
  checkpointName: string;
  onAddPhoto: () => void;
  onDismiss: () => void;
  autoDismissMs?: number;
  /** Si true: la marca quedó registrada pero fuera del radio (señal pobre).
   *  Se muestra con tono de advertencia, no de éxito. */
  geoNoVerificada?: boolean;
}

export function AutoMarkToast({
  checkpointName,
  onAddPhoto,
  onDismiss,
  geoNoVerificada,
}: AutoMarkToastProps) {
  const tone = geoNoVerificada ? "warn" : "ok";

  // Tokens semánticos del design system v3.
  const containerClass = tone === "warn"
    ? "relative overflow-hidden rounded-2xl border border-status-warn-border bg-status-warn-soft/90 shadow-lg shadow-status-warn/30 backdrop-blur-sm"
    : "relative overflow-hidden rounded-2xl border border-status-ok-border bg-status-ok-soft/90 shadow-lg shadow-status-ok/30 backdrop-blur-sm";

  const iconBgClass = tone === "warn"
    ? "flex h-9 w-9 shrink-0 items-center justify-content rounded-full bg-status-warn-soft"
    : "flex h-9 w-9 shrink-0 items-center justify-content rounded-full bg-status-ok-soft";

  const iconClass = tone === "warn"
    ? "h-5 w-5 text-status-warn-fg mx-auto"
    : "h-5 w-5 text-status-ok-fg mx-auto";

  const titleClass = tone === "warn"
    ? "text-sm font-semibold text-status-warn-fg"
    : "text-sm font-semibold text-status-ok-fg";

  const subtitleClass = tone === "warn"
    ? "text-xs text-status-warn-fg/70"
    : "text-xs text-status-ok-fg/60";

  const primaryButtonClass = tone === "warn"
    ? "flex-1 rounded-lg border border-status-warn-border bg-status-warn-soft px-3 py-2 text-sm font-medium text-status-warn-fg transition-colors active:brightness-95"
    : "flex-1 rounded-lg border border-status-ok-border bg-status-ok-soft px-3 py-2 text-sm font-medium text-status-ok-fg transition-colors active:brightness-95";

  const title = geoNoVerificada
    ? `${checkpointName} — ubicación sin confirmar`
    : `${checkpointName} marcado`;

  const subtitle = geoNoVerificada
    ? "Punto registrado, pero fuera del radio (señal débil)."
    : "Marcacion automatica por geocerca";

  // Icono: check para éxito, exclamación/warning para geo no verificada.
  const iconPath = geoNoVerificada
    ? "M12 9v2m0 4h.01M4.93 19h14.14a2 2 0 001.74-3l-7.07-12a2 2 0 00-3.48 0l-7.07 12a2 2 0 001.74 3z"
    : "M5 13l4 4L19 7";

  return (
    <div
      className="fixed inset-x-4 z-[70] animate-in slide-in-from-top duration-300"
      style={{ top: "calc(var(--safe-area-top, 0px) + 1rem)" }}
    >
      <div className={containerClass}>
        <div className="flex flex-col gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className={iconBgClass}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className={iconClass}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
                style={{ animation: "scale-check 0.3s ease-out" }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
              </svg>
            </div>

            <div className="min-w-0 flex-1">
              <p className={titleClass}>{title}</p>
              <p className={subtitleClass}>{subtitle}</p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddPhoto();
              }}
              className={primaryButtonClass}
            >
              Tomar Foto
            </button>
            <button
              onClick={onDismiss}
              className="flex-1 rounded-lg border border-gray-600/40 bg-gray-800/40 px-3 py-2 text-sm font-medium text-gray-300 transition-colors active:bg-gray-700/60"
            >
              Continuar
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes scale-check {
          0% { transform: scale(0); opacity: 0; }
          50% { transform: scale(1.2); }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
