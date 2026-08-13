"use client";

import { ChevronDown, MapPin } from "lucide-react";
import { useSelectedInstallation } from "@/contexts/selected-installation-context";
import { cn } from "@/lib/utils";

type Props = {
  hideWhenEmpty?: boolean;
  className?: string;
};

export function InstallationSwitcher({ hideWhenEmpty = true, className }: Props) {
  const { installationId, installations, setInstallationId, hasMultiple } =
    useSelectedInstallation();

  if (installations.length === 0) {
    if (hideWhenEmpty) return null;
    return (
      <span className="inline-flex items-center gap-1.5 text-ds-caption text-ds-text-3">
        <MapPin className="h-3.5 w-3.5" /> Sin instalaciones
      </span>
    );
  }

  const LiveDot = (
    <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
      <span className="absolute inline-flex h-full w-full rounded-full bg-status-ok opacity-75 animate-ping motion-reduce:animate-none" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-status-ok" />
    </span>
  );

  if (!hasMultiple) {
    const only = installations[0];
    return (
      <span
        className={cn(
          "inline-flex items-center gap-2 h-10 sm:h-9 max-w-[200px] px-3 rounded-full",
          "border border-ds-border-subtle bg-ds-surface-2 text-ds-caption text-ds-text-1",
          className,
        )}
        title={only.name}
      >
        {LiveDot}
        <span className="truncate font-medium">{only.name}</span>
      </span>
    );
  }

  return (
    <div className={cn("relative", className)}>
      <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
        {LiveDot}
      </span>
      <select
        value={installationId}
        onChange={(e) => setInstallationId(e.target.value)}
        aria-label="Seleccionar instalación"
        className="h-10 sm:h-9 rounded-full border border-ds-border-subtle bg-ds-surface-2 pl-8 pr-8 text-ds-caption appearance-none max-w-[220px] truncate text-ds-text-1 focus:outline-none focus:ring-1 focus:ring-primary/40"
      >
        {installations.map((i) => (
          <option key={i.id} value={i.id}>
            {i.name}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none text-ds-text-3" />
    </div>
  );
}
