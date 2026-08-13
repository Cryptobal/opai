"use client";

/**
 * Tab Consolidado del workspace multi-instalación: resumen, instalaciones,
 * condiciones comerciales (editables una vez, se propagan a todas las hijas),
 * datos de la propuesta, comparador, contenido AI global, Incluye agregado y
 * auditoría consolidada.
 */

import type { BundleDetail, BundleMember } from "@/components/cpq/bundle/useBundle";
import { ResumenSection } from "./ResumenSection";
import { BundleProposalPreview } from "./BundleProposalPreview";
import { DatosPropuestaSection } from "./DatosPropuestaSection";
import { BundleCondicionesSection } from "./BundleCondicionesSection";
import { InstalacionesSection } from "./InstalacionesSection";
import { ComparadorSection } from "./ComparadorSection";
import { BundleAiSection } from "./BundleAiSection";
import { IncluyeAgregadoSection } from "./IncluyeAgregadoSection";
import { BundleAuditSection } from "./BundleAuditSection";

export function ConsolidadoPanel({
  bundle,
  ufValue,
  saving,
  onPatch,
  onRefresh,
  onOpenInstall,
  onAdd,
  onDuplicate,
  onRequestUnlink,
  onRequestDelete,
  auditRefreshKey,
}: {
  bundle: BundleDetail;
  ufValue: number | null;
  saving: boolean;
  onPatch: (data: Record<string, unknown>) => Promise<void>;
  onRefresh: () => Promise<void>;
  onOpenInstall: (quoteId: string) => void;
  onAdd: () => void;
  onDuplicate: (quoteId: string) => void;
  onRequestUnlink: (member: BundleMember) => void;
  onRequestDelete: (member: BundleMember) => void;
  /** Cambia tras cada acción para recargar la auditoría consolidada. */
  auditRefreshKey: unknown;
}) {
  return (
    <div className="space-y-3 ds-page-enter">
      <ResumenSection bundle={bundle} ufValue={ufValue} />
      <BundleProposalPreview bundle={bundle} />
      <InstalacionesSection
        bundle={bundle}
        ufValue={ufValue}
        onRefresh={onRefresh}
        onOpenInstall={onOpenInstall}
        onAdd={onAdd}
        onDuplicate={onDuplicate}
        onRequestUnlink={onRequestUnlink}
        onRequestDelete={onRequestDelete}
      />
      <BundleCondicionesSection bundle={bundle} saving={saving} onPatch={onPatch} />
      <DatosPropuestaSection bundle={bundle} onPatch={onPatch} />
      <ComparadorSection bundle={bundle} ufValue={ufValue} />
      <BundleAiSection bundle={bundle} onOpenInstall={onOpenInstall} />
      <IncluyeAgregadoSection bundle={bundle} onOpenInstall={onOpenInstall} />
      <BundleAuditSection bundleId={bundle.id} refreshKey={auditRefreshKey} />
    </div>
  );
}
