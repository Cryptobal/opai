"use client";

export function PreviewBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border"
      style={{
        color: "#2dd4bf",
        borderColor: "rgba(45, 212, 191, 0.3)",
        backgroundColor: "rgba(45, 212, 191, 0.08)",
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
      Vista previa
    </span>
  );
}
