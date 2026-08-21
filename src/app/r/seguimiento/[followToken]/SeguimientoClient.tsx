"use client";

import { incidenteStatusView } from "@/lib/incidentes-instalacion/status";
import type { PublicFollowTimeline } from "@/lib/incidentes-instalacion/timeline";

export function SeguimientoClient({ data }: { data: PublicFollowTimeline }) {
  const current = incidenteStatusView(data.status);
  return (
    <div className="r-page">
      <header className="r-header">
        <p className="r-kicker">Seguimiento del reporte</p>
        <h1 className="r-code">{data.code}</h1>
        <p className="r-tenant">{data.installationName ?? data.title}</p>
      </header>

      <p className="r-status-now">
        Estado actual: <strong>{current.label}</strong>
      </p>

      <ol className="r-timeline">
        {data.steps.map((step) => (
          <li key={step.key} className={step.at ? "is-done" : "is-pending"}>
            <div className="r-tl-dot" />
            <div>
              <p className="r-tl-title">{step.label}</p>
              {step.at ? (
                <p className="r-tl-meta">
                  {new Date(step.at).toLocaleString("es-CL", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {step.guardName ? ` · ${step.guardName}` : ""}
                  {step.elapsedLabel ? ` · ${step.elapsedLabel}` : ""}
                </p>
              ) : (
                <p className="r-tl-meta">Pendiente</p>
              )}
              {step.comment ? <blockquote>{step.comment}</blockquote> : null}
              {step.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="r-tl-photo" src={step.photoUrl} alt="" />
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
