"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { Plus, Trash2, Loader2, Send, Download, FileEdit } from "lucide-react";
import { CustomerCombobox, type CustomerOption } from "./CustomerCombobox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { EmisionConfirmDialog } from "./EmisionConfirmDialog";

/* ── Types ── */

interface AccountOption {
  id: string;
  code: string;
  name: string;
}

interface Props {
  availableTypes: number[];
  accounts: AccountOption[];
}

interface DteLine {
  itemName: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  discountPct: string;
  isExempt: boolean;
  accountId: string;
  refuerzoSolicitudId?: string;
}

interface PendingBillableItem {
  id: string;
  accountId: string;
  sourceType: string;
  sourceId: string;
  itemName: string;
  description: string | null;
  quantity: string;
  unit: string;
  unitPrice: string;
  netAmount: string;
  status: string;
  createdAt: string;
}

const DTE_TYPE_LABELS: Record<number, string> = {
  33: "Factura Electrónica",
  34: "Factura Exenta",
};

const EMPTY_LINE: DteLine = {
  itemName: "",
  description: "",
  quantity: "1",
  unit: "UN",
  unitPrice: "",
  discountPct: "0",
  isExempt: false,
  accountId: "",
};

const IVA_RATE = 0.19;

const fmtCLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  minimumFractionDigits: 0,
});

/* ── Component ── */

export function DteForm({ availableTypes, accounts }: Props) {
  const router = useRouter();

  const [dteType, setDteType] = useState(String(availableTypes[0] ?? 33));
  // Cliente seleccionado del CRM (vía CustomerCombobox). Si está null, el
  // usuario está ingresando manualmente los datos del receptor.
  const [customer, setCustomer] = useState<CustomerOption | null>(null);
  // Datos manuales del receptor (cuando el cliente NO está en el CRM).
  // Si hay `customer` seleccionado, estos campos se ignoran al enviar.
  const [receiverRut, setReceiverRut] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [receiverEmail, setReceiverEmail] = useState("");
  /**
   * Datos del receptor que el SII exige en facturas (giro/dir/comuna/ciudad).
   * Se autocompletan del CRM cuando hay customer seleccionado pero el usuario
   * puede editarlos. Si quedan vacíos, el provider usa defaults seguros.
   */
  const [receiverGiro, setReceiverGiro] = useState("");
  const [receiverDireccion, setReceiverDireccion] = useState("");
  const [receiverComuna, setReceiverComuna] = useState("");
  const [receiverCiudad, setReceiverCiudad] = useState("");
  /** Centro de costo: instalación del cliente. Se carga al seleccionar customer. */
  const [installationId, setInstallationId] = useState<string>("");
  const [installations, setInstallations] = useState<
    { id: string; name: string; address: string | null; commune: string | null }[]
  >([]);
  /**
   * Emails CC adicionales para el envío del PDF/XML del DTE.
   * El XML SII solo lleva el email primario; estos van como copia.
   */
  const [ccEmailsRaw, setCcEmailsRaw] = useState("");
  /**
   * Sugerencias de contactos desde el CRM cuando el RUT del receptor
   * matchea un account existente.
   */
  const [crmSuggestions, setCrmSuggestions] = useState<{
    account: { id: string; name: string; commercialName: string; rut: string; address: string | null; commune: string | null } | null;
    contacts: { id: string; fullName: string; email: string; roleTitle: string | null; isPrimary: boolean }[];
  } | null>(null);
  /** Referencias adicionales del DTE: OC, HES, Contrato, etc. */
  const [additionalRefs, setAdditionalRefs] = useState<
    { tipoDocRef: string; folioRef: string; fchRef: string; razonRef: string }[]
  >([]);
  const [notes, setNotes] = useState("");
  // Default true: tras emitir, OPAI envía automáticamente el PDF + XML
  // al receptor (y a los CC). Si el usuario desmarca, no se envía y
  // queda disponible "Reenviar email" en la lista.
  const [autoSendEmail, setAutoSendEmail] = useState(true);
  const [lines, setLines] = useState<DteLine[]>([{ ...EMPTY_LINE }]);
  const [saving, setSaving] = useState(false);

  // Selector de moneda. Si UF, los precios de cada línea se interpretan
  // como UF; el backend los convierte a CLP usando getUfValue() del día.
  const [currency, setCurrency] = useState<"CLP" | "UF">("CLP");
  const [ufValue, setUfValue] = useState<number | null>(null);
  // Modal de confirmación pre-emisión.
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Config del tenant para el modal (emails XML al backoffice).
  const [tenantBackoffice, setTenantBackoffice] = useState<{
    emails: string[];
    alwaysSend: boolean;
  }>({ emails: [], alwaysSend: false });

  // Identificador del borrador en edición. Si viene en URL, cargamos los
  // datos del borrador y al guardar usamos PATCH en lugar de POST de creación.
  const searchParams = useSearchParams();
  const draftIdParam = searchParams?.get("draftId") ?? null;
  const asDraftFlag = searchParams?.get("asDraft") === "true";

  // Cargar UF del día cuando se elige UF como moneda.
  useEffect(() => {
    if (currency !== "UF") {
      setUfValue(null);
      return;
    }
    const ctrl = new AbortController();
    fetch("/api/fx/uf", { signal: ctrl.signal })
      .then((r) => r.json())
      .then((j) => {
        const v = j?.data?.value ?? j?.value;
        if (typeof v === "number") setUfValue(v);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [currency]);

  // Cargar config del tenant (default emails XML al backoffice + plantillas).
  useEffect(() => {
    fetch("/api/finance/config/dte-provider")
      .then((r) => r.json())
      .then((j) => {
        const cfg = j?.data;
        if (cfg) {
          setTenantBackoffice({
            emails: cfg.defaultXmlRecipientEmails ?? [],
            alwaysSend: !!cfg.defaultXmlRecipientAlwaysSend,
          });
        }
      })
      .catch(() => {});
  }, []);

  // Cargar borrador existente si viene draftId en la URL.
  useEffect(() => {
    if (!draftIdParam) return;
    const ctrl = new AbortController();
    fetch(`/api/finance/billing/drafts/${draftIdParam}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((j) => {
        const d = j?.data;
        if (!d) return;
        setDteType(String(d.dteType));
        setReceiverRut(d.receiverRut ?? "");
        setReceiverName(d.receiverName ?? "");
        setReceiverEmail(d.receiverEmail ?? "");
        setReceiverGiro(d.receiverGiro ?? "");
        setReceiverDireccion(d.receiverDireccion ?? "");
        setReceiverComuna(d.receiverComuna ?? "");
        setReceiverCiudad(d.receiverCiudad ?? "");
        setCcEmailsRaw((d.receiverEmailCc ?? []).join(", "));
        setNotes(d.notes ?? "");
        if (d.currency === "UF" || d.currency === "CLP") setCurrency(d.currency);
        const draftLines = (d.lines ?? []).map((l: Record<string, unknown>) => ({
          itemName: String(l.itemName ?? ""),
          description: String(l.description ?? ""),
          quantity: String(l.quantity ?? "1"),
          unit: String(l.unit ?? "UN"),
          // Si el draft estaba en UF, mostramos unitPriceUf; si CLP, unitPrice.
          unitPrice: String(
            d.currency === "UF" && l.unitPriceUf != null
              ? l.unitPriceUf
              : (l.unitPrice ?? ""),
          ),
          discountPct: String(l.discountPct ?? "0"),
          isExempt: !!l.isExempt,
          accountId: String(l.accountId ?? ""),
        }));
        if (draftLines.length > 0) setLines(draftLines);
      })
      .catch(() => {
        toast.error("No se pudo cargar el borrador");
      });
    return () => ctrl.abort();
  }, [draftIdParam]);

  // Cuando se selecciona un customer del CRM, autocompletar los datos del
  // receptor con lo que tenga el CRM (dirección, comuna). Si el campo del
  // CRM está vacío, dejamos en blanco (el usuario puede escribir o el
  // provider usa defaults).
  useEffect(() => {
    if (!customer) return;
    setReceiverDireccion(customer.address ?? "");
    setReceiverComuna(customer.commune ?? "");
    setReceiverCiudad(customer.city ?? "");
    // Giro NO viene del CRM (CrmAccount usa "industry" para otra cosa).
    // Si el usuario tiene CrmAccount.legalName con el giro, podríamos parsear,
    // pero por simplicidad lo dejamos al usuario.
  }, [customer]);

  // Cargar instalaciones del cliente cuando cambia el customer.
  useEffect(() => {
    if (!customer) {
      setInstallations([]);
      setInstallationId("");
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
    setInstallationId("");
    return () => ctrl.abort();
  }, [customer]);

  // Trigger fetch a /receiver-suggestions para mostrar contactos CC del CRM.
  // Usa el RUT efectivo (customer del CRM si está seleccionado, sino manual).
  // Debounce 350ms para no spamear al servidor mientras el usuario escribe.
  useEffect(() => {
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
        // Silently ignore — no es crítico para emisión.
      }
    }, 350);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [customer, receiverRut]);

  const isExenta = dteType === "34";

  const updateLine = useCallback((index: number, field: keyof DteLine, value: string | boolean) => {
    setLines((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }, []);

  const addLine = useCallback(() => {
    setLines((prev) => [...prev, { ...EMPTY_LINE }]);
  }, []);

  const removeLine = useCallback((index: number) => {
    setLines((prev) => {
      if (prev.length <= 1) {
        toast.error("Se requiere al menos 1 línea");
        return prev;
      }
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const totals = useMemo(() => {
    let netAmount = 0;
    lines.forEach((l) => {
      const qty = parseFloat(l.quantity) || 0;
      const price = parseFloat(l.unitPrice) || 0;
      const discount = parseFloat(l.discountPct) || 0;
      const lineNet = qty * price * (1 - discount / 100);
      netAmount += lineNet;
    });
    const taxAmount = isExenta ? 0 : Math.round(netAmount * IVA_RATE);
    const totalAmount = Math.round(netAmount) + taxAmount;
    return { netAmount: Math.round(netAmount), taxAmount, totalAmount };
  }, [lines, isExenta]);

  const handleSubmit = async () => {
    // Datos efectivos del receptor: prioriza customer del CRM si existe;
    // si no, usa los campos manuales (RUT/RazonSocial/Email).
    const effRut = (customer?.rut || receiverRut).trim();
    const effName = (customer?.name || receiverName).trim();
    const effEmail = (customer?.email || receiverEmail).trim();

    if (!effRut || !effName) {
      toast.error("RUT y nombre del receptor son obligatorios");
      return;
    }

    // Validación local del DV (módulo 11) — el SII rechaza el DTE si el
    // DV es incorrecto. NO consume cupo SimpleAPI (es 100% offline).
    const cleanRut = effRut.replace(/[^\dKk]/g, "").toUpperCase();
    if (cleanRut.length < 2) {
      toast.error("RUT del receptor inválido");
      return;
    }
    const cuerpo = cleanRut.slice(0, -1);
    const dv = cleanRut.slice(-1);
    if (!/^\d+$/.test(cuerpo)) {
      toast.error("RUT del receptor inválido (formato)");
      return;
    }
    let suma = 0; let multi = 2;
    for (let i = cuerpo.length - 1; i >= 0; i--) {
      suma += parseInt(cuerpo[i], 10) * multi;
      multi = multi === 7 ? 2 : multi + 1;
    }
    const resto = 11 - (suma % 11);
    const dvCalc = resto === 11 ? "0" : resto === 10 ? "K" : String(resto);
    if (dv !== dvCalc) {
      toast.error(`RUT inválido: el DV calculado es ${dvCalc}, no ${dv}`);
      return;
    }
    const validLines = lines.filter((l) => l.itemName.trim() && parseFloat(l.unitPrice) > 0);
    if (validLines.length === 0) {
      toast.error("Debe incluir al menos una línea con nombre y precio");
      return;
    }

    // Parsear y validar emails CC (separador: coma, espacio o ;).
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const primaryEmail = effEmail;
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
      new Set(ccCandidates.filter((e) => e !== primaryEmail)),
    );
    if (ccEmails.length > 10) {
      toast.error("Máximo 10 emails CC.");
      return;
    }

    // Validar referencias completas (descartar las vacías).
    const validRefs = additionalRefs.filter(
      (r) =>
        r.tipoDocRef.trim() &&
        r.folioRef.trim() &&
        r.fchRef &&
        r.razonRef.trim(),
    );

    // Validación pasada — abrir modal de confirmación. La emisión real
    // se dispara desde EmisionConfirmDialog.onConfirm → submitToServer.
    setConfirmOpen(true);
  };

  /**
   * Construye el payload (compartido entre emisión real y guardar borrador).
   * Aplica conversión UF: si currency=UF cada precio va como unitPriceUf
   * y unitPrice queda 0 (el backend convierte usando getUfValue()).
   */
  const buildPayload = (
    overrides?: { autoSendEmail?: boolean; sendXmlToBackoffice?: boolean },
  ) => {
    const effRut = (customer?.rut || receiverRut).trim();
    const effName = (customer?.name || receiverName).trim();
    const effEmail = (customer?.email || receiverEmail).trim();
    const validLines = lines.filter(
      (l) => l.itemName.trim() && parseFloat(l.unitPrice) > 0,
    );
    const ccCandidates = ccEmailsRaw
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const ccEmails = Array.from(
      new Set(ccCandidates.filter((e) => e !== effEmail)),
    );
    const validRefs = additionalRefs.filter(
      (r) =>
        r.tipoDocRef.trim() &&
        r.folioRef.trim() &&
        r.fchRef &&
        r.razonRef.trim(),
    );
    return {
      dteType: parseInt(dteType),
      receiverRut: effRut || undefined,
      receiverName: effName || undefined,
      receiverEmail: effEmail || null,
      receiverEmailCc: ccEmails.length > 0 ? ccEmails : undefined,
      receiverGiro: receiverGiro.trim() || null,
      receiverDireccion: receiverDireccion.trim() || null,
      receiverComuna: receiverComuna.trim() || null,
      receiverCiudad: receiverCiudad.trim() || null,
      crmAccountId: customer?.id ?? null,
      installationId: installationId || null,
      additionalReferences: validRefs.length > 0 ? validRefs : undefined,
      notes: notes.trim() || null,
      autoSendEmail: overrides?.autoSendEmail ?? autoSendEmail,
      sendXmlToBackoffice: overrides?.sendXmlToBackoffice,
      currency,
      lines: validLines.map((l) => {
        const priceNum = parseFloat(l.unitPrice) || 0;
        return {
          itemName: l.itemName.trim(),
          description: l.description.trim() || null,
          quantity: parseFloat(l.quantity) || 1,
          unit: l.unit.trim() || null,
          // Si moneda=UF, el precio del input se manda como unitPriceUf.
          // El backend lo convierte a CLP usando getUfValue() del día.
          unitPrice: currency === "UF" ? 0 : priceNum,
          unitPriceUf: currency === "UF" ? priceNum : undefined,
          discountPct: parseFloat(l.discountPct) || 0,
          isExempt: isExenta || l.isExempt,
          accountId: l.accountId || null,
          refuerzoSolicitudId: l.refuerzoSolicitudId || null,
        };
      }),
    };
  };

  /** Emisión real — la llama el modal de confirmación tras OK del usuario. */
  const submitToServer = async (opts: { autoSendEmail: boolean; sendXmlToBackoffice: boolean }) => {
    setSaving(true);
    try {
      const payload = buildPayload(opts);
      // Si estamos editando un borrador, lo emitimos vía /drafts/[id]/issue.
      // Esto guarda primero (PATCH) y luego emite — patrón seguro.
      if (draftIdParam) {
        const patchRes = await fetch(`/api/finance/billing/drafts/${draftIdParam}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!patchRes.ok) {
          const err = await patchRes.json();
          throw new Error(err.error || "Error al guardar borrador antes de emitir");
        }
        const issueRes = await fetch(`/api/finance/billing/drafts/${draftIdParam}/issue`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            autoSendEmail: opts.autoSendEmail,
            sendXmlToBackoffice: opts.sendXmlToBackoffice,
          }),
        });
        if (!issueRes.ok) {
          const err = await issueRes.json();
          throw new Error(err.error || "Error al emitir borrador");
        }
      } else {
        const res = await fetch("/api/finance/billing/issued", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Error al emitir DTE");
        }
      }
      toast.success("DTE emitido exitosamente");
      setConfirmOpen(false);
      router.push("/finanzas/facturacion");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setSaving(false);
    }
  };

  /** Guardar como borrador (sin emitir, sin reservar folio). */
  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      const payload = buildPayload();
      const url = draftIdParam
        ? `/api/finance/billing/drafts/${draftIdParam}`
        : "/api/finance/billing/drafts";
      const method = draftIdParam ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al guardar borrador");
      }
      toast.success(draftIdParam ? "Borrador actualizado" : "Borrador creado");
      router.push("/finanzas/facturacion?tab=borradores");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setSaving(false);
    }
  };

  /* ── Pending billable items import ── */

  const [importOpen, setImportOpen] = useState(false);
  const [importAccountId, setImportAccountId] = useState("");
  const [pendingItems, setPendingItems] = useState<PendingBillableItem[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [loadingItems, setLoadingItems] = useState(false);

  const fetchPendingItems = useCallback(async (accountId: string) => {
    if (!accountId) return;
    setLoadingItems(true);
    try {
      const res = await fetch(
        `/api/finance/pending-billable-items?accountId=${accountId}&status=pending`,
      );
      if (!res.ok) throw new Error();
      const json = await res.json();
      setPendingItems(json.data?.items ?? []);
    } catch {
      toast.error("Error al cargar items pendientes");
      setPendingItems([]);
    } finally {
      setLoadingItems(false);
    }
  }, []);

  const handleImportOpen = useCallback(() => {
    setPendingItems([]);
    setSelectedItemIds(new Set());
    setImportAccountId("");
    setImportOpen(true);
  }, []);

  const toggleItem = useCallback((id: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleImportSelected = useCallback(() => {
    const selected = pendingItems.filter((i) => selectedItemIds.has(i.id));
    if (selected.length === 0) {
      toast.error("Seleccione al menos un item");
      return;
    }
    const newLines: DteLine[] = selected.map((item) => ({
      itemName: item.itemName,
      description: item.description ?? "",
      quantity: String(parseFloat(item.quantity) || 1),
      unit: item.unit || "UN",
      unitPrice: String(parseFloat(item.unitPrice) || 0),
      discountPct: "0",
      isExempt: false,
      accountId: item.accountId,
      refuerzoSolicitudId: item.sourceType === "refuerzo" ? item.sourceId : undefined,
    }));

    setLines((prev) => {
      // Replace the empty first line if it's the only one and blank
      if (prev.length === 1 && !prev[0].itemName && !prev[0].unitPrice) {
        return newLines;
      }
      return [...prev, ...newLines];
    });

    toast.success(`${selected.length} item(s) importados`);
    setImportOpen(false);
  }, [pendingItems, selectedItemIds]);

  return (
    <div className="space-y-6">
      {draftIdParam && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 flex items-center gap-2">
          <FileEdit className="size-4" />
          <span>Editando borrador. Aún no se ha emitido al SII.</span>
        </div>
      )}
      {asDraftFlag && !draftIdParam && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 flex items-center gap-2">
          <FileEdit className="size-4" />
          <span>Modo borrador: usa "Guardar como borrador" para archivar sin emitir.</span>
        </div>
      )}
      {/* Header fields */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tipo de documento *</Label>
              <Select value={dteType} onValueChange={setDteType}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {availableTypes.map((t) => (
                    <SelectItem key={t} value={String(t)}>
                      {DTE_TYPE_LABELS[t] ?? `Tipo ${t}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Moneda</Label>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant={currency === "CLP" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCurrency("CLP")}
                >
                  CLP
                </Button>
                <Button
                  type="button"
                  variant={currency === "UF" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCurrency("UF")}
                >
                  UF
                </Button>
                {currency === "UF" && ufValue != null && (
                  <span className="ml-2 self-center text-xs text-muted-foreground">
                    UF hoy: ${ufValue.toLocaleString("es-CL")}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="border-t mt-4 pt-4">
            <p className="text-sm font-medium mb-3">Receptor</p>
            {/*
              CustomerCombobox: busca clientes en el CRM (crm.accounts) por
              razón social/RUT/email. Si encuentra match, autocompleta todos
              los datos. Si el cliente no está en CRM, el componente expone
              modo manual para ingresar RUT/RazonSocial/Email.
            */}
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

            {/*
              Datos adicionales del receptor (giro/dirección/comuna/ciudad)
              + selector de instalación. SII exige los 3 primeros en facturas
              tipo 33; si quedan vacíos el provider usa defaults seguros pero
              lo correcto es completarlos.
            */}
            <div className="mt-4 space-y-3 border-t pt-4">
              <p className="text-sm font-medium">Datos adicionales del receptor</p>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Giro / Actividad económica *</Label>
                  <Input
                    placeholder="Ej: Construcción, Comercio al por mayor..."
                    value={receiverGiro}
                    onChange={(e) => setReceiverGiro(e.target.value)}
                    maxLength={80}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Dirección *</Label>
                  <Input
                    placeholder="Ej: Av. Apoquindo 4500"
                    value={receiverDireccion}
                    onChange={(e) => setReceiverDireccion(e.target.value)}
                    maxLength={200}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Comuna *</Label>
                  <Input
                    placeholder="Ej: Las Condes"
                    value={receiverComuna}
                    onChange={(e) => setReceiverComuna(e.target.value)}
                    maxLength={80}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Ciudad</Label>
                  <Input
                    placeholder="Ej: Santiago"
                    value={receiverCiudad}
                    onChange={(e) => setReceiverCiudad(e.target.value)}
                    maxLength={80}
                    className="h-9"
                  />
                </div>
              </div>

              {/* Selector de instalación (solo si hay customer del CRM) */}
              {customer && (
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Instalación / Centro de costo
                    {installations.length === 0 && (
                      <span className="text-muted-foreground ml-1.5 font-normal">
                        (este cliente no tiene instalaciones registradas)
                      </span>
                    )}
                  </Label>
                  <Select
                    value={installationId || "NONE"}
                    onValueChange={(v) => setInstallationId(v === "NONE" ? "" : v)}
                    disabled={installations.length === 0}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Sin instalación específica" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">
                        Sin instalación específica
                      </SelectItem>
                      {installations.map((inst) => (
                        <SelectItem key={inst.id} value={inst.id}>
                          {inst.name}
                          {inst.commune && ` · ${inst.commune}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {customer && installations.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Asociar el DTE a una instalación permite reportar
                      ingresos/gastos por centro de costo.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Sugerencias de contactos CRM cuando el RUT matchea un account */}
          {crmSuggestions?.account && crmSuggestions.contacts.length > 0 && (
            <div className="border-t mt-4 pt-4 space-y-2">
              <p className="text-[13px] font-medium text-ds-text-1">
                {crmSuggestions.contacts.length} contacto(s) en CRM para
                {" "}
                <span className="font-mono">{crmSuggestions.account.rut}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Click en un contacto para agregarlo al envío como CC.
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
                        "rounded-full border px-3 py-1 text-xs transition-colors " +
                        (alreadyAdded
                          ? "border-primary/40 bg-primary/15 text-primary"
                          : "border-border bg-muted/30 text-foreground hover:bg-muted/50")
                      }
                    >
                      <span className="font-medium">{c.fullName}</span>
                      {c.roleTitle && (
                        <span className="text-muted-foreground"> · {c.roleTitle}</span>
                      )}
                      <span className="text-muted-foreground"> · {c.email}</span>
                      {c.isPrimary && (
                        <span className="ml-1 text-xs uppercase tracking-wide text-primary">
                          principal
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Emails CC adicionales — solo afecta envío externo, no XML SII */}
          <div className="border-t mt-4 pt-4 space-y-1.5">
            <Label htmlFor="cc-emails">Emails CC (opcional)</Label>
            <p className="text-xs text-muted-foreground">
              Copia del PDF/XML a más destinatarios (contador, finanzas,
              etc). Separá con coma o espacio. El XML del SII solo lleva
              el email primario del receptor.
            </p>
            <Input
              id="cc-emails"
              placeholder="contador@cliente.cl, finanzas@cliente.cl"
              value={ccEmailsRaw}
              onChange={(e) => setCcEmailsRaw(e.target.value)}
              className="h-9"
            />
          </div>
        </CardContent>
      </Card>

      {/* Lines */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Detalle</h3>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleImportOpen}>
              <Download className="h-3.5 w-3.5 mr-1" />
              Importar pendientes
            </Button>
            <Button variant="outline" size="sm" onClick={addLine}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Agregar línea
            </Button>
          </div>
        </div>

        {/* Desktop lines */}
        <div className="hidden md:block">
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Nombre *</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground w-20">Cant.</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground w-16">Unidad</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground w-28">Precio *</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground w-20">Desc.%</th>
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
                            className="h-8 text-xs"
                            placeholder="Nombre del ítem"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number" min={1}
                            value={line.quantity}
                            onChange={(e) => updateLine(i, "quantity", e.target.value)}
                            className="h-8 text-xs text-right"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            value={line.unit}
                            onChange={(e) => updateLine(i, "unit", e.target.value)}
                            className="h-8 text-xs"
                            placeholder="UN"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number" min={0}
                            value={line.unitPrice}
                            onChange={(e) => updateLine(i, "unitPrice", e.target.value)}
                            className="h-8 text-xs text-right"
                            placeholder="0"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number" min={0} max={100}
                            value={line.discountPct}
                            onChange={(e) => updateLine(i, "discountPct", e.target.value)}
                            className="h-8 text-xs text-right"
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs">
                          {fmtCLP.format(Math.round(subtotal))}
                        </td>
                        <td className="px-3 py-2">
                          <Button variant="ghost" size="sm" onClick={() => removeLine(i)} className="h-8 w-8 p-0">
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Mobile lines */}
        <div className="md:hidden space-y-3">
          {lines.map((line, i) => {
            const qty = parseFloat(line.quantity) || 0;
            const price = parseFloat(line.unitPrice) || 0;
            const disc = parseFloat(line.discountPct) || 0;
            const subtotal = qty * price * (1 - disc / 100);
            return (
              <Card key={i}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Línea {i + 1}</span>
                    <Button variant="ghost" size="sm" onClick={() => removeLine(i)} className="h-7 w-7 p-0">
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                  <Input
                    value={line.itemName}
                    onChange={(e) => updateLine(i, "itemName", e.target.value)}
                    className="h-8 text-xs"
                    placeholder="Nombre del ítem *"
                  />
                  <div className="grid grid-cols-3 gap-2 min-w-0">
                    <div className="space-y-1">
                      <Label className="text-[10px]">Cant.</Label>
                      <Input
                        type="number" min={1}
                        value={line.quantity}
                        onChange={(e) => updateLine(i, "quantity", e.target.value)}
                        className="h-8 text-xs text-right"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px]">Precio *</Label>
                      <Input
                        type="number" min={0}
                        value={line.unitPrice}
                        onChange={(e) => updateLine(i, "unitPrice", e.target.value)}
                        className="h-8 text-xs text-right"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px]">Desc.%</Label>
                      <Input
                        type="number" min={0} max={100}
                        value={line.discountPct}
                        onChange={(e) => updateLine(i, "discountPct", e.target.value)}
                        className="h-8 text-xs text-right"
                      />
                    </div>
                  </div>
                  <div className="text-right text-xs font-mono">
                    Subtotal: {fmtCLP.format(Math.round(subtotal))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Referencias adicionales (OC, HES, Contrato, etc) */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-medium">Referencias (opcional)</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Asocia este DTE a documentos del cliente: Orden de Compra,
                HES, Contrato, etc. Se imprimen en el PDF y van al SII.
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
              Sin referencias. Click en &quot;Agregar referencia&quot; para vincular OC, HES, etc.
            </p>
          ) : (
            <div className="space-y-2">
              {additionalRefs.map((ref, i) => (
                <div
                  key={i}
                  className="grid grid-cols-1 md:grid-cols-12 gap-2 items-start p-2 rounded-md bg-muted/30 border border-border"
                >
                  <div className="md:col-span-2">
                    <Label className="text-xs">Tipo *</Label>
                    <Select
                      value={ref.tipoDocRef}
                      onValueChange={(v) =>
                        setAdditionalRefs((prev) =>
                          prev.map((r, idx) => (idx === i ? { ...r, tipoDocRef: v } : r)),
                        )
                      }
                    >
                      <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="801">801 — Orden de Compra</SelectItem>
                        <SelectItem value="802">802 — Nota de Pedido</SelectItem>
                        <SelectItem value="803">803 — Contrato</SelectItem>
                        <SelectItem value="804">804 — Resolución</SelectItem>
                        <SelectItem value="HES">HES — Hoja Entrada Servicios</SelectItem>
                        <SelectItem value="GD">GD — Guía Despacho manual</SelectItem>
                        <SelectItem value="52">52 — Guía Despacho electrónica</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-3">
                    <Label className="text-xs">Folio / N° *</Label>
                    <Input
                      value={ref.folioRef}
                      onChange={(e) =>
                        setAdditionalRefs((prev) =>
                          prev.map((r, idx) => (idx === i ? { ...r, folioRef: e.target.value } : r)),
                        )
                      }
                      placeholder="PO-2026-0001"
                      className="h-9 text-xs"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-xs">Fecha *</Label>
                    <Input
                      type="date"
                      value={ref.fchRef}
                      onChange={(e) =>
                        setAdditionalRefs((prev) =>
                          prev.map((r, idx) => (idx === i ? { ...r, fchRef: e.target.value } : r)),
                        )
                      }
                      className="h-9 text-xs"
                    />
                  </div>
                  <div className="md:col-span-4">
                    <Label className="text-xs">Razón / glosa *</Label>
                    <Input
                      value={ref.razonRef}
                      onChange={(e) =>
                        setAdditionalRefs((prev) =>
                          prev.map((r, idx) => (idx === i ? { ...r, razonRef: e.target.value } : r)),
                        )
                      }
                      placeholder="Orden de Compra del cliente"
                      maxLength={90}
                      className="h-9 text-xs"
                    />
                  </div>
                  <div className="md:col-span-1 flex items-end justify-end h-full">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setAdditionalRefs((prev) => prev.filter((_, idx) => idx !== i))
                      }
                      className="h-9 w-9 p-0"
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

      {/* Totals */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col items-end gap-1 text-sm">
            <div className="flex items-center gap-8">
              <span className="text-muted-foreground">Neto</span>
              <span className="font-mono w-28 text-right">{fmtCLP.format(totals.netAmount)}</span>
            </div>
            {!isExenta && (
              <div className="flex items-center gap-8">
                <span className="text-muted-foreground">IVA (19%)</span>
                <span className="font-mono w-28 text-right">{fmtCLP.format(totals.taxAmount)}</span>
              </div>
            )}
            <div className="flex items-center gap-8 font-medium border-t pt-1 mt-1">
              <span>Total</span>
              <span className="font-mono w-28 text-right">{fmtCLP.format(totals.totalAmount)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Options */}
      <Card>
        <CardContent className="pt-4">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Notas / Observaciones</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notas opcionales para el documento"
                className="h-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="dte-auto-email"
                checked={autoSendEmail}
                onChange={(e) => setAutoSendEmail(e.target.checked)}
                className="rounded border-border"
              />
              <Label htmlFor="dte-auto-email">Enviar automáticamente por email al receptor</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button
          variant="outline"
          onClick={() => router.push("/finanzas/facturacion")}
          disabled={saving}
        >
          Cancelar
        </Button>
        <Button variant="outline" onClick={handleSaveDraft} disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <FileEdit className="h-4 w-4 mr-1.5" />
          )}
          {draftIdParam ? "Guardar borrador" : "Guardar como borrador"}
        </Button>
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
          Emitir documento
        </Button>
      </div>

      {/* Modal de confirmación pre-emisión SII */}
      <EmisionConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={(opts) => submitToServer(opts)}
        loading={saving}
        dteType={parseInt(dteType)}
        receiver={{
          name: (customer?.name || receiverName).trim(),
          rut: (customer?.rut || receiverRut).trim(),
          email: (customer?.email || receiverEmail).trim() || null,
        }}
        totals={{
          netAmount: totals.netAmount,
          taxAmount: totals.taxAmount,
          totalAmount: totals.totalAmount,
          currency,
          ufValue: ufValue ?? undefined,
          totalUf:
            currency === "UF" && ufValue && ufValue > 0
              ? totals.totalAmount / ufValue
              : undefined,
        }}
        lines={lines
          .filter((l) => l.itemName.trim() && parseFloat(l.unitPrice) > 0)
          .map((l) => ({
            itemName: l.itemName.trim(),
            quantity: parseFloat(l.quantity) || 1,
            unitPrice:
              currency === "UF" && ufValue
                ? Math.round(parseFloat(l.unitPrice) * ufValue * 100) / 100
                : parseFloat(l.unitPrice) || 0,
            unitPriceUf: currency === "UF" ? parseFloat(l.unitPrice) || 0 : null,
          }))}
        defaultBackofficeEmails={tenantBackoffice.emails}
        defaultBackofficeAlwaysSend={tenantBackoffice.alwaysSend}
      />

      {/* Import pending billable items dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Importar items pendientes</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Cuenta / Cliente</Label>
              <SearchableSelect
                value={importAccountId}
                options={accounts.map((a) => ({
                  id: a.id,
                  label: a.name,
                  description: a.code,
                }))}
                placeholder="Seleccione una cuenta"
                emptyText="No se encontraron cuentas"
                onChange={(v) => {
                  setImportAccountId(v);
                  fetchPendingItems(v);
                }}
              />
            </div>

            {loadingItems && (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {!loadingItems && importAccountId && pendingItems.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No hay items pendientes para esta cuenta.
              </p>
            )}

            {!loadingItems && pendingItems.length > 0 && (
              <div className="max-h-64 overflow-y-auto border rounded-md divide-y">
                {pendingItems.map((item) => (
                  <label
                    key={item.id}
                    className="flex items-start gap-3 p-3 hover:bg-muted/50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedItemIds.has(item.id)}
                      onChange={() => toggleItem(item.id)}
                      className="mt-0.5 rounded border-border"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.itemName}</p>
                      {item.description && (
                        <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                      )}
                      <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                        <span>{parseFloat(item.quantity)} {item.unit}</span>
                        <span>x {fmtCLP.format(parseFloat(item.unitPrice))}</span>
                        <span className="font-medium text-foreground">
                          = {fmtCLP.format(parseFloat(item.netAmount))}
                        </span>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleImportSelected}
              disabled={selectedItemIds.size === 0}
            >
              Importar {selectedItemIds.size > 0 ? `(${selectedItemIds.size})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
