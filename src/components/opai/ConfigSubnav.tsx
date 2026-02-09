"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const CONFIG_NAV = [
  { href: "/opai/configuracion/usuarios", label: "Usuarios" },
  { href: "/opai/configuracion/integraciones", label: "Integraciones" },
  { href: "/opai/configuracion/email-templates", label: "Templates email" },
  { href: "/opai/configuracion/crm", label: "CRM" },
  { href: "/opai/configuracion/cpq", label: "Configuración CPQ" },
  { href: "/opai/configuracion/payroll", label: "Payroll" },
];

export function ConfigSubnav() {
  const pathname = usePathname();

  return (
    <div className="mb-6">
      <div className="flex gap-2 overflow-x-auto pb-2">
        {CONFIG_NAV.map((item) => {
          const isActive = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] transition",
                isActive
                  ? "border-foreground/60 bg-foreground/5 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
