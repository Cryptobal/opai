"use client";

import { Activity } from "lucide-react";
import { EmptyState, KPIStrip } from "@/components/opai-ds";

export function TenantUsoTab() {
  return (
    <div className="space-y-4">
      <KPIStrip
        items={[
          { label: "Logins 30 d", value: "—" },
          { label: "Marcaciones", value: "—" },
          { label: "Activos", value: "—" },
        ]}
      />
      <EmptyState
        icon={Activity}
        title="Sin datos de uso aún"
        description="Disponible con la telemetría (F3)."
      />
    </div>
  );
}
