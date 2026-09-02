"use client";

import { ChipTabs } from "@/components/ui/chip-tabs";

const TABS = [
  { id: "resumen", label: "Resumen" },
  { id: "plan", label: "Plan y precio" },
  { id: "modulos", label: "Módulos" },
  { id: "uso", label: "Uso" },
  { id: "historial", label: "Historial" },
] as const;

export type TenantTabId = (typeof TABS)[number]["id"];

export function isTenantTab(value: string | null): value is TenantTabId {
  return TABS.some((t) => t.id === value);
}

export function TenantTabNav({ tenantId, tab }: { tenantId: string; tab: TenantTabId }) {
  const href = (id: string) => `/platform/tenants/${tenantId}?tab=${id}`;
  return (
    <ChipTabs
      activeTab={tab}
      onTabChange={() => undefined}
      tabs={TABS.map((t) => ({ id: t.id, label: t.label, href: href(t.id) }))}
    />
  );
}
