"use client";

import React, { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Shield, ShieldAlert, Plus, Search, Edit, Trash2,
  Loader2, Upload, X, Check, AlertTriangle, Car,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { AccessControlListEntry, ListType, AccessControlConfigData } from "@/lib/access-control/types";
import { getRecordTypeLabel, getRecordTypeIconName, DEFAULT_RECORD_TYPE_IDS } from "@/lib/access-control/types";
import { formatRut, validateRut } from "@/lib/access-control/utils";
import { getLucideIconByName } from "@/lib/access-control/record-type-icon";
import { ListImport } from "./ListImport";

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

  const [installConfig, setInstallConfig] = useState<AccessControlConfigData | null>(null);
  const [formRecordTypes, setFormRecordTypes] = useState<string[]>(["visit"]);

  // Form state
  const [formRut, setFormRut] = useState("");
  const [formPlate, setFormPlate] = useState("");
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
      if (json.success && Array.isArray(json.data)) {
        setEntries(json.data);
      } else {
        setEntries([]);
        if (!json.success || !res.ok) {
          toast.error(
            typeof json.error === "string"
              ? json.error
              : res.status === 401
                ? "Sesión inválida. Vuelve a iniciar sesión para ver las listas."
                : "No se pudieron cargar las listas de control de acceso.",
          );
        }
      }
    } catch {
      setEntries([]);
      toast.error("Error al cargar lista");
    } finally {
      setLoading(false);
    }
  }, [installationId, activeTab]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/access-control/config/${installationId}`)
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && j.success) setInstallConfig(j.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [installationId]);

  const resetForm = () => {
    setFormRut("");
    setFormPlate("");
    setFormName("");
    setFormCompany("");
    setFormBlockReason("");
    setFormScope("local");
    setFormValidFrom("");
    setFormValidUntil("");
    setFormRecordTypes(["visit"]);
    setEditEntry(null);
    setShowForm(false);
  };

  const openEdit = (entry: AccessControlListEntry) => {
    setEditEntry(entry);
    setFormRut(entry.rut ?? "");
    setFormPlate(entry.vehiclePlate ?? "");
    setFormName(entry.fullName);
    setFormCompany(entry.company || "");
    setFormBlockReason(entry.blockReason || "");
    setFormScope(entry.scope as "local" | "global");
    setFormValidFrom(entry.validFrom ? entry.validFrom.split("T")[0] : "");
    setFormValidUntil(entry.validUntil ? entry.validUntil.split("T")[0] : "");
    setFormRecordTypes(
      Array.isArray(entry.recordTypes) && entry.recordTypes.length > 0
        ? entry.recordTypes
        : entry.recordType
          ? [entry.recordType]
          : ["visit"],
    );
    setShowForm(true);
  };

  const handleSave = async () => {
    const hasRut = formRut.trim().length > 0;
    const hasPlate = formPlate.trim().length >= 4;

    if (!hasRut && !hasPlate) {
      toast.error("Debe especificar RUT o patente");
      return;
    }
    if (hasRut && !validateRut(formRut)) {
      toast.error("RUT inválido");
      return;
    }
    if (!formName.trim()) {
      toast.error("El nombre es requerido");
      return;
    }
    if (formRecordTypes.length === 0) {
      toast.error("Selecciona al menos un tipo de registro");
      return;
    }

    setFormSaving(true);
    try {
      if (editEntry) {
        const res = await fetch(`/api/access-control/lists/item/${editEntry.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rut: hasRut ? formRut : null,
            vehiclePlate: hasPlate ? formPlate : null,
            fullName: formName,
            company: formCompany,
            blockReason: formBlockReason,
            scope: formScope,
            validFrom: formValidFrom || null,
            validUntil: formValidUntil || null,
            isActive: true,
            recordTypes: formRecordTypes,
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
            rut: hasRut ? formRut : null,
            vehiclePlate: hasPlate ? formPlate : null,
            fullName: formName,
            company: formCompany,
            blockReason: formBlockReason,
            scope: formScope,
            validFrom: formValidFrom || null,
            validUntil: formValidUntil || null,
            recordTypes: formRecordTypes,
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
      (e.rut?.toLowerCase().includes(s) ?? false) ||
      (e.vehiclePlate?.toLowerCase().includes(s) ?? false) ||
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
            placeholder="Buscar por RUT, patente, nombre o empresa..."
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
            <div className="sm:col-span-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-zinc-400">RUT</Label>
                <Input
                  value={formRut}
                  onChange={(e) => setFormRut(e.target.value)}
                  placeholder="12.345.678-9"
                  className="bg-zinc-700 border-zinc-600"
                />
                {formRut && !validateRut(formRut) && (
                  <p className="mt-1 text-xs text-status-danger-fg">RUT inválido</p>
                )}
              </div>
              <div>
                <Label className="text-zinc-400">Patente</Label>
                <Input
                  value={formPlate}
                  onChange={(e) => setFormPlate(e.target.value.toUpperCase())}
                  placeholder="BBBB12"
                  className="bg-zinc-700 border-zinc-600 font-mono"
                />
              </div>
              <p className="text-xs text-zinc-500 sm:col-span-2 -mt-1">
                Debe ingresar al menos uno de los dos. Si ingresas ambos, la
                persona puede entrar identificándose con cualquiera.
              </p>
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
            <div className="sm:col-span-2">
              <Label className="text-zinc-400 mb-1.5 block">
                Tipos de registro a los que aplica
              </Label>
              <p className="text-xs text-zinc-500 mb-2">
                Esta entrada se valida solo cuando el guardia registra uno de los tipos marcados.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(installConfig?.enabledRecordTypes ?? Array.from(DEFAULT_RECORD_TYPE_IDS)).map((type) => {
                  const active = formRecordTypes.includes(type);
                  const Icon = getLucideIconByName(
                    getRecordTypeIconName(type, installConfig ?? undefined),
                  );
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() =>
                        setFormRecordTypes((prev) =>
                          prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
                        )
                      }
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        active
                          ? "border-status-info-border bg-status-info-soft text-status-info-fg"
                          : "border-zinc-700 bg-zinc-700 text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      <Icon className="h-3 w-3" />
                      {getRecordTypeLabel(type, installConfig ?? undefined)}
                    </button>
                  );
                })}
              </div>
              {formRecordTypes.length === 0 && (
                <p className="mt-1 text-xs text-status-danger-fg">
                  Selecciona al menos un tipo de registro.
                </p>
              )}
            </div>
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

      {/* Import */}
      {showImport && (
        <ListImport
          installationId={installationId}
          listType={activeTab}
          mode="admin"
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
                <div className="flex items-center gap-3 text-xs text-zinc-500 flex-wrap">
                  {entry.rut && <span>{formatRut(entry.rut)}</span>}
                  {entry.vehiclePlate && (
                    <span className="flex items-center gap-1 font-mono">
                      <Car className="h-3 w-3" />
                      {entry.vehiclePlate}
                    </span>
                  )}
                  {entry.company && <span>{entry.company}</span>}
                  {entry.blockReason && (
                    <span className="flex items-center gap-1 text-status-danger-fg">
                      <AlertTriangle className="h-3 w-3" />
                      {entry.blockReason}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(Array.isArray(entry.recordTypes) && entry.recordTypes.length > 0
                    ? entry.recordTypes
                    : entry.recordType
                      ? [entry.recordType]
                      : []
                  ).map((rt) => (
                    <Badge
                      key={rt}
                      variant="outline"
                      className="text-[10px] border-zinc-700 bg-zinc-800/50 text-zinc-400"
                    >
                      {getRecordTypeLabel(rt, installConfig ?? undefined)}
                    </Badge>
                  ))}
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

