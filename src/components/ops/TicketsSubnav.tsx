"use client";

import { SubNav, type SubNavItem } from "@/components/opai/SubNav";
import { Ticket } from "lucide-react";

const TICKETS_ITEMS: SubNavItem[] = [
  { href: "/ops/tickets", label: "Listado", icon: Ticket },
];

export function TicketsSubnav() {
  return <SubNav items={TICKETS_ITEMS} />;
}
