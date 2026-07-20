"use client";

import { AsociarCuenta } from "./AsociarCuenta";

/** Barra "Asociación: {cuenta}" + selector de cuenta del drawer de correos. */
export function CorreoAssociationBar({
  accountName,
  onSelect,
}: {
  accountName: string | null;
  onSelect: (accountId: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-ds-border-subtle bg-ds-surface-2 p-2.5">
      <span className="text-[12px] text-ds-text-3">Asociación:</span>
      <span className="text-[13px] text-ds-text-1">{accountName || "Sin cuenta"}</span>
      <div className="ml-auto">
        <AsociarCuenta onSelect={onSelect} />
      </div>
    </div>
  );
}
