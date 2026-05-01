"use client";

import { Calendar, Building2, MapPin } from "lucide-react";
import type { GuardiaDetalle } from "./types";

interface Props {
  data: GuardiaDetalle;
}

export function TabInfo({ data }: Props) {
  const { info, historial } = data;
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 space-y-3">
        <InfoRow
          icon={Calendar}
          label="Ingreso"
          value={
            info.hiredAt
              ? new Date(info.hiredAt).toLocaleDateString("es-CL")
              : "—"
          }
        />
        {info.installation && (
          <>
            <InfoRow
              icon={Building2}
              label="Instalación"
              value={info.installation.name}
            />
            {(info.installation.address || info.installation.commune) && (
              <InfoRow
                icon={MapPin}
                label="Dirección"
                value={[info.installation.address, info.installation.commune]
                  .filter(Boolean)
                  .join(" · ")}
              />
            )}
          </>
        )}
      </div>
      {historial.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wider text-zinc-500 mb-2 px-1">
            Historial
          </p>
          <div className="space-y-1.5">
            {historial.map((h, i) => (
              <div
                key={`${h.createdAt}-${i}`}
                className="flex items-start gap-3 rounded-lg bg-white/[0.02] px-3 py-2"
              >
                <div className="h-1.5 w-1.5 rounded-full bg-status-info mt-2 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{h.summary}</p>
                  <p className="text-[11px] text-zinc-500">
                    {new Date(h.createdAt).toLocaleDateString("es-CL")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="h-4 w-4 text-zinc-500 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-zinc-500">
          {label}
        </p>
        <p className="text-sm truncate">{value}</p>
      </div>
    </div>
  );
}
