"use client";

import { AlertTriangle, FileText, MapPin, Shield, User } from "lucide-react";
import Link from "next/link";
import type { TicketFinding } from "@/lib/tickets";

const LAYER_LABEL: Record<string, string> = {
  global: "Global",
  instalacion: "Instalación",
  guardia: "Guardia",
};

const SEVERITY_STYLE: Record<string, string> = {
  critical: "bg-status-danger-soft text-status-danger-fg border-status-danger-border",
  major: "bg-status-warn-soft text-status-warn-fg border-status-warn-border",
  minor: "bg-status-warn-soft text-status-warn-fg border-status-warn-border",
};

const CATEGORY_LABEL: Record<string, string> = {
  documentation: "Documentación",
  infrastructure: "Infraestructura",
  equipment: "Equipamiento",
  personnel: "Personal",
  other: "Otro",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface Props {
  finding: TicketFinding;
}

export function TicketFindingCard({ finding }: Props) {
  const documentName = finding.tipoDocNombre ?? finding.guardiaDocCode ?? "Sin documento";
  const documentCode = finding.tipoDocCodigo ?? finding.guardiaDocCode;
  const layerLabel = finding.tipoDocCapa
    ? LAYER_LABEL[String(finding.tipoDocCapa)] ?? String(finding.tipoDocCapa)
    : finding.guardiaDocCode ? "Guardia" : null;
  const severityCls = SEVERITY_STYLE[String(finding.severity)] ?? SEVERITY_STYLE.minor;
  const categoryLabel = CATEGORY_LABEL[String(finding.category)] ?? String(finding.category);

  return (
    <div className="rounded-xl border border-status-warn-border bg-status-warn-soft p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <FileText className="h-5 w-5 shrink-0 text-status-warn-fg mt-0.5" />
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wider text-status-warn-fg/70">
              Hallazgo de supervisión
            </p>
            <p className="text-base font-semibold text-foreground leading-snug">
              {documentName}
            </p>
            {documentCode && (
              <p className="font-mono text-[11px] text-muted-foreground">
                {documentCode}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {layerLabel && (
            <span className="rounded-full border border-white/10 bg-background/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {layerLabel}
            </span>
          )}
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${severityCls}`}>
            {finding.severity}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Categoría</p>
          <p className="font-medium">{categoryLabel}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Ocurrencias</p>
          <p className="font-medium">
            {finding.occurrenceCount}
            {finding.occurrenceCount > 1 && (
              <span className="ml-1 text-status-warn-fg">
                ({finding.occurrenceCount} visitas)
              </span>
            )}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Primera detección</p>
          <p className="font-medium">{formatDate(finding.firstDetectedAt)}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Última detección</p>
          <p className="font-medium">{formatDate(finding.lastDetectedAt)}</p>
        </div>
      </div>

      {finding.guardName && (
        <div className="flex items-center gap-2 rounded-lg border border-status-info-border bg-status-info-soft px-3 py-2 text-xs">
          <Shield className="h-3.5 w-3.5 text-status-info-fg" />
          <span className="text-status-info-fg font-medium">Guardia asociado:</span>
          <span>{finding.guardName}</span>
          {finding.guardCode && (
            <span className="font-mono text-[10px] text-status-info-fg/60">
              ({finding.guardCode})
            </span>
          )}
        </div>
      )}

      {(finding.lastVisitCheckInAt || finding.lastSupervisorName) && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <User className="h-3.5 w-3.5" />
          <span>
            Última visita:{" "}
            <span className="text-foreground font-medium">
              {formatDate(finding.lastVisitCheckInAt)}
            </span>
            {finding.lastSupervisorName && (
              <>
                {" · por "}
                <span className="text-foreground font-medium">
                  {finding.lastSupervisorName}
                </span>
              </>
            )}
          </span>
          {finding.lastVisitId && (
            <Link
              href={`/ops/supervision/${finding.lastVisitId}`}
              className="ml-auto text-primary hover:underline"
            >
              Ver visita →
            </Link>
          )}
        </div>
      )}

      {finding.photoUrl && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            Foto de evidencia
          </p>
          <a
            href={finding.photoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block"
          >
            <img
              src={finding.photoUrl}
              alt="Evidencia del hallazgo"
              className="max-h-48 rounded-lg border border-white/10 object-cover"
            />
          </a>
        </div>
      )}

      {finding.description && (
        <div className="rounded-lg bg-background/50 px-3 py-2 text-xs">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            Descripción del hallazgo
          </p>
          <p className="whitespace-pre-wrap leading-relaxed">{finding.description}</p>
        </div>
      )}
    </div>
  );
}
