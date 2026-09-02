"use client";

import { useSearchParams } from "next/navigation";
import { Tags } from "lucide-react";
import { EmptyState, PageHero } from "@/components/opai-ds";
import { ChipTabs } from "@/components/ui/chip-tabs";
import { usePlatformUi } from "../PlatformUiProvider";
import { CatalogPlansTab } from "./CatalogPlansTab";
import { CatalogAddonsTab } from "./CatalogAddonsTab";
import { CatalogSettingsTab } from "./CatalogSettingsTab";

const TABS = [
  { id: "planes", label: "Planes" },
  { id: "addons", label: "Add-ons" },
  { id: "config", label: "Configuración" },
] as const;

export function CatalogClient() {
  const { can } = usePlatformUi();
  const sp = useSearchParams();
  const tab = TABS.some((t) => t.id === sp.get("tab")) ? sp.get("tab")! : "planes";

  if (!can("owner")) {
    return (
      <EmptyState
        icon={Tags}
        title="Catálogo"
        description="Requiere rol owner."
      />
    );
  }

  return (
    <div className="space-y-6 min-w-0">
      <PageHero icon={<Tags />} iconTone="teal" title="Catálogo" subtitle="Planes, add-ons y configuración global" />
      <ChipTabs
        activeTab={tab}
        onTabChange={() => undefined}
        tabs={TABS.map((t) => ({
          id: t.id,
          label: t.label,
          href: `/platform/catalog?tab=${t.id}`,
        }))}
      />
      {tab === "planes" ? <CatalogPlansTab /> : null}
      {tab === "addons" ? <CatalogAddonsTab /> : null}
      {tab === "config" ? <CatalogSettingsTab /> : null}
    </div>
  );
}
