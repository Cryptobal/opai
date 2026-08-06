"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect, type SearchableOption } from "@/components/ui/SearchableSelect";
import { SimpleSelect } from "@/components/ui/simple-select";
import { SECTION_LABELS, SECTION_ORDER } from "./grid-classes";

/** Secciones que admiten egreso/recurrencia de plan (mismo set que RecurringExpenseDialog). */
export const PLAN_RECURRENCE_SECTIONS = [
  "REMUNERACIONES", "IMPUESTOS", "GAV", "OTROS", "FINANCIAMIENTO",
] as const;

export type CreatedFlowRow = { id: string; section: string; name: string };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  onCreate: (body: Record<string, unknown>) => Promise<unknown>;
  lockedSection?: string | null;
  initialSection?: string | null;
  /** Precarga nombre del renglón. */
  presetName?: string | null;
  /** Cuentas a vincular tras crear (salud → crear renglón). */
  presetAccountPlanIds?: string[] | null;
  onCreated?: (
    row: CreatedFlowRow,
    opts: { configureRecurrence: boolean },
  ) => void;
}

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-ds-border-default bg-ds-surface-1 px-2 text-sm text-ds-text-1";

export function AddRowDialog({
  open,
  onOpenChange,
  busy,
  onCreate,
  lockedSection = null,
  initialSection = null,
  presetName = null,
  presetAccountPlanIds = null,
  onCreated,
}: Props) {
  const [section, setSection] = useState("INGRESOS");
  const [crmAccounts, setCrmAccounts] = useState<SearchableOption[]>([]);
  const [installations, setInstallations] = useState<SearchableOption[]>([]);
  const [accountPlans, setAccountPlans] = useState<SearchableOption[]>([]);
  const [accountId, setAccountId] = useState("");
  const [installationId, setInstallationId] = useState("");
  const [expenseAccountId, setExpenseAccountId] = useState("");
  const [linkAccount, setLinkAccount] = useState(true);
  const [name, setName] = useState("");
  const [configureRecurrence, setConfigureRecurrence] = useState(false);

  useEffect(() => {
    if (!open) return;
    const lockedOk =
      lockedSection &&
      (SECTION_ORDER as readonly string[]).includes(lockedSection)
        ? lockedSection
        : null;
    const initialOk =
      initialSection &&
      (SECTION_ORDER as readonly string[]).includes(initialSection)
        ? initialSection
        : null;
    setSection(lockedOk ?? initialOk ?? "GAV");
    setConfigureRecurrence(false);
    setName(presetName ?? "");
    setAccountId("");
    setInstallationId("");
    setExpenseAccountId(presetAccountPlanIds?.[0] ?? "");
    setLinkAccount(true);
  }, [open, lockedSection, initialSection, presetName, presetAccountPlanIds]);

  useEffect(() => {
    if (!open) return;
    fetch("/api/crm/accounts?active=true", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const list = (j.data ?? j.accounts ?? []) as Array<{ id: string; name: string }>;
        setCrmAccounts(list.map((a) => ({ id: a.id, label: a.name })));
      })
      .catch(() => setCrmAccounts([]));
    fetch("/api/finance/accounting/accounts", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const flat: SearchableOption[] = [];
        const walk = (nodes: Array<{ id: string; code: string; name: string; acceptsEntries?: boolean; children?: unknown[] }>) => {
          for (const n of nodes) {
            if (n.acceptsEntries !== false) {
              flat.push({ id: n.id, label: `${n.code} · ${n.name}` });
            }
            if (Array.isArray(n.children) && n.children.length) {
              walk(n.children as typeof nodes);
            }
          }
        };
        walk((j.data ?? []) as typeof flat extends never ? never : Parameters<typeof walk>[0]);
        setAccountPlans(flat);
      })
      .catch(() => setAccountPlans([]));
  }, [open]);

  useEffect(() => {
    setInstallationId("");
    if (!accountId) return setInstallations([]);
    fetch(`/api/crm/installations?accountId=${accountId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const list = (j.data ?? j.installations ?? []) as Array<{ id: string; name: string }>;
        setInstallations(list.map((i) => ({ id: i.id, label: i.name })));
      })
      .catch(() => setInstallations([]));
  }, [accountId]);

  const sectionLocked = !!lockedSection;
  const isIncome = section === "INGRESOS";
  const canConfigureRecurrence = (PLAN_RECURRENCE_SECTIONS as readonly string[]).includes(section);
  const incomeLinked = isIncome && linkAccount;

  const autoName = useMemo(() => {
    if (incomeLinked && accountId) {
      const acc = crmAccounts.find((a) => a.id === accountId)?.label ?? "";
      const inst = installations.find((i) => i.id === installationId)?.label;
      return inst ? `${acc} · ${inst}` : acc;
    }
    if (!isIncome && expenseAccountId) {
      return accountPlans.find((a) => a.id === expenseAccountId)?.label ?? "";
    }
    return "";
  }, [incomeLinked, isIncome, accountId, installationId, crmAccounts, installations, expenseAccountId, accountPlans]);

  const finalName = name.trim() || autoName;
  const canSubmit =
    finalName.length > 0 &&
    (isIncome ? (linkAccount ? !!accountId : true) : true) &&
    !busy;

  const submit = async () => {
    const body = isIncome
      ? incomeLinked
        ? {
            section, name: finalName, mapping: "ACCOUNT_INSTALLATION",
            crmAccountId: accountId, installationId: installationId || null,
          }
        : { section, name: finalName, mapping: "MANUAL" }
      : { section, name: finalName, mapping: "MANUAL" };
    const r = await onCreate(body);
    if (r != null && typeof r === "object" && "id" in r && typeof (r as { id: unknown }).id === "string") {
      const created = r as CreatedFlowRow;
      const accountIds = !isIncome && expenseAccountId ? [expenseAccountId] : presetAccountPlanIds;
      if (accountIds?.length) {
        await fetch(`/api/finance/flow-v3/rows/${created.id}/accounts`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountPlanIds: accountIds }),
        });
      }
      onOpenChange(false);
      setName(""); setAccountId(""); setInstallationId(""); setExpenseAccountId("");
      onCreated?.(
        { id: created.id, section: created.section ?? section, name: created.name ?? finalName },
        { configureRecurrence: canConfigureRecurrence && configureRecurrence },
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Agregar concepto</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block space-y-1 text-xs text-ds-text-3">
            <span>Sección</span>
            {sectionLocked ? (
              <Input
                className={SELECT_CLASS}
                value={SECTION_LABELS[section] ?? section}
                disabled
                readOnly
                aria-label="Sección (fija)"
                data-testid="add-row-section-locked"
              />
            ) : (
              <SimpleSelect
                className={SELECT_CLASS}
                value={section}
                onValueChange={(v) => setSection(v)}
                options={SECTION_ORDER.map((s) => ({
                  value: s,
                  label: SECTION_LABELS[s],
                }))}
              />
            )}
          </label>

          {isIncome ? (
            <>
              <label className="flex items-center gap-2 text-xs text-ds-text-2">
                <input type="checkbox" checked={linkAccount} onChange={(e) => setLinkAccount(e.target.checked)} />
                Asociar a una cuenta CRM (recomendado: cruza facturas y cobros)
              </label>
              {linkAccount ? (
                <>
                  <div className="space-y-1 text-xs text-ds-text-3">
                    <span>Cuenta CRM</span>
                    <SearchableSelect value={accountId} options={crmAccounts} placeholder="Buscar cliente…" onChange={setAccountId} />
                  </div>
                  <div className="space-y-1 text-xs text-ds-text-3">
                    <span>Instalación (opcional)</span>
                    <SearchableSelect value={installationId} options={installations} placeholder="Todas las instalaciones" onChange={setInstallationId} disabled={!accountId} />
                  </div>
                </>
              ) : (
                <p className="text-xs text-ds-text-4">
                  Ingreso manual sin cuenta: lo proyectás tú a mano en la planilla.
                </p>
              )}
            </>
          ) : (
            <div className="space-y-1 text-xs text-ds-text-3">
              <span>Cuenta contable (opcional)</span>
              <SearchableSelect
                value={expenseAccountId}
                options={accountPlans}
                placeholder="Vincular ahora o después en configuración…"
                onChange={setExpenseAccountId}
              />
            </div>
          )}

          <label className="block space-y-1 text-xs text-ds-text-3">
            <span>Nombre del renglón</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={autoName || "Nombre visible en la planilla"} />
          </label>

          {canConfigureRecurrence && (
            <label className="flex items-center gap-2 text-xs text-ds-text-2">
              <input
                type="checkbox"
                checked={configureRecurrence}
                onChange={(e) => setConfigureRecurrence(e.target.checked)}
                data-testid="add-row-configure-recurrence"
              />
              Configurar recurrencia al crear
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={!canSubmit}>{busy ? "Creando…" : "Crear fila"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
