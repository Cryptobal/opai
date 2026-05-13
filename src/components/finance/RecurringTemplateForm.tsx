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
import { DteAttachmentsCard } from "./DteAttachmentsCard";
import {
  LineDetailSurface,
  computeLineSubtotal,
  lineDiscountToPct,
  type LineDetailValue,
  type DiscountKind,
} from "./_LineDetailSurface";
import {
  buildContext,
  type PlaceholderContext,
} from "@/modules/finance/billing/placeholders";
import { formatCLP, formatUFSuffix } from "@/lib/utils";

const fmtCLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  minimumFractionDigits: 0,
});

type TemplateLine = LineDetailValue;

interface AdditionalRef {
  tipoDocRef: string;
  folioRef: string;
  fchRef: string;
  razonRef: string;
}

const EMPTY_LINE: TemplateLine = {
  itemName: "",
  description: "",
  quantity: "1",
  unit: "UN",
  unitPrice: "",
  discountKind: "PCT",
  discountValue: "0",
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
  const [autoSendProforma, setAutoSendProforma] = React.useState(false);
  const [autoSendPaymentStatement, setAutoSendPaymentStatement] = React.useState(false);

  // ── UF policy (solo si currency=UF) ──
  const [ufFixingPolicy, setUfFixingPolicy] = React.useState<
    "RUN_DAY" | "LAST_DAY_PREV_MONTH" | "FIRST_DAY_MONTH" | "LAST_DAY_MONTH" | "CUSTOM_DAY"
  >("LAST_DAY_PREV_MONTH");
  const [ufFixingDay, setUfFixingDay] = React.useState("1");

  // ── Period policy: cómo se resuelve {{periodo}} en cada run del cron.
  // Default CURRENT_MONTH = factura por adelantado (común en CL).
  const [periodPolicy, setPeriodPolicy] = React.useState<
    "CURRENT_MONTH" | "PREVIOUS_MONTH" | "NEXT_MONTH"
  >("CURRENT_MONTH");

  // UF actual (informativa) — solo para mostrar la previsualización de
  // {{uf_valor}} en el picker. La UF real al run la define ufFixingPolicy.
  const [ufNow, setUfNow] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (currency !== "UF") {
      setUfNow(null);
      return;
    }
    const ctrl = new AbortController();
    fetch("/api/fx/uf", { signal: ctrl.signal })
      .then((r) => r.json())
      .then((j) => {
        const v = j?.data?.value ?? j?.value;
        if (typeof v === "number") setUfNow(v);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [currency]);

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
    setAutoSendProforma(false);
    setAutoSendPaymentStatement(false);
    setUfFixingPolicy("LAST_DAY_PREV_MONTH");
    setUfFixingDay("1");
    setPeriodPolicy("CURRENT_MONTH");
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
          ? (t.lines as Array<Record<string, unknown>>).map((l) => {
              // Si la plantilla guardó kind=AMOUNT (intención `$`), lo
              // restauramos exactamente como lo tipeó el usuario. Si no,
              // caemos al discountPct (PCT por default).
              const kind: DiscountKind =
                l.discountKind === "AMOUNT" ? "AMOUNT" : "PCT";
              const value =
                kind === "AMOUNT"
                  ? String(l.discountAmount ?? "0")
                  : String(l.discountPct ?? "0");
              return {
                itemName: String(l.itemName ?? ""),
                description: String(l.description ?? ""),
                quantity: String(l.quantity ?? "1"),
                unit: String(l.unit ?? "UN"),
                unitPrice: String(
                  t.currency === "UF" && l.unitPriceUf != null
                    ? l.unitPriceUf
                    : (l.unitPrice ?? ""),
                ),
                discountKind: kind,
                discountValue: value,
                isExempt: !!l.isExempt,
              };
            })
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
        setAutoSendProforma(!!t.autoSendProforma);
        setAutoSendPaymentStatement(!!t.autoSendPaymentStatement);
        setUfFixingPolicy(t.ufFixingPolicy ?? "LAST_DAY_PREV_MONTH");
        setUfFixingDay(t.ufFixingDay != null ? String(t.ufFixingDay) : "1");
        setPeriodPolicy(t.periodPolicy ?? "CURRENT_MONTH");
      })
      .catch(() => {
        toast.error("Error al cargar la plantilla");
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [open, templateId]);

  // Auto-fill direccion/comuna/ciudad/giro desde el customer seleccionado.
  // Para el giro caemos al `industry` del CRM cuando `giro` está vacío
  // — eso al menos llena algo razonable hasta que actualicen la ficha.
  React.useEffect(() => {
    if (!customer) return;
    if (!receiverDireccion) setReceiverDireccion(customer.address ?? "");
    if (!receiverComuna) setReceiverComuna(customer.commune ?? "");
    if (!receiverCiudad) setReceiverCiudad(customer.city ?? "");
    if (!receiverGiro) {
      const giroFromCrm = (customer.giro ?? "").trim();
      const industryFromCrm = (customer.industry ?? "").trim();
      setReceiverGiro(giroFromCrm || industryFromCrm);
    }
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
    (index: number, partial: Partial<TemplateLine>) => {
      setLines((prev) =>
        prev.map((l, i) => (i === index ? { ...l, ...partial } : l)),
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
    return lines.reduce((sum, l) => sum + computeLineSubtotal(l), 0);
  }, [lines]);

  /**
   * Contexto del resolver de placeholders para previsualización en el
   * picker y para la "Vista previa" debajo de los textareas. Refleja
   * cómo se resolverían los tokens si el cron corriera HOY:
   *   - Período según `periodPolicy` aplicada al día actual.
   *   - UF: la del día (valor informativo). En runs reales la UF la
   *     elige `ufFixingPolicy`.
   *   - Cliente: receptor manual o del CRM.
   *   - Instalación: nombre de la elegida.
   *
   * En modo "literal" del picker (plantillas), se inserta `{{token}}`
   * y este ctx solo se usa para mostrar el valor de ejemplo a la
   * derecha de cada item del menú.
   */
  const placeholderCtx: PlaceholderContext = React.useMemo(() => {
    const installationName =
      installations.find((i) => i.id === installationId)?.name ?? null;
    const today = new Date();
    return {
      ...buildContext({
        periodPolicy,
        runDate: today,
        uf:
          currency === "UF" && ufNow != null
            ? {
                value: ufNow,
                date: new Date(
                  Date.UTC(
                    today.getUTCFullYear(),
                    today.getUTCMonth(),
                    today.getUTCDate(),
                  ),
                ),
              }
            : null,
        cliente: (customer?.name || receiverName || "").trim(),
        instalacion: installationName,
        currency: currency === "UF" ? "UF" : "CLP",
      }),
    };
  }, [
    installations,
    installationId,
    currency,
    ufNow,
    customer?.name,
    receiverName,
    periodPolicy,
  ]);

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

    // Razón / glosa dejó de ser obligatoria (la UI ya no la expone).
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
        // Persistencia híbrida del descuento (opción C):
        //   - Para kind=AMOUNT, guardamos kind+amount en el JSON para
        //     preservar la intención del usuario entre runs.
        //   - El `discountPct` que viaja al schema y BD es el efectivo
        //     calculado contra el bruto del momento — el cron lo recalcula
        //     en cada run según el monto vigente.
        const kind = l.discountKind;
        const discountAmountNum =
          kind === "AMOUNT" ? parseFloat(l.discountValue) || 0 : undefined;
        return {
          itemName: l.itemName.trim(),
          // Description: NO trim para preservar saltos de línea SII permite
          // hasta 1000 caracteres en <DscItem> con \n.
          description: l.description.length > 0 ? l.description : null,
          quantity: parseFloat(l.quantity) || 1,
          unit: l.unit.trim() || null,
          unitPrice: currency === "UF" ? 0 : priceNum,
          unitPriceUf: currency === "UF" ? priceNum : undefined,
          discountPct: lineDiscountToPct(l),
          discountKind: kind,
          discountAmount: discountAmountNum,
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
      autoSendProforma,
      autoSendPaymentStatement,
      ufFixingPolicy: currency === "UF" ? ufFixingPolicy : "RUN_DAY",
      ufFixingDay:
        currency === "UF" && ufFixingPolicy === "CUSTOM_DAY"
          ? parseInt(ufFixingDay, 10)
          : null,
      periodPolicy,
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
      <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-y-auto">
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

                {/* Banner: el SII exige Giro/Ciudad en el bloque
                    <Receptor> de facturas 33/34. Si el customer está
                    seleccionado pero le faltan datos, lo avisamos para
                    que el usuario lo complete antes de que el cron
                    genere borradores con datos por defecto. */}
                {customer && (() => {
                  const missing: string[] = [];
                  // Giro estricto: industry NO califica para SII (es un
                  // sector comercial interno). Solo silenciamos el banner
                  // si el usuario ya editó el campo manualmente.
                  if (!customer.giro && !receiverGiro.trim()) missing.push("Giro");
                  if (!customer.city && !receiverCiudad.trim()) missing.push("Ciudad");
                  if (missing.length === 0) return null;
                  return (
                    <div className="rounded-md border border-status-warn-border bg-status-warn-soft p-3 text-xs">
                      <p className="font-semibold text-status-warn-fg">
                        Faltan datos del cliente para SII: {missing.join(" y ")}
                      </p>
                      <p className="text-status-warn-fg/80 mt-1">
                        El SII los exige en facturas 33/34. Completalos
                        manualmente abajo o, mejor, en la ficha CRM del
                        cliente para que se sincronicen en cada run del cron.
                      </p>
                    </div>
                  );
                })()}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Giro / Actividad</Label>
                    <Input
                      placeholder="Ej: Construcción"
                      value={receiverGiro}
                      onChange={(e) => setReceiverGiro(e.target.value)}
                      maxLength={200}
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

              {/* Surface por línea (desktop + mobile, mismo layout). En
                  modo "literal" el picker de placeholders inserta
                  `{{token}}` y el cron resuelve en cada run. */}
              <div className="space-y-3">
                {lines.map((line, i) => {
                  const subtotal = computeLineSubtotal(line);
                  const subtotalFormatted =
                    currency === "UF"
                      ? formatUFSuffix(subtotal)
                      : formatCLP(Math.round(subtotal));
                  return (
                    <LineDetailSurface
                      key={i}
                      index={i}
                      value={line}
                      onChange={(partial) => updateLine(i, partial)}
                      onRemove={() => removeLine(i)}
                      canRemove={lines.length > 1}
                      currency={currency}
                      placeholderMode="literal"
                      placeholderContext={placeholderCtx}
                      showExempt
                      subtotalFormatted={subtotalFormatted}
                    />
                  );
                })}
                <Card>
                  <CardContent className="p-3 text-right font-mono text-sm font-medium tabular-nums">
                    Total neto estimado:{" "}
                    {currency === "UF"
                      ? formatUFSuffix(totalNet)
                      : formatCLP(Math.round(totalNet))}
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* ── Observaciones ── */}
            <Card>
              <CardContent className="pt-4 space-y-1.5">
                <Label htmlFor="t-notes">Observaciones (opcional)</Label>
                <Textarea
                  id="t-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ej: Servicio según contrato firmado el 01/01/2026."
                  rows={2}
                  maxLength={1000}
                />
                <p className="text-[12px] text-muted-foreground">
                  Soporta los mismos placeholders de las líneas
                  (<code>{`{{periodo}}`}</code>, <code>{`{{uf_valor}}`}</code>,
                  etc.). Se resuelven en cada run del cron.
                </p>
              </CardContent>
            </Card>

            {/* ── Referencias adicionales (OC, HES, Contrato, etc) ── */}
            <Card>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <h3 className="text-sm font-medium">Referencias (opcional)</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Asocia cada borrador generado a documentos del cliente:
                      Orden de Compra, HES, Contrato, etc. Se imprimen en el
                      PDF y van al SII.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setAdditionalRefs((prev) => [
                        ...prev,
                        { tipoDocRef: "801", folioRef: "", fchRef: "", razonRef: "" },
                      ])
                    }
                    disabled={additionalRefs.length >= 30}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Agregar referencia
                  </Button>
                </div>

                {additionalRefs.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">
                    Sin referencias. Click en &quot;Agregar referencia&quot; para
                    vincular OC, HES, etc.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {additionalRefs.map((ref, i) => (
                      <div
                        key={i}
                        className="grid grid-cols-1 md:grid-cols-12 gap-2 items-start p-2 rounded-md bg-muted/30 border border-border"
                      >
                          <div className="md:col-span-3">
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
                          <div className="md:col-span-5">
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

                {/* Política de período: cómo resolver `{{periodo}}` y
                    derivados al generar el borrador. Default
                    CURRENT_MONTH = factura por adelantado (común en CL). */}
                <div className="rounded-md border border-status-info-border bg-status-info-soft p-3 space-y-2">
                  <p className="text-[13px] font-medium text-status-info-fg">
                    Política de período (placeholder {`{{periodo}}`})
                  </p>
                  <p className="text-[12px] text-status-info-fg/80">
                    Define qué mes mostrarán los placeholders <code>{`{{periodo}}`}</code>,{" "}
                    <code>{`{{periodo_mes}}`}</code> y derivados cuando el cron
                    genere cada borrador. Solo aplica si tus líneas usan estos
                    placeholders.
                  </p>
                  <Select
                    value={periodPolicy}
                    onValueChange={(v) =>
                      setPeriodPolicy(
                        v as "CURRENT_MONTH" | "PREVIOUS_MONTH" | "NEXT_MONTH",
                      )
                    }
                  >
                    <SelectTrigger className="h-10 sm:h-9 bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CURRENT_MONTH">
                        Mes en curso (factura por adelantado, recomendado)
                      </SelectItem>
                      <SelectItem value="PREVIOUS_MONTH">
                        Mes anterior (factura vencida)
                      </SelectItem>
                      <SelectItem value="NEXT_MONTH">
                        Mes siguiente (casos especiales)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

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

                <label className="flex items-start gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    checked={autoSendProforma}
                    onChange={(e) => setAutoSendProforma(e.target.checked)}
                    className="mt-0.5 size-4"
                  />
                  <span>
                    Enviar <strong>proforma</strong> al receptor cuando el cron
                    genere el borrador (antes de emitir la factura al SII).
                  </span>
                </label>

                <label className="flex items-start gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    checked={autoSendPaymentStatement}
                    onChange={(e) =>
                      setAutoSendPaymentStatement(e.target.checked)
                    }
                    className="mt-0.5 size-4"
                  />
                  <span>
                    Enviar <strong>estado de pago</strong> al receptor cuando el
                    cron genere el borrador.
                  </span>
                </label>
              </CardContent>
            </Card>

            {/* Adjuntos de la plantilla: solo disponibles al editar (necesita id).
                Se copian a cada borrador generado y viajan en el correo de envío. */}
            {isEditing && templateId ? (
              <DteAttachmentsCard
                baseUrl={`/api/finance/billing/recurring/${templateId}/attachments`}
                helpText="Estos archivos se copiarán a cada borrador que genere la plantilla y viajarán en el correo cuando se emita. PDF, JPG, PNG, WebP, GIF · máx 10 MB."
              />
            ) : (
              <Card className="border-dashed">
                <CardContent className="p-4 text-xs text-muted-foreground">
                  Para adjuntar archivos a la plantilla, créala primero. Después podrás subir archivos editándola.
                </CardContent>
              </Card>
            )}
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
