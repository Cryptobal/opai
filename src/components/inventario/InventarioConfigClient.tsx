"use client";

import { useState } from "react";
import { Surface } from "@/components/opai-ds";
import { InventarioBodegasManager } from "./InventarioBodegasManager";
import { InventarioAuditList } from "./InventarioAuditList";
import { Building2, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  canDelete: boolean;
}

const TABS = [
  { id: "bodegas", label: "Bodegas", icon: Building2 },
  { id: "auditoria", label: "Auditoría", icon: ClipboardList },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function InventarioConfigClient({ canDelete }: Props) {
  const [tab, setTab] = useState<TabId>("bodegas");

  return (
    <div className="space-y-4 ds-page-enter">
      {/* Tabs estilo war room (pills) */}
      <div className="flex flex-wrap gap-1 rounded-full border border-ds-border-subtle p-1 bg-ds-surface-2 w-fit">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
                isActive
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "text-ds-text-3 hover:text-ds-text-1 hover:bg-ds-surface-3 border border-transparent",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "bodegas" && (
        <Surface elevation={1} padding="md">
          <InventarioBodegasManager canDelete={canDelete} />
        </Surface>
      )}

      {tab === "auditoria" && (
        <Surface elevation={1} padding="md">
          <InventarioAuditList />
        </Surface>
      )}
    </div>
  );
}
