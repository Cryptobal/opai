"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileBarChart,
  Scale,
  Grid3x3,
  TrendingUp,
  BookOpen,
  Receipt,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/finanzas/reportes", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/finanzas/reportes/eerr", label: "Estado de Resultado", icon: FileBarChart },
  { href: "/finanzas/reportes/balance", label: "Balance General", icon: Scale },
  { href: "/finanzas/reportes/ventas", label: "Ventas por cliente", icon: Grid3x3 },
  { href: "/finanzas/reportes/compras", label: "Compras", icon: Receipt },
  { href: "/finanzas/reportes/rentabilidad", label: "Rentabilidad", icon: TrendingUp },
  { href: "/finanzas/reportes/mayor", label: "Libro Mayor", icon: BookOpen },
];

export function ReportsSidebar() {
  const path = usePathname();
  const isActive = (href: string, exact?: boolean) =>
    exact ? path === href : path === href || path.startsWith(href + "/");
  return (
    <>
      <aside className="hidden lg:flex flex-col w-56 shrink-0 sticky top-4 self-start">
        <nav
          className="rounded-xl border bg-ds-surface p-2 space-y-0.5"
          style={{ borderColor: "var(--ds-border)" }}
        >
          {ITEMS.map((it) => {
            const active = isActive(it.href, it.exact);
            const Icon = it.icon;
            return (
              <Link
                key={it.href}
                href={it.href}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12.5px] transition-colors",
                  active ? "bg-ds-bg-2 text-ds-text-1" : "text-ds-text-2 hover:bg-ds-bg-2/50"
                )}
              >
                <Icon className="w-4 h-4" strokeWidth={2.2} />
                <span style={{ fontFamily: "var(--font-display)" }}>{it.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t backdrop-blur"
        style={{ background: "var(--ds-bg-1)", borderColor: "var(--ds-border)" }}
      >
        <div className="flex overflow-x-auto px-2 py-1.5 gap-1 no-scrollbar">
          {ITEMS.map((it) => {
            const active = isActive(it.href, it.exact);
            const Icon = it.icon;
            return (
              <Link
                key={it.href}
                href={it.href}
                className={cn(
                  "flex flex-col items-center justify-center min-w-[64px] h-12 rounded-lg shrink-0",
                  active ? "bg-ds-bg-2 text-ds-text-1" : "text-ds-text-3"
                )}
              >
                <Icon className="w-4 h-4" strokeWidth={2.2} />
                <span className="text-[9.5px] mt-0.5 font-mono uppercase tracking-wider">
                  {it.label.split(" ")[0]}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
