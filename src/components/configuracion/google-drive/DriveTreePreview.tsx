"use client";

import { buildTreePreview } from "@/lib/google-workspace/drive-tree";

type Props = {
  config: Record<string, boolean>;
  enabledModules?: string[];
  rootFolderName?: string | null;
};

export function DriveTreePreview({
  config,
  enabledModules = ["crm", "cpq", "personas", "documentos", "ops_supervision"],
  rootFolderName,
}: Props) {
  const lines = buildTreePreview(
    config,
    enabledModules,
    rootFolderName?.trim() || "Opai",
  );

  return (
    <div className="space-y-2">
      <pre className="overflow-x-auto rounded-xl border border-ds-border-subtle bg-ds-surface-1 p-3 font-mono text-[11px] leading-relaxed text-ds-text-3 sm:text-[12px]">
        {lines.join("\n")}
      </pre>
      <p className="text-[13px] text-ds-text-4">
        Solo se crean carpetas de módulos habilitados con al menos un tipo activo.
        Las carpetas de cada entidad aparecen con el primer documento.
      </p>
    </div>
  );
}
