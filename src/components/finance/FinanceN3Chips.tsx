"use client";

import { useRouter, usePathname } from "next/navigation";
import { useMemo } from "react";
import { useTenantModules } from "@/contexts/TenantModulesContext";
import { usePermissions } from "@/lib/permissions-context";
import {
  findChildByKey,
  isNodeVisible,
  type VisibilityContext,
} from "@/lib/nav/registry";
import { cn } from "@/lib/utils";

interface Props {
  /** Key del nodo N2 padre en el registry (ej. "finance-compras-ventas",
   *  "finance-informes", "finance-rendiciones", "finance-banca"). */
  submoduleKey: string;
  /** Override de href activo (para tabs con query param). Si no se pasa,
   *  se detecta del pathname. */
  activeHref?: string;
}

export function FinanceN3Chips({ submoduleKey, activeHref }: Props) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const perms = usePermissions();
  const { isModuleEnabled } = useTenantModules();

  const items = useMemo(() => {
    const parent = findChildByKey(submoduleKey);
    if (!parent?.children) return [];
    const ctx: VisibilityContext = {
      perms,
      isAdmin: false,
      isModuleEnabled,
    };
    return parent.children
      .filter((c) => !c.hideInSubNav)
      .filter((c) => isNodeVisible(c, ctx));
  }, [submoduleKey, perms, isModuleEnabled]);

  const active = useMemo(() => {
    if (activeHref) return activeHref;
    return items
      .filter((i) =>
        i.exactMatch
          ? pathname === i.href
          : pathname === i.href || pathname.startsWith(i.href + "/"),
      )
      .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  }, [items, pathname, activeHref]);

  if (items.length === 0) return null;

  return (
    <nav className="-mx-4 px-4 sm:mx-0 sm:px-0">
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
        {items.map((item) => {
          const isActive = item.href === active;
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => router.push(item.href)}
              className={cn(
                "whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors shrink-0 flex items-center gap-1.5",
                isActive
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground border border-transparent",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.shortLabel ?? item.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
