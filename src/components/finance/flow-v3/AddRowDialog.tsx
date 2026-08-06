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
  /**
   * Sección prefijada desde el "+" del encabezado. Si se setea, el select
   * queda bloqueado (no editable).
   */
  lockedSection?: string | null;
  /**
   * Sección sugerida editable (p.ej. Salud → Crear fila). Se ignora si hay
   * lockedSection. Si hay presetCategoryId y no se pasa, usa GAV (egreso).
   */
  initialSection?: string | null;
  /** Precarga categoría (pestaña Salud → Crear fila). */
  presetCategoryId?: string | null;
  /** Precarga nombre de la fila. */
  presetName?: string | null;
  /**
   * Tras crear con éxito: fila creada + si el usuario pidió encadenar
   * el diálogo de recurrencia.
   */
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
  presetCategoryId = null,
  presetName = null,
  onCreated,
}: Props) {
  const [section, setSection] = useState("INGRESOS");
  const [accounts, setAccounts] = useState<SearchableOption[]>([]);
  const [installations, setInstallations] = useState<SearchableOption[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string; kind: string }>>([]);
  const [accountId, setAccountId] = useState("");
  const [installationId, setInstallationId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [manual, setManual] = useState(false);
  // Ingreso asociado a una cuenta CRM (default) o manual/libre (sin cuenta).
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
    // Crear desde categoría de egreso: nunca abrir en INGRESOS.
    const fallback = presetCategoryId ? "GAV" : "INGRESOS";
    setSection(lockedOk ?? initialOk ?? fallback);
    setConfigureRecurrence(false);
    setName(presetName ?? "");
    setAccountId("");
    setInstallationId("");
    setCategoryId(presetCategoryId ?? "");
    setManual(false);
    setLinkAccount(!presetCategoryId);
  }, [open, lockedSection, initialSection, presetCategoryId, presetName]);

  useEffect(() => {
    if (!open) return;
    fetch("/api/crm/accounts?active=true", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const list = (j.data ?? j.accounts ?? []) as Array<{ id: string; name: string }>;
        setAccounts(list.map((a) => ({ id: a.id, label: a.name })));
      })
      .catch(() => setAccounts([]));
    fetch("/api/finance/cashflow/categorias", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setCategories((j.data ?? []) as Array<{ id: string; name: string; kind: string }>))
      .catch(() => setCategories([]));
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
  const expenseCategories = useMemo(
    () => categories.filter((c) => c.kind === "EXPENSE"),
    [categories],
  );

  // Ingreso: asociado a cuenta (default) o manual (libre, sin cuenta).
  const incomeLinked = isIncome && linkAccount;

  const autoName = useMemo(() => {
    if (incomeLinked && accountId) {
      const acc = accounts.find((a) => a.id === accountId)?.label ?? "";
      const inst = installations.find((i) => i.id === installationId)?.label;
      return inst ? `${acc} · ${inst}` : acc;
    }
    if (!isIncome && !manual && categoryId) {
      return categories.find((c) => c.id === categoryId)?.name ?? "";
    }
    return "";
  }, [incomeLinked, isIncome, accountId, installationId, accounts, installations, manual, categoryId, categories]);

  const finalName = name.trim() || autoName;
  const canSubmit =
    finalName.length > 0 &&
    (isIncome ? (linkAccount ? !!accountId : true) : manual ? true : !!categoryId) &&
    !busy;

  const submit = async () => {
    const body = isIncome
      ? incomeLinked
        ? {
            section, name: finalName, mapping: "ACCOUNT_INSTALLATION",
            crmAccountId: accountId, installationId: installationId || null,
          }
        : { section, name: finalName, mapping: "MANUAL" }
      : manual
        ? { section, name: finalName, mapping: "MANUAL" }
        : { section, name: finalName, mapping: "CATEGORY", categoryId };
    const r = await onCreate(body);
    if (r != null && typeof r === "object" && "id" in r && typeof (r as { id: unknown }).id === "string") {
      const created = r as CreatedFlowRow;
      onOpenChange(false);
      setName(""); setAccountId(""); setInstallationId(""); setCategoryId("");
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
                    <SearchableSelect value={accountId} options={accounts} placeholder="Buscar cliente…" onChange={setAccountId} />
                  </div>
                  <div className="space-y-1 text-xs text-ds-text-3">
                    <span>Instalación (opcional: sin instalación = fila genérica de la cuenta)</span>
                    <SearchableSelect value={installationId} options={installations} placeholder="Todas las instalaciones" onChange={setInstallationId} disabled={!accountId} />
                  </div>
                </>
              ) : (
                <p className="text-xs text-ds-text-4">
                  Ingreso manual sin cuenta: lo proyectas tú a mano en la planilla
                  (no se cruza con facturas ni programaciones).
                </p>
              )}
            </>
          ) : (
            <>
              <label className="flex items-center gap-2 text-xs text-ds-text-2">
                <input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} />
                Concepto manual (sin categoría)
              </label>
              {!manual && (
                <label className="block space-y-1 text-xs text-ds-text-3">
                  <span>Categoría</span>
                  <SimpleSelect
                    className={SELECT_CLASS}
                    value={categoryId}
                    onValueChange={(v) => setCategoryId(v)}
                    options={[
                      { value: "", label: "Seleccionar…" },
                      ...expenseCategories.map((c) => ({ value: c.id, label: c.name })),
                    ]}
                  />
                </label>
              )}
            </>
          )}

          <label className="block space-y-1 text-xs text-ds-text-3">
            <span>Nombre de la fila</span>
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
