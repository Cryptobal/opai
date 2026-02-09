"use client";

import { SubNav } from "@/components/opai/SubNav";

const CONFIG_NAV = [
  { href: "/opai/configuracion/usuarios", label: "Usuarios" },
  { href: "/opai/configuracion/integraciones", label: "Integraciones" },
  { href: "/opai/configuracion/email-templates", label: "Templates email" },
  { href: "/opai/configuracion/crm", label: "CRM" },
  { href: "/opai/configuracion/cpq", label: "Configuración CPQ" },
  { href: "/opai/configuracion/payroll", label: "Payroll" },
];

export function ConfigSubnav() {
  return <SubNav items={CONFIG_NAV} />;
}
