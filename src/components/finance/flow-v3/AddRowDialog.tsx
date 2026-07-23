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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  onCreate: (body: Record<string, unknown>) => Promise<unknown>;
}

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-ds-border-default bg-ds-surface-1 px-2 text-sm text-ds-text-1";

export function AddRowDialog({ open, onOpenChange, busy, onCreate }: Props) {
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

  const isIncome = section === "INGRESOS";
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
    if (r != null) {
      onOpenChange(false);
      setName(""); setAccountId(""); setInstallationId(""); setCategoryId("");
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
            <SimpleSelect
              className={SELECT_CLASS}
              value={section}
              onValueChange={(v) => setSection(v)}
              options={SECTION_ORDER.map((s) => ({
                value: s,
                label: SECTION_LABELS[s],
              }))}
            />
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={!canSubmit}>{busy ? "Creando…" : "Crear fila"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
