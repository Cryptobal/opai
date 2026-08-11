"use client";

import { SectionHeader, Surface } from "@/components/opai-ds";
import {
  MIRROR_DOC_TYPE_GROUPS,
  type SupportedDocType,
} from "@/lib/google-workspace/drive-mirror-config";
import type { PendingCount } from "@/lib/google-workspace/drive-pending-counts";
import { DriveMirrorRow } from "./DriveMirrorRow";

type Props = {
  config: Record<string, boolean>;
  destinations: Record<string, string>;
  pendingByDocType: Record<string, PendingCount>;
  enabledModules: string[];
  workspaceActive: boolean;
  countingTypes: Set<string>;
  queuedByType: Record<string, number>;
  backfillingType: string | null;
  onToggle: (docType: string, value: boolean) => void;
  onBackfill: (docType: string) => void;
};

export function DriveMirrorSection({
  config,
  destinations,
  pendingByDocType,
  enabledModules,
  workspaceActive,
  countingTypes,
  queuedByType,
  backfillingType,
  onToggle,
  onBackfill,
}: Props) {
  const modSet = new Set(enabledModules);

  return (
    <Surface elevation={1} padding="md" className="space-y-5">
      <SectionHeader
        title="Qué se espeja"
        hint={
          workspaceActive
            ? "Activá un tipo para espejar lo nuevo; el histórico se ofrece en la fila"
            : "Conectá Drive para habilitar el espejo"
        }
      />
      {!workspaceActive && (
        <p className="text-[13px] text-status-warn-fg">
          Workspace inactivo: los tipos están deshabilitados hasta conectar Drive.
        </p>
      )}
      {MIRROR_DOC_TYPE_GROUPS.map((group) => {
        const moduleOn =
          group.tenantModules.length === 0 ||
          group.tenantModules.some((m) => modSet.has(m));
        return (
          <div
            key={group.module}
            className={moduleOn ? "space-y-2" : "space-y-2 opacity-60"}
          >
            <SectionHeader
              title={group.label}
              hint={
                moduleOn
                  ? undefined
                  : "Módulo no habilitado en el tenant — contactá a un administrador"
              }
            />
            <ul className="space-y-2">
              {group.docTypes.map((key: SupportedDocType) => (
                <DriveMirrorRow
                  key={key}
                  docType={key}
                  enabled={Boolean(config[key])}
                  disabled={!workspaceActive || !moduleOn}
                  destination={destinations[key] ?? key}
                  pending={pendingByDocType[key]}
                  counting={countingTypes.has(key)}
                  queuedCount={queuedByType[key] ?? null}
                  backfilling={backfillingType === key}
                  onToggle={(v) => onToggle(key, v)}
                  onBackfill={() => onBackfill(key)}
                />
              ))}
            </ul>
          </div>
        );
      })}
    </Surface>
  );
}
