"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { CrmAccount, CrmDeal } from "@/types";
import { DEFAULT_DEAL_FORM, type DealFormState } from "./types";

export function useCreateDeal({
  initialAccounts,
  onCreated,
}: {
  initialAccounts: CrmAccount[];
  onCreated: (deal: CrmDeal) => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<DealFormState>(DEFAULT_DEAL_FORM);
  const [accounts, setAccounts] = useState<CrmAccount[]>(initialAccounts);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [creating, setCreating] = useState(false);

  const ensureAccounts = async () => {
    if (accounts.length > 0 || loadingAccounts) return;
    setLoadingAccounts(true);
    try {
      const res = await fetch(
        "/api/crm/accounts?limit=100&sort=az&lifecycle=client_active",
      );
      const payload = await res.json();
      if (payload.success) setAccounts(payload.data ?? []);
    } catch {
      toast.error("No se pudieron cargar las cuentas.");
    } finally {
      setLoadingAccounts(false);
    }
  };

  const openCreate = (stageId?: string) => {
    if (stageId) setForm((f) => ({ ...f, stageId }));
    void ensureAccounts();
    setOpen(true);
  };

  const createDeal = async () => {
    if (!form.accountId) {
      toast.error("Selecciona un cliente.");
      return;
    }
    setCreating(true);
    try {
      const response = await fetch("/api/crm/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: form.accountId,
          title: form.title,
          stageId: form.stageId || undefined,
          amount: form.amount ? Number(form.amount) : 0,
          probability: form.probability ? Number(form.probability) : 0,
          expectedCloseDate: form.expectedCloseDate || undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Error");
      onCreated(payload.data);
      setForm(DEFAULT_DEAL_FORM);
      setOpen(false);
      toast.success("Negocio creado exitosamente");
    } catch {
      toast.error("No se pudo crear el negocio.");
    } finally {
      setCreating(false);
    }
  };

  return {
    open,
    setOpen,
    form,
    setFormField: (k: keyof DealFormState, v: string) =>
      setForm((f) => ({ ...f, [k]: v })),
    accounts,
    loadingAccounts,
    creating,
    ensureAccounts,
    openCreate,
    createDeal,
  };
}
