"use client";

import type { ReactNode } from "react";
import { ConfigTabs } from "@/components/configuracion/ConfigTabs";
import { CrmPipelineTab } from "@/components/crm/CrmPipelineTab";
import { CrmFieldsTab } from "@/components/crm/CrmFieldsTab";
import { CrmIndustriasTab } from "@/components/crm/CrmIndustriasTab";
import { BarChart3, LayoutList, Factory, Mail } from "lucide-react";

type PipelineStage = {
  id: string;
  name: string;
  order: number;
  color?: string | null;
  isClosedWon: boolean;
  isClosedLost: boolean;
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
}

export function CrmConfigTabs({
  initialStages,
  initialFields,
  followUpSection,
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
  ];

  return <ConfigTabs tabs={tabs} defaultTab="pipeline" />;
}
