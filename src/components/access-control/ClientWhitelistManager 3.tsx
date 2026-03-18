"use client";

import React, { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Shield, Plus, Search, Edit, Loader2, Check, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatRut, validateRut } from "@/lib/access-control/utils";

interface WhitelistEntry {
  id: string;
  rut: string;
  fullName: string;
  company: string | null;
  validFrom: string | null;
  validUntil: string | null;
  isActive: boolean;
}

interface Props {
  installationId: string;
  createdBy?: string;
}

export function ClientWhitelistManager({ installationId, createdBy }: Props) {
  const [entries, setEntries] = useState<WhitelistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form
  const [fRut, setFRut] = useState("");
  const [fName, setFName] = useState("");
  const [fCompany, setFCompany] = useState("");
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
    setFRut(""); setFName(""); setFCompany(""); setFValidFrom(""); setFValidUntil("");
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
          <Shield className="h-5 w-5 text-emerald-400" />
          Personas Autorizadas
        </h3>
        <Button size="sm" onClick={() => setShowForm(true)}>
          <Plus className="mr-1 h-4 w-4" /> Agregar
        </Button>
      </div>

      {showForm && (
        <div className="rounded-lg border border-zinc-600 bg-zinc-800 p-4 space-y-3">
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
            <div className="flex gap-2">
              <div className="flex-1">
                <Label className="text-zinc-400">Desde</Label>
                <Input type="date" value={fValidFrom} onChange={(e) => setFValidFrom(e.target.value)} className="bg-zinc-700 border-zinc-600" />
              </div>
              <div className="flex-1">
                <Label className="text-zinc-400">Hasta</Label>
                <Input type="date" value={fValidUntil} onChange={(e) => setFValidUntil(e.target.value)} className="bg-zinc-700 border-zinc-600" />
              </div>
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
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-zinc-200">{entry.fullName}</span>
                  {!entry.isActive && (
                    <Badge variant="outline" className="text-xs border-zinc-600 text-zinc-500">Inactivo</Badge>
                  )}
                </div>
                <div className="text-xs text-zinc-500">
                  {formatRut(entry.rut)}
                  {entry.company && ` — ${entry.company}`}
                </div>
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
                className={`text-xs ${entry.isActive ? "border-zinc-600" : "border-emerald-500/30 text-emerald-400"}`}
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
