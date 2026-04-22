"use client";

import { ChevronDown, MapPin } from "lucide-react";
import { useSelectedInstallation } from "@/contexts/selected-installation-context";

type Props = {
  /** Oculta completamente el selector si no hay instalaciones. */
  hideWhenEmpty?: boolean;
  className?: string;
};

/**
 * Selector de instalación siempre visible en el header del portal cliente.
 * - Si solo hay 1 instalación: muestra su nombre como etiqueta (sin dropdown).
 * - Si hay 2+: muestra un <select> accesible.
 * - Persiste la selección en URL + localStorage (ver `SelectedInstallationContext`).
 */
export function InstallationSwitcher({ hideWhenEmpty = true, className }: Props) {
  const { installationId, installations, setInstallationId, hasMultiple } =
    useSelectedInstallation();

  if (installations.length === 0) {
    if (hideWhenEmpty) return null;
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
        <MapPin className="h-3.5 w-3.5" /> Sin instalaciones
      </span>
    );
  }

  if (!hasMultiple) {
    const only = installations[0];
    return (
      <span
        className={`inline-flex items-center gap-1.5 text-xs text-zinc-300 max-w-[180px] truncate ${className ?? ""}`}
        title={only.name}
      >
        <MapPin className="h-3.5 w-3.5 text-teal-400 shrink-0" />
        <span className="truncate">{only.name}</span>
      </span>
    );
  }

  return (
    <div className={`relative ${className ?? ""}`}>
      <MapPin className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-teal-400 pointer-events-none" />
      <select
        value={installationId}
        onChange={(e) => setInstallationId(e.target.value)}
        aria-label="Seleccionar instalación"
        className="h-10 sm:h-8 rounded border border-white/10 bg-white/5 pl-7 pr-8 text-xs appearance-none max-w-[200px] truncate focus:outline-none focus:ring-1 focus:ring-teal-400/40"
      >
        {installations.map((i) => (
          <option key={i.id} value={i.id}>
            {i.name}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none text-zinc-400" />
    </div>
  );
}
