"use client";

import React, { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Shield, ShieldAlert, Plus, Search, Edit, Trash2,
  Loader2, Upload, X, Check, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { AccessControlListEntry, ListType } from "@/lib/access-control/types";
import { formatRut, validateRut } from "@/lib/access-control/utils";

interface Props {
  installationId: string;
}

export function AccessControlListsManager({ installationId }: Props) {
  const [activeTab, setActiveTab] = useState<ListType>("whitelist");
  const [entries, setEntries] = useState<AccessControlListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editEntry, setEditEntry] = useState<AccessControlListEntry | null>(null);
  const [showImport, setShowImport] = useState(false);

  // Form state
  const [formRut, setFormRut] = useState("");
  const [formName, setFormName] = useState("");
  const [formCompany, setFormCompany] = useState("");
  const [formBlockReason, setFormBlockReason] = useState("");
  const [formScope, setFormScope] = useState<"local" | "global">("local");
  const [formValidFrom, setFormValidFrom] = useState("");
  const [formValidUntil, setFormValidUntil] = useState("");
  const [formSaving, setFormSaving] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/access-control/lists/${installationId}?type=${activeTab}`
      );
      const json = await res.json();
      if (json.success) {
        setEntries(json.data);
      }
    } catch {
      toast.error("Error al cargar lista");
    } finally {
      setLoading(false);
    }
  }, [installationId, activeTab]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const resetForm = () => {
    setFormRut("");
    setFormName("");
    setFormCompany("");
    setFormBlockReason("");
    setFormScope("local");
    setFormValidFrom("");
    setFormValidUntil("");
    setEditEntry(null);
    setShowForm(false);
  };

  const openEdit = (entry: AccessControlListEntry) => {
    setEditEntry(entry);
    setFormRut(entry.rut);
    setFormName(entry.fullName);
    setFormCompany(entry.company || "");
    setFormBlockReason(entry.blockReason || "");
    setFormScope(entry.scope as "local" | "global");
    setFormValidFrom(entry.validFrom ? entry.validFrom.split("T")[0] : "");
    setFormValidUntil(entry.validUntil ? entry.validUntil.split("T")[0] : "");
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!validateRut(formRut)) {
      toast.error("RUT inválido");
      return;
    }
    if (!formName.trim()) {
      toast.error("El nombre es requerido");
      return;
    }

    setFormSaving(true);
    try {
      if (editEntry) {
        const res = await fetch(`/api/access-control/lists/item/${editEntry.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fullName: formName,
            company: formCompany,
            blockReason: formBlockReason,
            scope: formScope,
            validFrom: formValidFrom || null,
            validUntil: formValidUntil || null,
            isActive: true,
          }),
        });
        const json = await res.json();
        if (json.success) {
          toast.success("Entrada actualizada");
          resetForm();
          fetchList();
        } else {
          toast.error(json.error);
        }
      } else {
        const res = await fetch(`/api/access-control/lists/${installationId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            listType: activeTab,
            rut: formRut,
            fullName: formName,
            company: formCompany,
            blockReason: formBlockReason,
            scope: formScope,
            validFrom: formValidFrom || null,
            validUntil: formValidUntil || null,
          }),
        });
        const json = await res.json();
        if (json.success) {
          toast.success("Entrada creada");
          resetForm();
          fetchList();
        } else {
          toast.error(json.error);
        }
      }
    } catch {
      toast.error("Error al guardar");
    } finally {
      setFormSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar esta entrada?")) return;
    try {
      const res = await fetch(`/api/access-control/lists/item/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        toast.success("Entrada eliminada");
        fetchList();
      }
    } catch {
      toast.error("Error al eliminar");
    }
  };

  const filtered = entries.filter((e) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      e.rut.toLowerCase().includes(s) ||
      e.fullName.toLowerCase().includes(s) ||
      (e.company && e.company.toLowerCase().includes(s))
    );
  });

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab("whitelist")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "whitelist"
              ? "bg-status-ok-soft text-status-ok-fg border border-status-ok-border"
              : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-600"
          }`}
        >
          <Shield className="h-4 w-4" />
          Lista Blanca
        </button>
        <button
          onClick={() => setActiveTab("blacklist")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "blacklist"
              ? "bg-status-danger-soft text-status-danger-fg border border-status-danger-border"
              : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-600"
          }`}
        >
          <ShieldAlert className="h-4 w-4" />
          Lista Negra
        </button>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por RUT, nombre o empresa..."
            className="pl-9 bg-zinc-800 border-zinc-600"
          />
        </div>
        <Button onClick={() => setShowImport(true)} variant="outline" size="sm">
          <Upload className="mr-1 h-4 w-4" />
          Importar
        </Button>
        <Button onClick={() => { resetForm(); setShowForm(true); }} size="sm">
          <Plus className="mr-1 h-4 w-4" />
          Agregar
        </Button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="rounded-lg border border-zinc-600 bg-zinc-800 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-zinc-200">
              {editEntry ? "Editar Entrada" : "Nueva Entrada"}
            </h4>
            <button onClick={resetForm} className="text-zinc-500 hover:text-zinc-300">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-zinc-400">RUT</Label>
              <Input
                value={formRut}
                onChange={(e) => setFormRut(e.target.value)}
                placeholder="12.345.678-9"
                className="bg-zinc-700 border-zinc-600"
                disabled={!!editEntry}
              />
              {formRut && !validateRut(formRut) && (
                <p className="mt-1 text-xs text-status-danger-fg">RUT inválido</p>
              )}
            </div>
            <div>
              <Label className="text-zinc-400">Nombre Completo</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="bg-zinc-700 border-zinc-600"
              />
            </div>
            <div>
              <Label className="text-zinc-400">Empresa</Label>
              <Input
                value={formCompany}
                onChange={(e) => setFormCompany(e.target.value)}
                className="bg-zinc-700 border-zinc-600"
              />
            </div>
            {activeTab === "blacklist" && (
              <>
                <div>
                  <Label className="text-zinc-400">Motivo del Bloqueo</Label>
                  <Input
                    value={formBlockReason}
                    onChange={(e) => setFormBlockReason(e.target.value)}
                    className="bg-zinc-700 border-zinc-600"
                  />
                </div>
                <div>
                  <Label className="text-zinc-400">Alcance</Label>
                  <select
                    value={formScope}
                    onChange={(e) => setFormScope(e.target.value as "local" | "global")}
                    className="w-full rounded-md border border-zinc-600 bg-zinc-700 px-3 py-2 text-sm text-zinc-200"
                  >
                    <option value="local">Solo esta instalación</option>
                    <option value="global">Todas las instalaciones</option>
                  </select>
                </div>
              </>
            )}
            {activeTab === "whitelist" && (
              <>
                <div>
                  <Label className="text-zinc-400">Vigencia Desde</Label>
                  <Input
                    type="date"
                    value={formValidFrom}
                    onChange={(e) => setFormValidFrom(e.target.value)}
                    className="bg-zinc-700 border-zinc-600"
                  />
                </div>
                <div>
                  <Label className="text-zinc-400">Vigencia Hasta</Label>
                  <Input
                    type="date"
                    value={formValidUntil}
                    onChange={(e) => setFormValidUntil(e.target.value)}
                    className="bg-zinc-700 border-zinc-600"
                  />
                </div>
              </>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={resetForm}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSave} disabled={formSaving}>
              {formSaving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
              {editEntry ? "Actualizar" : "Crear"}
            </Button>
          </div>
        </div>
      )}

      {/* Import Modal Placeholder */}
      {showImport && (
        <AccessControlListImport
          installationId={installationId}
          listType={activeTab}
          onClose={() => setShowImport(false)}
          onImported={fetchList}
        />
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-8 text-center text-sm text-zinc-500">
          {search ? "Sin resultados" : `No hay entradas en la ${activeTab === "whitelist" ? "lista blanca" : "lista negra"}`}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between rounded-lg border border-zinc-700 bg-zinc-800 p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-zinc-200">{entry.fullName}</span>
                  {entry.scope === "global" && (
                    <Badge variant="outline" className="text-xs border-status-warn-border text-status-warn-fg">
                      Global
                    </Badge>
                  )}
                  {!entry.isActive && (
                    <Badge variant="outline" className="text-xs border-zinc-600 text-zinc-500">
                      Inactivo
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-zinc-500">
                  <span>{formatRut(entry.rut)}</span>
                  {entry.company && <span>{entry.company}</span>}
                  {entry.blockReason && (
                    <span className="flex items-center gap-1 text-status-danger-fg">
                      <AlertTriangle className="h-3 w-3" />
                      {entry.blockReason}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => openEdit(entry)}
                  className="rounded p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700"
                >
                  <Edit className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDelete(entry.id)}
                  className="rounded p-1.5 text-zinc-500 hover:text-status-danger-fg hover:bg-zinc-700"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  IMPORT COMPONENT
// ═══════════════════════════════════════════════════════════════

function AccessControlListImport({
  installationId,
  listType,
  onClose,
  onImported,
}: {
  installationId: string;
  listType: ListType;
  onClose: () => void;
  onImported: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Array<Record<string, string>>>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; errors: Array<{ row: number; rut: string; error: string }> } | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);

    // Parse CSV
    const text = await f.text();
    const lines = text.split("\n").filter((l) => l.trim());
    if (lines.length < 2) return;

    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const rows = lines.slice(1).map((line) => {
      const values = line.split(",");
      const row: Record<string, string> = {};
      headers.forEach((h, i) => {
        row[h] = values[i]?.trim() || "";
      });
      return row;
    });

    setPreview(rows.slice(0, 10));
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);

    try {
      const text = await file.text();
      const lines = text.split("\n").filter((l) => l.trim());
      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
      const rows = lines.slice(1).map((line) => {
        const values = line.split(",");
        const row: Record<string, string> = {};
        headers.forEach((h, i) => {
          row[h] = values[i]?.trim() || "";
        });
        return {
          rut: row.rut || row.run || "",
          fullName: row.nombre || row.full_name || row.fullname || "",
          company: row.empresa || row.company || "",
          blockReason: row.motivo || row.block_reason || row.razon || "",
          validFrom: row.vigencia_desde || row.valid_from || "",
          validUntil: row.vigencia_hasta || row.valid_until || "",
        };
      });

      const res = await fetch(`/api/access-control/lists/${installationId}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, listType }),
      });

      const json = await res.json();
      if (json.success) {
        setResult(json.data);
        toast.success(`${json.data.imported} entradas importadas`);
        onImported();
      } else {
        toast.error(json.error);
      }
    } catch {
      toast.error("Error al importar");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="rounded-lg border border-zinc-600 bg-zinc-800 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-zinc-200">
          Importar {listType === "whitelist" ? "Lista Blanca" : "Lista Negra"}
        </h4>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">
          <X className="h-4 w-4" />
        </button>
      </div>

      <p className="text-xs text-zinc-500">
        Sube un archivo CSV con columnas: RUT, Nombre, Empresa
        {listType === "blacklist" ? ", Motivo" : ", Vigencia Desde, Vigencia Hasta"}
      </p>

      <input
        type="file"
        accept=".csv,.txt"
        onChange={handleFileChange}
        className="text-sm text-zinc-400"
      />

      {preview.length > 0 && (
        <div className="max-h-40 overflow-auto rounded border border-zinc-700 text-xs">
          <table className="w-full">
            <thead>
              <tr className="bg-zinc-700">
                {Object.keys(preview[0]).map((h) => (
                  <th key={h} className="px-2 py-1 text-left text-zinc-300">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((row, i) => (
                <tr key={i} className="border-t border-zinc-700">
                  {Object.values(row).map((v, j) => (
                    <td key={j} className="px-2 py-1 text-zinc-400">{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result && (
        <div className="space-y-1">
          <p className="text-sm text-status-ok-fg">
            {result.imported} entradas importadas exitosamente
          </p>
          {result.errors.length > 0 && (
            <div className="max-h-20 overflow-auto text-xs text-status-danger-fg">
              {result.errors.map((e, i) => (
                <p key={i}>Fila {e.row}: {e.rut} — {e.error}</p>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onClose}>
          Cerrar
        </Button>
        <Button
          size="sm"
          onClick={handleImport}
          disabled={!file || importing}
        >
          {importing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}
          Importar
        </Button>
      </div>
    </div>
  );
}
