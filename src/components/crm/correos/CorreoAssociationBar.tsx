"use client";

import { useEffect, useState } from "react";
import { AsociarCuenta } from "./AsociarCuenta";
import { QuickDealCreate } from "./QuickDealCreate";

type DealOpt = { id: string; title: string };

const CREATE = "__create__";

/** Barra de asociación: cuenta + negocio opcional del drawer de correos. */
export function CorreoAssociationBar({
  accountId,
  accountName,
  dealId,
  dealTitle,
  subject,
  onAssociate,
}: {
  accountId: string | null;
  accountName: string | null;
  dealId: string | null;
  dealTitle: string | null;
  subject?: string;
  onAssociate: (p: { accountId: string | null; dealId: string | null }) => void;
}) {
  const [deals, setDeals] = useState<DealOpt[]>([]);
  const [loadingDeals, setLoadingDeals] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    setCreating(false);
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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-[12px] text-ds-text-3">Asociación:</span>
          <span className="min-w-0 truncate text-[13px] text-ds-text-1">
            {accountName || "Sin cuenta"}
          </span>
          {dealTitle && (
            <span className="min-w-0 truncate text-[12px] text-ds-text-3">· {dealTitle}</span>
          )}
        </div>
        <div className="w-full sm:ml-auto sm:w-auto">
          <AsociarCuenta onSelect={(id) => onAssociate({ accountId: id, dealId: null })} />
        </div>
      </div>
      {accountId && !creating && (
        <label className="flex flex-col gap-1">
          <span className="text-[12px] text-ds-text-3">Negocio (opcional)</span>
          <select
            className="h-10 rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] text-ds-text-1 sm:h-9"
            value={dealId ?? ""}
            disabled={loadingDeals}
            onChange={(e) => {
              if (e.target.value === CREATE) {
                setCreating(true);
                return;
              }
              onAssociate({ accountId, dealId: e.target.value || null });
            }}
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
            <option value={CREATE}>＋ Crear negocio…</option>
          </select>
        </label>
      )}
      {accountId && creating && (
        <QuickDealCreate
          accountId={accountId}
          defaultTitle={subject ?? ""}
          onCreated={(newDealId) => {
            setCreating(false);
            onAssociate({ accountId, dealId: newDealId });
          }}
          onCancel={() => setCreating(false)}
        />
      )}
    </div>
  );
}
