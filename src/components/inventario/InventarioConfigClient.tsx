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
    <div className="space-y-5 ds-page-enter">
      {/* Tabs: chip elevado neutro. El estado activo se eleva sobre la
          superficie del segmento sin recurrir a translucidez de primary
          (issue D6 #4: bg-primary/15 fallaba contraste en dark). */}
      <div
        role="tablist"
        aria-label="Secciones de configuración"
        className="inline-flex rounded-ds-md border border-ds-border-subtle bg-ds-surface-1 p-1"
      >
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setTab(t.id)}
              className={cn(
                "relative inline-flex items-center gap-1.5 rounded-ds-sm px-3.5 py-1.5 text-sm font-medium",
                "transition-colors duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface-1",
                isActive
                  ? "bg-ds-surface-3 text-ds-text-1 shadow-ds-xs"
                  : "text-ds-text-3 hover:text-ds-text-1",
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4",
                  isActive ? "text-primary" : "text-ds-text-4",
                )}
                strokeWidth={1.75}
              />
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
