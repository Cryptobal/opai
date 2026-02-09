"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const CRM_NAV_ITEMS = [
  { href: "/crm/leads", label: "Prospectos" },
  { href: "/crm/accounts", label: "Clientes" },
  { href: "/crm/contacts", label: "Contactos" },
  { href: "/crm/deals", label: "Negocios" },
];

export function CrmSubnav() {
  const pathname = usePathname();

  return (
    <div className="mb-6">
      <div className="flex gap-2 overflow-x-auto pb-2">
        {CRM_NAV_ITEMS.map((item) => {
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
