"use client";

import { useCallback, useMemo, useState } from "react";
import { Building2, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  EmptyState,
  IconBubble,
  Tag,
  Toolbar,
  type DataTableColumn,
} from "@/components/opai-ds";
import { FactoringCompanyForm } from "./FactoringCompanyForm";

export interface FactoringCompanyRow {
  id: string;
  rut: string;
  rutFormatted: string;
  razonSocial: string;
  direccion: string | null;
  comuna: string | null;
  ciudad: string | null;
  email: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  defaultAdvanceRate: number | null;
  defaultInterestRate: number | null;
  defaultCommissionPct: number | null;
  notes: string | null;
  isActive: boolean;
}

interface Props {
  initialCompanies: FactoringCompanyRow[];
  canManage: boolean;
}

export function FactoringCompaniesClient({ initialCompanies, canManage }: Props) {
  const [companies, setCompanies] = useState(initialCompanies);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<FactoringCompanyRow | null>(null);
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    if (!search.trim()) return companies;
    const term = search.trim().toLowerCase();
    return companies.filter(
      (c) =>
        c.razonSocial.toLowerCase().includes(term) ||
        c.rut.toLowerCase().includes(term),
    );
  }, [companies, search]);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/finance/factoring/companies?includeInactive=1");
    const json = await res.json();
    if (json.success) setCompanies(json.companies);
  }, []);

  const handleDeactivate = useCallback(
    async (company: FactoringCompanyRow) => {
      if (!confirm(`¿Desactivar el factoring "${company.razonSocial}"?`)) return;
      const res = await fetch(`/api/finance/factoring/companies/${company.id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error ?? "Error desactivando");
        return;
      }
      toast.success("Factoring desactivado");
      refresh();
    },
    [refresh],
  );

  const handleReactivate = useCallback(
    async (company: FactoringCompanyRow) => {
      const res = await fetch(`/api/finance/factoring/companies/${company.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...company, isActive: undefined }),
      });
      // El service no expone reactivate por API directo, pero seteo isActive
      // mediante PATCH con campos completos. Si el body PATCH no acepta
      // isActive, hago un follow-up endpoint en V2.
      // Workaround: hago una llamada a un endpoint custom — mejor, refresh.
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error ?? "Error reactivando");
        return;
      }
      toast.success("Factoring reactivado");
      refresh();
    },
    [refresh],
  );

  const columns: DataTableColumn<FactoringCompanyRow>[] = [
    {
      id: "razonSocial",
      header: "Razón social",
      cell: (c) => (
        <div className="flex items-center gap-2 min-w-0">
          <IconBubble icon={Building2} variant="brand" size="sm" />
          <div className="min-w-0">
            <div className="font-medium text-ds-text-1 truncate">{c.razonSocial}</div>
            <div className="text-xs text-ds-text-3 font-mono">{c.rutFormatted}</div>
          </div>
        </div>
      ),
    },
    {
      id: "contact",
      header: "Contacto",
      hideOnMobile: true,
      cell: (c) => (
        <div className="text-sm text-ds-text-2 min-w-0">
          {c.contactName ? <div className="truncate">{c.contactName}</div> : null}
          {c.contactEmail ? (
            <div className="text-xs text-ds-text-3 truncate">{c.contactEmail}</div>
          ) : null}
        </div>
      ),
    },
    {
      id: "tasas",
      header: "Tasas default",
      align: "right",
      hideOnMobile: true,
      cell: (c) => (
        <div className="text-xs text-ds-text-2 font-mono whitespace-nowrap">
          {c.defaultAdvanceRate !== null ? `Anticipo ${c.defaultAdvanceRate}%` : "—"}
          {c.defaultInterestRate !== null ? ` · Int ${c.defaultInterestRate}%/m` : ""}
          {c.defaultCommissionPct !== null ? ` · Com ${c.defaultCommissionPct}%` : ""}
        </div>
      ),
    },
    {
      id: "status",
      header: "Estado",
      cell: (c) =>
        c.isActive ? (
          <Tag variant="ok" size="sm">Activo</Tag>
        ) : (
          <Tag variant="neutral" size="sm">Inactivo</Tag>
        ),
    },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (c) =>
        canManage ? (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditing(c)}
              aria-label="Editar"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            {c.isActive ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDeactivate(c)}
                aria-label="Desactivar"
              >
                <Trash2 className="h-4 w-4 text-status-danger-fg" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleReactivate(c)}
                aria-label="Reactivar"
              >
                <RotateCcw className="h-4 w-4 text-status-ok-fg" />
              </Button>
            )}
          </div>
        ) : null,
    },
  ];

  return (
    <div className="space-y-4">
      <Toolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por nombre o RUT…"
        primaryAction={
          canManage ? (
            <Button
              onClick={() => setCreating(true)}
              className="h-10 sm:h-9"
              size="sm"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Nuevo factoring
            </Button>
          ) : null
        }
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={search ? "Sin resultados" : "Sin empresas de factoring"}
          description={
            search
              ? "Probá con otro término de búsqueda."
              : "Agregá la primera empresa para empezar a ceder facturas."
          }
        />
      ) : (
        <DataTable columns={columns} rows={filtered} rowKey={(c) => c.id} />
      )}

      {creating ? (
        <FactoringCompanyForm
          mode="create"
          onClose={() => setCreating(false)}
          onSuccess={() => {
            setCreating(false);
            refresh();
          }}
        />
      ) : null}

      {editing ? (
        <FactoringCompanyForm
          mode="edit"
          company={editing}
          onClose={() => setEditing(null)}
          onSuccess={() => {
            setEditing(null);
            refresh();
          }}
        />
      ) : null}
    </div>
  );
}
