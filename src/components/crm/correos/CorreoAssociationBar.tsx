"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, Sparkles } from "lucide-react";
import { SelectGroup, SelectLabel } from "@/components/ui/select";
import { SimpleSelect, SimpleSelectItem } from "@/components/ui/simple-select";
import { toast } from "sonner";
import { AsociarCuenta } from "./AsociarCuenta";
import { QuickDealCreate, type DealPrefill } from "./QuickDealCreate";

type DealOpt = { id: string; title: string; status: string };
type AccountSuggestion = { id: string; name: string; reason: string };

const CREATE = "__create__";
const CREATE_AI = "__create_ai__";

const STATUS_SUFFIX: Record<string, string> = {
  won: " · Ganado",
  lost: " · Perdido",
};

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
  onAssociate: (p: {
    accountId: string | null;
    dealId: string | null;
    sharedWithAccount?: boolean;
  }) => void;
}) {
  const [deals, setDeals] = useState<DealOpt[]>([]);
  const [loadingDeals, setLoadingDeals] = useState(false);
  const [creating, setCreating] = useState(false);
  const [prefill, setPrefill] = useState<DealPrefill | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<AccountSuggestion[]>([]);

  useEffect(() => {
    setCreating(false);
    setPrefill(null);
    if (!accountId) {
      setDeals([]);
      return;
    }
    setLoadingDeals(true);
    fetch(`/api/crm/correos/deals-for-account?accountId=${encodeURIComponent(accountId)}`)
      .then((r) => r.json())
      .then((j) => {
        const items = Array.isArray(j.items) ? j.items : [];
        setDeals(
          items.map((d: { id: string; title: string; status?: string }) => ({
            id: d.id,
            title: d.title,
            status: d.status ?? "open",
          })),
        );
      })
      .catch(() => setDeals([]))
      .finally(() => setLoadingDeals(false));
  }, [accountId]);

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

  const openDeals = deals.filter((d) => d.status === "open");
  const closedDeals = deals.filter((d) => d.status !== "open");

  async function createWithAi() {
    if (!threadId || !accountId || suggesting) return;
    setSuggesting(true);
    try {
      const res = await fetch(`/api/crm/correos/${threadId}/suggest-deal`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.suggestion) {
        throw new Error(body?.error || "No se pudo generar la propuesta");
      }
      const s = body.suggestion as {
        title: string;
        amount: number | null;
        stageId: string | null;
        stageName: string | null;
      };
      setPrefill({
        title: s.title,
        amount: s.amount,
        stageId: s.stageId,
        stageName: s.stageName,
        fromAi: true,
      });
      setCreating(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar la propuesta");
    } finally {
      setSuggesting(false);
    }
  }

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
              {sharedWithAccount
                ? "Visible en la ficha de la cuenta"
                : "Privado (no visible en la ficha)"}
            </span>
            <span className="block text-[12px] text-ds-text-4">
              El hilo aparece en «Conversaciones» de la cuenta para quienes tengan acceso a ella. Tu
              casilla sigue siendo privada.
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
          <SimpleSelect
            className="h-10 rounded-xl sm:h-9"
            value={dealId ?? ""}
            disabled={loadingDeals || suggesting}
            aria-label="Negocio (opcional)"
            onValueChange={(v) => {
              if (v === CREATE) {
                setPrefill(null);
                setCreating(true);
                return;
              }
              if (v === CREATE_AI) {
                void createWithAi();
                return;
              }
              onAssociate({ accountId, dealId: v || null });
            }}
          >
            <SimpleSelectItem value="">Sin negocio</SimpleSelectItem>
            {dealId && !deals.some((d) => d.id === dealId) && (
              <SimpleSelectItem value={dealId}>{dealTitle || "Negocio actual"}</SimpleSelectItem>
            )}
            {openDeals.length > 0 && (
              <SelectGroup>
                <SelectLabel className="text-[12px] text-ds-text-3">Abiertos</SelectLabel>
                {openDeals.map((d) => (
                  <SimpleSelectItem key={d.id} value={d.id}>
                    {d.title}
                  </SimpleSelectItem>
                ))}
              </SelectGroup>
            )}
            {closedDeals.length > 0 && (
              <SelectGroup>
                <SelectLabel className="text-[12px] text-ds-text-4">Cerrados</SelectLabel>
                {closedDeals.map((d) => (
                  <SimpleSelectItem key={d.id} value={d.id}>
                    <span className="text-ds-text-3">
                      {d.title}
                      {STATUS_SUFFIX[d.status] ?? ` · ${d.status}`}
                    </span>
                  </SimpleSelectItem>
                ))}
              </SelectGroup>
            )}
            <SimpleSelectItem value={CREATE}>＋ Crear negocio…</SimpleSelectItem>
            <SimpleSelectItem value={CREATE_AI}>
              ✦ {suggesting ? "Generando propuesta…" : "Crear negocio con IA"}
            </SimpleSelectItem>
          </SimpleSelect>
        </label>
      )}
      {accountId && creating && (
        <QuickDealCreate
          accountId={accountId}
          defaultTitle={subject ?? ""}
          prefill={prefill}
          onCreated={(newDealId) => {
            setCreating(false);
            setPrefill(null);
            onAssociate({ accountId, dealId: newDealId });
          }}
          onCancel={() => {
            setCreating(false);
            setPrefill(null);
          }}
        />
      )}
    </div>
  );
}
