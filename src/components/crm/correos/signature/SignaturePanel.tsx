"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { SignatureData } from "@/modules/crm/email/signature-data";
import { SignatureForm } from "./SignatureForm";
import { SignatureList } from "./SignatureList";
import { SignaturePreview } from "./SignaturePreview";
import {
  dataFromRow,
  emptySignatureData,
  inferFromLegacyHtml,
  type SignatureRow,
} from "./signature-ui";

type Props = {
  /** Scope inicial del formulario (config → tenant; Correos → user). */
  defaultScope?: "user" | "tenant";
  /** Si false, oculta el toggle empresa o lo deja deshabilitado. */
  canEditTenant?: boolean;
  /** Carga inicial opcional (página de config). */
  initialRows?: SignatureRow[];
};

export function SignaturePanel({
  defaultScope = "user",
  canEditTenant: canEditTenantProp,
  initialRows,
}: Props) {
  const [loading, setLoading] = useState(!initialRows);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<SignatureRow[]>(initialRows ?? []);
  const [canEditTenant, setCanEditTenant] = useState(Boolean(canEditTenantProp));
  const [scope, setScope] = useState<"user" | "tenant">(defaultScope);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("Mi firma");
  const [isDefault, setIsDefault] = useState(true);
  const [data, setData] = useState<SignatureData>(emptySignatureData());
  /** Firma legacy abierta: editable tras auto-conversión a campos. */
  const [convertedFromLegacy, setConvertedFromLegacy] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/crm/signatures");
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(d.error || "No se pudieron cargar las firmas");
        return;
      }
      setRows(d.data ?? []);
      // canEditTenant desde ai-style (mismo criterio)
      const styleR = await fetch("/api/crm/correos/ai-style?scope=tenant");
      if (styleR.ok) {
        const s = await styleR.json();
        setCanEditTenant(Boolean(s.canEditTenant));
      }
    } catch {
      toast.error("Sin conexión");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  function startCreate() {
    setEditingId(null);
    setName(scope === "tenant" ? "Firma de la empresa" : "Mi firma");
    setIsDefault(true);
    setData(emptySignatureData());
    setConvertedFromLegacy(false);
    setShowEditor(true);
  }

  function selectRow(row: SignatureRow) {
    setEditingId(row.id);
    setName(row.name);
    setIsDefault(row.isDefault);
    setScope(row.userId ? "user" : "tenant");
    const structured = dataFromRow(row);
    if (structured) {
      setData(structured);
      setConvertedFromLegacy(false);
    } else {
      // Legacy: abrir ya editable (antes quedaba disabled y ni diseño ni campos).
      // Se guarda con PATCH sobre el mismo id → content estructurado + html nuevo.
      setData({
        ...emptySignatureData(),
        ...inferFromLegacyHtml(row.htmlContent),
      });
      setConvertedFromLegacy(true);
      toast.message("Revisá los campos (nombre, cargo, diseño) y guardá");
    }
    setShowEditor(true);
  }

  function convertLegacy(row: SignatureRow) {
    selectRow(row);
  }

  async function save() {
    if (!data.fullName.trim()) {
      toast.error("El nombre completo es obligatorio");
      return;
    }
    setSaving(true);
    try {
      const payload = { name: name.trim() || data.fullName, isDefault, scope, data };
      const r = await fetch(
        editingId ? `/api/crm/signatures/${editingId}` : "/api/crm/signatures",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(d.error || "No se pudo guardar");
        return;
      }
      toast.success("Firma guardada");
      setConvertedFromLegacy(false);
      setShowEditor(false);
      await reload();
    } catch {
      toast.error("Error de guardado");
    } finally {
      setSaving(false);
    }
  }

  async function setDefault(row: SignatureRow) {
    const r = await fetch(`/api/crm/signatures/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      toast.error(d.error || "No se pudo marcar como predeterminada");
      return;
    }
    toast.success("Firma predeterminada actualizada");
    await reload();
  }

  async function confirmDelete() {
    if (!deleteId) return;
    const r = await fetch(`/api/crm/signatures/${deleteId}`, { method: "DELETE" });
    if (!r.ok) {
      toast.error("No se pudo eliminar");
      return;
    }
    toast.success("Firma eliminada");
    setDeleteId(null);
    if (editingId === deleteId) setShowEditor(false);
    await reload();
  }

  const scopeDisabled = scope === "tenant" && !canEditTenant;

  return (
    <div className="ds-page-enter space-y-4">
      {!showEditor ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12px] text-ds-text-3">
              La firma se anexa al enviar. No la escribas en el prompt de IA.
            </p>
            <button type="button" onClick={startCreate}
              className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-primary px-3 text-[13px] font-medium text-primary-foreground ds-tap sm:h-10">
              <Plus className="h-4 w-4" /> Nueva
            </button>
          </div>
          <SignatureList
            rows={rows}
            loading={loading}
            selectedId={editingId}
            onSelect={selectRow}
            onSetDefault={(row) => void setDefault(row)}
            onDelete={(row) => setDeleteId(row.id)}
            onConvertLegacy={convertLegacy}
            onCreate={startCreate}
          />
        </>
      ) : (
        <>
          <div className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-ds-border-subtle bg-ds-surface-2 px-3">
            <label htmlFor="sig-scope-personal" className="min-w-0 flex-1 text-[13px] text-ds-text-2">
              Firma personal (si no, de empresa)
            </label>
            <input
              id="sig-scope-personal"
              type="checkbox"
              checked={scope === "user"}
              disabled={scopeDisabled}
              onChange={(e) => {
                const personal = e.target.checked;
                if (!personal && !canEditTenant) {
                  toast.error("Necesitas permiso de configuración para firmas de empresa");
                  return;
                }
                setScope(personal ? "user" : "tenant");
              }}
              className="h-5 w-5 shrink-0 rounded border-ds-border-default accent-primary"
            />
          </div>
          {scope === "tenant" && !canEditTenant && (
            <p className="rounded-lg bg-ds-surface-2 px-3 py-2 text-[12px] text-ds-text-3">
              Sin permiso para editar firmas de la empresa. Pedí a un admin o usá firma personal.
            </p>
          )}
          {convertedFromLegacy && (
            <p className="rounded-lg border border-status-warn-border bg-status-warn-soft px-3 py-2 text-[12px] text-status-warn-fg">
              Firma antigua convertida a campos. Separá nombre y cargo, elegí el diseño y guardá
              para que deje de verse de corrido en los correos.
            </p>
          )}

          <label className="block space-y-1">
            <span className="text-[12px] text-ds-text-3">Nombre interno</span>
            <input
              value={name}
              disabled={scopeDisabled}
              onChange={(e) => setName(e.target.value)}
              className="h-11 w-full rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] sm:h-10"
            />
          </label>

          <label className="flex min-h-11 items-center gap-2 text-[13px] text-ds-text-2">
            <input type="checkbox" checked={isDefault} disabled={scopeDisabled}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="h-5 w-5 accent-primary" />
            Usar como predeterminada
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <SignatureForm
              data={data}
              onChange={setData}
              disabled={scopeDisabled}
            />
            <SignaturePreview data={data} />
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {!scopeDisabled && (
              <button type="button" disabled={saving} onClick={() => void save()}
                className="inline-flex h-11 flex-1 items-center justify-center rounded-xl bg-primary px-4 text-[13px] font-medium text-primary-foreground ds-tap disabled:opacity-50 sm:h-10">
                {saving ? "Guardando…" : "Guardar firma"}
              </button>
            )}
            <button type="button" onClick={() => setShowEditor(false)}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-ds-border-default px-3 text-[13px] text-ds-text-2 ds-tap sm:h-10">
              Volver
            </button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={Boolean(deleteId)}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title="Eliminar firma"
        description="La firma se desactivará. Los correos ya enviados no cambian."
        confirmLabel="Eliminar"
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
