"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { SectionHeader, Surface, Spinner } from "@/components/opai-ds";
import { OAuthResultBanner } from "@/components/configuracion/OAuthResultBanner";
import { DriveConnectionCard } from "./DriveConnectionCard";
import { DriveMirrorToggles } from "./DriveMirrorToggles";
import { DriveTreePreview } from "./DriveTreePreview";
import { DriveActivityTable, type DriveOutboxRow } from "./DriveActivityTable";
import { SharedDriveSetupCard } from "./SharedDriveSetupCard";
import { DEFAULT_MIRROR_CONFIG } from "@/lib/google-workspace/drive-mirror-config";

type ConfigResponse = {
  connected: boolean;
  googleEmail: string | null;
  mode: "OAUTH" | "SHARED_DRIVE";
  sharedDriveId: string | null;
  sharedDriveName: string | null;
  lastIngestAt: string | null;
  lastIngestError: string | null;
  ingestCounts: Record<string, number>;
  mirrorConfig: Record<string, boolean>;
  recent: DriveOutboxRow[];
  rootFolderUrl: string | null;
  rootFolderName: string | null;
  structureVersion: number;
  enabledModules: string[];
  duplicateRoots: Array<{ id: string; createdTime?: string | null }>;
};

export function GoogleDriveConfigClient() {
  const [data, setData] = useState<ConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creatingStructure, setCreatingStructure] = useState(false);
  const [repairing, setRepairing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/integrations/google-drive/config");
      if (!res.ok) throw new Error("load failed");
      setData(await res.json());
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function patchConfig(key: string, value: boolean) {
    if (!data) return;
    setData({ ...data, mirrorConfig: { ...data.mirrorConfig, [key]: value } });
    setSaving(true);
    try {
      await fetch("/api/integrations/google-drive/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mirrorConfig: { [key]: value } }),
      });
    } finally {
      setSaving(false);
    }
  }

  async function createStructure() {
    setCreatingStructure(true);
    try {
      const res = await fetch("/api/integrations/google-drive/ensure-structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "fail");
      const n = Array.isArray(json.paths) ? json.paths.length : 0;
      toast.success(
        n === 0
          ? "Nada que crear: activá al menos un tipo en un módulo habilitado"
          : `${n} carpeta(s) listas en Drive`,
      );
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo crear la estructura");
    } finally {
      setCreatingStructure(false);
    }
  }

  async function repairStructure(consolidateRoots: boolean) {
    setRepairing(true);
    try {
      const res = await fetch("/api/integrations/google-drive/ensure-structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: consolidateRoots ? "repair" : "migrate" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "fail");
      const parts = [
        json.foldersMoved ? `${json.foldersMoved} movidas` : null,
        json.foldersRenamed ? `${json.foldersRenamed} renombradas` : null,
        json.rootsTrashed ? `${json.rootsTrashed} raíces a papelera` : null,
        json.cacheRewritten ? `${json.cacheRewritten} pathKeys` : null,
      ].filter(Boolean);
      toast.success(
        parts.length
          ? `Reparación: ${parts.join(", ")}`
          : "Estructura ya estaba al día (0 cambios)",
      );
      if (json.hasMore) {
        toast.message("Quedaron movimientos pendientes: volvé a pulsar Reparar");
      }
      if (Array.isArray(json.rootsSkipped) && json.rootsSkipped.length > 0) {
        toast.message(
          `${json.rootsSkipped.length} raíz(ces) con contenido no visible no se enviaron a papelera`,
        );
      }
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo reparar la estructura");
    } finally {
      setRepairing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  const connected = Boolean(data?.connected);
  const config = data?.mirrorConfig ?? DEFAULT_MIRROR_CONFIG;
  const enabledModules = data?.enabledModules ?? [];

  return (
    <div className="ds-page-enter space-y-6">
      <OAuthResultBanner
        param="drive"
        startHref="/api/integrations/google-drive/oauth/start"
        onConnected={load}
      />
      <DriveConnectionCard
        connected={connected}
        googleEmail={data?.googleEmail ?? null}
        rootFolderUrl={data?.rootFolderUrl ?? null}
        structureVersion={data?.structureVersion ?? 1}
        duplicateRoots={data?.duplicateRoots ?? []}
        creatingStructure={creatingStructure}
        repairing={repairing}
        onCreateStructure={() => void createStructure()}
        onRepair={(consolidate) => void repairStructure(consolidate)}
        onDisconnect={() =>
          void fetch("/api/integrations/google-drive/disconnect", { method: "POST" }).then(load)
        }
      />
      <SharedDriveSetupCard
        mode={data?.mode ?? "OAUTH"}
        sharedDriveId={data?.sharedDriveId ?? null}
        sharedDriveName={data?.sharedDriveName ?? null}
        lastIngestAt={data?.lastIngestAt ?? null}
        lastIngestError={data?.lastIngestError ?? null}
        ingestCounts={data?.ingestCounts ?? {}}
        onChanged={() => void load()}
      />
      <Surface elevation={1} padding="md" className="space-y-3">
        <SectionHeader
          title="Tipos a espejar"
          hint={saving ? "Guardando…" : "Agrupados por módulo · OFF no crea carpetas"}
        />
        <DriveMirrorToggles
          config={config}
          disabled={!connected}
          enabledModules={enabledModules}
          onChange={(k, v) => void patchConfig(k, v)}
        />
      </Surface>
      <Surface elevation={1} padding="md" className="space-y-3">
        <SectionHeader title="Árbol de carpetas" hint="Vista previa según toggles y módulos" />
        <DriveTreePreview
          config={config}
          enabledModules={enabledModules}
          rootFolderName={data?.rootFolderName}
        />
      </Surface>
      <Surface elevation={1} padding="md" className="space-y-3">
        <SectionHeader title="Actividad reciente" hint="Últimas 20 exportaciones" />
        <DriveActivityTable rows={data?.recent ?? []} />
      </Surface>
    </div>
  );
}
