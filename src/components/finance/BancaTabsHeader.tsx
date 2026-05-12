"use client";

import { useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  BarChart3,
  Settings2,
  Landmark,
  Upload,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Strip de tabs replicado de BancosClient. Se renderiza en /finanzas/flujo-caja
 * para que la página se vea como una pestaña dentro de Banca. Cada tab
 * (excepto Flujo de caja) navega a /finanzas/bancos donde BancosClient
 * recoge el query param y arranca con ese tab activo.
 */
const TABS = [
  { id: "transactions", label: "Movimientos", icon: ArrowLeftRight },
  { id: "cashflow", label: "Flujo de caja", icon: Wallet },
  { id: "analysis", label: "Análisis", icon: BarChart3 },
  { id: "rules", label: "Reglas", icon: Settings2 },
  { id: "accounts", label: "Cuentas Bancarias", icon: Landmark },
  { id: "import", label: "Importar Cartola", icon: Upload },
] as const;

export function BancaTabsHeader({ active }: { active: (typeof TABS)[number]["id"] }) {
  const router = useRouter();
  return (
    <nav className="-mx-4 px-4 sm:mx-0 sm:px-0">
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
        {TABS.map((tab) => {
          const isActive = tab.id === active;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                if (tab.id === "cashflow") {
                  router.push("/finanzas/flujo-caja");
                  return;
                }
                router.push(`/finanzas/bancos?tab=${tab.id}`);
              }}
              className={cn(
                "whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors shrink-0 flex items-center gap-1.5",
                isActive
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground border border-transparent",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
