"use client";

import { useCallback } from "react";

export function ResizableDivider({ onResize }: { onResize: (pct: number) => void }) {
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const container = (e.target as HTMLElement).closest(
        "[data-monitor-layout]",
      ) as HTMLElement;
      if (!container) return;
      const containerRect = container.getBoundingClientRect();

      const handleMove = (moveE: MouseEvent) => {
        const pct =
          ((moveE.clientY - containerRect.top) / containerRect.height) * 100;
        onResize(Math.max(25, Math.min(75, pct)));
      };

      const handleUp = () => {
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleUp);
        document.body.style.cursor = "";
      };

      document.body.style.cursor = "row-resize";
      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleUp);
    },
    [onResize],
  );

  return (
    <div
      onMouseDown={handleMouseDown}
      className="h-1.5 bg-slate-800 hover:bg-teal-500/30 cursor-row-resize flex items-center justify-center transition-colors group flex-shrink-0"
    >
      <div className="w-12 h-0.5 bg-slate-600 group-hover:bg-teal-400 rounded-full transition-colors" />
    </div>
  );
}
