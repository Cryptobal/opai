"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect, type SearchableOption } from "@/components/ui/SearchableSelect";
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

  const autoName = useMemo(() => {
    if (isIncome && accountId) {
      const acc = accounts.find((a) => a.id === accountId)?.label ?? "";
      const inst = installations.find((i) => i.id === installationId)?.label;
      return inst ? `${acc} · ${inst}` : acc;
    }
    if (!isIncome && !manual && categoryId) {
      return categories.find((c) => c.id === categoryId)?.name ?? "";
    }
    return "";
  }, [isIncome, accountId, installationId, accounts, installations, manual, categoryId, categories]);

  const finalName = name.trim() || autoName;
  const canSubmit =
    finalName.length > 0 &&
    (isIncome ? !!accountId : manual ? true : !!categoryId) &&
    !busy;

  const submit = async () => {
    const body = isIncome
      ? {
          section, name: finalName, mapping: "ACCOUNT_INSTALLATION",
          crmAccountId: accountId, installationId: installationId || null,
        }
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
            <select className={SELECT_CLASS} value={section} onChange={(e) => setSection(e.target.value)}>
              {SECTION_ORDER.map((s) => (
                <option key={s} value={s}>{SECTION_LABELS[s]}</option>
              ))}
            </select>
          </label>

          {isIncome ? (
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
            <>
              <label className="flex items-center gap-2 text-xs text-ds-text-2">
                <input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} />
                Concepto manual (sin categoría)
              </label>
              {!manual && (
                <label className="block space-y-1 text-xs text-ds-text-3">
                  <span>Categoría</span>
                  <select className={SELECT_CLASS} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                    <option value="">Seleccionar…</option>
                    {expenseCategories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
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
