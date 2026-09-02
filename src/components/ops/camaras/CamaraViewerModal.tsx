"use client";

import { useCallback, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/opai-ds";
import { CamaraPlayer } from "./CamaraPlayer";
import { CamaraPtzControls } from "./CamaraPtzControls";
import { BRAND_LABELS, cameraStatusLabel, cameraStatusVariant } from "./status";
import type { CamaraDto } from "./types";

type Props = {
  camera: CamaraDto | null;
  token: string | null;
  relayUrl: string | null;
  onClose: () => void;
  onUnauthorized?: () => void;
};

export function CamaraViewerModal({ camera, token, relayUrl, onClose, onUnauthorized }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [ptzMsg, setPtzMsg] = useState<string | null>(null);

  const ptz = useCallback(async (body: Record<string, unknown>) => {
    if (!camera) return;
    const res = await fetch(`/api/ops/camaras/${camera.id}/ptz`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setPtzMsg(typeof json.error === "string" ? json.error : "PTZ no disponible");
    }
  }, [camera]);

  const snapshot = () => {
    const video = wrapRef.current?.querySelector("video");
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/jpeg", 0.9);
    a.download = `${camera?.name ?? "camara"}.jpg`;
    a.click();
  };

  return (
    <Dialog open={Boolean(camera)} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-5xl border-ds-border-default bg-ds-surface-1 p-0">
        {camera && (
          <div className="flex flex-col">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <DialogTitle className="truncate font-display text-lg text-ds-text-1">
                  {camera.name}
                </DialogTitle>
                <p className="text-[13px] text-ds-text-3">
                  {BRAND_LABELS[camera.brand] ?? camera.brand} · {camera.installation?.name ?? ""}
                </p>
              </div>
              <Tag variant={cameraStatusVariant(camera.status)} dot>
                {cameraStatusLabel(camera.status)}
              </Tag>
            </div>
            <div ref={wrapRef} className="aspect-video bg-ds-surface-2">
              <CamaraPlayer
                src={camera.streamName}
                token={token}
                relayUrl={relayUrl}
                enabled
                onUnauthorized={onUnauthorized}
                className="h-full w-full"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              {camera.ptzCapable ? (
                <CamaraPtzControls
                  onMove={(pan, tilt, zoom) => void ptz({ action: "move", pan, tilt, zoom })}
                  onStop={() => void ptz({ action: "stop" })}
                />
              ) : (
                <p className="text-[13px] text-ds-text-3">PTZ no disponible</p>
              )}
              <div className="flex items-center gap-2">
                {ptzMsg && <span className="text-[12px] text-status-warn-fg">{ptzMsg}</span>}
                <Button type="button" variant="outline" className="h-10 sm:h-9" onClick={snapshot}>
                  <Camera className="h-4 w-4" />
                  Snapshot
                </Button>
                <Button type="button" variant="ghost" className="h-10 sm:h-9" onClick={onClose}>
                  <X className="h-4 w-4" />
                  Cerrar
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
