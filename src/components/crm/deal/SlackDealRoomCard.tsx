"use client";

import { ExternalLink, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * SlackDealRoomCard — sala de Slack del negocio como ciudadano de primera clase
 * en el panel derecho. Solo presentación: `onOpen` (handleOpenDealRoom) llega por
 * prop. Si hay sala abierta, muestra el nombre REAL guardado (`channelName`),
 * sincronizado desde Slack vía el evento `channel_rename`. Si aún no hay sala,
 * cae a una estimación best-effort del patrón `neg-{cliente}-{negocio}`.
 */
interface SlackDealRoomCardProps {
  accountName?: string | null;
  dealTitle: string;
  /** Nombre real del canal (de la BD); si falta, se estima desde cuenta+título. */
  channelName?: string | null;
  onOpen: () => void;
}

/** Slug ascii equivalente al usado en el server (sin tildes, [a-z0-9-]). */
function slug(raw: string, max: number): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max);
}

export function SlackDealRoomCard({ accountName, dealTitle, channelName: realName, onOpen }: SlackDealRoomCardProps) {
  const cliente = slug(accountName || "cliente", 32);
  const negocio = slug(dealTitle, 30);
  const estimated = ["neg", cliente, negocio].filter(Boolean).join("-").slice(0, 80);
  // Nombre real de la sala (sincronizado desde Slack) si existe; si no, estimación.
  const channelName = realName?.trim() || estimated;

  return (
    <div className="rounded-xl border border-tint-violet/40 bg-tint-violet/10 p-3.5">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-tint-violet/20 text-tint-violet-fg">
          <Hash className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-tint-violet-fg">
            Sala Slack
          </p>
          <p className="truncate text-[13px] font-medium" title={`#${channelName}`}>
            #{channelName}
          </p>
        </div>
      </div>
      <Button size="sm" onClick={onOpen} className="mt-3 w-full gap-1.5">
        Abrir en Slack <ExternalLink className="h-3.5 w-3.5" />
      </Button>
      {/* TODO fase 2: estado del canal (último mensaje, miembros) vía GET deal-room */}
    </div>
  );
}
