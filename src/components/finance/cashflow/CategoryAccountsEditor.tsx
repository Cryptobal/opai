"use client";
import { useEffect, useState } from "react";
import { X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AccountOption {
  id: string;
  code: string;
  name: string;
}

interface Mapping {
  id: string;
  accountPlanId: string;
  isPrimary: boolean;
  accountPlan: { code: string; name: string };
}

interface Props {
  categoryId: string;
  accountOptions: AccountOption[];
  canEdit: boolean;
}

/**
 * Edita los mappings categoría ↔ cuentas contables (1:N).
 * Renderiza un chip por cuenta mapeada (la principal en color info, las
 * adicionales en gris). Permite agregar y quitar. Persiste vía PUT.
 */
export function CategoryAccountsEditor({ categoryId, accountOptions, canEdit }: Props) {
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [picker, setPicker] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/finance/cashflow/categorias/${categoryId}/accounts`);
      const j = await r.json();
      if (j?.success) setMappings(j.data);
      else setError(j?.error ?? "Error al cargar");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId]);

  async function save(nextIds: string[]) {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/finance/cashflow/categorias/${categoryId}/accounts`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountPlanIds: nextIds }),
      });
      const j = await r.json();
      if (j?.success) await load();
      else setError(j?.error ?? "Error al guardar");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setSaving(false);
    }
  }

  function addAccount() {
    if (!picker) return;
    if (mappings.some((m) => m.accountPlanId === picker)) return;
    const nextIds = [...mappings.map((m) => m.accountPlanId), picker];
    save(nextIds);
    setPicker("");
  }

  function removeAccount(accountPlanId: string) {
    const nextIds = mappings
      .filter((m) => m.accountPlanId !== accountPlanId)
      .map((m) => m.accountPlanId);
    save(nextIds);
  }

  if (loading) {
    return <span className="text-[12px] text-ds-text-3">Cargando…</span>;
  }

  const available = accountOptions.filter(
    (o) => !mappings.some((m) => m.accountPlanId === o.id),
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {mappings.length === 0 && (
        <span className="text-[12px] text-ds-text-3">Sin cuentas</span>
      )}
      {mappings.map((m) => (
        <span
          key={m.id}
          className={`inline-flex items-center gap-1 rounded-ds-sm px-1.5 py-0.5 text-[12px] ${
            m.isPrimary
              ? "bg-status-info-soft text-status-info-fg"
              : "bg-muted/40 text-ds-text-2"
          }`}
          title={m.accountPlan.name}
        >
          <span className="font-mono">{m.accountPlan.code}</span>
          {canEdit && (
            <button
              type="button"
              aria-label={`Quitar cuenta ${m.accountPlan.code}`}
              onClick={() => removeAccount(m.accountPlanId)}
              disabled={saving}
              className="hover:text-status-warn-fg disabled:opacity-50"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}
      {canEdit && available.length > 0 && (
        <div className="flex items-center gap-1">
          <Select value={picker} onValueChange={setPicker}>
            <SelectTrigger className="h-7 w-[200px] text-[12px]">
              <SelectValue placeholder="Agregar cuenta…" />
            </SelectTrigger>
            <SelectContent>
              {available.map((a) => (
                <SelectItem key={a.id} value={a.id} className="text-[12px]">
                  <span className="font-mono mr-1">{a.code}</span> {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            onClick={addAccount}
            disabled={!picker || saving}
            className="h-7 px-2"
            aria-label="Agregar cuenta"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
      {error && (
        <span className="text-[12px] text-status-warn-fg ml-2">{error}</span>
      )}
    </div>
  );
}
