"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, Sparkles } from "lucide-react";
import { AsociarCuenta } from "./AsociarCuenta";
import { QuickDealCreate } from "./QuickDealCreate";

type DealOpt = { id: string; title: string };
type AccountSuggestion = { id: string; name: string; reason: string };

const CREATE = "__create__";

/** Barra de asociación: cuenta + negocio opcional del drawer de correos. */
export function CorreoAssociationBar({
  threadId,
  accountId,
  accountName,
  dealId,
  dealTitle,
  subject,
  sharedWithAccount = true,
  onAssociate,
}: {
  threadId?: string;
  accountId: string | null;
  accountName: string | null;
  dealId: string | null;
  dealTitle: string | null;
  subject?: string;
  /** Bloque 5: el hilo asociado es visible en la ficha de la cuenta. */
  sharedWithAccount?: boolean;
  onAssociate: (p: { accountId: string | null; dealId: string | null; sharedWithAccount?: boolean }) => void;
}) {
  const [deals, setDeals] = useState<DealOpt[]>([]);
  const [loadingDeals, setLoadingDeals] = useState(false);
  const [creating, setCreating] = useState(false);
  const [suggestions, setSuggestions] = useState<AccountSuggestion[]>([]);

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

  // Sugerencias de cuenta (IA por dominio) solo cuando el hilo no tiene cuenta.
  useEffect(() => {
    if (accountId || !threadId) {
      setSuggestions([]);
      return;
    }
    let alive = true;
    fetch(`/api/crm/correos/${threadId}/suggest-account`)
      .then((r) => r.json())
      .then((j) => alive && setSuggestions(j.suggestions ?? []))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [accountId, threadId]);

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

      {accountId && (
        <button
          type="button"
          onClick={() => onAssociate({ accountId, dealId, sharedWithAccount: !sharedWithAccount })}
          aria-pressed={sharedWithAccount}
          className="flex w-full items-start gap-2 rounded-lg border border-ds-border-subtle bg-ds-surface-1 px-3 py-2 text-left ds-tap"
        >
          {sharedWithAccount ? (
            <Eye className="mt-0.5 h-4 w-4 shrink-0 text-status-ok-fg" />
          ) : (
            <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-ds-text-4" />
          )}
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium text-ds-text-1">
              {sharedWithAccount ? "Visible en la ficha de la cuenta" : "Privado (no visible en la ficha)"}
            </span>
            <span className="block text-[12px] text-ds-text-4">
              El hilo aparece en «Conversaciones» de la cuenta para quienes tengan acceso a ella. Tu casilla sigue siendo privada.
            </span>
          </span>
          <span
            className={`mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${
              sharedWithAccount ? "bg-primary" : "bg-ds-surface-3"
            }`}
          >
            <span
              className={`h-4 w-4 rounded-full bg-ds-surface-1 transition-transform ${
                sharedWithAccount ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </span>
        </button>
      )}

      {!accountId && suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[12px] text-ds-text-3">
            <Sparkles className="h-3.5 w-3.5 text-tint-violet-fg" /> Sugerencia:
          </span>
          {suggestions.map((s) => (
            <button
              key={s.id}
              type="button"
              title={s.reason}
              onClick={() => onAssociate({ accountId: s.id, dealId: null })}
              className="inline-flex items-center rounded-full border border-ds-border-default bg-ds-surface-1 px-2.5 py-1 text-[12px] text-ds-text-1 ds-tap hover:border-primary"
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
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
