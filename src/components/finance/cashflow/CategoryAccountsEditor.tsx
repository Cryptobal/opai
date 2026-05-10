"use client";
import { useEffect, useState } from "react";
import { X, Search } from "lucide-react";

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
  const [query, setQuery] = useState("");
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
          className={`inline-flex items-center gap-1.5 rounded-ds-sm px-2 py-1 text-[12px] ${
            m.isPrimary
              ? "bg-status-info-soft text-status-info-fg"
              : "bg-muted/40 text-ds-text-2"
          }`}
          title={`${m.accountPlan.code} — ${m.accountPlan.name}`}
        >
          <span className="font-mono">{m.accountPlan.code}</span>
          <span className="text-ds-text-3">·</span>
          <span className="truncate max-w-[180px]">{m.accountPlan.name}</span>
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
        <div className="relative">
          <div className="flex items-center gap-1.5 h-7 w-[260px] rounded-ds-sm border border-border bg-background px-2">
            <Search className="h-3.5 w-3.5 text-ds-text-3 shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por código o nombre..."
              className="flex-1 bg-transparent border-0 outline-none text-[12px]"
            />
          </div>
          {query.trim().length > 0 && (
            <ul className="absolute top-full left-0 mt-1 w-[260px] max-h-[240px] overflow-y-auto rounded-ds-sm border border-border bg-popover shadow-lg z-10">
              {available
                .filter((a) => {
                  const q = query.trim().toLowerCase();
                  return (
                    a.code.toLowerCase().includes(q) ||
                    a.name.toLowerCase().includes(q)
                  );
                })
                .slice(0, 50)
                .map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => {
                        save([...mappings.map((m) => m.accountPlanId), a.id]);
                        setQuery("");
                      }}
                      className="w-full text-left px-2 py-1.5 text-[12px] hover:bg-muted/40 flex items-center gap-2"
                    >
                      <span className="font-mono text-ds-text-3">{a.code}</span>
                      <span className="truncate">{a.name}</span>
                    </button>
                  </li>
                ))}
              {available.filter((a) => {
                const q = query.trim().toLowerCase();
                return (
                  a.code.toLowerCase().includes(q) ||
                  a.name.toLowerCase().includes(q)
                );
              }).length === 0 && (
                <li className="px-2 py-2 text-[12px] text-ds-text-3">
                  Sin resultados.{" "}
                  <a
                    href="/opai/configuracion/finanzas"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-status-info-fg underline"
                  >
                    Crear cuenta contable
                  </a>
                </li>
              )}
            </ul>
          )}
        </div>
      )}
      {error && (
        <span className="text-[12px] text-status-warn-fg ml-2">{error}</span>
      )}
    </div>
  );
}
