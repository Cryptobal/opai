"use client";

import React, { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Shield, Plus, Search, Loader2, Check, Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { formatRut, validateRut } from "@/lib/access-control/utils";
import {
  DEFAULT_RECORD_TYPE_IDS,
  getRecordTypeLabel,
} from "@/lib/access-control/types";
import type {
  AccessRecordType, CustomRecordType,
} from "@/lib/access-control/types";
import { ListImport } from "./ListImport";

interface WhitelistEntry {
  id: string;
  rut: string;
  fullName: string;
  company: string | null;
  validFrom: string | null;
  validUntil: string | null;
  allowedDays?: number[] | null;
  allowedTimeFrom?: string | null;
  allowedTimeTo?: string | null;
  recordType?: string | null;
  singleUse?: boolean | null;
  isActive: boolean;
}

interface Props {
  installationId: string;
  createdBy?: string;
}

const DAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export function ClientWhitelistManager({ installationId, createdBy }: Props) {
  const [entries, setEntries] = useState<WhitelistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [saving, setSaving] = useState(false);

  const [fRut, setFRut] = useState("");
  const [fName, setFName] = useState("");
  const [fCompany, setFCompany] = useState("");
  const [fRecordType, setFRecordType] = useState<AccessRecordType>("visit");
  // Record types available for this installation (defaults + active customs).
  const [availableTypes, setAvailableTypes] = useState<string[]>([
    ...DEFAULT_RECORD_TYPE_IDS,
  ]);
  const [customTypes, setCustomTypes] = useState<CustomRecordType[]>([]);

  useEffect(() => {
    let cancelled = false;
    // Use the portal-cliente record-types endpoint (its auth differs
    // from the admin /api/access-control/config endpoint, which would
    // reject a cliente session with 401).
    fetch(`/api/portal/cliente/access-control/${installationId}/record-types`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled || !json.success) return;
        const enabled: string[] = json.data?.enabledRecordTypes ?? [
          ...DEFAULT_RECORD_TYPE_IDS,
        ];
        setAvailableTypes(enabled.length ? enabled : [...DEFAULT_RECORD_TYPE_IDS]);
        setCustomTypes(json.data?.customRecordTypes ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [installationId]);
  const [fAllowedDays, setFAllowedDays] = useState<number[]>([]);
  const [fTimeFrom, setFTimeFrom] = useState("");
  const [fTimeTo, setFTimeTo] = useState("");
  const [fSingleUse, setFSingleUse] = useState(false);
  const [fValidFrom, setFValidFrom] = useState("");
  const [fValidUntil, setFValidUntil] = useState("");

  const fetchList = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/portal/cliente/access-control/${installationId}/whitelist`
      );
      const json = await res.json();
      if (json.success) setEntries(json.data);
    } catch {
      // offline
    } finally {
      setLoading(false);
    }
  }, [installationId]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const resetForm = () => {
    setFRut("");
    setFName("");
    setFCompany("");
    setFRecordType("visit");
    setFAllowedDays([]);
    setFTimeFrom("");
    setFTimeTo("");
    setFSingleUse(false);
    setFValidFrom("");
    setFValidUntil("");
    setShowForm(false);
  };

  const handleSubmit = async () => {
    if (!validateRut(fRut)) { toast.error("RUT inválido"); return; }
    if (!fName.trim()) { toast.error("Nombre requerido"); return; }

    setSaving(true);
    try {
      const res = await fetch(
        `/api/portal/cliente/access-control/${installationId}/whitelist`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rut: fRut,
            fullName: fName,
            company: fCompany || null,
            recordType: fRecordType,
            allowedDays: fAllowedDays,
            allowedTimeFrom: fTimeFrom || null,
            allowedTimeTo: fTimeTo || null,
            singleUse: fSingleUse,
            validFrom: fValidFrom || null,
            validUntil: fValidUntil || null,
            createdBy,
          }),
        }
      );
      const json = await res.json();
      if (json.success) {
        toast.success("Persona autorizada agregada");
        resetForm();
        fetchList();
      } else {
        toast.error(json.error);
      }
    } catch {
      toast.error("Error al agregar");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (entry: WhitelistEntry) => {
    try {
      await fetch(
        `/api/portal/cliente/access-control/${installationId}/whitelist/${entry.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: !entry.isActive }),
        }
      );
      fetchList();
    } catch {
      toast.error("Error al actualizar");
    }
  };

  const filtered = entries.filter((e) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return e.fullName.toLowerCase().includes(s) || e.rut.includes(s);
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
          <Shield className="h-5 w-5 text-status-ok-fg" />
          Personas Autorizadas
        </h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowImport(true)}>
            <Upload className="mr-1 h-4 w-4" /> Importar
          </Button>
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="mr-1 h-4 w-4" /> Agregar
          </Button>
        </div>
      </div>

      {showImport && (
        <ListImport
          installationId={installationId}
          listType="whitelist"
          mode="client"
          onClose={() => setShowImport(false)}
          onImported={fetchList}
        />
      )}

      {showForm && (
        <div className="rounded-lg border border-zinc-600 bg-zinc-800 p-4 space-y-3">
          <div className="rounded-md border border-status-info-border bg-status-info-soft px-3 py-2">
            <p className="text-xs text-status-info-fg">
              💡 <strong>Tip:</strong> para visitas únicas o ventanas cortas
              (un día específico, 2 horas), usa <strong>Pre-registro</strong>.
              La lista de autorizados es para personas que vienen seguido.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-zinc-400">RUT *</Label>
              <Input value={fRut} onChange={(e) => setFRut(e.target.value)} placeholder="12.345.678-9" className="bg-zinc-700 border-zinc-600" />
            </div>
            <div>
              <Label className="text-zinc-400">Nombre *</Label>
              <Input value={fName} onChange={(e) => setFName(e.target.value)} className="bg-zinc-700 border-zinc-600" />
            </div>
            <div>
              <Label className="text-zinc-400">Empresa</Label>
              <Input value={fCompany} onChange={(e) => setFCompany(e.target.value)} className="bg-zinc-700 border-zinc-600" />
            </div>
            <div>
              <Label className="text-zinc-400">Tipo de persona</Label>
              <select
                value={fRecordType}
                onChange={(e) => setFRecordType(e.target.value as AccessRecordType)}
                className="w-full rounded-md border border-zinc-600 bg-zinc-700 px-3 py-2 text-sm text-zinc-200"
              >
                {availableTypes.map((t) => (
                  <option key={t} value={t}>
                    {getRecordTypeLabel(t, { customRecordTypes: customTypes })}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <Label className="text-zinc-400 mb-2 block">
                Días permitidos (vacío = todos)
              </Label>
              <div className="flex gap-1.5">
                {DAY_LABELS.map((label, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() =>
                      setFAllowedDays((prev) =>
                        prev.includes(idx)
                          ? prev.filter((d) => d !== idx)
                          : [...prev, idx]
                      )
                    }
                    className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                      fAllowedDays.includes(idx)
                        ? "border-status-info-border bg-status-info-soft text-status-info-fg"
                        : "border-zinc-600 bg-zinc-700 text-zinc-400"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <Label className="text-zinc-400">Hora desde</Label>
                <Input type="time" value={fTimeFrom} onChange={(e) => setFTimeFrom(e.target.value)} className="bg-zinc-700 border-zinc-600" />
              </div>
              <div className="flex-1">
                <Label className="text-zinc-400">Hora hasta</Label>
                <Input type="time" value={fTimeTo} onChange={(e) => setFTimeTo(e.target.value)} className="bg-zinc-700 border-zinc-600" />
              </div>
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <Label className="text-zinc-400">Vigencia desde</Label>
                <Input type="date" value={fValidFrom} onChange={(e) => setFValidFrom(e.target.value)} className="bg-zinc-700 border-zinc-600" />
              </div>
              <div className="flex-1">
                <Label className="text-zinc-400">Vigencia hasta</Label>
                <Input type="date" value={fValidUntil} onChange={(e) => setFValidUntil(e.target.value)} className="bg-zinc-700 border-zinc-600" />
              </div>
            </div>

            <div className="sm:col-span-2 flex items-center justify-between rounded-md border border-zinc-700 bg-zinc-900/50 px-3 py-2">
              <div>
                <Label className="text-zinc-300 text-sm font-medium">Uso único</Label>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Se desactiva automáticamente después del primer ingreso
                </p>
              </div>
              <Switch checked={fSingleUse} onCheckedChange={setFSingleUse} />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={resetForm}>Cancelar</Button>
            <Button size="sm" onClick={handleSubmit} disabled={saving}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
              Agregar
            </Button>
          </div>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar..."
          className="pl-9 bg-zinc-800 border-zinc-600"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-sm text-zinc-500 py-8">Sin personas autorizadas</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between rounded-lg border border-zinc-700 bg-zinc-900 p-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-zinc-200">{entry.fullName}</span>
                  {entry.recordType && entry.recordType !== "visit" && (
                    <Badge variant="outline" className="text-xs border-zinc-600 text-zinc-400">
                      {recordTypeLabel(entry.recordType)}
                    </Badge>
                  )}
                  {entry.singleUse && (
                    <Badge variant="outline" className="text-xs border-status-warn-border text-status-warn-fg">
                      Uso único
                    </Badge>
                  )}
                  {!entry.isActive && (
                    <Badge variant="outline" className="text-xs border-zinc-600 text-zinc-500">Inactivo</Badge>
                  )}
                </div>
                <div className="text-xs text-zinc-500">
                  {formatRut(entry.rut)}
                  {entry.company && ` — ${entry.company}`}
                </div>
                {(entry.allowedDays && entry.allowedDays.length > 0) || entry.allowedTimeFrom ? (
                  <div className="text-xs text-zinc-500 mt-0.5">
                    {entry.allowedDays && entry.allowedDays.length > 0 && (
                      <span>{entry.allowedDays.map((d) => DAY_LABELS[d]).join(", ")}</span>
                    )}
                    {entry.allowedTimeFrom && entry.allowedTimeTo && (
                      <span className="ml-1">
                        {entry.allowedDays && entry.allowedDays.length > 0 ? "· " : ""}
                        {entry.allowedTimeFrom}–{entry.allowedTimeTo}
                      </span>
                    )}
                  </div>
                ) : null}
                {(entry.validFrom || entry.validUntil) && (
                  <div className="text-xs text-zinc-500 mt-0.5">
                    Vigencia: {entry.validFrom ? new Date(entry.validFrom).toLocaleDateString("es-CL") : "—"}
                    {" a "}
                    {entry.validUntil ? new Date(entry.validUntil).toLocaleDateString("es-CL") : "permanente"}
                  </div>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => toggleActive(entry)}
                className={`text-xs ${entry.isActive ? "border-zinc-600" : "border-status-ok-border text-status-ok-fg"}`}
              >
                {entry.isActive ? "Desactivar" : "Activar"}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function recordTypeLabel(type: string): string {
  switch (type) {
    case "provider":
      return "Proveedor";
    case "staff":
      return "Personal";
    case "delivery":
      return "Despacho";
    case "vehicle":
      return "Vehículo";
    default:
      return "Visita";
  }
}
