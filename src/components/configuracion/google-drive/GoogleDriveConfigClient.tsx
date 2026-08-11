"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/opai-ds";
import { OAuthResultBanner } from "@/components/configuracion/OAuthResultBanner";
import { DEFAULT_MIRROR_CONFIG } from "@/lib/google-workspace/drive-mirror-config";
import type { PendingCount } from "@/lib/google-workspace/drive-pending-counts";
import { DriveStatusCard } from "./DriveStatusCard";
import { DriveMirrorSection } from "./DriveMirrorSection";
import { DriveAdvancedPanel } from "./DriveAdvancedPanel";
import { DriveActivityTable, type DriveOutboxRow } from "./DriveActivityTable";

type ConfigResponse = {
  connected: boolean;
  googleEmail: string | null;
  mode: "OAUTH" | "SHARED_DRIVE";
  sharedDriveId: string | null;
  sharedDriveName: string | null;
  lastSyncAt: string | null;
  mirrorConfig: Record<string, boolean>;
  pendingByDocType: Record<string, PendingCount>;
  destinationByDocType: Record<string, string>;
  totalInDrive: number;
  inFlight: number;
  errorCount: number;
  serviceAccountEmail: string | null;
  recent: DriveOutboxRow[];
  rootFolderUrl: string | null;
  rootFolderName: string | null;
  structureVersion: number;
  enabledModules: string[];
};

export function GoogleDriveConfigClient() {
  const [data, setData] = useState<ConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [repairing, setRepairing] = useState(false);
  const [countingTypes, setCountingTypes] = useState<Set<string>>(new Set());
  const [queuedByType, setQueuedByType] = useState<Record<string, number>>({});
  const [backfillingType, setBackfillingType] = useState<string | null>(null);

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

  async function refreshCounts(focusType?: string) {
    if (focusType) {
      setCountingTypes((prev) => new Set(prev).add(focusType));
    }
    try {
      const res = await fetch("/api/integrations/google-drive/config");
      if (!res.ok) throw new Error("refresh failed");
      const json = (await res.json()) as ConfigResponse;
      setData(json);
    } finally {
      if (focusType) {
        setCountingTypes((prev) => {
          const next = new Set(prev);
          next.delete(focusType);
          return next;
        });
      }
    }
  }

  async function patchConfig(key: string, value: boolean) {
    if (!data) return;
    setData({ ...data, mirrorConfig: { ...data.mirrorConfig, [key]: value } });
    setQueuedByType((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    try {
      await fetch("/api/integrations/google-drive/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mirrorConfig: { [key]: value } }),
      });
      if (value) await refreshCounts(key);
    } catch {
      toast.error("No se pudo guardar el interruptor");
    }
  }

  async function backfill(docType: string) {
    setBackfillingType(docType);
    try {
      const res = await fetch("/api/integrations/google-drive/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docType }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Backfill falló");
      const queued = Number(json.queued ?? 0);
      const folders = Number(json.foldersCreated ?? 0);
      const skipped = Number(json.skipped ?? 0);
      if (queued > 0) {
        setQueuedByType((prev) => ({ ...prev, [docType]: queued }));
        toast.success(`${queued} documentos en cola`);
      } else if (folders > 0) {
        toast.success(`${folders} carpetas creadas`);
      } else {
        toast.message(
          skipped > 0
            ? `Nada nuevo en cola (${skipped} omitidos)`
            : "Nada pendiente para subir",
        );
      }
      if (json.remaining > 0) {
        toast.message("Quedan documentos: podés volver a pulsar Subirlos");
      }
      await refreshCounts(docType);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo encolar");
    } finally {
      setBackfillingType(null);
    }
  }

  async function repairStructure() {
    setRepairing(true);
    try {
      const res = await fetch("/api/integrations/google-drive/ensure-structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "migrate" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "fail");
      toast.success(
        json.foldersMoved || json.cacheRewritten
          ? "Estructura revisada"
          : "Estructura ya estaba al día",
      );
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo revisar");
    } finally {
      setRepairing(false);
    }
  }

  async function changeUnit(sharedDriveId: string) {
    const res = await fetch("/api/integrations/google-drive/shared-drive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sharedDriveId }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Activación fallida");
    toast.success("Unidad activada");
    await load();
  }

  async function disconnect() {
    const res = await fetch("/api/integrations/google-drive/disconnect", {
      method: "POST",
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      toast.error(json.error || "No se pudo desconectar");
      return;
    }
    toast.success("Drive desconectado");
    await load();
  }

  const pendingTotal = useMemo(() => {
    if (!data?.pendingByDocType) return 0;
    return Object.values(data.pendingByDocType).reduce(
      (acc, c) => acc + (c?.pending ?? 0) + (c?.pendingFolders ?? 0),
      0,
    );
  }, [data?.pendingByDocType]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  const connected = Boolean(data?.connected);
  const config = data?.mirrorConfig ?? DEFAULT_MIRROR_CONFIG;

  return (
    <div className="ds-page-enter space-y-6">
      <OAuthResultBanner
        param="drive"
        startHref="/api/integrations/google-drive/oauth/start"
        onConnected={load}
      />
      <DriveStatusCard
        connected={connected}
        driveName={
          data?.sharedDriveName ||
          data?.rootFolderName ||
          "Google Drive"
        }
        mode={data?.mode ?? "OAUTH"}
        totalInDrive={data?.totalInDrive ?? 0}
        inFlight={data?.inFlight ?? 0}
        pendingTotal={pendingTotal}
        lastSyncAt={data?.lastSyncAt ?? null}
        rootFolderUrl={data?.rootFolderUrl ?? null}
      />
      <DriveMirrorSection
        config={config}
        destinations={data?.destinationByDocType ?? {}}
        pendingByDocType={data?.pendingByDocType ?? {}}
        enabledModules={data?.enabledModules ?? []}
        workspaceActive={connected}
        countingTypes={countingTypes}
        queuedByType={queuedByType}
        backfillingType={backfillingType}
        onToggle={(k, v) => void patchConfig(k, v)}
        onBackfill={(k) => void backfill(k)}
      />
      {connected && (
        <DriveAdvancedPanel
          mode={data?.mode ?? "OAUTH"}
          sharedDriveId={data?.sharedDriveId ?? null}
          sharedDriveName={data?.sharedDriveName ?? null}
          serviceAccountEmail={data?.serviceAccountEmail ?? null}
          googleEmail={data?.googleEmail ?? null}
          structureVersion={data?.structureVersion ?? 1}
          repairing={repairing}
          onRepair={() => void repairStructure()}
          onChangeUnit={changeUnit}
          onDisconnect={disconnect}
        />
      )}
      <DriveActivityTable
        rows={data?.recent ?? []}
        inFlight={data?.inFlight ?? 0}
        errorCount={data?.errorCount ?? 0}
      />
    </div>
  );
}
