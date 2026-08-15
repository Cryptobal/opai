"use client";

import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { DealAboutCard, type DealAboutCardProps } from "@/components/crm/deal/DealAboutCard";
import { DealDocumentosCard } from "./DealDocumentosCard";
import { DealIntegrationsCard } from "./DealIntegrationsCard";
import { formatDealDateCountdown, formatDealDateShort } from "@/components/crm/deals/deals-helpers";
import { WorkbenchGateRing } from "@/components/workbench";
import { cn } from "@/lib/utils";
import type { LicitacionDocRow } from "./useDealLicitacionDocs";

const MERCADO_PUBLICO_URL = "https://www.mercadopublico.cl/";

export interface DealRailLicitacionProps {
  fechaEntrega: string | null;
  docsDone: number;
  docsTotal: number;
  gate: string | null;
  milestones?: ReactNode;
}

export function DealRail({
  ficha,
  licitacion,
  documentos,
  associated,
  slackHasRoom,
  slackChannelName,
  onSlackOpen,
  driveHasFolder,
  driveUrl,
  onDriveOpen,
}: {
  ficha: DealAboutCardProps;
  /** Centro de licitación (solo negocios con isLicitacion). */
  licitacion?: DealRailLicitacionProps;
  documentos: {
    dealId: string;
    files: LicitacionDocRow[];
    loading: boolean;
    error: string | null;
    onReload: () => void;
    onOpenFolder: () => void;
    driveUrl?: string | null;
    showClassification?: boolean;
    onClassify?: (fileId: string, tipoCodigo: string | null) => Promise<{ ok: boolean; error?: string }>;
  };
  associated: ReactNode;
  slackHasRoom: boolean;
  slackChannelName?: string | null;
  onSlackOpen: () => void;
  driveHasFolder: boolean;
  driveUrl?: string | null;
  onDriveOpen: () => void;
}) {
  return (
    <div className="mb-4 space-y-4 lg:mb-0 lg:ml-6 lg:w-[336px] lg:shrink-0 lg:self-start lg:sticky lg:top-[var(--app-topbar-offset)] lg:max-h-[calc(100dvh-var(--app-topbar-offset))] lg:overflow-y-auto">
      {licitacion ? <DealLicitacionCentro {...licitacion} /> : null}
      <DealAboutCard {...ficha} />
      <DealDocumentosCard {...documentos} />
      {associated}
      <DealIntegrationsCard
        slackHasRoom={slackHasRoom}
        slackChannelName={slackChannelName}
        onSlackOpen={onSlackOpen}
        driveHasFolder={driveHasFolder}
        driveUrl={driveUrl}
        onDriveOpen={onDriveOpen}
      />
    </div>
  );
}

/** "Centro de licitación" — gate documental + hitos + acceso a Mercado Público. */
function DealLicitacionCentro({
  fechaEntrega,
  docsDone,
  docsTotal,
  gate,
  milestones,
}: DealRailLicitacionProps) {
  const cd = formatDealDateCountdown(fechaEntrega);
  const short = formatDealDateShort(fechaEntrega);

  return (
    <div
      className={cn(
        "space-y-3.5 rounded-[20px] border border-[var(--glass-border)] p-4",
        "bg-[var(--glass-fill)] shadow-[var(--glass-specular),0_10px_34px_rgba(0,0,0,0.32)]",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-ds-text-3">
          Centro de licitación
        </p>
        {short ? (
          <span
            className={cn(
              "shrink-0 text-[12px] font-medium",
              cd?.variant === "danger"
                ? "text-status-danger-fg"
                : cd?.variant === "warn"
                  ? "text-status-warn-fg"
                  : "text-ds-text-3",
            )}
          >
            {short}
            {cd ? ` · ${cd.text}` : ""}
          </span>
        ) : null}
      </div>

      <WorkbenchGateRing
        done={docsDone}
        total={docsTotal}
        hint={gate ? "Faltan bases técnicas" : undefined}
      />

      {milestones ? <div className="border-t border-white/[0.07] pt-3">{milestones}</div> : null}

      <a
        href={MERCADO_PUBLICO_URL}
        target="_blank"
        rel="noreferrer"
        className={cn(
          "flex min-h-10 items-center justify-between gap-2 rounded-xl border border-white/[0.08] px-3",
          "bg-[var(--glass-fill-soft)] text-[13px] font-medium text-ds-text-2 transition hover:text-ds-text-1",
        )}
      >
        Mercado Público
        <ExternalLink className="h-4 w-4 shrink-0 text-ds-text-3" />
      </a>
    </div>
  );
}
