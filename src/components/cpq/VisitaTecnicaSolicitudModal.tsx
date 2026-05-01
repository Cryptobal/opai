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
import { Loader2, Briefcase, MapPin, MessageCircle, CalendarDays, User, Phone, Check } from "lucide-react";
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

interface AccountContact {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  quoteId: string;
  quoteCode: string;
  accountId?: string;
  installation: CrmInstallationOption | null;
  positions: CpqPosition[];
  onSuccess: (data: {
    visitaId: string;
    supervisorName: string;
    supervisorEmail: string;
    supervisors?: Array<{ name: string; email: string; emailSent: boolean }>;
    installationName?: string;
    installationAddress: string | null;
    mapsUrl?: string | null;
    contactName?: string | null;
    contactPhone?: string | null;
    scheduledAt: string;
    quoteCode?: string;
    puestosDetail?: Array<{ name: string; cargo?: string | null; numGuards: number; numPuestos: number; startTime?: string | null; endTime?: string | null }>;
    emailSent: boolean;
    googleCalendarUrl?: string;
  }) => void;
}

export function VisitaTecnicaSolicitudModal({
  open,
  onOpenChange,
  quoteId,
  quoteCode,
  accountId,
  installation,
  positions,
  onSuccess,
}: Props) {
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [loadingSupervisors, setLoadingSupervisors] = useState(false);
  const [accountContacts, setAccountContacts] = useState<AccountContact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);

  const [selectedSupervisorIds, setSelectedSupervisorIds] = useState<string[]>([]);
  const [scheduledAt, setScheduledAt] = useState("");
  const [contactMode, setContactMode] = useState<"select" | "manual">("select");
  const [selectedContactId, setSelectedContactId] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setContactMode("select");
    setSelectedContactId("");
    setContactName("");
    setContactPhone("");
    setLoadingSupervisors(true);
    fetch("/api/ops/supervisors")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          setSupervisors(json.data ?? []);
          if (json.data?.length === 1) setSelectedSupervisorIds([json.data[0].id]);
        }
      })
      .catch(() => toast.error("No se pudo cargar la lista de supervisores"))
      .finally(() => setLoadingSupervisors(false));
  }, [open]);

  useEffect(() => {
    if (!open || !accountId) return;
    setLoadingContacts(true);
    fetch(`/api/crm/contacts?accountId=${accountId}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data)) {
          setAccountContacts(
            json.data.map((c: { id: string; firstName: string; lastName: string; email?: string | null; phone?: string | null }) => ({
              id: c.id,
              firstName: c.firstName,
              lastName: c.lastName,
              email: c.email,
              phone: c.phone,
            }))
          );
        }
      })
      .catch(() => toast.error("No se pudieron cargar los contactos"))
      .finally(() => setLoadingContacts(false));
  }, [open, accountId]);

  // Default scheduledAt: tomorrow at 10:00 (minutos en intervalos de 15)
  useEffect(() => {
    if (!open || scheduledAt) return;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    const y = tomorrow.getFullYear();
    const m = String(tomorrow.getMonth() + 1).padStart(2, "0");
    const d = String(tomorrow.getDate()).padStart(2, "0");
    const h = String(tomorrow.getHours()).padStart(2, "0");
    const min = "00"; // 00, 15, 30, 45
    setScheduledAt(`${y}-${m}-${d}T${h}:${min}`);
  }, [open]);

  const MINUTES = ["00", "15", "30", "45"] as const;
  const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));

  const scheduledDate = scheduledAt ? scheduledAt.slice(0, 10) : "";
  const rawHour = scheduledAt ? scheduledAt.slice(11, 13) : "10";
  const rawMinute = scheduledAt ? scheduledAt.slice(14, 16) : "00";
  const scheduledHour = rawHour || "10";
  const scheduledMinute = MINUTES.includes(rawMinute as (typeof MINUTES)[number])
    ? rawMinute
    : (MINUTES[Math.min(3, Math.round(parseInt(rawMinute, 10) / 15))] ?? "00");

  const setScheduledDateTime = (date: string, hour: string, minute: string) => {
    if (!date) return;
    const m = MINUTES.includes(minute as (typeof MINUTES)[number]) ? minute : "00";
    setScheduledAt(`${date}T${hour}:${m}`);
  };

  const mapsUrl = installation?.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(installation.address)}`
    : null;

  const resolvedContact = selectedContactId
    ? accountContacts.find((c) => c.id === selectedContactId)
    : null;
  const effectiveContactName =
    contactMode === "manual" ? contactName : resolvedContact ? `${resolvedContact.firstName} ${resolvedContact.lastName}`.trim() : "";
  const effectiveContactPhone =
    contactMode === "manual" ? contactPhone : resolvedContact?.phone ?? "";

  const toggleSupervisor = (id: string) => {
    setSelectedSupervisorIds((prev) =>
      prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id]
    );
  };

  async function handleSubmit() {
    if (selectedSupervisorIds.length === 0) { toast.error("Selecciona al menos un supervisor"); return; }
    if (!scheduledAt) { toast.error("Indica fecha y hora"); return; }

    setSending(true);
    try {
      // Enviar scheduledAt como ISO UTC para que el servidor interprete correctamente la hora en Chile
      const [y, m, d] = scheduledAt.slice(0, 10).split("-").map(Number);
      const h = parseInt(scheduledHour, 10);
      const min = parseInt(scheduledMinute, 10);
      const dateObj = new Date(y, m - 1, d, h, min, 0, 0);
      const scheduledAtIso = dateObj.toISOString();

      const res = await fetch(`/api/cpq/quotes/${quoteId}/solicitar-visita-tecnica`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supervisorIds: selectedSupervisorIds,
          scheduledAt: scheduledAtIso,
          contactName: effectiveContactName,
          contactPhone: effectiveContactPhone,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "No se pudo crear la visita técnica");
      }
      const emailCount = json.data.supervisors?.filter((s: { emailSent: boolean }) => s.emailSent).length ?? (json.data.emailSent ? 1 : 0);
      toast.success(`Visita técnica programada. Se envió email a ${emailCount} supervisor${emailCount !== 1 ? "es" : ""}.`);
      onOpenChange(false);
      onSuccess(json.data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al programar la visita");
    } finally {
      setSending(false);
    }
  }

  const selectedSupervisorsInfo = supervisors.filter((s) => selectedSupervisorIds.includes(s.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-status-info-fg" />
            Programar visita técnica
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Instalación (read-only) */}
          {installation && (
            <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1">
              <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Instalación</p>
              <p className="text-sm font-medium">{installation.name}</p>
              {installation.address && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3 flex-shrink-0" />
                  {mapsUrl ? (
                    <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="text-status-info-fg hover:underline">
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
              <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
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

          {/* Supervisores */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" /> Supervisores a notificar *
            </Label>
            {loadingSupervisors ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando supervisores...
              </div>
            ) : (
              <div className="max-h-36 overflow-y-auto rounded-md border border-input bg-background p-1 space-y-0.5">
                {supervisors.map((s) => {
                  const isSelected = selectedSupervisorIds.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggleSupervisor(s.id)}
                      disabled={sending}
                      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ${
                        isSelected
                          ? "bg-status-info-soft text-status-info-fg"
                          : "text-muted-foreground hover:bg-muted/60"
                      }`}
                    >
                      <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        isSelected ? "border-sky-500 bg-status-info" : "border-muted-foreground/40"
                      }`}>
                        {isSelected && <Check className="h-3 w-3 text-white" />}
                      </div>
                      <span className="truncate">{s.name}</span>
                      <span className="ml-auto text-xs text-muted-foreground truncate">{s.email}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {selectedSupervisorsInfo.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Se enviará email a {selectedSupervisorsInfo.map((s) => s.email).join(", ")}
              </p>
            )}
          </div>

          {/* Fecha y hora (24h, minutos cada 15) */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" /> Fecha y hora *
            </Label>
            <div className="flex gap-2">
              <Input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDateTime(e.target.value, scheduledHour, scheduledMinute)}
                disabled={sending}
                className="bg-background flex-1"
              />
              <select
                value={scheduledHour}
                onChange={(e) => setScheduledDateTime(scheduledDate, e.target.value, scheduledMinute)}
                disabled={sending}
                className="h-9 w-16 rounded-md border border-input bg-background px-2 text-sm"
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
              <span className="flex items-center text-muted-foreground">:</span>
              <select
                value={scheduledMinute}
                onChange={(e) => setScheduledDateTime(scheduledDate, scheduledHour, e.target.value)}
                disabled={sending}
                className="h-9 w-16 rounded-md border border-input bg-background px-2 text-sm"
              >
                {MINUTES.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Contacto en visita */}
          <div className="space-y-3">
            <Label className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" /> Contacto en visita
            </Label>
            {accountId && accountContacts.length > 0 && !loadingContacts ? (
              <>
                <div className="flex gap-2">
                  <select
                    value={contactMode === "select" ? selectedContactId || "__none__" : "__manual__"}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "__manual__") {
                        setContactMode("manual");
                        setSelectedContactId("");
                      } else {
                        setContactMode("select");
                        setSelectedContactId(v === "__none__" ? "" : v);
                      }
                    }}
                    className="flex h-9 flex-1 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    disabled={sending}
                  >
                    <option value="__none__">Sin contacto</option>
                    {accountContacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {`${c.firstName} ${c.lastName}`.trim()}
                        {c.phone ? ` · ${c.phone}` : c.email ? ` · ${c.email}` : ""}
                      </option>
                    ))}
                    <option value="__manual__">Otro (ingresar manualmente)</option>
                  </select>
                </div>
                {contactMode === "manual" && (
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <Input
                      placeholder="Nombre del contacto"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      disabled={sending}
                      className="bg-background"
                    />
                    <Input
                      placeholder="+56 9 1234 5678"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                      disabled={sending}
                      className="bg-background"
                    />
                  </div>
                )}
                {contactMode === "select" && selectedContactId && resolvedContact && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {resolvedContact.phone || resolvedContact.email || "Sin teléfono/email"}
                  </p>
                )}
              </>
            ) : accountId && loadingContacts ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando contactos...
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Input
                  placeholder="Nombre del contacto"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  disabled={sending}
                  className="bg-background"
                />
                <Input
                  placeholder="+56 9 1234 5678"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  disabled={sending}
                  className="bg-background"
                />
              </div>
            )}
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
            disabled={sending || selectedSupervisorIds.length === 0 || !scheduledAt}
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
