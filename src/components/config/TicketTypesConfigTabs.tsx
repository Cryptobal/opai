"use client";

import { Shield, Building2, List } from "lucide-react";
import { ConfigTabs } from "@/components/configuracion/ConfigTabs";
import { TicketTypesConfigClient } from "@/components/config/TicketTypesConfigClient";

interface TicketTypesConfigTabsProps {
  userRole: string;
}

export function TicketTypesConfigTabs({ userRole }: TicketTypesConfigTabsProps) {
  const tabs = [
    {
      id: "guardias",
      label: "De Guardias",
      icon: Shield,
      content: <TicketTypesConfigClient userRole={userRole} originFilter="guard" />,
    },
    {
      id: "internas",
      label: "Internas",
      icon: Building2,
      content: <TicketTypesConfigClient userRole={userRole} originFilter="internal" />,
    },
    {
      id: "todas",
      label: "Todas",
      icon: List,
      content: <TicketTypesConfigClient userRole={userRole} />,
    },
  ];

  return <ConfigTabs tabs={tabs} defaultTab="todas" />;
}
