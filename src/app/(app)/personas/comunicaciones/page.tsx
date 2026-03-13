"use client";

import { useState } from "react";
import { PageHeader } from "@/components/opai";
import { ChipTabs } from "@/components/ui/chip-tabs";
import { Send, History, FileText } from "lucide-react";
import TemplatesListClient from "@/components/comunicaciones/TemplatesListClient";
import EmailComposerClient from "@/components/comunicaciones/EmailComposerClient";
import EmailHistoryClient from "@/components/comunicaciones/EmailHistoryClient";

const TABS = [
  { id: "enviar", label: "Enviar", icon: Send },
  { id: "historial", label: "Historial", icon: History },
  { id: "plantillas", label: "Plantillas", icon: FileText },
];

export default function ComunicacionesPage() {
  const [tab, setTab] = useState("plantillas");

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden">
      <PageHeader
        title="Comunicaciones"
        description="Gestión de plantillas de email y envío de comunicaciones."
      />
      <ChipTabs tabs={TABS} activeTab={tab} onTabChange={setTab} />

      {tab === "plantillas" && <TemplatesListClient />}
      {tab === "enviar" && <EmailComposerClient tenantId="" />}
      {tab === "historial" && <EmailHistoryClient tenantId="" />}
    </div>
  );
}
