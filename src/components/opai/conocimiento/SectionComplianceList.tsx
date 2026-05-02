"use client";

import { cn } from "@/lib/utils";
import { MetricBar, thresholdFromScore } from "@/components/opai-ds";
import type { InstallationDetailSectionCompliance } from "@/lib/protocols/knowledge-aggregator-types";

const TEXT_COLOR = {
  ok:      "text-status-ok-fg",
  warn:    "text-status-warn-fg",
  danger:  "text-status-danger-fg",
  neutral: "text-ds-text-4",
} as const;

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
        <h3 className="font-display text-[14px] font-semibold mb-2 text-ds-text-1">
          {title}
        </h3>
      )}
      <div className="rounded-ds-md border border-ds-border-default bg-ds-surface-1 divide-y divide-ds-border-subtle">
        {sections.map((s) => {
          const t = s.percent !== null ? thresholdFromScore(s.percent) : "neutral";
          return (
            <div
              key={s.sectionId}
              className="flex items-center gap-3 px-3 py-2.5"
            >
              <span className="shrink-0 text-base" aria-hidden>{s.icon}</span>
              <span className="flex-1 min-w-0 text-[13px] text-ds-text-1 truncate">
                {s.title}
              </span>
              <div className="w-24 shrink-0">
                {s.percent !== null ? (
                  <MetricBar value={s.percent} threshold={t} />
                ) : (
                  <div className="h-1.5 rounded-full bg-ds-surface-3" />
                )}
              </div>
              <span
                className={cn(
                  "w-10 text-right text-[12px] font-mono ds-num shrink-0",
                  TEXT_COLOR[t],
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
