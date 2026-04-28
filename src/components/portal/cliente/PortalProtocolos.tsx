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
        <div className="flex gap-1 mt-1 p-0.5 rounded-lg bg-white/[0.03] border border-white/5">
          <button
            type="button"
            onClick={() => setTab("protocol")}
            className={cn(
              "flex-1 py-2 text-[11px] font-medium rounded-md tap-mock",
              tab === "protocol"
                ? "bg-white/[0.06] text-white"
                : "text-white/50",
            )}
          >
            Protocolo
          </button>
          <button
            type="button"
            onClick={() => setTab("knowledge")}
            className={cn(
              "flex-1 py-2 text-[11px] font-medium rounded-md tap-mock",
              tab === "knowledge"
                ? "bg-white/[0.06] text-white"
                : "text-white/50",
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
