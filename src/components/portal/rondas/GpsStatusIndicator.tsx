"use client";

interface GpsStatusProps {
  accuracy: number | null;
  isWatching: boolean;
}

export function GpsStatusIndicator({ accuracy, isWatching }: GpsStatusProps) {
  if (!isWatching) {
    return (
      <div className="flex items-center gap-1.5 rounded-lg bg-gray-800/80 px-2.5 py-1.5 backdrop-blur-sm">
        <SignalIcon bars={0} color="text-gray-500" />
        <span className="text-xs font-medium text-gray-500">Sin GPS</span>
      </div>
    );
  }

  if (accuracy == null) {
    return (
      <div className="flex items-center gap-1.5 rounded-lg bg-gray-800/80 px-2.5 py-1.5 backdrop-blur-sm">
        <SignalIcon bars={1} color="text-status-warn-fg" />
        <span className="text-xs font-medium text-status-warn-fg animate-pulse">Buscando...</span>
      </div>
    );
  }

  const { label, color, bars } = getGpsLevel(accuracy);

  return (
    <div className="flex items-center gap-1.5 rounded-lg bg-gray-800/80 px-2.5 py-1.5 backdrop-blur-sm">
      <SignalIcon bars={bars} color={color} />
      <span className={`text-xs font-medium ${color}`}>{label}</span>
      <span className="text-xs text-gray-500">{Math.round(accuracy)}m</span>
    </div>
  );
}

function getGpsLevel(accuracy: number): { label: string; color: string; bars: number } {
  if (accuracy <= 10) return { label: "Preciso", color: "text-status-ok-fg", bars: 4 };
  if (accuracy <= 30) return { label: "Normal", color: "text-status-ok-fg", bars: 3 };
  if (accuracy <= 50) return { label: "Impreciso", color: "text-status-warn-fg", bars: 2 };
  return { label: "Debil", color: "text-status-danger-fg", bars: 1 };
}

function SignalIcon({ bars, color }: { bars: number; color: string }) {
  return (
    <svg className={`h-3.5 w-3.5 ${color}`} viewBox="0 0 16 16" fill="currentColor">
      <rect x="1" y="12" width="2.5" height="3" rx="0.5" opacity={bars >= 1 ? 1 : 0.2} />
      <rect x="5" y="9" width="2.5" height="6" rx="0.5" opacity={bars >= 2 ? 1 : 0.2} />
      <rect x="9" y="5" width="2.5" height="10" rx="0.5" opacity={bars >= 3 ? 1 : 0.2} />
      <rect x="13" y="1" width="2.5" height="14" rx="0.5" opacity={bars >= 4 ? 1 : 0.2} />
    </svg>
  );
}
