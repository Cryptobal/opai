"use client";

import { ExternalLink, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/opai-ds";

export function DealIntegrationsCard({
  slackHasRoom,
  slackChannelName,
  onSlackOpen,
  driveHasFolder,
  driveUrl,
  onDriveOpen,
}: {
  slackHasRoom: boolean;
  slackChannelName?: string | null;
  onSlackOpen: () => void;
  driveHasFolder: boolean;
  driveUrl?: string | null;
  onDriveOpen: () => void;
}) {
  return (
    <Surface elevation={1} padding="sm" className="space-y-1 lg:space-y-3 lg:p-4">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-ds-text-3">
        Integraciones
      </p>
      <div className="flex min-h-10 items-center justify-between gap-2 py-1">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[13px] font-medium text-ds-text-1">
            <Hash className="h-3.5 w-3.5 text-ds-text-3" />
            Slack
          </p>
          <p className="text-[12px] text-ds-text-3">
            {slackHasRoom
              ? `#${slackChannelName || "sala"}`
              : "No creada · solo manual"}
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" className="h-10 shrink-0 sm:h-9" onClick={onSlackOpen}>
          {slackHasRoom ? "Abrir" : "Crear sala"}
        </Button>
      </div>
      <div className="flex min-h-10 items-center justify-between gap-2 py-1">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-ds-text-1">Google Drive</p>
          <p className="text-[12px] text-ds-text-3">
            {driveHasFolder ? "Carpeta lista" : "Sin carpeta"}
          </p>
        </div>
        {driveUrl ? (
          <Button type="button" size="sm" variant="outline" className="h-10 shrink-0 sm:h-9" asChild>
            <a href={driveUrl} target="_blank" rel="noreferrer">
              Abrir <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
        ) : (
          <Button type="button" size="sm" variant="outline" className="h-10 shrink-0 sm:h-9" onClick={onDriveOpen}>
            Crear
          </Button>
        )}
      </div>
    </Surface>
  );
}
