"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize2 } from "lucide-react";
import { Surface, Tag } from "@/components/opai-ds";
import { CamaraPlayer } from "./CamaraPlayer";
import { BRAND_LABELS, cameraStatusLabel, cameraStatusVariant } from "./status";
import type { CamaraDto } from "./types";
import { cn } from "@/lib/utils";

type Props = {
  camera: CamaraDto;
  token: string | null;
  relayUrl: string | null;
  live?: boolean;
  onOpen?: () => void;
  onUnauthorized?: () => void;
};

export function CamaraTile({ camera, token, relayUrl, live, onOpen, onUnauthorized }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: "80px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const offline = camera.status === "offline" || camera.status === "error";

  return (
    <Surface
      ref={rootRef}
      padding="none"
      tappable
      className={cn("overflow-hidden cursor-pointer")}
      onClick={onOpen}
    >
      <div className="relative aspect-video bg-ds-surface-2">
        {live && !offline ? (
          <CamaraPlayer
            src={camera.streamName}
            token={token}
            relayUrl={relayUrl}
            enabled={visible}
            onUnauthorized={onUnauthorized}
            className="absolute inset-0"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[13px] text-ds-text-3">
            {offline ? "Offline" : "Sin preview"}
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-ds-surface-4/85 p-2">
          <p className="truncate text-[13px] font-medium text-ds-text-1">{camera.name}</p>
          <p className="truncate text-[12px] text-ds-text-3">
            {camera.installation?.name ?? BRAND_LABELS[camera.brand] ?? camera.brand}
          </p>
        </div>
        <div className="absolute left-2 top-2">
          <Tag size="sm" variant={cameraStatusVariant(camera.status)} dot>
            {cameraStatusLabel(camera.status)}
          </Tag>
        </div>
        <button
          type="button"
          aria-label="Pantalla completa"
          className="absolute right-2 top-2 inline-flex h-11 w-11 items-center justify-center rounded-ds-md bg-ds-surface-3/80 text-ds-text-1"
          onClick={(e) => {
            e.stopPropagation();
            onOpen?.();
          }}
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>
    </Surface>
  );
}
