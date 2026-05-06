"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FactoringCompanyRow } from "./FactoringCompaniesClient";

interface Props {
  mode: "create" | "edit";
  company?: FactoringCompanyRow;
  onClose: () => void;
  onSuccess: () => void;
}

export function FactoringCompanyForm({ mode, company, onClose, onSuccess }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    rut: company?.rut ?? "",
    razonSocial: company?.razonSocial ?? "",
    direccion: company?.direccion ?? "",
    comuna: company?.comuna ?? "",
    ciudad: company?.ciudad ?? "",
    email: company?.email ?? "",
    contactName: company?.contactName ?? "",
    contactEmail: company?.contactEmail ?? "",
    contactPhone: company?.contactPhone ?? "",
    defaultAdvanceRate: company?.defaultAdvanceRate ?? "",
    defaultInterestRate: company?.defaultInterestRate ?? "",
    defaultCommissionPct: company?.defaultCommissionPct ?? "",
    notes: company?.notes ?? "",
  });

  const setField = <K extends keyof typeof form>(key: K, value: string | number) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const payload = {
        rut: form.rut.trim(),
        razonSocial: form.razonSocial.trim(),
        direccion: form.direccion.trim() || null,
        comuna: form.comuna.trim() || null,
        ciudad: form.ciudad.trim() || null,
        email: form.email.trim() || null,
        contactName: form.contactName.trim() || null,
        contactEmail: form.contactEmail.trim() || null,
        contactPhone: form.contactPhone.trim() || null,
        defaultAdvanceRate:
          form.defaultAdvanceRate === "" ? null : Number(form.defaultAdvanceRate),
        defaultInterestRate:
          form.defaultInterestRate === "" ? null : Number(form.defaultInterestRate),
        defaultCommissionPct:
          form.defaultCommissionPct === "" ? null : Number(form.defaultCommissionPct),
        notes: form.notes.trim() || null,
      };

      const url =
        mode === "create"
          ? "/api/finance/factoring/companies"
          : `/api/finance/factoring/companies/${company!.id}`;
      const method = mode === "create" ? "POST" : "PATCH";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error ?? "Error guardando");
        return;
      }
      toast.success(mode === "create" ? "Factoring creado" : "Factoring actualizado");
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error de red");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Nueva empresa de factoring" : "Editar factoring"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="rut">RUT</Label>
            <Input
              id="rut"
              placeholder="76.123.456-7"
              value={form.rut}
              onChange={(e) => setField("rut", e.target.value)}
              className="h-10 sm:h-9"
            />
          </div>
          <div>
            <Label htmlFor="razonSocial">Razón social</Label>
            <Input
              id="razonSocial"
              value={form.razonSocial}
              onChange={(e) => setField("razonSocial", e.target.value)}
              className="h-10 sm:h-9"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="direccion">Dirección</Label>
            <Input
              id="direccion"
              value={form.direccion}
              onChange={(e) => setField("direccion", e.target.value)}
              className="h-10 sm:h-9"
            />
          </div>
          <div>
            <Label htmlFor="comuna">Comuna</Label>
            <Input
              id="comuna"
              value={form.comuna}
              onChange={(e) => setField("comuna", e.target.value)}
              className="h-10 sm:h-9"
            />
          </div>
          <div>
            <Label htmlFor="ciudad">Ciudad</Label>
            <Input
              id="ciudad"
              value={form.ciudad}
              onChange={(e) => setField("ciudad", e.target.value)}
              className="h-10 sm:h-9"
            />
          </div>
          <div>
            <Label htmlFor="email">Email general</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => setField("email", e.target.value)}
              className="h-10 sm:h-9"
            />
          </div>
          <div>
            <Label htmlFor="contactName">Contacto</Label>
            <Input
              id="contactName"
              value={form.contactName}
              onChange={(e) => setField("contactName", e.target.value)}
              className="h-10 sm:h-9"
            />
          </div>
          <div>
            <Label htmlFor="contactEmail">Email contacto</Label>
            <Input
              id="contactEmail"
              type="email"
              value={form.contactEmail}
              onChange={(e) => setField("contactEmail", e.target.value)}
              className="h-10 sm:h-9"
            />
          </div>
          <div>
            <Label htmlFor="contactPhone">Teléfono</Label>
            <Input
              id="contactPhone"
              value={form.contactPhone}
              onChange={(e) => setField("contactPhone", e.target.value)}
              className="h-10 sm:h-9"
            />
          </div>
          <div>
            <Label htmlFor="defaultAdvanceRate">Anticipo default (%)</Label>
            <Input
              id="defaultAdvanceRate"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={form.defaultAdvanceRate}
              onChange={(e) => setField("defaultAdvanceRate", e.target.value)}
              className="h-10 sm:h-9"
            />
          </div>
          <div>
            <Label htmlFor="defaultInterestRate">Interés mensual default (%)</Label>
            <Input
              id="defaultInterestRate"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={form.defaultInterestRate}
              onChange={(e) => setField("defaultInterestRate", e.target.value)}
              className="h-10 sm:h-9"
            />
          </div>
          <div>
            <Label htmlFor="defaultCommissionPct">Comisión default (%)</Label>
            <Input
              id="defaultCommissionPct"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={form.defaultCommissionPct}
              onChange={(e) => setField("defaultCommissionPct", e.target.value)}
              className="h-10 sm:h-9"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="notes">Notas</Label>
            <Textarea
              id="notes"
              rows={2}
              value={form.notes}
              onChange={(e) => setField("notes", e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
            {mode === "create" ? "Crear" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
