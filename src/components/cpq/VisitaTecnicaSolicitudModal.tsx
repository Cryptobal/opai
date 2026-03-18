"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Briefcase, MapPin, MessageCircle, CalendarDays, User, Phone } from "lucide-react";
import { toast } from "sonner";
import type { CpqPosition } from "@/types/cpq";

interface Supervisor {
  id: string;
  name: string;
  email: string;
}

interface CrmInstallationOption {
  id: string;
  name: string;
  address?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  quoteId: string;
  quoteCode: string;
  installation: CrmInstallationOption | null;
  positions: CpqPosition[];
  onSuccess: (data: {
    visitaId: string;
    supervisorName: string;
    supervisorEmail: string;
    installationAddress: string | null;
    scheduledAt: string;
    emailSent: boolean;
  }) => void;
}

export function VisitaTecnicaSolicitudModal({
  open,
  onOpenChange,
  quoteId,
  quoteCode,
  installation,
  positions,
  onSuccess,
}: Props) {
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [loadingSupervisors, setLoadingSupervisors] = useState(false);

  const [supervisorId, setSupervisorId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoadingSupervisors(true);
    fetch("/api/ops/supervisors")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          setSupervisors(json.data ?? []);
          if (json.data?.length === 1) setSupervisorId(json.data[0].id);
        }
      })
      .catch(() => toast.error("No se pudo cargar la lista de supervisores"))
      .finally(() => setLoadingSupervisors(false));
  }, [open]);

  // Default scheduledAt: tomorrow at 10:00
  useEffect(() => {
    if (!open || scheduledAt) return;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    const local = tomorrow.toISOString().slice(0, 16);
    setScheduledAt(local);
  }, [open]);

  const mapsUrl = installation?.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(installation.address)}`
    : null;

  async function handleSubmit() {
    if (!supervisorId) { toast.error("Selecciona un supervisor"); return; }
    if (!scheduledAt) { toast.error("Indica fecha y hora"); return; }

    setSending(true);
    try {
      const res = await fetch(`/api/cpq/quotes/${quoteId}/solicitar-visita-tecnica`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supervisorId, scheduledAt, contactName, contactPhone }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "No se pudo crear la visita técnica");
      }
      toast.success("Visita técnica programada. Se envió email al supervisor.");
      onOpenChange(false);
      onSuccess(json.data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al programar la visita");
    } finally {
      setSending(false);
    }
  }

  const selectedSupervisor = supervisors.find((s) => s.id === supervisorId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-sky-400" />
            Programar visita técnica
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Instalación (read-only) */}
          {installation && (
            <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Instalación</p>
              <p className="text-sm font-medium">{installation.name}</p>
              {installation.address && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3 flex-shrink-0" />
                  {mapsUrl ? (
                    <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="text-sky-500 hover:underline">
                      {installation.address}
                    </a>
                  ) : installation.address}
                </p>
              )}
            </div>
          )}

          {/* Puestos (read-only) */}
          {positions.length > 0 && (
            <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Puestos cotizados ({positions.length})
              </p>
              <div className="space-y-1 max-h-28 overflow-y-auto">
                {positions.map((p) => (
                  <p key={p.id} className="text-xs text-muted-foreground">
                    • {p.customName || p.puestoTrabajo?.name || "Puesto"}{" "}
                    — {p.numGuards} guardia{p.numGuards !== 1 ? "s" : ""}{" "}
                    · {p.startTime}–{p.endTime}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Supervisor */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" /> Supervisor asignado *
            </Label>
            {loadingSupervisors ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando supervisores...
              </div>
            ) : (
              <select
                value={supervisorId}
                onChange={(e) => setSupervisorId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                disabled={sending}
              >
                <option value="">Seleccionar supervisor...</option>
                {supervisors.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.email})</option>
                ))}
              </select>
            )}
            {selectedSupervisor && (
              <p className="text-xs text-muted-foreground">Se enviará email a {selectedSupervisor.email}</p>
            )}
          </div>

          {/* Fecha y hora */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" /> Fecha y hora *
            </Label>
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              disabled={sending}
              className="bg-background"
            />
          </div>

          {/* Contacto */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" /> Contacto en visita
              </Label>
              <Input
                placeholder="Nombre del contacto"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                disabled={sending}
                className="bg-background"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" /> Teléfono
              </Label>
              <Input
                placeholder="+56 9 1234 5678"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                disabled={sending}
                className="bg-background"
              />
            </div>
          </div>

          {/* Cotización */}
          <p className="text-xs text-muted-foreground">
            Cotización: <span className="font-medium text-foreground">{quoteCode}</span>
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={sending || !supervisorId || !scheduledAt}
            className="gap-2"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Briefcase className="h-4 w-4" />}
            {sending ? "Programando..." : "Programar y enviar email"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
