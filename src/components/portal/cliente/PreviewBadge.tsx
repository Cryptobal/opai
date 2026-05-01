"use client";

interface PreviewBadgeProps {
  onNavigateToPropuesta?: () => void;
}

export function PreviewBadge({ onNavigateToPropuesta }: PreviewBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border"
      style={{
        color: "#fbbf24",
        borderColor: "rgba(251, 191, 36, 0.3)",
        backgroundColor: "rgba(251, 191, 36, 0.08)",
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
      Vista previa · Demo
      {onNavigateToPropuesta && (
        <button
          onClick={(e) => { e.stopPropagation(); onNavigateToPropuesta(); }}
          className="ml-1 underline underline-offset-2 hover:text-status-warn-fg transition-colors"
        >
          Aprobar →
        </button>
      )}
    </span>
  );
}
