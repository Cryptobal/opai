"use client";

import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BundleMember } from "./useBundle";

export type BundleTabId = "consolidated" | `inst:${string}`;

export function BundleTabs({
  members,
  active,
  onChange,
  onAdd,
}: {
  members: BundleMember[];
  active: BundleTabId;
  onChange: (id: BundleTabId) => void;
  onAdd: () => void;
}) {
  return (
    <div
      className="flex gap-1 overflow-x-auto pb-1 [-webkit-mask-image:linear-gradient(90deg,#000_85%,transparent)] [mask-image:linear-gradient(90deg,#000_85%,transparent)]"
      role="tablist"
    >
      <TabButton
        active={active === "consolidated"}
        onClick={() => onChange("consolidated")}
        label="Consolidado"
      />
      {members.map((m) => (
        <TabButton
          key={m.quoteId}
          active={active === `inst:${m.quoteId}`}
          onClick={() => onChange(`inst:${m.quoteId}`)}
          label={m.quote.installation?.name || m.quote.code}
        />
      ))}
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex h-11 sm:h-9 shrink-0 items-center gap-1 rounded-full px-3 text-[13px] text-primary hover:bg-ds-surface-2"
        aria-label="Agregar instalación"
      >
        <Plus className="h-4 w-4" />
        <span className="hidden sm:inline">Instalación</span>
      </button>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "h-11 sm:h-9 shrink-0 rounded-full px-3.5 text-[13px] font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-ds-surface-2 text-ds-text-2 hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
