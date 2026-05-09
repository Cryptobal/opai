"use client";

import React, { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  CalendarClock, Plus, Loader2, Check, X, Edit, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PREREGISTRATION_STATUS_CONFIG } from "@/lib/access-control/types";
import { formatRut, validateRut } from "@/lib/access-control/utils";
import type { PreregistrationStatus, AccessRecordType } from "@/lib/access-control/types";

interface Prereg {
  id: string;
  visitorRut: string;
  visitorName: string;
  visitorCompany: string | null;
  hostName: string | null;
  expectedDate: string;
  expectedEndDate?: string | null;
  expectedTimeFrom: string | null;
  expectedTimeTo: string | null;
  vehiclePlate?: string | null;
  recordType?: string | null;
  purpose: string | null;
  status: PreregistrationStatus;
  createdAt: string;
}

interface Props {
  installationId: string;
  createdBy?: string;
}

export function ClientPreregistration({ installationId, createdBy }: Props) {
  const [items, setItems] = useState<Prereg[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form
  const [fRut, setFRut] = useState("");
  const [fName, setFName] = useState("");
  const [fCompany, setFCompany] = useState("");
  const [fHost, setFHost] = useState("");
  const [fRecordType, setFRecordType] = useState<AccessRecordType>("visit");
  const [fVehiclePlate, setFVehiclePlate] = useState("");
  const [fDate, setFDate] = useState("");
  const [fEndDate, setFEndDate] = useState("");
  const [fTimeFrom, setFTimeFrom] = useState("");
  const [fTimeTo, setFTimeTo] = useState("");
  const [fPurpose, setFPurpose] = useState("");

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/portal/cliente/access-control/${installationId}/preregister`
      );
      const json = await res.json();
      if (json.success) setItems(json.data);
    } catch {
      // offline
    } finally {
      setLoading(false);
    }
  }, [installationId]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const resetForm = () => {
    setFRut(""); setFName(""); setFCompany(""); setFHost("");
    setFRecordType("visit"); setFVehiclePlate("");
    setFDate(""); setFEndDate("");
    setFTimeFrom(""); setFTimeTo(""); setFPurpose("");
    setShowForm(false);
  };

  const handleSubmit = async () => {
    if (!validateRut(fRut)) { toast.error("RUT inválido"); return; }
    if (!fName.trim()) { toast.error("Nombre requerido"); return; }
    if (!fDate) { toast.error("Fecha requerida"); return; }

    setSaving(true);
    try {
      const res = await fetch(
        `/api/portal/cliente/access-control/${installationId}/preregister`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            visitorRut: fRut,
            visitorName: fName,
            visitorCompany: fCompany || null,
            hostName: fHost || null,
            recordType: fRecordType,
            vehiclePlate: fRecordType === "vehicle" ? fVehiclePlate || null : null,
            expectedDate: fDate,
            expectedEndDate: fEndDate || null,
            expectedTimeFrom: fTimeFrom || null,
            expectedTimeTo: fTimeTo || null,
            purpose: fPurpose || null,
            createdBy,
            createdByClient: true,
          }),
        }
      );
      const json = await res.json();
      if (json.success) {
        toast.success("Visita pre-registrada");
        resetForm();
        fetchItems();
      } else {
        toast.error(json.error);
      }
    } catch {
      toast.error("Error al pre-registrar");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm("¿Cancelar este pre-registro?")) return;
    try {
      await fetch(`/api/access-control/preregistrations/item/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      toast.success("Pre-registro cancelado");
      fetchItems();
    } catch {
      toast.error("Error");
    }
  };

  const statusColors: Record<string, string> = {
    pending: "border-status-warn-border text-status-warn-fg",
    checked_in: "border-status-ok-border text-status-ok-fg",
    checked_out: "border-status-info-border text-status-info-fg",
    no_show: "border-status-danger-border text-status-danger-fg",
    cancelled: "border-zinc-500/30 text-zinc-500",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-zinc-400" />
          Pre-registro de Visitas
        </h3>
        <Button size="sm" onClick={() => setShowForm(true)}>
          <Plus className="mr-1 h-4 w-4" /> Nueva
        </Button>
      </div>

      {showForm && (
        <div className="rounded-lg border border-zinc-600 bg-zinc-800 p-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-zinc-400">RUT Visitante *</Label>
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
              <Label className="text-zinc-400">Persona que recibe</Label>
              <Input value={fHost} onChange={(e) => setFHost(e.target.value)} className="bg-zinc-700 border-zinc-600" />
            </div>
            <div>
              <Label className="text-zinc-400">Tipo de registro</Label>
              <select
                value={fRecordType}
                onChange={(e) => setFRecordType(e.target.value as AccessRecordType)}
                className="w-full rounded-md border border-zinc-600 bg-zinc-700 px-3 py-2 text-sm text-zinc-200"
              >
                <option value="visit">Visita</option>
                <option value="provider">Proveedor</option>
                <option value="vehicle">Vehículo</option>
                <option value="staff">Personal</option>
                <option value="delivery">Despacho</option>
              </select>
            </div>
            {fRecordType === "vehicle" && (
              <div>
                <Label className="text-zinc-400">Patente</Label>
                <Input
                  value={fVehiclePlate}
                  onChange={(e) => setFVehiclePlate(e.target.value.toUpperCase())}
                  placeholder="BBCC-12"
                  className="bg-zinc-700 border-zinc-600 uppercase"
                />
              </div>
            )}
            <div>
              <Label className="text-zinc-400">Fecha desde *</Label>
              <Input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} className="bg-zinc-700 border-zinc-600" />
            </div>
            <div>
              <Label className="text-zinc-400">Fecha hasta (opcional)</Label>
              <Input
                type="date"
                value={fEndDate}
                onChange={(e) => setFEndDate(e.target.value)}
                min={fDate || undefined}
                className="bg-zinc-700 border-zinc-600"
              />
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
            <div className="sm:col-span-2">
              <Label className="text-zinc-400">Motivo</Label>
              <Input value={fPurpose} onChange={(e) => setFPurpose(e.target.value)} className="bg-zinc-700 border-zinc-600" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={resetForm}>Cancelar</Button>
            <Button size="sm" onClick={handleSubmit} disabled={saving}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
              Pre-registrar
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-center text-sm text-zinc-500 py-8">Sin pre-registros</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="rounded-lg border border-zinc-700 bg-zinc-900 p-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-200">{item.visitorName}</span>
                    <Badge variant="outline" className={`text-xs ${statusColors[item.status] || ""}`}>
                      {PREREGISTRATION_STATUS_CONFIG[item.status]?.label}
                    </Badge>
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {formatRut(item.visitorRut)}
                    {item.visitorCompany && ` — ${item.visitorCompany}`}
                  </div>
                  <div className="mt-1 text-xs text-zinc-400">
                    {new Date(item.expectedDate).toLocaleDateString("es-CL")}
                    {item.expectedEndDate && (
                      <> – {new Date(item.expectedEndDate).toLocaleDateString("es-CL")}</>
                    )}
                    {item.expectedTimeFrom && ` ${item.expectedTimeFrom}`}
                    {item.expectedTimeTo && ` - ${item.expectedTimeTo}`}
                  </div>
                  {item.vehiclePlate && (
                    <div className="text-xs text-zinc-500 mt-0.5">
                      Patente: <span className="font-mono">{item.vehiclePlate}</span>
                    </div>
                  )}
                  {item.hostName && (
                    <div className="text-xs text-zinc-500 mt-0.5">Visita a: {item.hostName}</div>
                  )}
                </div>
                {item.status === "pending" && (
                  <button
                    onClick={() => handleCancel(item.id)}
                    className="text-zinc-500 hover:text-status-danger-fg p-1"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
