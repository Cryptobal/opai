"use client";

import React, { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Shield, ShieldAlert, Plus, Search, Edit2, Trash2,
  Loader2, Upload, X, Check, AlertTriangle, Car, UserPlus,
  Users, Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Surface, SectionHeader, Tag as DSTag, StatusDot, Spinner } from "@/components/opai-ds";
import type {
  AccessControlListEntry,
  ListType,
  AccessControlConfigData,
  AccessControlListGroupData,
} from "@/lib/access-control/types";
import {
  getRecordTypeLabel,
  getRecordTypeIconName,
  DEFAULT_RECORD_TYPE_IDS,
} from "@/lib/access-control/types";
import { formatRut, validateRut } from "@/lib/access-control/utils";
import { getLucideIconByName } from "@/lib/access-control/record-type-icon";
import { ListImport } from "./ListImport";
import { KnownVisitorPickerModal } from "./KnownVisitorPickerModal";
import { ACCESS_CONTROL_LIST_PURGE_CONFIRMATION } from "@/lib/access-control/list-purge-constants";

interface Props {
  installationId: string;
}

// ────────────────────────────────────────────────
// Main component
// ────────────────────────────────────────────────
export function AccessControlListsManager({ installationId }: Props) {
  const [activeTab, setActiveTab] = useState<ListType>("whitelist");

  // Data
  const [entries, setEntries] = useState<AccessControlListEntry[]>([]);
  const [groups, setGroups] = useState<AccessControlListGroupData[]>([]);
  const [installConfig, setInstallConfig] = useState<AccessControlConfigData | null>(null);
  const [loading, setLoading] = useState(true);

  // UI panels
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [showPurgeModal, setShowPurgeModal] = useState(false);
  const [showGroupPanel, setShowGroupPanel] = useState(false);

  // Selection mode
  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(new Set());

  // Entry form
  const [editEntry, setEditEntry] = useState<AccessControlListEntry | null>(null);
  const [formRut, setFormRut] = useState("");
  const [formPlate, setFormPlate] = useState("");
  const [formName, setFormName] = useState("");
  const [formCompany, setFormCompany] = useState("");
  const [formBlockReason, setFormBlockReason] = useState("");
  const [formScope, setFormScope] = useState<"local" | "global">("local");
  const [formValidFrom, setFormValidFrom] = useState("");
  const [formValidUntil, setFormValidUntil] = useState("");
  const [formRecordTypes, setFormRecordTypes] = useState<string[]>(["visit"]);
  const [formSaving, setFormSaving] = useState(false);

  // Group form
  const [editingGroup, setEditingGroup] = useState<AccessControlListGroupData | null>(null);
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [groupRecordTypes, setGroupRecordTypes] = useState<string[]>([]);
  const [groupSaving, setGroupSaving] = useState(false);

  // Purge
  const [purgePhrase, setPurgePhrase] = useState("");
  const [purgeIncludeGlobal, setPurgeIncludeGlobal] = useState(false);
  const [purgeSaving, setPurgeSaving] = useState(false);

  // ── Data fetching ──────────────────────────────
  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/access-control/lists/${installationId}?type=${activeTab}`);
      const json = await res.json();
      setEntries(json.success && Array.isArray(json.data) ? json.data : []);
      if (!json.success) toast.error(json.error ?? "No se pudo cargar la lista");
    } catch {
      setEntries([]);
      toast.error("Error al cargar lista");
    } finally {
      setLoading(false);
    }
  }, [installationId, activeTab]);

  const fetchGroups = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/access-control/groups/${installationId}?listType=${activeTab}`,
      );
      const json = await res.json();
      setGroups(json.success ? (json.data?.groups ?? []) : []);
    } catch {
      setGroups([]);
    }
  }, [installationId, activeTab]);

  useEffect(() => {
    void fetchList();
    void fetchGroups();
  }, [fetchList, fetchGroups]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/access-control/config/${installationId}`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled && j.success) setInstallConfig(j.data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [installationId]);

  useEffect(() => {
    setSelectedEntryIds(new Set());
    setSearch("");
    setShowForm(false);
    setShowImport(false);
    setPurgePhrase("");
  }, [activeTab]);

  // ── Enabled record types for this installation ─
  const enabledTypes = installConfig?.enabledRecordTypes ?? Array.from(DEFAULT_RECORD_TYPE_IDS);

  // ── Entry form ─────────────────────────────────
  const resetForm = () => {
    setFormRut(""); setFormPlate(""); setFormName(""); setFormCompany("");
    setFormBlockReason(""); setFormScope("local"); setFormValidFrom(""); setFormValidUntil("");
    setFormRecordTypes(["visit"]); setEditEntry(null); setShowForm(false);
  };

  const openEditEntry = (entry: AccessControlListEntry) => {
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
        : entry.recordType ? [entry.recordType] : ["visit"],
    );
    setShowForm(true);
  };

  const handleSaveEntry = async () => {
    const hasRut = formRut.trim().length > 0;
    const hasPlate = formPlate.trim().length >= 4;
    if (!hasRut && !hasPlate) { toast.error("Ingresa RUT o patente"); return; }
    if (hasRut && !validateRut(formRut)) { toast.error("RUT inválido"); return; }
    if (!formName.trim()) { toast.error("El nombre es requerido"); return; }
    if (formRecordTypes.length === 0) { toast.error("Selecciona al menos un formulario"); return; }
    setFormSaving(true);
    try {
      const payload = {
        rut: hasRut ? formRut : null,
        vehiclePlate: hasPlate ? formPlate : null,
        fullName: formName, company: formCompany,
        blockReason: formBlockReason, scope: formScope,
        validFrom: formValidFrom || null, validUntil: formValidUntil || null,
        isActive: true, recordTypes: formRecordTypes,
      };
      const url = editEntry
        ? `/api/access-control/lists/item/${editEntry.id}`
        : `/api/access-control/lists/${installationId}`;
      const method = editEntry ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editEntry ? payload : { ...payload, listType: activeTab }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(editEntry ? "Entrada actualizada" : "Entrada creada");
        resetForm(); void fetchList();
      } else {
        toast.error(json.error);
      }
    } catch { toast.error("Error al guardar"); }
    finally { setFormSaving(false); }
  };

  const handleDeleteEntry = async (id: string) => {
    if (!confirm("¿Eliminar esta entrada?")) return;
    try {
      const res = await fetch(`/api/access-control/lists/item/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) { toast.success("Eliminado"); void fetchList(); }
      else toast.error(json.error);
    } catch { toast.error("Error al eliminar"); }
  };

  // ── Group CRUD ─────────────────────────────────
  const resetGroupForm = () => {
    setGroupName(""); setGroupDescription(""); setGroupRecordTypes([]); setEditingGroup(null);
  };

  const openEditGroup = (g: AccessControlListGroupData) => {
    setEditingGroup(g);
    setGroupName(g.name);
    setGroupDescription(g.description ?? "");
    setGroupRecordTypes(Array.isArray(g.recordTypes) ? g.recordTypes : []);
    setShowGroupPanel(true);
  };

  const openCreateGroup = () => {
    resetGroupForm();
    setShowGroupPanel(true);
  };

  const handleSaveGroup = async () => {
    const name = groupName.trim();
    if (!name) { toast.error("El nombre es requerido"); return; }
    setGroupSaving(true);
    try {
      const payload = { name, description: groupDescription, recordTypes: groupRecordTypes };
      let res: Response;
      if (editingGroup) {
        res = await fetch(`/api/access-control/groups/item/${editingGroup.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ installationId, ...payload }),
        });
      } else {
        res = await fetch(`/api/access-control/groups/${installationId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ listType: activeTab, ...payload }),
        });
      }
      const json = await res.json();
      if (json.success) {
        toast.success(editingGroup ? "Grupo actualizado" : "Grupo creado");
        resetGroupForm();
        setShowGroupPanel(false);
        void fetchGroups();
      } else {
        toast.error(json.error ?? "Error al guardar grupo");
      }
    } catch { toast.error("Error al guardar grupo"); }
    finally { setGroupSaving(false); }
  };

  const handleDeleteGroup = async (g: AccessControlListGroupData) => {
    if (!confirm(`¿Eliminar el grupo "${g.name}"? Las personas permanecen en la lista.`)) return;
    try {
      const res = await fetch(
        `/api/access-control/groups/item/${g.id}?installationId=${installationId}`,
        { method: "DELETE" },
      );
      const json = await res.json();
      if (json.success) { toast.success("Grupo eliminado"); void fetchGroups(); void fetchList(); }
      else toast.error(json.error ?? "Error al eliminar");
    } catch { toast.error("Error al eliminar grupo"); }
  };

  // ── Bulk assign to group ───────────────────────
  const handleAssignToGroup = async (groupId: string) => {
    const entryIds = Array.from(selectedEntryIds);
    if (entryIds.length === 0) { toast.error("Selecciona personas primero"); return; }
    try {
      const res = await fetch(`/api/access-control/groups/${installationId}/assign-members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryIds, groupIds: [groupId], listType: activeTab }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`${json.data.assigned ?? entryIds.length} asignación(es) creadas`);
        setSelectedEntryIds(new Set());
        void fetchList(); void fetchGroups();
      } else { toast.error(json.error ?? "Error al asignar"); }
    } catch { toast.error("Error al asignar"); }
  };

  // ── Purge ──────────────────────────────────────
  const handlePurge = async () => {
    if (purgePhrase !== ACCESS_CONTROL_LIST_PURGE_CONFIRMATION) {
      toast.error(`Escribe exactamente: ${ACCESS_CONTROL_LIST_PURGE_CONFIRMATION}`); return;
    }
    setPurgeSaving(true);
    try {
      const res = await fetch(`/api/access-control/lists/${installationId}/purge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listType: activeTab,
          confirmation: purgePhrase,
          deleteGlobalBlacklist: activeTab === "blacklist" ? purgeIncludeGlobal : undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`${json.data.deleted} registro(s) eliminados`);
        setShowPurgeModal(false); setPurgePhrase(""); setPurgeIncludeGlobal(false);
        setSelectedEntryIds(new Set());
        void fetchList(); void fetchGroups();
      } else { toast.error(json.error ?? "Error al vaciar lista"); }
    } catch { toast.error("Error al vaciar"); }
    finally { setPurgeSaving(false); }
  };

  // ── Derived state ──────────────────────────────
  const filtered = entries.filter((e) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (e.rut?.toLowerCase().includes(s) ?? false) ||
      (e.vehiclePlate?.toLowerCase().includes(s) ?? false) ||
      e.fullName.toLowerCase().includes(s) ||
      (e.company?.toLowerCase().includes(s) ?? false)
    );
  });
  const visibleIds = filtered.map((e) => e.id);
  const allVisible = visibleIds.length > 0 && visibleIds.every((id) => selectedEntryIds.has(id));
  const anySelected = selectedEntryIds.size > 0;

  const toggleEntry = (id: string) =>
    setSelectedEntryIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAllVisible = () =>
    setSelectedEntryIds((prev) => {
      const next = new Set(prev);
      if (allVisible) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });

  const toggleGroupRecordType = (type: string) =>
    setGroupRecordTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );

  // ── Render helpers ─────────────────────────────
  const isWhitelist = activeTab === "whitelist";
  const listLabel = isWhitelist ? "Lista Blanca" : "Lista Negra";

  return (
    <div className="space-y-5">
      {/* ── Tab switcher ── */}
      <div className="flex gap-2">
        {(["whitelist", "blacklist"] as ListType[]).map((tab) => {
          const active = activeTab === tab;
          const isW = tab === "whitelist";
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={[
                "flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
                active && isW
                  ? "border-status-ok-border bg-status-ok-soft text-status-ok-fg"
                  : active && !isW
                    ? "border-status-danger-border bg-status-danger-soft text-status-danger-fg"
                    : "border-ds-border-default bg-ds-surface-2 text-ds-text-3 hover:text-ds-text-1",
              ].join(" ")}
            >
              {isW ? <Shield className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
              {isW ? "Lista Blanca" : "Lista Negra"}
            </button>
          );
        })}
      </div>

      {/* ── Groups panel ── */}
      <Surface elevation={1} padding="md">
        <div className="flex items-center justify-between gap-2">
          <SectionHeader
            title={`Grupos de ${listLabel.toLowerCase()}`}
            hint={`${groups.length} grupo(s) — define quién puede entrar por formulario`}
          />
          <Button size="sm" variant="outline" onClick={openCreateGroup}>
            <Users className="mr-1.5 h-3.5 w-3.5" />
            Nuevo grupo
          </Button>
        </div>

        {groups.length === 0 ? (
          <p className="mt-3 text-sm text-ds-text-3">
            No hay grupos. Crea uno para organizar personas por tipo de formulario.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {groups.map((g) => {
              const hasTypes = Array.isArray(g.recordTypes) && g.recordTypes.length > 0;
              return (
                <div
                  key={g.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-ds-border-subtle bg-ds-surface-2 px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-ds-text-1 truncate">{g.name}</span>
                      <span className="shrink-0 text-xs text-ds-text-4">
                        {g._count?.memberLinks ?? 0} persona(s)
                      </span>
                    </div>
                    {g.description && (
                      <p className="mt-0.5 text-xs text-ds-text-3 truncate">{g.description}</p>
                    )}
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {hasTypes ? (
                        g.recordTypes.map((rt) => (
                          <span
                            key={rt}
                            className="inline-flex items-center rounded-full border border-status-info-border bg-status-info-soft px-2 py-0.5 text-[12px] text-status-info-fg"
                          >
                            {getRecordTypeLabel(rt, installConfig ?? undefined)}
                          </span>
                        ))
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-ds-border-subtle bg-ds-surface-3 px-2 py-0.5 text-[12px] text-ds-text-3">
                          Todos los formularios
                        </span>
                      )}
                    </div>
                    {/* Quick assign if selection active */}
                    {anySelected && (
                      <button
                        type="button"
                        onClick={() => void handleAssignToGroup(g.id)}
                        className="mt-2 text-xs font-medium text-status-info-fg hover:underline"
                      >
                        + Asignar {selectedEntryIds.size} seleccionada(s) a este grupo
                      </button>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEditGroup(g)}
                      className="rounded p-1 text-ds-text-4 hover:bg-ds-surface-3 hover:text-ds-text-1"
                      title="Editar grupo"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteGroup(g)}
                      className="rounded p-1 text-ds-text-4 hover:bg-ds-surface-3 hover:text-status-danger-fg"
                      title="Eliminar grupo"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Surface>

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ds-text-4" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por RUT, patente, nombre o empresa…"
            className="pl-9"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowPicker(true)}>
          <UserPlus className="mr-1.5 h-3.5 w-3.5" />
          Desde visitantes
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowImport(true)}>
          <Upload className="mr-1.5 h-3.5 w-3.5" />
          Importar CSV
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="border-status-danger-border text-status-danger-fg hover:bg-status-danger-soft"
          onClick={() => { setPurgePhrase(""); setPurgeIncludeGlobal(false); setShowPurgeModal(true); }}
        >
          <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
          Vaciar lista
        </Button>
        <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Agregar
        </Button>
      </div>

      {/* Selection context bar */}
      {anySelected && (
        <div className="flex items-center gap-3 rounded-lg border border-status-info-border bg-status-info-soft px-3 py-2">
          <StatusDot kind="info" />
          <span className="text-sm text-status-info-fg">
            {selectedEntryIds.size} persona(s) seleccionada(s)
          </span>
          <button
            type="button"
            onClick={() => setSelectedEntryIds(new Set())}
            className="ml-auto text-xs text-ds-text-3 hover:text-ds-text-1"
          >
            Cancelar selección
          </button>
        </div>
      )}

      {/* ── Entry form (create / edit) ── */}
      {showForm && (
        <Surface elevation={1} padding="md" className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-ds-text-1">
              {editEntry ? "Editar entrada" : "Nueva entrada"}
            </h4>
            <button type="button" onClick={resetForm} className="text-ds-text-4 hover:text-ds-text-1">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-ds-text-3 text-xs">RUT</Label>
              <Input
                value={formRut}
                onChange={(e) => setFormRut(e.target.value)}
                placeholder="12.345.678-9"
                className="mt-1"
              />
              {formRut && !validateRut(formRut) && (
                <p className="mt-1 text-xs text-status-danger-fg">RUT inválido</p>
              )}
            </div>
            <div>
              <Label className="text-ds-text-3 text-xs">Patente</Label>
              <Input
                value={formPlate}
                onChange={(e) => setFormPlate(e.target.value.toUpperCase())}
                placeholder="BBBB12"
                className="mt-1 font-mono"
              />
            </div>
            <p className="text-xs text-ds-text-4 sm:col-span-2 -mt-1">
              Ingresa al menos uno. Si ingresas ambos, la persona puede entrar con cualquiera.
            </p>
            <div>
              <Label className="text-ds-text-3 text-xs">Nombre completo *</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-ds-text-3 text-xs">Empresa</Label>
              <Input value={formCompany} onChange={(e) => setFormCompany(e.target.value)} className="mt-1" />
            </div>

            {!isWhitelist && (
              <>
                <div>
                  <Label className="text-ds-text-3 text-xs">Motivo del bloqueo</Label>
                  <Input value={formBlockReason} onChange={(e) => setFormBlockReason(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label className="text-ds-text-3 text-xs">Alcance</Label>
                  <select
                    value={formScope}
                    onChange={(e) => setFormScope(e.target.value as "local" | "global")}
                    className="mt-1 w-full rounded-md border border-ds-border-default bg-ds-surface-2 px-3 py-2 text-sm text-ds-text-1"
                  >
                    <option value="local">Solo esta instalación</option>
                    <option value="global">Todas las instalaciones</option>
                  </select>
                </div>
              </>
            )}

            {isWhitelist && (
              <>
                <div>
                  <Label className="text-ds-text-3 text-xs">Vigencia desde</Label>
                  <Input type="date" value={formValidFrom} onChange={(e) => setFormValidFrom(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label className="text-ds-text-3 text-xs">Vigencia hasta</Label>
                  <Input type="date" value={formValidUntil} onChange={(e) => setFormValidUntil(e.target.value)} className="mt-1" />
                </div>
              </>
            )}

            <div className="sm:col-span-2">
              <Label className="text-ds-text-3 text-xs mb-2 block">
                Formularios que activan esta entrada
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {enabledTypes.map((type) => {
                  const active = formRecordTypes.includes(type);
                  const Icon = getLucideIconByName(getRecordTypeIconName(type, installConfig ?? undefined));
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() =>
                        setFormRecordTypes((prev) =>
                          prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
                        )
                      }
                      className={[
                        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                        active
                          ? "border-status-info-border bg-status-info-soft text-status-info-fg"
                          : "border-ds-border-default bg-ds-surface-2 text-ds-text-3 hover:text-ds-text-1",
                      ].join(" ")}
                    >
                      <Icon className="h-3 w-3" />
                      {getRecordTypeLabel(type, installConfig ?? undefined)}
                    </button>
                  );
                })}
              </div>
              {formRecordTypes.length === 0 && (
                <p className="mt-1 text-xs text-status-danger-fg">Selecciona al menos un formulario.</p>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={resetForm}>Cancelar</Button>
            <Button size="sm" onClick={() => void handleSaveEntry()} disabled={formSaving}>
              {formSaving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
              {editEntry ? "Actualizar" : "Crear"}
            </Button>
          </div>
        </Surface>
      )}

      {/* ── Import CSV ── */}
      {showImport && (
        <ListImport
          installationId={installationId}
          listType={activeTab}
          mode="admin"
          groups={groups.map((g) => ({ id: g.id, name: g.name }))}
          requireGroupWhenAvailable
          onClose={() => setShowImport(false)}
          onImported={() => { void fetchList(); void fetchGroups(); }}
        />
      )}

      {/* ── Picker from known visitors ── */}
      {showPicker && (
        <KnownVisitorPickerModal
          installationId={installationId}
          listType={activeTab}
          onClose={() => setShowPicker(false)}
          onImported={() => void fetchList()}
        />
      )}

      {/* ── List of entries ── */}
      <div className="space-y-1">
        <div className="flex items-center justify-between px-1 pb-1">
          <button
            type="button"
            onClick={toggleAllVisible}
            className="text-xs text-status-info-fg hover:underline"
          >
            {allVisible ? "Deseleccionar visibles" : "Seleccionar visibles"}
          </button>
          <span className="text-xs text-ds-text-4">{filtered.length} registro(s)</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Spinner size="md" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-ds-border-subtle bg-ds-surface-1 py-10 text-center text-sm text-ds-text-3">
            {search ? "Sin resultados para esta búsqueda" : `No hay entradas en la ${listLabel.toLowerCase()}`}
          </div>
        ) : (
          filtered.map((entry) => {
            const isSelected = selectedEntryIds.has(entry.id);
            const entryTypes =
              Array.isArray(entry.recordTypes) && entry.recordTypes.length > 0
                ? entry.recordTypes
                : entry.recordType ? [entry.recordType] : [];

            return (
              <div
                key={entry.id}
                className={[
                  "flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                  isSelected
                    ? "border-status-info-border bg-status-info-soft/40"
                    : "border-ds-border-subtle bg-ds-surface-1 hover:bg-ds-surface-2",
                ].join(" ")}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleEntry(entry.id)}
                  className="mt-0.5 rounded border-ds-border-default"
                  aria-label={`Seleccionar ${entry.fullName}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-ds-text-1">{entry.fullName}</span>
                    {!entry.isActive && (
                      <DSTag variant="neutral" size="sm">Inactivo</DSTag>
                    )}
                    {entry.scope === "global" && (
                      <DSTag variant="warn" size="sm">Global</DSTag>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ds-text-3">
                    {entry.rut && <span className="font-mono">{formatRut(entry.rut)}</span>}
                    {entry.vehiclePlate && (
                      <span className="flex items-center gap-1 font-mono">
                        <Car className="h-3 w-3" />{entry.vehiclePlate}
                      </span>
                    )}
                    {entry.company && <span>{entry.company}</span>}
                    {entry.blockReason && (
                      <span className="flex items-center gap-1 text-status-danger-fg">
                        <AlertTriangle className="h-3 w-3" />{entry.blockReason}
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {entryTypes.map((rt) => (
                      <span
                        key={rt}
                        className="inline-flex items-center rounded-full border border-ds-border-subtle bg-ds-surface-3 px-2 py-0.5 text-[12px] text-ds-text-3"
                      >
                        {getRecordTypeLabel(rt, installConfig ?? undefined)}
                      </span>
                    ))}
                    {(entry.groups ?? []).map((g) => (
                      <span
                        key={g.id}
                        className="inline-flex items-center gap-1 rounded-full border border-status-ok-border bg-status-ok-soft px-2 py-0.5 text-[12px] text-status-ok-fg"
                      >
                        <Users className="h-2.5 w-2.5" />{g.name}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openEditEntry(entry)}
                    className="rounded p-1.5 text-ds-text-4 hover:bg-ds-surface-3 hover:text-ds-text-1"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteEntry(entry.id)}
                    className="rounded p-1.5 text-ds-text-4 hover:bg-ds-surface-3 hover:text-status-danger-fg"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Group create / edit modal ── */}
      {showGroupPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-xl border border-ds-border-default bg-ds-surface-1 p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h4 className="text-base font-semibold text-ds-text-1">
                {editingGroup ? `Editar grupo: ${editingGroup.name}` : "Nuevo grupo"}
              </h4>
              <button
                type="button"
                onClick={() => { setShowGroupPanel(false); resetGroupForm(); }}
                className="text-ds-text-4 hover:text-ds-text-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <Label className="text-ds-text-3 text-xs">Nombre del grupo *</Label>
                <Input
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="Ej: Transportistas FT Foods"
                  className="mt-1"
                  autoFocus
                />
              </div>
              <div>
                <Label className="text-ds-text-3 text-xs">Descripción (opcional)</Label>
                <Input
                  value={groupDescription}
                  onChange={(e) => setGroupDescription(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-ds-text-3 text-xs mb-2 block">
                  Formularios a los que aplica este grupo
                </Label>
                <p className="mb-2 text-xs text-ds-text-4">
                  Si no seleccionas ninguno, el grupo aplica a <strong>todos</strong> los formularios habilitados.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {enabledTypes.map((type) => {
                    const active = groupRecordTypes.includes(type);
                    const Icon = getLucideIconByName(
                      getRecordTypeIconName(type, installConfig ?? undefined),
                    );
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => toggleGroupRecordType(type)}
                        className={[
                          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                          active
                            ? "border-status-info-border bg-status-info-soft text-status-info-fg"
                            : "border-ds-border-default bg-ds-surface-2 text-ds-text-3 hover:text-ds-text-1",
                        ].join(" ")}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {getRecordTypeLabel(type, installConfig ?? undefined)}
                      </button>
                    );
                  })}
                </div>
                {groupRecordTypes.length === 0 && (
                  <p className="mt-2 text-xs text-ds-text-4">
                    ✓ Aplica a todos los formularios (sin restricción)
                  </p>
                )}
              </div>

              <div className="rounded-md border border-ds-border-subtle bg-ds-surface-2 px-3 py-2 text-xs text-ds-text-3">
                Este grupo queda asociado solo a esta instalación.
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setShowGroupPanel(false); resetGroupForm(); }}
              >
                Cancelar
              </Button>
              <Button size="sm" onClick={() => void handleSaveGroup()} disabled={groupSaving}>
                {groupSaving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {editingGroup ? "Guardar cambios" : "Crear grupo"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Purge modal ── */}
      {showPurgeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-status-danger-border bg-ds-surface-1 p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-ds-text-1">
                Vaciar {listLabel.toLowerCase()}
              </h4>
              <button
                type="button"
                onClick={() => setShowPurgeModal(false)}
                className="text-ds-text-4 hover:text-ds-text-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <p className="text-xs text-ds-text-3">
                Se eliminan <strong className="text-ds-text-1">definitivamente</strong> todas las entradas
                de esta instalación. Los grupos no se borran.
              </p>
              {!isWhitelist && (
                <label className="flex cursor-pointer items-start gap-2 rounded-md border border-ds-border-subtle bg-ds-surface-2 p-3 text-xs">
                  <input
                    type="checkbox"
                    checked={purgeIncludeGlobal}
                    onChange={(e) => setPurgeIncludeGlobal(e.target.checked)}
                    className="mt-0.5 rounded"
                  />
                  <span className="text-ds-text-3">
                    Incluir también la lista negra <strong className="text-ds-text-1">global</strong> del tenant
                  </span>
                </label>
              )}
              <div>
                <Label className="text-xs text-ds-text-3">
                  Para confirmar escribe:{" "}
                  <span className="font-mono text-status-danger-fg">{ACCESS_CONTROL_LIST_PURGE_CONFIRMATION}</span>
                </Label>
                <Input
                  value={purgePhrase}
                  onChange={(e) => setPurgePhrase(e.target.value)}
                  placeholder={ACCESS_CONTROL_LIST_PURGE_CONFIRMATION}
                  className="mt-1 font-mono"
                  autoComplete="off"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowPurgeModal(false)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={purgeSaving || purgePhrase !== ACCESS_CONTROL_LIST_PURGE_CONFIRMATION}
                onClick={() => void handlePurge()}
              >
                {purgeSaving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Eliminar todo
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
