"use client";

import { useState } from "react";
import { ChipTabs } from "@/components/ui/chip-tabs";
import { ProtocolSectionsSubTab } from "./ProtocolSectionsSubTab";
import { ProtocolDocumentsSubTab } from "./ProtocolDocumentsSubTab";
import { ExamsSubTab } from "./ExamsSubTab";
import { ClientViewSubTab } from "./ClientViewSubTab";

const PROTOCOL_SUB_TABS = [
  { id: "sections", label: "📋 Secciones" },
  { id: "documents", label: "📄 Documentos" },
  { id: "exams", label: "📝 Exámenes" },
  { id: "client", label: "👤 Vista Cliente" },
] as const;

export type ProtocolSubTabId = (typeof PROTOCOL_SUB_TABS)[number]["id"];

/** Barra de sub-tabs de Protocolo, para renderizar debajo de ChipTabs */
export function ProtocolSubTabsBar({
  activeSubTab,
  onSubTabChange,
}: {
  activeSubTab: ProtocolSubTabId;
  onSubTabChange: (id: ProtocolSubTabId) => void;
}) {
  return (
    <ChipTabs
      tabs={PROTOCOL_SUB_TABS.map((t) => ({ id: t.id, label: t.label }))}
      activeTab={activeSubTab}
      onTabChange={(id) => onSubTabChange(id as ProtocolSubTabId)}
      centered={false}
    />
  );
}

type Props = {
  installationId: string;
  installationName: string;
  /** Cuando se usa desde CrmInstallationDetailClient, la barra va en EntityDetailLayout */
  activeSubTab?: ProtocolSubTabId;
  onSubTabChange?: (id: ProtocolSubTabId) => void;
};

export function ProtocolTab({ installationId, installationName, activeSubTab: controlledSubTab, onSubTabChange }: Props) {
  const [internalSubTab, setInternalSubTab] = useState<ProtocolSubTabId>("sections");
  const activeSubTab = controlledSubTab ?? internalSubTab;
  const setActiveSubTab = onSubTabChange ?? setInternalSubTab;

  return (
    <div className="space-y-4">
      {activeSubTab === "sections" && (
        <ProtocolSectionsSubTab installationId={installationId} />
      )}
      {activeSubTab === "documents" && (
        <ProtocolDocumentsSubTab installationId={installationId} />
      )}
      {activeSubTab === "exams" && (
        <ExamsSubTab installationId={installationId} />
      )}
      {activeSubTab === "client" && (
        <ClientViewSubTab
          installationId={installationId}
          installationName={installationName}
        />
      )}
    </div>
  );
}
