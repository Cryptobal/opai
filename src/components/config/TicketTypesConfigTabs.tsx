"use client";

import { Shield, Building2, List } from "lucide-react";
import { ConfigTabs } from "@/components/configuracion/ConfigTabs";
import { TicketTypesConfigClient } from "@/components/config/TicketTypesConfigClient";

interface TicketTypesConfigTabsProps {
  userRole: string;
  admins?: Array<{ id: string; name: string | null; email: string }>;
}

export function TicketTypesConfigTabs({ userRole, admins }: TicketTypesConfigTabsProps) {
  const tabs = [
    {
      id: "guardias",
      label: "De Guardias",
      icon: Shield,
      content: <TicketTypesConfigClient userRole={userRole} originFilter="guard" admins={admins} />,
    },
    {
      id: "internas",
      label: "Internas",
      icon: Building2,
      content: <TicketTypesConfigClient userRole={userRole} originFilter="internal" admins={admins} />,
    },
    {
      id: "todas",
      label: "Todas",
      icon: List,
      content: <TicketTypesConfigClient userRole={userRole} admins={admins} />,
    },
  ];

  return <ConfigTabs tabs={tabs} defaultTab="todas" />;
}
