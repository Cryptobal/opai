"use client";

import React from "react";

export default function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border bg-card opai-glass-soft-m p-4 animate-pulse">
      {/* Header row: avatar + name/rut */}
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-muted" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-muted rounded w-3/4" />
          <div className="h-3 bg-muted rounded w-1/2" />
        </div>
      </div>

      {/* Detail rows */}
      <div className="space-y-2 mb-3">
        <div className="h-3 bg-muted rounded w-full" />
        <div className="h-3 bg-muted rounded w-5/6" />
      </div>

      {/* Footer: badge + timestamp */}
      <div className="flex items-center justify-between">
        <div className="h-5 w-16 bg-muted rounded-full" />
        <div className="h-3 w-20 bg-muted rounded" />
      </div>
    </div>
  );
}
