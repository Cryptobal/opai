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
import { ContactsMultiSelect } from "@/components/finance/recurring/ContactsMultiSelect";
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
import { normalizeEmailAddress, normalizeEmailList } from "@/lib/email-address";

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

/** CC del receptor: mismo criterio que envío/email (RFC: local case-insensitive para ASCII). */
function parseCcEmailsFromRaw(raw: string): string[] {
  const tokens = raw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return normalizeEmailList(tokens);
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
  priceCurrency: "CLP",
};

interface Props {
  open: boolean;
  /** Si viene un id, el form opera en modo edición. */
  templateId?: string | null;
  /**
   * Si se setea, al terminar la carga inicial el form scrollea suavemente a
   * la sección indicada. Útil para deep-linkear desde el banner de errores
   * de auto-envío ("Corregir destinatarios").
   */
  initialScrollTo?: "recipients" | null;
  onClose: () => void;
  onSaved: () => void;
}

export function RecurringTemplateForm({
  open,
  templateId,
  initialScrollTo,
  onClose,
  onSaved,
}: Props) {
  const isEditing = !!templateId;

  // ── Estado de carga inicial cuando editamos ──
  const [loading, setLoading] = React.useState(false);

  // ── Datos básicos ──
  const [name, setName] = React.useState("");
  const [dteType, setDteType] = React.useState("33");
  // La plantilla SIEMPRE emite el DTE en CLP. La moneda se decide por
  // línea (ver `priceCurrency` en cada `LineDetailValue`). Mantenemos el
  // campo `currency` en el state por compat con BD/zod, pero el form ya
  // no lo expone como selector. Las plantillas viejas con `currency=UF`
  // se "migran" en caliente al guardar: el form rehidrata cada línea
  // con `priceCurrency="UF"` si la plantilla está en UF y la línea no lo
  // declaraba explícitamente, y al guardar forzamos `currency=CLP`.
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
  // Contrato (Document) opcional — al borrarlo, esta plantilla queda inactiva.
  const [contractDocumentId, setContractDocumentId] = React.useState<string>("");
  const [contracts, setContracts] = React.useState<
    { id: string; name: string; status: string | null }[]
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

  // ¿Hay al menos una línea con moneda UF? Decide si renderizamos la
  // política UF + si pedimos `ufNow` para previsualización de tokens.
  // Lo declaramos acá arriba porque el effect que carga ufNow depende
  // de este valor.
  const hasUfLine = React.useMemo(
    () => lines.some((l) => l.priceCurrency === "UF"),
    [lines],
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
  const [recipientContactIds, setRecipientContactIds] = React.useState<string[]>([]);

  // ── UF policy (solo si currency=UF) ──
  const [ufFixingPolicy, setUfFixingPolicy] = React.useState<
    "RUN_DAY" | "LAST_DAY_PREV_MONTH" | "FIRST_DAY_MONTH" | "LAST_DAY_MONTH" | "CUSTOM_DAY"
  >("LAST_DAY_MONTH");
  const [ufFixingDay, setUfFixingDay] = React.useState("1");

  // ── Period policy: cómo se resuelve {{periodo}} en cada run del cron.
  // Default CURRENT_MONTH = factura por adelantado (común en CL).
  const [periodPolicy, setPeriodPolicy] = React.useState<
    "CURRENT_MONTH" | "PREVIOUS_MONTH" | "NEXT_MONTH"
  >("CURRENT_MONTH");

  // ── Reajuste IPC (modo manual con alerta) ──
  // No modifica montos: el cron solo AVISA cuando se acerca la fecha de
  // reajuste para que el usuario ingrese el % real editando la plantilla.
  const [hasIpcAdjustment, setHasIpcAdjustment] = React.useState(false);
  const [ipcAdjustmentMonths, setIpcAdjustmentMonths] = React.useState("12");
  const [ipcStartDate, setIpcStartDate] = React.useState("");

  // UF actual (informativa) — solo para mostrar la previsualización de
  // {{uf_valor}} en el picker. La UF real al run la define
  // `ufFixingPolicy`. Carga lazy cuando hay al menos una línea UF;
  // mantiene el valor en caché entre toggles para no re-fetchear cada
  // vez que el usuario alterna CLP↔UF en una línea.
  const [ufNow, setUfNow] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!hasUfLine || ufNow != null) return;
    const ctrl = new AbortController();
    fetch("/api/fx/uf", { signal: ctrl.signal })
      .then((r) => r.json())
      .then((j) => {
        const v = j?.data?.value ?? j?.value;
        if (typeof v === "number") setUfNow(v);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [hasUfLine, ufNow]);

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
    setContractDocumentId("");
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
    setRecipientContactIds([]);
    setUfFixingPolicy("LAST_DAY_MONTH");
    setUfFixingDay("1");
    setPeriodPolicy("CURRENT_MONTH");
  }, [open, templateId]);

  // Cargar plantilla existente cuando editamos
  React.useEffect(() => {
    if (!open || !templateId) return;
    const ctrl = new AbortController();
    setLoading(true);
    fetch(`/api/finance/billing/recurring/${templateId}`, { signal: ctrl.signal })
      .then(async (r) => ({ status: r.status, body: await r.json() }))
      .then(({ status, body }) => {
        const t = body?.data;
        if (!t) {
          // 404 = la plantilla ya no existe (eliminada / nunca persistió).
          // Cerramos el modal en vez de dejar al usuario rellenar un form
          // fantasma que va a fallar al hacer PATCH.
          if (status === 404) {
            toast.error(
              "Esta plantilla ya no existe (puede haber sido eliminada). Creá una nueva.",
            );
            onClose();
            return;
          }
          toast.error(body?.error ?? "No se pudo cargar la plantilla");
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
        setContractDocumentId(t.contractDocumentId ?? "");
        // Reconstruimos el `customer` cuando la plantilla referencia un
        // CRM account, así el form muestra la tarjeta verde del receptor
        // (y NO la vista vacía "Buscar cliente del CRM…") al editar.
        // Sin esto, el usuario debía re-elegir el cliente cada vez que
        // abría una plantilla existente — y peor: por el bug histórico
        // de state-leak (resuelto vía `key` en el padre), terminaba
        // arrastrando al receptor de la plantilla anterior.
        if (t.crmAccountId && t.receiverName) {
          setCustomer({
            id: t.crmAccountId,
            name: t.receiverName,
            displayName: t.receiverName,
            rut: t.receiverRut ?? "",
            email: t.receiverEmail ?? null,
            address: t.receiverDireccion ?? null,
            commune: t.receiverComuna ?? null,
            city: t.receiverCiudad ?? null,
            giro: t.receiverGiro ?? null,
            industry: null,
          });
        } else {
          setCustomer(null);
        }
        setCcEmailsRaw(normalizeEmailList(t.receiverEmailCc ?? []).join(", "));
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
              // Resolución de moneda POR LÍNEA:
              //   1) Si la línea declara `priceCurrency` (formato nuevo)
              //      la respetamos tal cual.
              //   2) Si no, inferimos por compat: plantilla en UF o
              //      línea con `unitPriceUf` → "UF"; resto → "CLP".
              // Así una plantilla legacy con `template.currency=UF` se
              // rehidrata con cada línea marcada UF.
              const declared = l.priceCurrency as
                | "CLP"
                | "UF"
                | undefined;
              const inferredCurrency: "CLP" | "UF" =
                declared ??
                (t.currency === "UF" || l.unitPriceUf != null
                  ? "UF"
                  : "CLP");
              const displayPrice =
                inferredCurrency === "UF"
                  ? (l.unitPriceUf ?? "")
                  : (l.unitPrice ?? "");
              return {
                itemName: String(l.itemName ?? ""),
                description: String(l.description ?? ""),
                quantity: String(l.quantity ?? "1"),
                unit: String(l.unit ?? "UN"),
                unitPrice: String(displayPrice),
                discountKind: kind,
                discountValue: value,
                isExempt: !!l.isExempt,
                priceCurrency: inferredCurrency,
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
        setRecipientContactIds(
          Array.isArray(t.recipientContactIds) ? t.recipientContactIds : [],
        );
        setUfFixingPolicy(t.ufFixingPolicy ?? "LAST_DAY_MONTH");
        setUfFixingDay(t.ufFixingDay != null ? String(t.ufFixingDay) : "1");
        setPeriodPolicy(t.periodPolicy ?? "CURRENT_MONTH");
        setHasIpcAdjustment(!!t.hasIpcAdjustment);
        setIpcAdjustmentMonths(
          t.ipcAdjustmentMonths != null ? String(t.ipcAdjustmentMonths) : "12",
        );
        setIpcStartDate(
          t.ipcStartDate ? String(t.ipcStartDate).split("T")[0] : "",
        );
      })
      .catch(() => {
        toast.error("Error al cargar la plantilla");
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [open, templateId]);

  // Si el caller pidió scrollear a una sección, lo hacemos cuando la carga
  // inicial termina y el DOM está pintado. Pequeño delay para que el modal
  // termine la animación de entrada antes de medir offset.
  React.useEffect(() => {
    if (!open || loading || !initialScrollTo) return;
    const id = `section-${initialScrollTo}`;
    const handle = window.setTimeout(() => {
      document
        .getElementById(id)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 250);
    return () => window.clearTimeout(handle);
  }, [open, loading, initialScrollTo]);

  // Auto-fill direccion/comuna/ciudad/giro/email desde el customer
  // seleccionado. Para el giro caemos al `industry` del CRM cuando
  // `giro` está vacío. El email viene del contacto primario del CRM
  // (lo resuelve `customer-search`) — sin esto, el operador veía la
  // plantilla "sin email" y se confundía aunque el cron sí usara el
  // del CRM en el submit (fallback `customer?.email || receiverEmail`).
  React.useEffect(() => {
    if (!customer) return;
    if (!receiverDireccion) setReceiverDireccion(customer.address ?? "");
    if (!receiverComuna) setReceiverComuna(customer.commune ?? "");
    if (!receiverCiudad) setReceiverCiudad(customer.city ?? "");
    if (!receiverEmail && customer.email) setReceiverEmail(customer.email);
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

  // Cargar contratos del cliente (Documents categoría contrato_*). Si el
  // cliente cambia y el contrato seleccionado no pertenece al nuevo cliente
  // → limpiar la selección.
  React.useEffect(() => {
    if (!customer) {
      setContracts([]);
      return;
    }
    const ctrl = new AbortController();
    fetch(`/api/crm/accounts/${customer.id}/contracts`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((j) => {
        if (j?.success && Array.isArray(j.data)) {
          const list = (j.data as Array<{ id: string; name?: string | null; title?: string | null; fileName?: string | null; status?: string | null }>).map(
            (d) => ({
              id: d.id,
              name: d.title || d.name || d.fileName || "(sin nombre)",
              status: d.status ?? null,
            }),
          );
          setContracts(list);
        }
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [customer]);

  // Si el contrato seleccionado no está en la lista actual, lo limpiamos.
  React.useEffect(() => {
    if (!contractDocumentId) return;
    if (contracts.length === 0) return;
    if (!contracts.some((c) => c.id === contractDocumentId)) {
      setContractDocumentId("");
    }
  }, [contracts, contractDocumentId]);

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

  // ── Totales estimados (informativos) ──
  // Mantenemos dos buckets (CLP + UF) en vez de un único total: las
  // líneas pueden tener distintas monedas y sumarlas en bruto da un
  // número mentiroso. El CLP final se realiza en el cron al multiplicar
  // unitPriceUf × UF del momento.
  const totals = React.useMemo(() => {
    let clp = 0;
    let uf = 0;
    for (const l of lines) {
      const subtotal = computeLineSubtotal(l);
      if ((l.priceCurrency ?? "CLP") === "UF") uf += subtotal;
      else clp += subtotal;
    }
    return { clp, uf };
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
        // Pasamos UF al contexto cuando hay al menos una línea UF.
        // Cada línea decide su moneda efectiva en `_LineDetailSurface`,
        // pero el `uf` debe estar disponible para que el picker resuelva
        // {{uf_valor}}/{{uf_fecha}} en líneas UF.
        uf:
          hasUfLine && ufNow != null
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
        // Currency a nivel ctx queda CLP (la plantilla emite en CLP).
        // El override por línea (UF) lo hace _LineDetailSurface.
        currency: "CLP",
      }),
    };
  }, [
    installations,
    installationId,
    hasUfLine,
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
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
    const ccCandidates = ccEmailsRaw
      .split(/[\s,;]+/)
      .map((s) => normalizeEmailAddress(s))
      .filter(Boolean);
    const invalidCc = ccCandidates.filter((e) => !EMAIL_RE.test(e));
    if (invalidCc.length > 0) {
      toast.error(`Emails CC inválidos: ${invalidCc.join(", ")}`);
      return;
    }
    // No filtramos CC igual al mail del cliente: mismo correo suele estar en
    // varios contactos CRM y el usuario puede querer persistir esa copia
    // explícita; el envío SMTP deduplica donde haga falta.
    const mergedCc = normalizeEmailList(ccCandidates);
    const ccEmails = mergedCc;
    if (ccEmails.length > 10) {
      toast.error("Máximo 10 emails CC.");
      return;
    }

    if (autoSendProforma || autoSendPaymentStatement) {
      if (!customer?.id) {
        toast.error(
          "Vinculá la plantilla a un cliente CRM para usar envío automático.",
        );
        return;
      }
      if (recipientContactIds.length === 0) {
        toast.error(
          "Seleccioná al menos un contacto para enviar proforma o estado de pago.",
        );
        return;
      }
    }

    // Razón / glosa dejó de ser obligatoria (la UI ya no la expone).
    const validRefs = additionalRefs
      .filter((r) => r.tipoDocRef.trim())
      .map((r) => ({
        tipoDocRef: r.tipoDocRef.trim(),
        folioRef: r.folioRef.trim(),
        fchRef: r.fchRef.trim(),
        razonRef: (r.razonRef ?? "").trim(),
      }));

    const payload: Record<string, unknown> = {
      name: name.trim(),
      isActive,
      dteType: parseInt(dteType, 10),
      receiverRut: effRut,
      receiverName: effName,
      receiverEmail:
        effEmail.length > 0 ? normalizeEmailAddress(effEmail) : null,
      receiverEmailCc: ccEmails,
      receiverGiro: receiverGiro.trim() || null,
      receiverDireccion: receiverDireccion.trim() || null,
      receiverComuna: receiverComuna.trim() || null,
      receiverCiudad: receiverCiudad.trim() || null,
      crmAccountId: customer?.id ?? null,
      installationId: installationId || null,
      contractDocumentId: contractDocumentId || null,
      // La plantilla siempre persiste como CLP. La moneda real viaja por
      // línea en `priceCurrency`. Plantillas legacy con `currency=UF` se
      // migran al guardar (la hidratación marcó cada línea con
      // priceCurrency="UF" y acá el global queda en CLP).
      currency: "CLP",
      lines: validLines.map((l) => {
        const priceNum = parseFloat(l.unitPrice) || 0;
        const linePc: "CLP" | "UF" = l.priceCurrency ?? "CLP";
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
          // En modo UF por línea, `unitPrice` (CLP) queda en 0 — el cron
          // lo calcula al generar el borrador multiplicando unitPriceUf
          // × valor_UF según `ufFixingPolicy`. En modo CLP, viaja el
          // precio tal cual y `unitPriceUf` queda undefined.
          unitPrice: linePc === "UF" ? 0 : priceNum,
          unitPriceUf: linePc === "UF" ? priceNum : undefined,
          priceCurrency: linePc,
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
      recipientContactIds,
      // La política UF aplica si AL MENOS UNA línea está en UF. Si todas
      // son CLP la mandamos como RUN_DAY (default neutro) y el campo
      // queda inerte en el cron.
      ufFixingPolicy: hasUfLine ? ufFixingPolicy : "RUN_DAY",
      ufFixingDay:
        hasUfLine && ufFixingPolicy === "CUSTOM_DAY"
          ? parseInt(ufFixingDay, 10)
          : null,
      periodPolicy,
      hasIpcAdjustment,
      ipcAdjustmentMonths: hasIpcAdjustment
        ? parseInt(ipcAdjustmentMonths, 10)
        : null,
      ipcStartDate: hasIpcAdjustment ? ipcStartDate || null : null,
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
      <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar plantilla recurrente" : "Nueva plantilla recurrente"}
          </DialogTitle>
          <DialogDescription className="break-words">
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
          <div className="space-y-5 py-2 min-w-0 scroll-pb-24">
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
                  <p className="text-[12px] text-muted-foreground">
                    El DTE se emite siempre en CLP. Si una línea viene en
                    UF, marcala como UF y el sistema convertirá a pesos
                    automáticamente al generar el borrador.
                  </p>
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

                {/* Botón "Traer datos del cliente" — sobreescribe giro/
                    dirección/comuna/ciudad con los datos del CRM. El
                    auto-fill del useEffect solo completa campos vacíos;
                    este botón es la salida explícita cuando el usuario
                    quiere refrescar tras un cambio en la ficha CRM. */}
                {customer && (
                  <div className="flex items-center justify-between gap-2 pt-3 border-t">
                    <p className="text-xs text-muted-foreground">
                      Datos del receptor para el bloque &lt;Receptor&gt; del DTE.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 shrink-0"
                      onClick={() => {
                        const giroFromCrm = (customer.giro ?? "").trim();
                        const industryFromCrm = (customer.industry ?? "").trim();
                        setReceiverGiro(giroFromCrm || industryFromCrm);
                        setReceiverDireccion(customer.address ?? "");
                        setReceiverComuna(customer.commune ?? "");
                        setReceiverCiudad(customer.city ?? "");
                        const missing: string[] = [];
                        if (!giroFromCrm && !industryFromCrm) missing.push("giro");
                        if (!customer.address) missing.push("dirección");
                        if (!customer.commune) missing.push("comuna");
                        if (!customer.city) missing.push("ciudad");
                        if (missing.length > 0) {
                          toast.warning(
                            `Datos traídos. Faltan en el CRM: ${missing.join(", ")}.`,
                          );
                        } else {
                          toast.success("Datos del cliente actualizados desde el CRM");
                        }
                      }}
                    >
                      Traer datos del cliente
                    </Button>
                  </div>
                )}

                <div
                  className={
                    customer
                      ? "grid grid-cols-1 sm:grid-cols-2 gap-3"
                      : "grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t"
                  }
                >
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

                {customer && contracts.length > 0 && (
                  <div className="space-y-1.5 pt-3 border-t">
                    <Label className="text-xs">Contrato asociado (opcional)</Label>
                    <Select
                      value={contractDocumentId || "NONE"}
                      onValueChange={(v) =>
                        setContractDocumentId(v === "NONE" ? "" : v)
                      }
                    >
                      <SelectTrigger className="h-10 sm:h-9">
                        <SelectValue placeholder="Sin contrato asociado" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NONE">Sin contrato asociado</SelectItem>
                        {contracts.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                            {c.status && ` · ${c.status}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">
                      Si se elimina el contrato, esta programación se desactiva automáticamente.
                    </p>
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
                        const ccArr = parseCcEmailsFromRaw(ccEmailsRaw);
                        const cKey = normalizeEmailAddress(c.email);
                        const alreadyAdded = ccArr.includes(cKey);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              if (alreadyAdded) {
                                setCcEmailsRaw(
                                  ccArr.filter((e) => e !== cKey).join(", "),
                                );
                              } else {
                                const merged = normalizeEmailList([...ccArr, cKey]);
                                if (merged.length > 10) {
                                  toast.error("Máximo 10 emails CC.");
                                  return;
                                }
                                setCcEmailsRaw(merged.join(", "));
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
                  // El formato sigue la moneda EFECTIVA de la línea, no
                  // la del template — una línea CLP en plantilla con
                  // otras UF se sigue mostrando como pesos.
                  const lineCurrency = line.priceCurrency ?? "CLP";
                  const subtotalFormatted =
                    lineCurrency === "UF"
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
                      currency="CLP"
                      allowPerLineCurrency
                      placeholderMode="literal"
                      placeholderContext={placeholderCtx}
                      showExempt
                      subtotalFormatted={subtotalFormatted}
                    />
                  );
                })}
                <Card>
                  <CardContent className="p-3 text-right font-mono text-sm font-medium tabular-nums space-y-0.5">
                    {totals.clp > 0 && (
                      <div>
                        Total neto CLP: {formatCLP(Math.round(totals.clp))}
                      </div>
                    )}
                    {totals.uf > 0 && (
                      <div>
                        Total neto UF: {formatUFSuffix(totals.uf)}
                        {ufNow != null && (
                          <span className="text-ds-text-3">
                            {" "}
                            (≈ {formatCLP(Math.round(totals.uf * ufNow))} a UF{" "}
                            {formatCLP(Math.round(ufNow))})
                          </span>
                        )}
                      </div>
                    )}
                    {totals.clp === 0 && totals.uf === 0 && (
                      <div className="text-ds-text-3">
                        Sin líneas con monto.
                      </div>
                    )}
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

                {hasUfLine && (
                  <div className="rounded-md border border-status-info-border bg-status-info-soft p-3 space-y-2">
                    <p className="text-[13px] font-medium text-status-info-fg">
                      Política de fijación de UF
                    </p>
                    <p className="text-[12px] text-status-info-fg/80">
                      Aplica a las líneas marcadas como UF. Define qué UF se
                      usa para convertir cada una a CLP cuando el cron genera
                      el borrador. Una vez generado, el monto en CLP queda
                      congelado en el borrador.
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
                        <SelectItem value="LAST_DAY_MONTH">
                          UF del último día del mes en curso (recomendado)
                        </SelectItem>
                        <SelectItem value="LAST_DAY_PREV_MONTH">
                          UF del último día del mes anterior
                        </SelectItem>
                        <SelectItem value="FIRST_DAY_MONTH">
                          UF del primer día del mes en curso
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

                {/* Reajuste IPC (modo manual con alerta). El cron NO modifica
                    montos: solo avisa cuando se acerca la fecha de reajuste para
                    que ingreses el % real editando las líneas de la plantilla. */}
                <div className="rounded-md border border-ds-border-subtle p-3 space-y-3">
                  <label className="flex items-start gap-2 text-[13px]">
                    <input
                      type="checkbox"
                      checked={hasIpcAdjustment}
                      onChange={(e) => setHasIpcAdjustment(e.target.checked)}
                      className="mt-0.5 size-4"
                    />
                    <span>
                      <span className="font-medium">Tiene reajuste de IPC</span>
                      <span className="block text-[12px] text-muted-foreground">
                        Te avisamos cuando se acerque la fecha de reajuste para
                        que actualices el monto de las líneas. No modifica montos
                        automáticamente.
                      </span>
                    </span>
                  </label>

                  {hasIpcAdjustment && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-6">
                      <div className="space-y-1.5">
                        <Label htmlFor="t-ipc-months">
                          Cada cuántos meses se reajusta
                        </Label>
                        <Input
                          id="t-ipc-months"
                          type="number"
                          min={1}
                          max={36}
                          inputMode="numeric"
                          value={ipcAdjustmentMonths}
                          onChange={(e) => setIpcAdjustmentMonths(e.target.value)}
                          className="h-10 sm:h-9 bg-background"
                          autoComplete="off"
                        />
                        <p className="text-[12px] text-muted-foreground">
                          Típico: <strong>12</strong> (anual), <strong>6</strong>{" "}
                          (semestral) o <strong>2</strong> (bimensual). Solo se usa
                          para la alerta — el % real lo aplicás vos al editar.
                        </p>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="t-ipc-start">
                          Fecha ancla del reajuste (opcional)
                        </Label>
                        <Input
                          id="t-ipc-start"
                          type="date"
                          value={ipcStartDate}
                          onChange={(e) => setIpcStartDate(e.target.value)}
                          className="h-10 sm:h-9 bg-background"
                        />
                        <p className="text-[12px] text-muted-foreground">
                          Desde cuándo empieza a contar el calendario de avisos. Si
                          la dejás vacía, se usa la fecha de inicio de la plantilla.
                        </p>
                      </div>
                    </div>
                  )}
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
                    Enviar el DTE al receptor por email{" "}
                    <strong>al emitirlo al SII</strong>{" "}
                    (el cron solo genera el borrador; el email al receptor se
                    manda recién cuando vos emitís manualmente. Podés
                    desmarcarlo por emisión).
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

                {(autoSendProforma || autoSendPaymentStatement) && (
                  <div
                    id="section-recipients"
                    className="rounded-md border border-ds-border-default bg-ds-surface-2 p-3 space-y-2 scroll-mt-4"
                  >
                    <div className="text-[13px] font-medium text-ds-text-1">
                      Destinatarios de proforma y estado de pago
                    </div>
                    <p className="text-xs text-ds-text-3">
                      Los mismos contactos reciben proforma y estado de pago.
                      Obligatorio si activás cualquiera de los dos envíos automáticos.
                    </p>
                    {!customer?.id ? (
                      <div className="rounded bg-status-warn-bg text-status-warn-fg text-xs p-2">
                        Vinculá la plantilla a un cliente CRM (campo "Cliente")
                        para poder seleccionar contactos.
                      </div>
                    ) : (
                      <ContactsMultiSelect
                        accountId={customer.id}
                        value={recipientContactIds}
                        onChange={setRecipientContactIds}
                      />
                    )}
                    {(autoSendProforma || autoSendPaymentStatement) &&
                      customer?.id &&
                      recipientContactIds.length === 0 && (
                        <div className="text-xs text-status-error-fg">
                          Seleccioná al menos un contacto.
                        </div>
                      )}
                  </div>
                )}
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
