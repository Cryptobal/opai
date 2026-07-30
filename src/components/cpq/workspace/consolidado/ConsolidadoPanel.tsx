"use client";

/**
 * Tab Consolidado del workspace multi-instalación: resumen + datos de la
 * propuesta + condiciones comerciales (editables una vez, se propagan) +
 * instalaciones. Comparador, AI global, Incluye agregado y Auditoría se suman
 * en B7.
 */

import type { ReactNode } from "react";
import type { BundleDetail } from "@/components/cpq/bundle/useBundle";
import { ResumenSection } from "./ResumenSection";
import { DatosPropuestaSection } from "./DatosPropuestaSection";
import { BundleCondicionesSection } from "./BundleCondicionesSection";
import { InstalacionesSection } from "./InstalacionesSection";

export function ConsolidadoPanel({
  bundle,
  ufValue,
  saving,
  onPatch,
  onRefresh,
  onOpenInstall,
  onAdd,
  onDuplicate,
  extraSections,
}: {
  bundle: BundleDetail;
  ufValue: number | null;
  saving: boolean;
  onPatch: (data: Record<string, unknown>) => Promise<void>;
  onRefresh: () => Promise<void>;
  onOpenInstall: (quoteId: string) => void;
  onAdd: () => void;
  onDuplicate: (quoteId: string) => void;
  /** Secciones avanzadas del consolidado (comparador, AI, incluye, auditoría). */
  extraSections?: ReactNode;
}) {
  return (
    <div className="space-y-3 ds-page-enter">
      <ResumenSection bundle={bundle} ufValue={ufValue} />
      <InstalacionesSection
        bundle={bundle}
        ufValue={ufValue}
        onRefresh={onRefresh}
        onOpenInstall={onOpenInstall}
        onAdd={onAdd}
        onDuplicate={onDuplicate}
      />
      <BundleCondicionesSection bundle={bundle} saving={saving} onPatch={onPatch} />
      <DatosPropuestaSection bundle={bundle} onPatch={onPatch} />
      {extraSections}
    </div>
  );
}
