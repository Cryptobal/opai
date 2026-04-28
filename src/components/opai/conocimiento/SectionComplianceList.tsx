"use client";

import { cn } from "@/lib/utils";
import {
  Bar,
  thresholdFromScore,
  thresholdText,
} from "./_primitives";
import type { InstallationDetailSectionCompliance } from "@/lib/protocols/knowledge-aggregator-types";

export function SectionComplianceList({
  sections,
  title,
  className,
}: {
  sections: InstallationDetailSectionCompliance[];
  title?: string;
  className?: string;
}) {
  if (!sections.length) return null;
  return (
    <div className={cn("mb-5", className)}>
      {title && (
        <h3 className="font-display text-[13px] font-semibold mb-2 text-white">
          {title}
        </h3>
      )}
      <div className="card-mock-tight divide-y divide-white/5">
        {sections.map((s) => {
          const t = thresholdFromScore(s.percent);
          return (
            <div
              key={s.sectionId}
              className="flex items-center gap-3 px-3 py-2.5"
            >
              <span className="shrink-0 text-base">{s.icon}</span>
              <span className="flex-1 min-w-0 text-[12px] text-white/80 truncate">
                {s.title}
              </span>
              <div className="w-24 shrink-0">
                {s.percent !== null ? (
                  <Bar value={s.percent} threshold={t} />
                ) : (
                  <div className="bar-mock" />
                )}
              </div>
              <span
                className={cn(
                  "w-10 text-right text-[12px] font-mono num-tabular shrink-0",
                  s.percent !== null ? thresholdText(t) : "text-white/30",
                )}
              >
                {s.percent !== null ? `${s.percent}%` : "—"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
