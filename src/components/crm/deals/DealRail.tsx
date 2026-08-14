"use client";

import type { ReactNode } from "react";
import { DealAboutCard, type DealAboutCardProps } from "@/components/crm/deal/DealAboutCard";
import { DealDocumentosCard } from "./DealDocumentosCard";
import { DealIntegrationsCard } from "./DealIntegrationsCard";
import type { LicitacionDocRow } from "./useDealLicitacionDocs";
import { Surface } from "@/components/opai-ds";
import { InlineEditField } from "@/components/opai/InlineEditField";
import { normalizeMoneyClp } from "@/lib/validations/field-normalizers";

export function DealRail({
  ficha,
  montoManual,
  onMontoCommit,
  canEdit,
  afterFicha,
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
  montoManual: string | null;
  onMontoCommit: (key: string, value: string | null) => Promise<string | null>;
  canEdit: boolean;
  afterFicha?: ReactNode;
  documentos: {
    dealId: string;
    files: LicitacionDocRow[];
    loading: boolean;
    error: string | null;
    onReload: () => void;
    onOpenFolder: () => void;
    driveUrl?: string | null;
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
    <div className="mb-4 space-y-4 lg:mb-0 lg:ml-6 lg:w-[316px] lg:shrink-0 lg:self-start lg:sticky lg:top-[var(--app-topbar-offset)] lg:max-h-[calc(100dvh-var(--app-topbar-offset))] lg:overflow-y-auto">
      <DealAboutCard {...ficha} />
      {montoManual && Number(montoManual) > 0 ? (
        <Surface elevation={1} padding="md">
          <InlineEditField
            label="Monto manual"
            fieldKey="amount"
            type="money"
            value={montoManual}
            canEdit={canEdit}
            normalize={normalizeMoneyClp}
            displayValue={(v) => (v ? `$${Number(v).toLocaleString("es-CL")}` : null)}
            onCommit={onMontoCommit}
          />
        </Surface>
      ) : null}
      {afterFicha}
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
