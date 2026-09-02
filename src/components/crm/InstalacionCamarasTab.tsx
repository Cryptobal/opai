"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Video } from "lucide-react";
import { EmptyState, Spinner, Surface } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { CamaraTile } from "@/components/ops/camaras/CamaraTile";
import { CamaraFormDialog } from "@/components/ops/camaras/CamaraFormDialog";
import { CamaraViewerModal } from "@/components/ops/camaras/CamaraViewerModal";
import type { CamaraDto, RelayAccess } from "@/components/ops/camaras/types";

export function InstalacionCamarasTab({ installationId }: { installationId: string }) {
  const [cameras, setCameras] = useState<CamaraDto[]>([]);
  const [canConfigure, setCanConfigure] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CamaraDto | null>(null);
  const [viewer, setViewer] = useState<CamaraDto | null>(null);
  const [relay, setRelay] = useState<RelayAccess | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/ops/camaras?installationId=${encodeURIComponent(installationId)}`);
    const json = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(typeof json.error === "string" ? json.error : "No se pudieron cargar las cámaras");
      return;
    }
    setCanConfigure(Boolean(json.canConfigure));
    setCameras(json.data ?? []);
  }, [installationId]);

  useEffect(() => { void load(); }, [load]);

  const requestToken = useCallback(async (ids: string[]) => {
    if (ids.length === 0) {
      setRelay(null);
      return;
    }
    const res = await fetch("/api/ops/camaras/relay-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cameraIds: ids.slice(0, 16) }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) setRelay({ token: json.token, relayUrl: json.relayUrl, streams: json.streams });
  }, []);

  useEffect(() => {
    void requestToken(cameras.map((c) => c.id));
  }, [cameras, requestToken]);

  if (loading) {
    return (
      <div className="flex justify-center py-12"><Spinner /></div>
    );
  }

  if (error) {
    return <p className="text-ds-body text-status-danger-fg">{error}</p>;
  }

  return (
    <div className="ds-page-enter space-y-4">
      <div className="flex justify-end">
        {canConfigure && (
          <Button
            type="button"
            className="h-10 sm:h-9"
            onClick={() => { setEditing(null); setFormOpen(true); }}
          >
            <Plus className="h-4 w-4" />
            Agregar cámara
          </Button>
        )}
      </div>
      {cameras.length === 0 ? (
        <EmptyState
          icon={Video}
          title="Sin cámaras"
          description="Registra un NVR o una cámara IP para verla en vivo."
          action={canConfigure ? (
            <Button type="button" className="h-10 sm:h-9" onClick={() => setFormOpen(true)}>
              Agregar cámara
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cameras.map((cam) => (
            <div key={cam.id} className="space-y-2">
              <CamaraTile
                camera={cam}
                token={relay?.token ?? null}
                relayUrl={relay?.relayUrl ?? null}
                live={cam.status !== "offline"}
                onOpen={() => setViewer(cam)}
                onUnauthorized={() => void requestToken(cameras.map((c) => c.id))}
              />
              {canConfigure && (
                <Surface padding="sm" className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="h-11 px-3 text-ds-body text-ds-text-2"
                    onClick={() => { setEditing(cam); setFormOpen(true); }}
                  >
                    Editar
                  </button>
                </Surface>
              )}
            </div>
          ))}
        </div>
      )}
      {formOpen && (
        <CamaraFormDialog
          open={formOpen}
          installationId={installationId}
          camera={editing}
          onClose={() => setFormOpen(false)}
          onSaved={() => void load()}
        />
      )}
      <CamaraViewerModal
        camera={viewer}
        token={relay?.token ?? null}
        relayUrl={relay?.relayUrl ?? null}
        onClose={() => setViewer(null)}
        onUnauthorized={() => viewer && void requestToken([viewer.id])}
      />
    </div>
  );
}
