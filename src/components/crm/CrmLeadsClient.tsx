/* eslint-disable @typescript-eslint/no-misused-promises */
"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CrmLead } from "@/types";
import { Plus } from "lucide-react";

type LeadFormState = {
  companyName: string;
  name: string;
  email: string;
  phone: string;
  source: string;
};

const DEFAULT_FORM: LeadFormState = {
  companyName: "",
  name: "",
  email: "",
  phone: "",
  source: "",
};

export function CrmLeadsClient({ initialLeads }: { initialLeads: CrmLead[] }) {
  const [leads, setLeads] = useState<CrmLead[]>(initialLeads);
  const [form, setForm] = useState<LeadFormState>(DEFAULT_FORM);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const inputClassName =
    "bg-blue-900/30 text-white placeholder:text-blue-200 border-blue-700 focus-visible:ring-blue-400";
  const selectClassName =
    "w-full rounded-md border border-blue-700 bg-blue-900/30 px-3 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400";

  const pendingLeads = useMemo(
    () => leads.filter((lead) => lead.status === "pending"),
    [leads]
  );

  const approvedLeads = useMemo(
    () => leads.filter((lead) => lead.status !== "pending"),
    [leads]
  );

  const updateForm = (key: keyof LeadFormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const createLead = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/crm/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Error creando prospecto");
      }
      setLeads((prev) => [payload.data, ...prev]);
      setForm(DEFAULT_FORM);
      setOpen(false);
    } catch (error) {
      console.error(error);
      alert("No se pudo crear el prospecto.");
    } finally {
      setLoading(false);
    }
  };

  const approveLead = async (leadId: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/crm/leads/${leadId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Error aprobando prospecto");
      }
      setLeads((prev) =>
        prev.map((lead) =>
          lead.id === leadId ? { ...lead, status: "approved" } : lead
        )
      );
    } catch (error) {
      console.error(error);
      alert("No se pudo aprobar el prospecto.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Registra nuevos prospectos desde el terreno.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="icon" variant="secondary" className="h-9 w-9">
              <Plus className="h-4 w-4" />
              <span className="sr-only">Nuevo prospecto</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Nuevo prospecto</DialogTitle>
              <DialogDescription>
                Ingresa los datos básicos del contacto.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Empresa</Label>
                <Input
                  value={form.companyName}
                  onChange={(event) => updateForm("companyName", event.target.value)}
                  placeholder="Nombre de la empresa"
                  className={inputClassName}
                />
              </div>
              <div className="space-y-2">
                <Label>Contacto</Label>
                <Input
                  value={form.name}
                  onChange={(event) => updateForm("name", event.target.value)}
                  placeholder="Nombre del contacto"
                  className={inputClassName}
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  value={form.email}
                  onChange={(event) => updateForm("email", event.target.value)}
                  placeholder="correo@empresa.com"
                  className={inputClassName}
                />
              </div>
              <div className="space-y-2">
                <Label>Teléfono</Label>
                <Input
                  value={form.phone}
                  onChange={(event) => updateForm("phone", event.target.value)}
                  placeholder="+56 9 1234 5678"
                  className={inputClassName}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Fuente</Label>
                <Input
                  value={form.source}
                  onChange={(event) => updateForm("source", event.target.value)}
                  placeholder="Formulario web, referido, inbound, etc."
                  className={inputClassName}
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={createLead} disabled={loading}>
                Guardar prospecto
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Prospectos pendientes</CardTitle>
          <CardDescription>
            Aprueba para crear cliente + contacto + negocio.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {pendingLeads.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No hay prospectos pendientes.
            </p>
          )}
          {pendingLeads.map((lead) => (
            <div
              key={lead.id}
              className="flex flex-col gap-2 rounded-lg border p-4 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <p className="font-medium">
                  {lead.companyName || "Empresa sin nombre"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {lead.name || "Contacto sin nombre"} · {lead.email || "Sin email"}
                </p>
              </div>
              <Button onClick={() => approveLead(lead.id)} disabled={loading}>
                Aprobar
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Prospectos procesados</CardTitle>
          <CardDescription>Historial de prospectos ya revisados.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {approvedLeads.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No hay prospectos aprobados todavía.
            </p>
          )}
          {approvedLeads.map((lead) => (
            <div
              key={lead.id}
              className="flex items-center justify-between rounded-lg border px-4 py-3"
            >
              <div>
                <p className="font-medium">
                  {lead.companyName || "Empresa sin nombre"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {lead.name || "Contacto sin nombre"}
                </p>
              </div>
              <Badge variant="outline">Aprobado</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
