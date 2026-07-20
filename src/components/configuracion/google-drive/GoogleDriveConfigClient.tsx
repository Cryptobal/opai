"use client";

import { useCallback, useEffect, useState } from "react";
import { HardDrive } from "lucide-react";
import { SectionHeader, Surface, Tag, Spinner } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { OAuthResultBanner } from "@/components/configuracion/OAuthResultBanner";
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
    const mirrorConfig = { ...data.mirrorConfig, [key]: value };
    setData({ ...data, mirrorConfig });
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

  async function disconnect() {
    await fetch("/api/integrations/google-drive/disconnect", { method: "POST" });
    await load();
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
      <Surface elevation={1} padding="md" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/20">
              <HardDrive className="h-5 w-5" />
            </div>
            <div>
              <p className="font-display text-base font-semibold text-ds-text-1">Google Drive</p>
              <p className="text-[13px] text-ds-text-3">
                {connected ? data?.googleEmail : "Espejo documental OPAI → Drive"}
              </p>
            </div>
          </div>
          <Tag variant={connected ? "ok" : "neutral"} size="sm">
            {connected ? "Conectado" : "Sin conectar"}
          </Tag>
        </div>
        <div className="flex flex-wrap gap-2">
          {!connected ? (
            <Button asChild>
              <a href="/api/integrations/google-drive/oauth/start">
                <HardDrive className="mr-1.5 h-4 w-4" /> Conectar Drive
              </a>
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => void disconnect()}>
              Desconectar
            </Button>
          )}
        </div>
      </Surface>

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
