"use client";

/**
 * RecurringTemplateForm — formulario rico para crear y editar plantillas
 * de facturación recurrente. Espeja la estructura de DteForm (cliente
 * CRM autocompletado, líneas múltiples, observaciones, referencias) y
 * agrega un bloque de configuración de recurrencia (frecuencia, día,
 * política de UF, fechas).
 *
 * Uso:
 *   - Crear: <RecurringTemplateForm onClose={...} onSaved={...} />
 *   - Editar: <RecurringTemplateForm templateId={id} onClose={...} onSaved={...} />
 *
 * El submit hace POST /api/finance/billing/recurring (crear) o
 * PATCH /api/finance/billing/recurring/[id] (editar). En ambos casos el
 * payload coincide con `recurringTemplateSchema`.
 */
import * as React from "react";
import { Plus, Trash2, Loader2, Save } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { CustomerCombobox, type CustomerOption } from "./CustomerCombobox";

const fmtCLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  minimumFractionDigits: 0,
});

interface TemplateLine {
  itemName: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  discountPct: string;
  isExempt: boolean;
}

interface AdditionalRef {
  tipoDocRef: string;
  folioRef: string;
  fchRef: string;
}

const EMPTY_LINE: TemplateLine = {
  itemName: "",
  description: "",
  quantity: "1",
  unit: "UN",
  unitPrice: "",
  discountPct: "0",
  isExempt: false,
};

interface Props {
  open: boolean;
  /** Si viene un id, el form opera en modo edición. */
  templateId?: string | null;
  onClose: () => void;
  onSaved: () => void;
}

export function RecurringTemplateForm({
  open,
  templateId,
  onClose,
  onSaved,
}: Props) {
  const isEditing = !!templateId;

  // ── Estado de carga inicial cuando editamos ──
  const [loading, setLoading] = React.useState(false);

  // ── Datos básicos ──
  const [name, setName] = React.useState("");
  const [dteType, setDteType] = React.useState("33");
  const [currency, setCurrency] = React.useState<"CLP" | "UF">("CLP");

  // ── Receptor (CRM o manual) ──
  const [customer, setCustomer] = React.useState<CustomerOption | null>(null);
  const [receiverRut, setReceiverRut] = React.useState("");
  const [receiverName, setReceiverName] = React.useState("");
  const [receiverEmail, setReceiverEmail] = React.useState("");
  const [receiverGiro, setReceiverGiro] = React.useState("");
  const [receiverDireccion, setReceiverDireccion] = React.useState("");
  const [receiverComuna, setReceiverComuna] = React.useState("");
  const [receiverCiudad, setReceiverCiudad] = React.useState("");
  const [installationId, setInstallationId] = React.useState<string>("");
  const [installations, setInstallations] = React.useState<
    { id: string; name: string; address: string | null; commune: string | null }[]
  >([]);
  const [ccEmailsRaw, setCcEmailsRaw] = React.useState("");
  const [crmSuggestions, setCrmSuggestions] = React.useState<{
    account: { id: string; name: string; rut: string } | null;
    contacts: { id: string; fullName: string; email: string; roleTitle: string | null; isPrimary: boolean }[];
  } | null>(null);

  // ── Líneas + extras ──
  const [lines, setLines] = React.useState<TemplateLine[]>([{ ...EMPTY_LINE }]);
  const [notes, setNotes] = React.useState("");
  const [additionalRefs, setAdditionalRefs] = React.useState<AdditionalRef[]>(
    [],
  );

  // ── Recurrencia ──
  const [frequency, setFrequency] = React.useState<
    "monthly" | "biweekly" | "weekly" | "yearly"
  >("monthly");
  const [dayOfMonth, setDayOfMonth] = React.useState("1");
  const [dayOfWeek, setDayOfWeek] = React.useState("1");
  const [monthOfYear, setMonthOfYear] = React.useState("1");
  const [startDate, setStartDate] = React.useState(
    new Date().toISOString().split("T")[0],
  );
  const [endDate, setEndDate] = React.useState("");
  const [isActive, setIsActive] = React.useState(true);
  const [autoSendEmail, setAutoSendEmail] = React.useState(true);

  // ── UF policy (solo si currency=UF) ──
  const [ufFixingPolicy, setUfFixingPolicy] = React.useState<
    "RUN_DAY" | "LAST_DAY_PREV_MONTH" | "FIRST_DAY_MONTH" | "LAST_DAY_MONTH" | "CUSTOM_DAY"
  >("LAST_DAY_PREV_MONTH");
  const [ufFixingDay, setUfFixingDay] = React.useState("1");

  const [submitting, setSubmitting] = React.useState(false);

  // Reset al abrir/cerrar (para que una segunda apertura no muestre datos viejos)
  React.useEffect(() => {
    if (!open) return;
    if (templateId) return; // si editamos, los efectos de carga se encargan
    setName("");
    setDteType("33");
    setCurrency("CLP");
    setCustomer(null);
    setReceiverRut("");
    setReceiverName("");
    setReceiverEmail("");
    setReceiverGiro("");
    setReceiverDireccion("");
    setReceiverComuna("");
    setReceiverCiudad("");
    setInstallationId("");
    setCcEmailsRaw("");
    setLines([{ ...EMPTY_LINE }]);
    setNotes("");
    setAdditionalRefs([]);
    setFrequency("monthly");
    setDayOfMonth("1");
    setDayOfWeek("1");
    setMonthOfYear("1");
    setStartDate(new Date().toISOString().split("T")[0]);
    setEndDate("");
    setIsActive(true);
    setAutoSendEmail(true);
    setUfFixingPolicy("LAST_DAY_PREV_MONTH");
    setUfFixingDay("1");
  }, [open, templateId]);

  // Cargar plantilla existente cuando editamos
  React.useEffect(() => {
    if (!open || !templateId) return;
    const ctrl = new AbortController();
    setLoading(true);
    fetch(`/api/finance/billing/recurring/${templateId}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((j) => {
        const t = j?.data;
        if (!t) {
          toast.error("No se pudo cargar la plantilla");
          return;
        }
        setName(t.name ?? "");
        setDteType(String(t.dteType ?? 33));
        setCurrency(t.currency === "UF" ? "UF" : "CLP");
        setReceiverRut(t.receiverRut ?? "");
        setReceiverName(t.receiverName ?? "");
        setReceiverEmail(t.receiverEmail ?? "");
        setReceiverGiro(t.receiverGiro ?? "");
        setReceiverDireccion(t.receiverDireccion ?? "");
        setReceiverComuna(t.receiverComuna ?? "");
        setReceiverCiudad(t.receiverCiudad ?? "");
        setInstallationId(t.installationId ?? "");
        setCcEmailsRaw((t.receiverEmailCc ?? []).join(", "));
        setNotes(t.notes ?? "");
        const linesData: TemplateLine[] = Array.isArray(t.lines) && t.lines.length > 0
          ? (t.lines as Array<Record<string, unknown>>).map((l) => ({
              itemName: String(l.itemName ?? ""),
              description: String(l.description ?? ""),
              quantity: String(l.quantity ?? "1"),
              unit: String(l.unit ?? "UN"),
              unitPrice: String(
                t.currency === "UF" && l.unitPriceUf != null
                  ? l.unitPriceUf
                  : (l.unitPrice ?? ""),
              ),
              discountPct: String(l.discountPct ?? "0"),
              isExempt: !!l.isExempt,
            }))
          : [{ ...EMPTY_LINE }];
        setLines(linesData);
        setAdditionalRefs(
          Array.isArray(t.additionalReferences)
            ? (t.additionalReferences as AdditionalRef[])
            : [],
        );
        setFrequency(t.frequency ?? "monthly");
        setDayOfMonth(t.dayOfMonth != null ? String(t.dayOfMonth) : "1");
        setDayOfWeek(t.dayOfWeek != null ? String(t.dayOfWeek) : "1");
        setMonthOfYear(t.monthOfYear != null ? String(t.monthOfYear) : "1");
        setStartDate(
          t.startDate ? String(t.startDate).split("T")[0] : new Date().toISOString().split("T")[0],
        );
        setEndDate(t.endDate ? String(t.endDate).split("T")[0] : "");
        setIsActive(!!t.isActive);
        setAutoSendEmail(t.autoSendEmail ?? true);
        setUfFixingPolicy(t.ufFixingPolicy ?? "LAST_DAY_PREV_MONTH");
        setUfFixingDay(t.ufFixingDay != null ? String(t.ufFixingDay) : "1");
      })
      .catch(() => {
        toast.error("Error al cargar la plantilla");
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [open, templateId]);

  // Auto-fill direccion/comuna/ciudad desde el customer seleccionado
  React.useEffect(() => {
    if (!customer) return;
    if (!receiverDireccion) setReceiverDireccion(customer.address ?? "");
    if (!receiverComuna) setReceiverComuna(customer.commune ?? "");
    if (!receiverCiudad) setReceiverCiudad(customer.city ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer]);

  // Cargar instalaciones del cliente
  React.useEffect(() => {
    if (!customer) {
      setInstallations([]);
      return;
    }
    const ctrl = new AbortController();
    fetch(
      `/api/finance/billing/customer-installations?accountId=${customer.id}`,
      { signal: ctrl.signal },
    )
      .then((r) => r.json())
      .then((j) => {
        if (j?.success && Array.isArray(j.data)) setInstallations(j.data);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [customer]);

  // Sugerencias CRM cuando hay RUT (autocompletar contactos CC)
  React.useEffect(() => {
    const rut = (customer?.rut || receiverRut).trim();
    if (!rut || rut.length < 8) {
      setCrmSuggestions(null);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/finance/billing/receiver-suggestions?rut=${encodeURIComponent(rut)}`,
          { signal: ctrl.signal },
        );
        if (!res.ok) return;
        const json = await res.json();
        if (json?.data?.account) setCrmSuggestions(json.data);
        else setCrmSuggestions(null);
      } catch {
        // best-effort
      }
    }, 350);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [customer, receiverRut]);

  // ── Handlers de líneas ──
  const updateLine = React.useCallback(
    (index: number, field: keyof TemplateLine, value: string | boolean) => {
      setLines((prev) =>
        prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)),
      );
    },
    [],
  );
  const addLine = React.useCallback(() => {
    setLines((prev) => [...prev, { ...EMPTY_LINE }]);
  }, []);
  const removeLine = React.useCallback((index: number) => {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }, []);

  // ── Total estimado (informativo) ──
  const totalNet = React.useMemo(() => {
    return lines.reduce((sum, l) => {
      const qty = parseFloat(l.quantity) || 0;
      const price = parseFloat(l.unitPrice) || 0;
      const disc = parseFloat(l.discountPct) || 0;
      return sum + qty * price * (1 - disc / 100);
    }, 0);
  }, [lines]);

  // ── Submit ──
  const handleSubmit = async () => {
    const effRut = (customer?.rut || receiverRut).trim();
    const effName = (customer?.name || receiverName).trim();
    const effEmail = (customer?.email || receiverEmail).trim();

    if (!name.trim()) {
      toast.error("El nombre interno de la plantilla es obligatorio");
      return;
    }
    if (!effRut || !effName) {
      toast.error("Tenés que elegir cliente o ingresar RUT y razón social");
      return;
    }
    const validLines = lines.filter(
      (l) => l.itemName.trim() && parseFloat(l.unitPrice) > 0,
    );
    if (validLines.length === 0) {
      toast.error("Tenés que incluir al menos una línea con nombre y precio");
      return;
    }

    // Parsear y validar emails CC
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const ccCandidates = ccEmailsRaw
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const invalidCc = ccCandidates.filter((e) => !EMAIL_RE.test(e));
    if (invalidCc.length > 0) {
      toast.error(`Emails CC inválidos: ${invalidCc.join(", ")}`);
      return;
    }
    const ccEmails = Array.from(
      new Set(ccCandidates.filter((e) => e !== effEmail)),
    );
    if (ccEmails.length > 10) {
      toast.error("Máximo 10 emails CC.");
      return;
    }

    const validRefs = additionalRefs.filter(
      (r) => r.tipoDocRef.trim() && r.folioRef.trim() && r.fchRef,
    );

    const payload: Record<string, unknown> = {
      name: name.trim(),
      isActive,
      dteType: parseInt(dteType, 10),
      receiverRut: effRut,
      receiverName: effName,
      receiverEmail: effEmail || null,
      receiverEmailCc: ccEmails,
      receiverGiro: receiverGiro.trim() || null,
      receiverDireccion: receiverDireccion.trim() || null,
      receiverComuna: receiverComuna.trim() || null,
      receiverCiudad: receiverCiudad.trim() || null,
      crmAccountId: customer?.id ?? null,
      installationId: installationId || null,
      currency,
      lines: validLines.map((l) => {
        const priceNum = parseFloat(l.unitPrice) || 0;
        return {
          itemName: l.itemName.trim(),
          description: l.description.trim() || null,
          quantity: parseFloat(l.quantity) || 1,
          unit: l.unit.trim() || null,
          unitPrice: currency === "UF" ? 0 : priceNum,
          unitPriceUf: currency === "UF" ? priceNum : undefined,
          discountPct: parseFloat(l.discountPct) || 0,
          isExempt: !!l.isExempt,
        };
      }),
      notes: notes.trim() || null,
      additionalReferences: validRefs.length > 0 ? validRefs : undefined,
      frequency,
      dayOfMonth:
        frequency === "monthly" || frequency === "yearly"
          ? parseInt(dayOfMonth, 10)
          : undefined,
      dayOfWeek:
        frequency === "weekly" || frequency === "biweekly"
          ? parseInt(dayOfWeek, 10)
          : undefined,
      monthOfYear: frequency === "yearly" ? parseInt(monthOfYear, 10) : undefined,
      startDate,
      endDate: endDate || undefined,
      autoSendEmail,
      ufFixingPolicy: currency === "UF" ? ufFixingPolicy : "RUN_DAY",
      ufFixingDay:
        currency === "UF" && ufFixingPolicy === "CUSTOM_DAY"
          ? parseInt(ufFixingDay, 10)
          : null,
    };

    setSubmitting(true);
    try {
      const url = isEditing
        ? `/api/finance/billing/recurring/${templateId}`
        : "/api/finance/billing/recurring";
      const method = isEditing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "Error al guardar la plantilla");
      }
      toast.success(isEditing ? "Plantilla actualizada" : "Plantilla creada");
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !submitting && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar plantilla recurrente" : "Nueva plantilla recurrente"}
          </DialogTitle>
          <DialogDescription>
            La plantilla se comporta exactamente como una factura. Cada vez
            que el cron diario corra, generará un borrador con estos datos
            que podrás revisar antes de emitir al SII.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5 py-2">
            {/* ── Nombre interno + tipo + moneda ── */}
            <Card>
              <CardContent className="pt-4 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="t-name">Nombre interno *</Label>
                  <Input
                    id="t-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ej: Servicio Mall Costanera mensual"
                    className="h-10 sm:h-9"
                    autoComplete="off"
                  />
                  <p className="text-[12px] text-muted-foreground">
                    Solo se ve internamente para identificar la plantilla.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Tipo DTE *</Label>
                    <Select value={dteType} onValueChange={setDteType}>
                      <SelectTrigger className="h-10 sm:h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="33">Factura Electrónica (33)</SelectItem>
                        <SelectItem value="34">Factura Exenta (34)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Moneda *</Label>
                    <Select
                      value={currency}
                      onValueChange={(v) => setCurrency(v as "CLP" | "UF")}
                    >
                      <SelectTrigger className="h-10 sm:h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CLP">CLP (pesos)</SelectItem>
                        <SelectItem value="UF">UF</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ── Cliente (CRM o manual) ── */}
            <Card>
              <CardContent className="pt-4 space-y-4">
                <p className="text-sm font-medium">Cliente / Receptor</p>
                <CustomerCombobox
                  value={customer}
                  onChange={setCustomer}
                  manualRut={receiverRut}
                  manualName={receiverName}
                  manualEmail={receiverEmail}
                  onManualChange={(field, value) => {
                    if (field === "rut") setReceiverRut(value);
                    else if (field === "name") setReceiverName(value);
                    else if (field === "email") setReceiverEmail(value);
                  }}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Giro / Actividad</Label>
                    <Input
                      placeholder="Ej: Construcción"
                      value={receiverGiro}
                      onChange={(e) => setReceiverGiro(e.target.value)}
                      maxLength={80}
                      className="h-10 sm:h-9"
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Dirección</Label>
                    <Input
                      placeholder="Av. Apoquindo 4500"
                      value={receiverDireccion}
                      onChange={(e) => setReceiverDireccion(e.target.value)}
                      maxLength={200}
                      className="h-10 sm:h-9"
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Comuna</Label>
                    <Input
                      placeholder="Las Condes"
                      value={receiverComuna}
                      onChange={(e) => setReceiverComuna(e.target.value)}
                      maxLength={80}
                      className="h-10 sm:h-9"
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Ciudad</Label>
                    <Input
                      placeholder="Santiago"
                      value={receiverCiudad}
                      onChange={(e) => setReceiverCiudad(e.target.value)}
                      maxLength={80}
                      className="h-10 sm:h-9"
                      autoComplete="off"
                    />
                  </div>
                </div>

                {customer && installations.length > 0 && (
                  <div className="space-y-1.5 pt-3 border-t">
                    <Label className="text-xs">
                      Instalación / Centro de costo
                    </Label>
                    <Select
                      value={installationId || "NONE"}
                      onValueChange={(v) =>
                        setInstallationId(v === "NONE" ? "" : v)
                      }
                    >
                      <SelectTrigger className="h-10 sm:h-9">
                        <SelectValue placeholder="Sin instalación específica" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NONE">Sin instalación específica</SelectItem>
                        {installations.map((inst) => (
                          <SelectItem key={inst.id} value={inst.id}>
                            {inst.name}
                            {inst.commune && ` · ${inst.commune}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Sugerencias CRM (contactos del account) → tap para CC */}
                {crmSuggestions?.account && crmSuggestions.contacts.length > 0 && (
                  <div className="pt-3 border-t space-y-2">
                    <p className="text-[13px] font-medium">
                      {crmSuggestions.contacts.length} contacto(s) en CRM para{" "}
                      <span className="font-mono">{crmSuggestions.account.rut}</span>
                    </p>
                    <p className="text-[12px] text-muted-foreground">
                      Toca un contacto para agregarlo como CC del envío.
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {crmSuggestions.contacts.map((c) => {
                        const ccArr = ccEmailsRaw
                          .split(/[\s,;]+/)
                          .map((s) => s.trim())
                          .filter(Boolean);
                        const alreadyAdded = ccArr.includes(c.email);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              if (alreadyAdded) {
                                setCcEmailsRaw(
                                  ccArr.filter((e) => e !== c.email).join(", "),
                                );
                              } else {
                                setCcEmailsRaw(
                                  [...ccArr, c.email].filter(Boolean).join(", "),
                                );
                              }
                            }}
                            className={
                              "rounded-full border px-3 py-1.5 text-[12px] transition-colors min-h-[36px] " +
                              (alreadyAdded
                                ? "border-primary/40 bg-primary/15 text-primary"
                                : "border-border bg-muted/30 text-foreground hover:bg-muted/50")
                            }
                          >
                            <span className="font-medium">{c.fullName}</span>
                            <span className="text-muted-foreground"> · {c.email}</span>
                            {c.isPrimary && (
                              <span className="ml-1 text-[11px] uppercase tracking-wide text-primary">
                                principal
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="space-y-1.5 pt-3 border-t">
                  <Label htmlFor="t-cc">Emails CC adicionales (opcional)</Label>
                  <Input
                    id="t-cc"
                    placeholder="contador@cliente.cl, finanzas@cliente.cl"
                    value={ccEmailsRaw}
                    onChange={(e) => setCcEmailsRaw(e.target.value)}
                    className="h-10 sm:h-9"
                    autoComplete="off"
                  />
                  <p className="text-[12px] text-muted-foreground">
                    Separá con coma o espacio. Hasta 10 destinatarios.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* ── Líneas (igual que DteForm) ── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="text-sm font-medium">Detalle de la factura</h3>
                  <p className="text-[12px] text-muted-foreground">
                    Mismas líneas que en una factura normal. Estas líneas se
                    copian a cada borrador generado por el cron.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={addLine}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Agregar línea
                </Button>
              </div>

              {/* Desktop table */}
              <div className="hidden md:block">
                <Card>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/30">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Nombre *</th>
                          <th className="px-3 py-2 text-right font-medium text-muted-foreground w-20">Cant.</th>
                          <th className="px-3 py-2 text-right font-medium text-muted-foreground w-28">
                            Precio {currency === "UF" ? "(UF)" : "(CLP)"} *
                          </th>
                          <th className="px-3 py-2 text-right font-medium text-muted-foreground w-20">Desc.%</th>
                          <th className="px-3 py-2 text-center font-medium text-muted-foreground w-16">Exenta</th>
                          <th className="px-3 py-2 text-right font-medium text-muted-foreground w-28">Subtotal</th>
                          <th className="px-3 py-2 w-10" />
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((line, i) => {
                          const qty = parseFloat(line.quantity) || 0;
                          const price = parseFloat(line.unitPrice) || 0;
                          const disc = parseFloat(line.discountPct) || 0;
                          const subtotal = qty * price * (1 - disc / 100);
                          return (
                            <tr key={i} className="border-b border-border/60 last:border-0">
                              <td className="px-3 py-2">
                                <Input
                                  value={line.itemName}
                                  onChange={(e) => updateLine(i, "itemName", e.target.value)}
                                  className="h-9 text-sm"
                                  placeholder="Servicio mensual"
                                  autoComplete="off"
                                />
                                {line.description !== "" && (
                                  <Input
                                    value={line.description}
                                    onChange={(e) => updateLine(i, "description", e.target.value)}
                                    className="h-8 text-xs mt-1"
                                    placeholder="Descripción opcional"
                                    autoComplete="off"
                                  />
                                )}
                                {line.description === "" && (
                                  <button
                                    type="button"
                                    onClick={() => updateLine(i, "description", " ")}
                                    className="mt-1 text-[12px] text-primary hover:underline"
                                  >
                                    + Agregar descripción
                                  </button>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <Input
                                  type="number"
                                  min={0.01}
                                  step="0.01"
                                  inputMode="decimal"
                                  value={line.quantity}
                                  onChange={(e) => updateLine(i, "quantity", e.target.value)}
                                  className="h-9 text-sm text-right tabular-nums"
                                  autoComplete="off"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <Input
                                  type="number"
                                  min={0}
                                  step={currency === "UF" ? "0.0001" : "1"}
                                  inputMode="decimal"
                                  value={line.unitPrice}
                                  onChange={(e) => updateLine(i, "unitPrice", e.target.value)}
                                  className="h-9 text-sm text-right tabular-nums"
                                  placeholder="0"
                                  autoComplete="off"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <Input
                                  type="number"
                                  min={0}
                                  max={100}
                                  inputMode="decimal"
                                  value={line.discountPct}
                                  onChange={(e) => updateLine(i, "discountPct", e.target.value)}
                                  className="h-9 text-sm text-right tabular-nums"
                                  autoComplete="off"
                                />
                              </td>
                              <td className="px-3 py-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={line.isExempt}
                                  onChange={(e) => updateLine(i, "isExempt", e.target.checked)}
                                  className="size-4"
                                />
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                                {currency === "UF"
                                  ? `${(qty * price * (1 - disc / 100)).toLocaleString("es-CL", { maximumFractionDigits: 4 })} UF`
                                  : fmtCLP.format(Math.round(subtotal))}
                              </td>
                              <td className="px-3 py-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeLine(i)}
                                  className="h-8 w-8 p-0"
                                  disabled={lines.length <= 1}
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                        <tr className="bg-accent/30 font-medium">
                          <td className="px-3 py-2" colSpan={5}>
                            <span className="text-xs">TOTAL NETO ESTIMADO</span>
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                            {currency === "UF"
                              ? `${totalNet.toLocaleString("es-CL", { maximumFractionDigits: 4 })} UF`
                              : fmtCLP.format(Math.round(totalNet))}
                          </td>
                          <td />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-3">
                {lines.map((line, i) => {
                  const qty = parseFloat(line.quantity) || 0;
                  const price = parseFloat(line.unitPrice) || 0;
                  const disc = parseFloat(line.discountPct) || 0;
                  const subtotal = qty * price * (1 - disc / 100);
                  return (
                    <Card key={i}>
                      <CardContent className="p-3 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[12px] font-medium text-muted-foreground">
                            Línea {i + 1}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeLine(i)}
                            className="h-10 w-10 p-0 sm:h-7 sm:w-7"
                            disabled={lines.length <= 1}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                        <Input
                          value={line.itemName}
                          onChange={(e) => updateLine(i, "itemName", e.target.value)}
                          className="h-10 sm:h-9 text-sm"
                          placeholder="Nombre del ítem *"
                          autoComplete="off"
                          autoCorrect="off"
                        />
                        <Input
                          value={line.description}
                          onChange={(e) => updateLine(i, "description", e.target.value)}
                          className="h-10 sm:h-9 text-sm"
                          placeholder="Descripción (opcional)"
                          autoComplete="off"
                        />
                        <div className="grid grid-cols-3 gap-2 min-w-0">
                          <div className="space-y-1">
                            <Label className="text-[12px] uppercase tracking-wide text-muted-foreground">
                              Cant.
                            </Label>
                            <Input
                              type="number"
                              min={0.01}
                              step="0.01"
                              inputMode="decimal"
                              value={line.quantity}
                              onChange={(e) => updateLine(i, "quantity", e.target.value)}
                              className="h-10 sm:h-9 text-sm text-right tabular-nums"
                              autoComplete="off"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[12px] uppercase tracking-wide text-muted-foreground">
                              {currency === "UF" ? "Pr.UF *" : "Precio *"}
                            </Label>
                            <Input
                              type="number"
                              min={0}
                              step={currency === "UF" ? "0.0001" : "1"}
                              inputMode="decimal"
                              value={line.unitPrice}
                              onChange={(e) => updateLine(i, "unitPrice", e.target.value)}
                              className="h-10 sm:h-9 text-sm text-right tabular-nums"
                              autoComplete="off"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[12px] uppercase tracking-wide text-muted-foreground">
                              Desc.%
                            </Label>
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              inputMode="decimal"
                              value={line.discountPct}
                              onChange={(e) => updateLine(i, "discountPct", e.target.value)}
                              className="h-10 sm:h-9 text-sm text-right tabular-nums"
                              autoComplete="off"
                            />
                          </div>
                        </div>
                        <label className="flex items-center gap-2 text-[13px]">
                          <input
                            type="checkbox"
                            checked={line.isExempt}
                            onChange={(e) => updateLine(i, "isExempt", e.target.checked)}
                            className="size-4"
                          />
                          <span>Línea exenta de IVA</span>
                        </label>
                        <div className="text-right text-[13px] font-mono tabular-nums">
                          Subtotal:{" "}
                          <span className="font-medium">
                            {currency === "UF"
                              ? `${subtotal.toLocaleString("es-CL", { maximumFractionDigits: 4 })} UF`
                              : fmtCLP.format(Math.round(subtotal))}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
                <Card>
                  <CardContent className="p-3 text-right font-mono text-sm font-medium tabular-nums">
                    Total neto:{" "}
                    {currency === "UF"
                      ? `${totalNet.toLocaleString("es-CL", { maximumFractionDigits: 4 })} UF`
                      : fmtCLP.format(Math.round(totalNet))}
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* ── Observaciones / Referencias ── */}
            <Card>
              <CardContent className="pt-4 space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="t-notes">Observaciones (opcional)</Label>
                  <Textarea
                    id="t-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Ej: Servicio según contrato firmado el 01/01/2026."
                    rows={2}
                    maxLength={1000}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Referencias adicionales (opcional)</Label>
                      <p className="text-[12px] text-muted-foreground">
                        OC, HES, contrato, etc. Aparecen en cada borrador.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setAdditionalRefs((prev) => [
                          ...prev,
                          { tipoDocRef: "801", folioRef: "", fchRef: "" },
                        ])
                      }
                      disabled={additionalRefs.length >= 30}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Agregar
                    </Button>
                  </div>
                  {additionalRefs.length > 0 && (
                    <div className="space-y-2">
                      {additionalRefs.map((ref, i) => (
                        <div
                          key={i}
                          className="grid grid-cols-1 md:grid-cols-12 gap-2 items-start p-2 rounded-md bg-muted/30 border border-border"
                        >
                          <div className="md:col-span-4">
                            <Label className="text-xs">Tipo</Label>
                            <Select
                              value={ref.tipoDocRef}
                              onValueChange={(v) =>
                                setAdditionalRefs((prev) =>
                                  prev.map((r, idx) => (idx === i ? { ...r, tipoDocRef: v } : r)),
                                )
                              }
                            >
                              <SelectTrigger className="h-10 sm:h-9 text-sm"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="801">801 — Orden de Compra</SelectItem>
                                <SelectItem value="802">802 — Nota de Pedido</SelectItem>
                                <SelectItem value="803">803 — Contrato</SelectItem>
                                <SelectItem value="804">804 — Resolución</SelectItem>
                                <SelectItem value="HES">HES</SelectItem>
                                <SelectItem value="GD">GD — Guía manual</SelectItem>
                                <SelectItem value="52">52 — Guía electrónica</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="md:col-span-4">
                            <Label className="text-xs">Folio / N°</Label>
                            <Input
                              value={ref.folioRef}
                              onChange={(e) =>
                                setAdditionalRefs((prev) =>
                                  prev.map((r, idx) => (idx === i ? { ...r, folioRef: e.target.value } : r)),
                                )
                              }
                              placeholder="PO-2026-0001"
                              className="h-10 sm:h-9 text-sm"
                              autoComplete="off"
                            />
                          </div>
                          <div className="md:col-span-3">
                            <Label className="text-xs">Fecha</Label>
                            <Input
                              type="date"
                              value={ref.fchRef}
                              onChange={(e) =>
                                setAdditionalRefs((prev) =>
                                  prev.map((r, idx) => (idx === i ? { ...r, fchRef: e.target.value } : r)),
                                )
                              }
                              className="h-10 sm:h-9 text-sm"
                            />
                          </div>
                          <div className="md:col-span-1 flex items-end justify-end h-full">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setAdditionalRefs((prev) => prev.filter((_, idx) => idx !== i))
                              }
                              className="h-10 w-10 p-0 sm:h-9 sm:w-9"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* ── Recurrencia ── */}
            <Card className="border-tint-violet-border bg-tint-violet-soft/30">
              <CardContent className="pt-4 space-y-4">
                <div>
                  <p className="text-sm font-medium">Recurrencia</p>
                  <p className="text-[12px] text-muted-foreground">
                    Define cuándo el cron diario genera un borrador con
                    estos datos.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>Frecuencia *</Label>
                    <Select
                      value={frequency}
                      onValueChange={(v) =>
                        setFrequency(v as "monthly" | "biweekly" | "weekly" | "yearly")
                      }
                    >
                      <SelectTrigger className="h-10 sm:h-9 bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">Mensual</SelectItem>
                        <SelectItem value="biweekly">Quincenal</SelectItem>
                        <SelectItem value="weekly">Semanal</SelectItem>
                        <SelectItem value="yearly">Anual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {(frequency === "monthly" || frequency === "yearly") && (
                    <div className="space-y-1.5">
                      <Label htmlFor="t-dom">Día del mes *</Label>
                      <Input
                        id="t-dom"
                        type="number"
                        min={-1}
                        max={31}
                        inputMode="numeric"
                        value={dayOfMonth}
                        onChange={(e) => setDayOfMonth(e.target.value)}
                        placeholder="1, 15, -1 (último)"
                        className="h-10 sm:h-9 bg-background"
                        autoComplete="off"
                      />
                      <p className="text-[12px] text-muted-foreground">
                        Usá -1 para "último día del mes".
                      </p>
                    </div>
                  )}

                  {(frequency === "weekly" || frequency === "biweekly") && (
                    <div className="space-y-1.5">
                      <Label>Día de la semana *</Label>
                      <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
                        <SelectTrigger className="h-10 sm:h-9 bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">Lunes</SelectItem>
                          <SelectItem value="2">Martes</SelectItem>
                          <SelectItem value="3">Miércoles</SelectItem>
                          <SelectItem value="4">Jueves</SelectItem>
                          <SelectItem value="5">Viernes</SelectItem>
                          <SelectItem value="6">Sábado</SelectItem>
                          <SelectItem value="0">Domingo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {frequency === "yearly" && (
                    <div className="space-y-1.5">
                      <Label>Mes *</Label>
                      <Select value={monthOfYear} onValueChange={setMonthOfYear}>
                        <SelectTrigger className="h-10 sm:h-9 bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[
                            "Enero",
                            "Febrero",
                            "Marzo",
                            "Abril",
                            "Mayo",
                            "Junio",
                            "Julio",
                            "Agosto",
                            "Septiembre",
                            "Octubre",
                            "Noviembre",
                            "Diciembre",
                          ].map((m, idx) => (
                            <SelectItem key={idx} value={String(idx + 1)}>
                              {m}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="t-start">Empieza el *</Label>
                    <Input
                      id="t-start"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="h-10 sm:h-9 bg-background"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="t-end">Termina el (opcional)</Label>
                    <Input
                      id="t-end"
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="h-10 sm:h-9 bg-background"
                    />
                    <p className="text-[12px] text-muted-foreground">
                      Dejá vacío si la plantilla corre indefinidamente.
                    </p>
                  </div>
                </div>

                {currency === "UF" && (
                  <div className="rounded-md border border-status-info-border bg-status-info-soft p-3 space-y-2">
                    <p className="text-[13px] font-medium text-status-info-fg">
                      Política de fijación de UF
                    </p>
                    <p className="text-[12px] text-status-info-fg/80">
                      Define qué UF se usa para convertir a CLP cuando el cron
                      genera el borrador. Una vez generado, el monto en CLP queda
                      congelado.
                    </p>
                    <Select
                      value={ufFixingPolicy}
                      onValueChange={(v) =>
                        setUfFixingPolicy(
                          v as
                            | "RUN_DAY"
                            | "LAST_DAY_PREV_MONTH"
                            | "FIRST_DAY_MONTH"
                            | "LAST_DAY_MONTH"
                            | "CUSTOM_DAY",
                        )
                      }
                    >
                      <SelectTrigger className="h-10 sm:h-9 bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="LAST_DAY_PREV_MONTH">
                          UF del último día del mes anterior (recomendado)
                        </SelectItem>
                        <SelectItem value="FIRST_DAY_MONTH">
                          UF del primer día del mes en curso
                        </SelectItem>
                        <SelectItem value="LAST_DAY_MONTH">
                          UF del último día del mes en curso
                        </SelectItem>
                        <SelectItem value="RUN_DAY">UF del día de generación</SelectItem>
                        <SelectItem value="CUSTOM_DAY">UF de un día específico del mes</SelectItem>
                      </SelectContent>
                    </Select>
                    {ufFixingPolicy === "CUSTOM_DAY" && (
                      <div className="space-y-1.5">
                        <Label htmlFor="t-uf-day">Día del mes para tomar UF</Label>
                        <Input
                          id="t-uf-day"
                          type="number"
                          min={1}
                          max={31}
                          inputMode="numeric"
                          value={ufFixingDay}
                          onChange={(e) => setUfFixingDay(e.target.value)}
                          className="h-10 sm:h-9 bg-background"
                          autoComplete="off"
                        />
                      </div>
                    )}
                  </div>
                )}

                <label className="flex items-start gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="mt-0.5 size-4"
                  />
                  <span>
                    Plantilla activa (si la pausás, el cron no genera borradores
                    pero la plantilla se conserva).
                  </span>
                </label>

                <label className="flex items-start gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    checked={autoSendEmail}
                    onChange={(e) => setAutoSendEmail(e.target.checked)}
                    className="mt-0.5 size-4"
                  />
                  <span>
                    Enviar email automáticamente al receptor cuando emita el
                    borrador (podés desmarcar después en cada emisión).
                  </span>
                </label>
              </CardContent>
            </Card>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || loading}>
            {submitting ? (
              <Loader2 className="size-4 animate-spin mr-1.5" />
            ) : (
              <Save className="size-4 mr-1.5" />
            )}
            {isEditing ? "Guardar cambios" : "Crear plantilla"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
