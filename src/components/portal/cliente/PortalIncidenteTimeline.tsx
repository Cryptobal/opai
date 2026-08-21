"use client";

import { IncidenteStatusBadge } from "@/components/incidentes/IncidenteStatusBadge";

type Step = {
  key: string;
  label: string;
  at?: string | null;
  meta?: string | null;
  guardName?: string | null;
  elapsedLabel?: string | null;
  comment?: string | null;
  photoUrl?: string | null;
};

export function PortalIncidenteTimeline(props: {
  status: string;
  steps: Step[];
}) {
  return (
    <div className="space-y-3">
      <IncidenteStatusBadge status={props.status} />
      <ol className="space-y-3">
        {props.steps.map((step) => (
          <li key={step.key} className="flex gap-3">
            <span
              className={`mt-1 h-3 w-3 shrink-0 rounded-full ${
                step.at ? "bg-status-ok" : "bg-ds-surface-3"
              }`}
            />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-medium">{step.label}</p>
              {step.at ? (
                <p className="text-[12px] text-ds-text-3">
                  {new Date(step.at).toLocaleString("es-CL", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {(() => {
                    const extra = [step.guardName, step.elapsedLabel, step.meta]
                      .filter(Boolean)
                      .join(" · ");
                    return extra ? ` · ${extra}` : "";
                  })()}
                </p>
              ) : (
                <p className="text-[12px] text-ds-text-3">Pendiente</p>
              )}
              {step.comment ? (
                <blockquote className="mt-1 rounded-lg bg-ds-surface-2 px-3 py-2 text-[13px]">
                  {step.comment}
                </blockquote>
              ) : null}
              {step.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={step.photoUrl} alt="" className="mt-2 w-full rounded-lg" />
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
