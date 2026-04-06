"use client";

import type { ReactNode } from "react";
import { ConfigTabs } from "@/components/configuracion/ConfigTabs";
import { CrmPipelineTab } from "@/components/crm/CrmPipelineTab";
import { CrmFieldsTab } from "@/components/crm/CrmFieldsTab";
import { CrmIndustriasTab } from "@/components/crm/CrmIndustriasTab";
import { CrmInboundEmailTab } from "@/components/crm/CrmInboundEmailTab";
import { BarChart3, LayoutList, Factory, Mail, Inbox } from "lucide-react";

type PipelineStage = {
  id: string;
  name: string;
  order: number;
  color?: string | null;
  isClosedWon: boolean;
  isClosedLost: boolean;
  isAccepted: boolean;
  isActive: boolean;
};

type CustomField = {
  id: string;
  name: string;
  entityType: string;
  type: string;
  options?: unknown;
};

interface CrmConfigTabsProps {
  initialStages: PipelineStage[];
  initialFields: CustomField[];
  followUpSection: ReactNode;
  tenantSlug: string;
}

export function CrmConfigTabs({
  initialStages,
  initialFields,
  followUpSection,
  tenantSlug,
}: CrmConfigTabsProps) {
  const tabs = [
    {
      id: "pipeline",
      label: "Pipeline",
      icon: BarChart3,
      content: <CrmPipelineTab initialStages={initialStages} />,
    },
    {
      id: "campos",
      label: "Campos y Entidades",
      icon: LayoutList,
      content: <CrmFieldsTab initialFields={initialFields} />,
    },
    {
      id: "industrias",
      label: "Industrias",
      icon: Factory,
      content: <CrmIndustriasTab />,
    },
    {
      id: "seguimientos",
      label: "Seguimientos",
      icon: Mail,
      content: <div>{followUpSection}</div>,
    },
    {
      id: "leads-email",
      label: "Leads por Email",
      icon: Inbox,
      content: <CrmInboundEmailTab tenantSlug={tenantSlug} />,
    },
  ];

  return <ConfigTabs tabs={tabs} defaultTab="pipeline" />;
}
