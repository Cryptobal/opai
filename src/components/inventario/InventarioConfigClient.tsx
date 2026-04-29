"use client";

import { useState } from "react";
import { OpaiSurface } from "@/components/opai";
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
    <div className="space-y-4">
      {/* Tabs estilo war room (pills) */}
      <div className="flex flex-wrap gap-1 rounded-full border border-foreground/[0.06] p-1 bg-foreground/[0.02] w-fit">
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
                  : "text-muted-foreground hover:text-foreground hover:bg-foreground/5 border border-transparent",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "bodegas" && (
        <OpaiSurface>
          <InventarioBodegasManager canDelete={canDelete} />
        </OpaiSurface>
      )}

      {tab === "auditoria" && (
        <OpaiSurface>
          <InventarioAuditList />
        </OpaiSurface>
      )}
    </div>
  );
}
