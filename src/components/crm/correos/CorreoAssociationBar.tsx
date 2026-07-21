"use client";

import { useEffect, useState } from "react";
import { AsociarCuenta } from "./AsociarCuenta";

type DealOpt = { id: string; title: string };

/** Barra de asociación: cuenta + negocio opcional del drawer de correos. */
export function CorreoAssociationBar({
  accountId,
  accountName,
  dealId,
  dealTitle,
  onAssociate,
}: {
  accountId: string | null;
  accountName: string | null;
  dealId: string | null;
  dealTitle: string | null;
  onAssociate: (p: { accountId: string | null; dealId: string | null }) => void;
}) {
  const [deals, setDeals] = useState<DealOpt[]>([]);
  const [loadingDeals, setLoadingDeals] = useState(false);

  useEffect(() => {
    if (!accountId) {
      setDeals([]);
      return;
    }
    setLoadingDeals(true);
    fetch(`/api/crm/correos/deals-for-account?accountId=${encodeURIComponent(accountId)}`)
      .then((r) => r.json())
      .then((j) => setDeals(j.items ?? []))
      .catch(() => setDeals([]))
      .finally(() => setLoadingDeals(false));
  }, [accountId]);

  return (
    <div className="space-y-2 rounded-xl border border-ds-border-subtle bg-ds-surface-2 p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-ds-text-3">Asociación:</span>
        <span className="text-[13px] text-ds-text-1">{accountName || "Sin cuenta"}</span>
        {dealTitle && (
          <span className="text-[12px] text-ds-text-3">· {dealTitle}</span>
        )}
        <div className="ml-auto">
          <AsociarCuenta onSelect={(id) => onAssociate({ accountId: id, dealId: null })} />
        </div>
      </div>
      {accountId && (
        <label className="flex flex-col gap-1">
          <span className="text-[12px] text-ds-text-3">Negocio (opcional)</span>
          <select
            className="h-10 rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] text-ds-text-1 sm:h-9"
            value={dealId ?? ""}
            disabled={loadingDeals}
            onChange={(e) =>
              onAssociate({
                accountId,
                dealId: e.target.value || null,
              })
            }
          >
            <option value="">Sin negocio</option>
            {dealId && !deals.some((d) => d.id === dealId) && (
              <option value={dealId}>{dealTitle || "Negocio actual"}</option>
            )}
            {deals.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
