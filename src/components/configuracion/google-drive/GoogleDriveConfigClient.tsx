"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { SectionHeader, Surface, Spinner } from "@/components/opai-ds";
import { OAuthResultBanner } from "@/components/configuracion/OAuthResultBanner";
import { DriveConnectionCard } from "./DriveConnectionCard";
import { DriveMirrorToggles } from "./DriveMirrorToggles";
import { DriveTreePreview } from "./DriveTreePreview";
import { DriveActivityTable, type DriveOutboxRow } from "./DriveActivityTable";
import { DEFAULT_MIRROR_CONFIG } from "@/lib/google-workspace/drive-mirror-config";

type ConfigResponse = {
  connected: boolean;
  googleEmail: string | null;
  mirrorConfig: Record<string, boolean>;
  recent: DriveOutboxRow[];
};

export function GoogleDriveConfigClient() {
  const [data, setData] = useState<ConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creatingStructure, setCreatingStructure] = useState(false);

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
      const res = await fetch("/api/integrations/google-drive/ensure-structure", { method: "POST" });
      if (!res.ok) throw new Error("fail");
      toast.success("Estructura inicial creada en Drive");
      await load();
    } catch {
      toast.error("No se pudo crear la estructura en Drive");
    } finally {
      setCreatingStructure(false);
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
        creatingStructure={creatingStructure}
        onCreateStructure={() => void createStructure()}
        onDisconnect={() =>
          void fetch("/api/integrations/google-drive/disconnect", { method: "POST" }).then(load)
        }
      />
      <Surface elevation={1} padding="md" className="space-y-3">
        <SectionHeader title="Tipos a espejar" hint={saving ? "Guardando…" : "Solo tipos con PDF persistido"} />
        <DriveMirrorToggles config={config} disabled={!connected} onChange={(k, v) => void patchConfig(k, v)} />
      </Surface>
      <Surface elevation={1} padding="md" className="space-y-3">
        <SectionHeader title="Árbol de carpetas" hint="Vista previa estática según toggles" />
        <DriveTreePreview config={config} />
      </Surface>
      <Surface elevation={1} padding="md" className="space-y-3">
        <SectionHeader title="Actividad reciente" hint="Últimas 20 exportaciones" />
        <DriveActivityTable rows={data?.recent ?? []} />
      </Surface>
    </div>
  );
}
