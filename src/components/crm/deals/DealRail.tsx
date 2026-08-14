"use client";

import type { ReactNode } from "react";
import { DealAboutCard, type DealAboutCardProps } from "@/components/crm/deal/DealAboutCard";
import { DealDocumentosCard } from "./DealDocumentosCard";
import { DealIntegrationsCard } from "./DealIntegrationsCard";
import type { LicitacionDocRow } from "./useDealLicitacionDocs";

export function DealRail({
  ficha,
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
    <div className="mb-4 space-y-4 lg:mb-0 lg:ml-6 lg:w-[316px] lg:shrink-0 lg:self-start lg:sticky lg:top-[var(--app-topbar-offset)] lg:max-h-[calc(100dvh-var(--app-topbar-offset))] lg:overflow-y-auto">
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
