"use client";

import { useState } from "react";
import { PageHero } from "@/components/opai-ds";
import { ChipTabs } from "@/components/ui/chip-tabs";
import { Send, History, FileText, MessageSquare } from "lucide-react";
import TemplatesListClient from "@/components/comunicaciones/TemplatesListClient";
import EmailComposerClient from "@/components/comunicaciones/EmailComposerClient";
import EmailHistoryClient from "@/components/comunicaciones/EmailHistoryClient";

const TABS = [
  { id: "enviar", label: "Enviar", icon: Send },
  { id: "historial", label: "Historial", icon: History },
  { id: "plantillas", label: "Plantillas", icon: FileText },
];

interface ComunicacionesPageClientProps {
  tenantId: string;
}

export default function ComunicacionesPageClient({ tenantId }: ComunicacionesPageClientProps) {
  const [tab, setTab] = useState("plantillas");

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden">
      <PageHero
        icon={<MessageSquare />}
        iconTone="violet"
        title="Comunicaciones"
        subtitle="campañas SMS, email y push"
        description="Gestión de plantillas de email y envío de comunicaciones."
        backHref="/personas/guardias"
        backLabel="Personas"
      />
      <ChipTabs tabs={TABS} activeTab={tab} onTabChange={setTab} />

      {tab === "plantillas" && <TemplatesListClient />}
      {tab === "enviar" && <EmailComposerClient tenantId={tenantId} />}
      {tab === "historial" && <EmailHistoryClient tenantId={tenantId} />}
    </div>
  );
}
