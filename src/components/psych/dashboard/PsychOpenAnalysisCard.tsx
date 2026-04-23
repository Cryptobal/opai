"use client";

import type { OpenAnalysisResult } from "@/lib/psych/types";

export default function PsychOpenAnalysisCard({
  entry,
}: {
  entry: OpenAnalysisResult;
}) {
  if (entry.error) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        Análisis IA no disponible: {entry.error}
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <p className="text-sm text-slate-800 leading-relaxed">{entry.summary}</p>
      {entry.markers.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {entry.markers.map((m) => (
            <span
              key={m}
              className="text-xs px-2 py-1 rounded-md bg-slate-100 text-slate-700"
            >
              {m}
            </span>
          ))}
        </div>
      ) : null}
      {entry.flags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {entry.flags.map((f) => (
            <span
              key={f}
              className="text-xs px-2 py-1 rounded-md bg-rose-100 text-rose-800 font-medium"
            >
              {f}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
