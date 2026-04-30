"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ClienteSession } from "@/lib/portal-cliente-types";
import { PortalProtocolosLista } from "./PortalProtocolosLista";
import { PortalConocimientoEquipo } from "./PortalConocimientoEquipo";

interface Props {
  session: ClienteSession;
  selectedInstallation: string;
  isProspect?: boolean;
}

type SubTab = "protocol" | "knowledge";

export function PortalProtocolos({
  session,
  selectedInstallation,
  isProspect,
}: Props) {
  const [tab, setTab] = useState<SubTab>("protocol");
  const showKnowledge = session.portalConfig?.conocimiento !== false;

  return (
    <div className="space-y-3">
      {showKnowledge && (
        <div
          role="tablist"
          aria-label="Vista del protocolo"
          className="flex gap-1 mt-1 p-0.5 rounded-ds-md bg-ds-surface-1 border border-ds-border-default"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "protocol"}
            onClick={() => setTab("protocol")}
            className={cn(
              "flex-1 py-2 text-[12px] font-medium rounded ds-tap transition-colors",
              tab === "protocol"
                ? "bg-ds-surface-3 text-ds-text-1"
                : "text-ds-text-3 hover:text-ds-text-1",
            )}
          >
            Protocolo
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "knowledge"}
            onClick={() => setTab("knowledge")}
            className={cn(
              "flex-1 py-2 text-[12px] font-medium rounded ds-tap transition-colors",
              tab === "knowledge"
                ? "bg-ds-surface-3 text-ds-text-1"
                : "text-ds-text-3 hover:text-ds-text-1",
            )}
          >
            Conocimiento del equipo
          </button>
        </div>
      )}

      {tab === "protocol" || !showKnowledge ? (
        <PortalProtocolosLista
          session={session}
          selectedInstallation={selectedInstallation}
          isProspect={isProspect}
        />
      ) : (
        <PortalConocimientoEquipo
          session={session}
          installationId={selectedInstallation}
        />
      )}
    </div>
  );
}
