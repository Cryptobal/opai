"use client";

import { SubNav } from "@/components/opai/SubNav";

const CRM_NAV_ITEMS = [
  { href: "/crm/leads", label: "Prospectos" },
  { href: "/crm/accounts", label: "Clientes" },
  { href: "/crm/contacts", label: "Contactos" },
  { href: "/crm/deals", label: "Negocios" },
  { href: "/crm/cotizaciones", label: "Cotizaciones" },
];

export function CrmSubnav() {
  return <SubNav items={CRM_NAV_ITEMS} />;
}
