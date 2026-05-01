"use client";

import { Building2, ShieldCheck, Shield, AlertTriangle } from "lucide-react";
import type { GuardiaDetalleInfo } from "./types";

interface Props {
  info: GuardiaDetalleInfo;
}

export function GuardiaHeader({ info }: Props) {
  const os10 = info.os10;
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 mb-4">
      <div className="flex items-start gap-4">
        {info.faceIdPhotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={info.faceIdPhotoUrl}
            alt={info.nombre}
            className="h-16 w-16 rounded-full object-cover border border-status-info-border"
          />
        ) : (
          <div className="h-16 w-16 rounded-full bg-teal-600/30 border border-status-info-border flex items-center justify-center flex-shrink-0">
            <span className="text-xl font-semibold text-status-info-fg">
              {info.iniciales}
            </span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold truncate">{info.nombre}</h1>
          {info.installation && (
            <div className="flex items-center gap-1.5 text-sm text-zinc-400 mt-0.5">
              <Building2 className="h-3.5 w-3.5" />
              <span className="truncate">{info.installation.name}</span>
            </div>
          )}
          <div className="flex items-center gap-3 mt-2 text-xs text-zinc-500">
            {info.antiguedadMeses > 0 && (
              <span>{info.antiguedadMeses} meses en el equipo</span>
            )}
            <Os10Badge estado={os10.estado} expiresAt={os10.expiresAt} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Os10Badge({
  estado,
  expiresAt,
}: {
  estado: GuardiaDetalleInfo["os10"]["estado"];
  expiresAt: string | null;
}) {
  if (estado === "vigente") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-status-ok-fg bg-emerald-400/10 border border-emerald-400/20 rounded-full px-2 py-0.5">
        <ShieldCheck className="h-3 w-3" />
        OS-10 vigente
        {expiresAt && (
          <span className="text-emerald-300/70">
            hasta {new Date(expiresAt).toLocaleDateString("es-CL")}
          </span>
        )}
      </span>
    );
  }
  if (estado === "por_vencer") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-status-warn-fg bg-amber-400/10 border border-amber-400/20 rounded-full px-2 py-0.5">
        <AlertTriangle className="h-3 w-3" />
        OS-10 por vencer
      </span>
    );
  }
  if (estado === "vencido") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-status-danger-fg bg-red-400/10 border border-red-400/20 rounded-full px-2 py-0.5">
        <Shield className="h-3 w-3" />
        OS-10 vencido
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500 bg-white/[0.03] border border-white/[0.06] rounded-full px-2 py-0.5">
      OS-10 pendiente
    </span>
  );
}
