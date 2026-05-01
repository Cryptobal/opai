"use client";

interface AutoMarkToastProps {
  checkpointName: string;
  onAddPhoto: () => void;
  onDismiss: () => void;
  autoDismissMs?: number;
}

export function AutoMarkToast({
  checkpointName,
  onAddPhoto,
  onDismiss,
}: AutoMarkToastProps) {
  return (
    <div
      className="fixed inset-x-4 z-[70] animate-in slide-in-from-top duration-300"
      style={{ top: "calc(var(--safe-area-top, 0px) + 1rem)" }}
    >
      <div className="relative overflow-hidden rounded-2xl border border-status-ok-border bg-status-ok-soft/90 shadow-lg shadow-status-ok/30 backdrop-blur-sm">
        <div className="flex flex-col gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            {/* Animated checkmark */}
            <div className="flex h-9 w-9 shrink-0 items-center justify-content rounded-full bg-status-ok-soft">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 text-status-ok-fg mx-auto"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
                style={{ animation: "scale-check 0.3s ease-out" }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>

            {/* Text */}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-status-ok-fg">
                {checkpointName} marcado
              </p>
              <p className="text-xs text-status-ok-fg/60">Marcacion automatica por geocerca</p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddPhoto();
              }}
              className="flex-1 rounded-lg border border-status-ok-border bg-status-ok-soft px-3 py-2 text-sm font-medium text-status-ok-fg transition-colors active:brightness-95"
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
