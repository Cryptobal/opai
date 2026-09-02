"use client";

import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { platformRoleTitle, type PlatformRole } from "@/lib/platform/roles";
import { usePlatformUiOptional } from "./PlatformUiProvider";

export function RoleGuard({
  minRole,
  children,
  asChild = false,
}: {
  minRole: PlatformRole;
  children: ReactNode;
  asChild?: boolean;
}) {
  const ui = usePlatformUiOptional();
  const allowed = ui?.can(minRole) ?? true;
  if (allowed) return <>{children}</>;
  const title = platformRoleTitle(minRole);
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild={asChild || true}>
          <span className="inline-flex cursor-not-allowed" title={title}>
            <span className="pointer-events-none opacity-40">{children}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent>{title}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
