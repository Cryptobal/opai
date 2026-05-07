"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Loader2, Send, Copy, FileEdit } from "lucide-react";
import { toast } from "sonner";
import { EmisionConfirmDialog } from "./EmisionConfirmDialog";

/* ── Types ── */

interface ReferenceDte {
  id: string;
  dteType: number;
  folio: number;
  receiverRut: string;
  receiverName: string;
  totalAmount: number;
  lines: {
    itemName: string;
    description: string | null;
    quantity: number;
    unitPrice: number;
  }[];
}

interface Props {
  noteType: "credit" | "debit";
  referenceDte: ReferenceDte | null;
  /**
   * Callback opcional al guardar exitosamente. Cuando el form se usa
   * dentro del modal, el modal lo usa para cerrarse + refrescar lista.
   * Cuando se usa en una página, no se pasa y el form hace router.push().
   */
  onSuccess?: () => void;
  /**
   * Callback opcional al cancelar. Mismo patrón: en modal cierra el
   * dialog, en página vuelve al listado.
   */
  onCancel?: () => void;
}

interface NoteLine {
  itemName: string;
  description: string;
  quantity: string;
  unitPrice: string;
}

const DTE_TYPE_LABELS: Record<number, string> = {
  33: "Factura Electrónica",
  34: "Factura Exenta",
  39: "Boleta Electrónica",
};

const EMPTY_LINE: NoteLine = {
  itemName: "",
  description: "",
  quantity: "1",
  unitPrice: "",
};

const fmtCLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  minimumFractionDigits: 0,
});

/* ── Component ── */

export function CreditNoteForm({ noteType, referenceDte, onSuccess, onCancel }: Props) {
  const router = useRouter();
  const isCredit = noteType === "credit";

  const [reason, setReason] = useState("");
  // Default según tipo de nota: NC suele anular (1), ND suele corregir
  // montos (3). Coincide con los defaults del endpoint en backend.
  const [referenceType, setReferenceType] = useState(isCredit ? "1" : "3");
  const [lines, setLines] = useState<NoteLine[]>([{ ...EMPTY_LINE }]);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Tracking: cuando el CodRef cambia y auto-cargamos las líneas del
  // original, recordamos que vinieron de auto-fill para mostrar el
  // banner correcto y permitir desbloquear si el usuario lo pide.
  const [autoFilled, setAutoFilled] = useState(false);
  // Si true, los montos están bloqueados (CodRef=1 o 2). El usuario
  // puede desbloquear con un botón (caso edge: necesita anular pero
  // ajustar algún campo).
  const [linesLocked, setLinesLocked] = useState(false);
  const [tenantBackoffice, setTenantBackoffice] = useState<{ emails: string[]; alwaysSend: boolean }>({
    emails: [],
    alwaysSend: false,
  });

  // Cargar config tenant para mostrar opción de XML al backoffice en confirm.
  useEffect(() => {
    fetch("/api/finance/config/dte-provider")
      .then((r) => r.json())
      .then((j) => {
        const cfg = j?.data?.config;
        if (cfg) {
          setTenantBackoffice({
            emails: cfg.defaultXmlRecipientEmails ?? [],
            alwaysSend: !!cfg.defaultXmlRecipientAlwaysSend,
          });
        }
      })
      .catch(() => {});
  }, []);

  const updateLine = useCallback((index: number, field: keyof NoteLine, value: string) => {
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
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const copyFromReference = useCallback(() => {
    if (!referenceDte?.lines.length) return;
    setLines(
      referenceDte.lines.map((l) => ({
        itemName: l.itemName,
        description: l.description ?? "",
        quantity: String(l.quantity),
        unitPrice: String(l.unitPrice),
      }))
    );
    setAutoFilled(true);
    toast.success("Líneas copiadas del DTE original");
  }, [referenceDte]);

  // Auto-copy + lock cuando cambia CodRef. Esta es la regla operativa
  // del SII para que las NCs anulen/corrijan limpio:
  //   - CodRef 1 (anula): la NC debe replicar el original y bloquear
  //     edición (de lo contrario queda saldo pendiente que el contador
  //     no entiende).
  //   - CodRef 2 (corrige texto): copia líneas pero solo permite editar
  //     itemName/description (no montos).
  //   - CodRef 3 (corrige montos): copia líneas y permite editar montos
  //     (pero NO el itemName, que debe coincidir con el original).
  // El usuario puede desbloquear con un botón si tiene caso edge.
  useEffect(() => {
    if (!referenceDte?.lines.length) return;
    if (referenceType === "1" || referenceType === "2") {
      // Anula y corrige texto → líneas idénticas al original.
      setLines(
        referenceDte.lines.map((l) => ({
          itemName: l.itemName,
          description: l.description ?? "",
          quantity: String(l.quantity),
          unitPrice: String(l.unitPrice),
        })),
      );
      setAutoFilled(true);
      setLinesLocked(true);
    } else if (referenceType === "3") {
      // Corrige montos → copia líneas pero permite editar.
      // Solo auto-fill si las líneas están vacías (no pisar trabajo).
      const hasContent = lines.some(
        (l) => l.itemName.trim() || l.unitPrice.trim(),
      );
      if (!hasContent) {
        setLines(
          referenceDte.lines.map((l) => ({
            itemName: l.itemName,
            description: l.description ?? "",
            quantity: String(l.quantity),
            unitPrice: String(l.unitPrice),
          })),
        );
        setAutoFilled(true);
      }
      setLinesLocked(false);
    }
    // No agregamos `lines` a deps: solo reaccionamos a cambios de CodRef
    // y carga inicial del referenceDte. Si lo agregamos, infinitamos el
    // loop al setear las líneas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referenceType, referenceDte]);

  const total = useMemo(() => {
    return lines.reduce((sum, l) => {
      const qty = parseFloat(l.quantity) || 0;
      const price = parseFloat(l.unitPrice) || 0;
      return sum + qty * price;
    }, 0);
  }, [lines]);

  const validateBeforeSubmit = (): boolean => {
    if (!referenceDte) {
      toast.error("No se ha seleccionado un DTE de referencia");
      return false;
    }
    if (!reason.trim()) {
      toast.error("La razón es obligatoria");
      return false;
    }
    const validLines = lines.filter((l) => l.itemName.trim() && parseFloat(l.unitPrice) > 0);
    if (validLines.length === 0) {
      toast.error("Debe incluir al menos una línea");
      return false;
    }
    return true;
  };

  // Validar y abrir el modal de confirmación. La emisión real ocurre en
  // submitToServer una vez que el usuario confirma.
  const handleSubmit = () => {
    if (!validateBeforeSubmit()) return;
    setConfirmOpen(true);
  };

  const buildPayload = () => {
    const validLines = lines.filter((l) => l.itemName.trim() && parseFloat(l.unitPrice) > 0);
    return {
      referenceDteId: referenceDte!.id,
      reason: reason.trim(),
      referenceType: parseInt(referenceType),
      lines: validLines.map((l) => ({
        itemName: l.itemName.trim(),
        description: l.description.trim() || null,
        quantity: parseFloat(l.quantity) || 1,
        unitPrice: parseFloat(l.unitPrice) || 0,
      })),
    };
  };

  const submitToServer = async () => {
    setSaving(true);
    try {
      const endpoint = isCredit
        ? "/api/finance/billing/credit-note"
        : "/api/finance/billing/debit-note";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `Error al emitir nota de ${isCredit ? "crédito" : "débito"}`);
      }
      toast.success(`Nota de ${isCredit ? "crédito" : "débito"} emitida`);
      setConfirmOpen(false);
      if (onSuccess) onSuccess();
      else {
        router.push("/finanzas/facturacion");
        router.refresh();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!validateBeforeSubmit()) return;
    setSaving(true);
    try {
      const endpoint = isCredit
        ? "/api/finance/billing/credit-note/draft"
        : "/api/finance/billing/debit-note/draft";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al guardar borrador");
      }
      toast.success("Borrador creado");
      if (onSuccess) onSuccess();
      else {
        router.push("/finanzas/facturacion?tab=borradores");
        router.refresh();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Reference DTE info */}
      {referenceDte ? (
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm font-medium mb-3">DTE de referencia</p>
            <div className="grid gap-2 md:grid-cols-4 text-sm">
              <div>
                <span className="text-muted-foreground text-xs">Tipo</span>
                <p>{DTE_TYPE_LABELS[referenceDte.dteType] ?? `Tipo ${referenceDte.dteType}`}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Folio</span>
                <p className="font-mono">{referenceDte.folio}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Receptor</span>
                <p>{referenceDte.receiverName}</p>
                <p className="text-xs text-muted-foreground font-mono">{referenceDte.receiverRut}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Total original</span>
                <p className="font-mono font-medium">{fmtCLP.format(referenceDte.totalAmount)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-4 text-center text-muted-foreground">
            <p>No se proporcionó un DTE de referencia.</p>
            <p className="text-xs mt-1">Use los botones de NC/ND en la lista de DTEs emitidos.</p>
          </CardContent>
        </Card>
      )}

      {/* Reason and reference type */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Razón *</Label>
              <Input
                placeholder={isCredit ? "Ej: Devolución de producto" : "Ej: Corrección de monto"}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo de corrección (CodRef SII) *</Label>
              <Select value={referenceType} onValueChange={setReferenceType}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 — Anula documento original</SelectItem>
                  <SelectItem value="2">2 — Corrige texto (no montos)</SelectItem>
                  <SelectItem value="3">3 — Corrige montos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lines */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-medium">Detalle</h3>
          <div className="flex gap-2 flex-wrap">
            {linesLocked && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setLinesLocked(false);
                  toast.info(
                    "Edición desbloqueada. Asegúrate de que la NC siga reflejando lo que querés anular/corregir.",
                  );
                }}
              >
                Desbloquear edición
              </Button>
            )}
            {referenceDte && referenceDte.lines.length > 0 && (
              <Button variant="outline" size="sm" onClick={copyFromReference}>
                <Copy className="h-3.5 w-3.5 mr-1" />
                Copiar del original
              </Button>
            )}
            {!linesLocked && (
              <Button variant="outline" size="sm" onClick={addLine}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Agregar línea
              </Button>
            )}
          </div>
        </div>

        {/* Banner contextual según CodRef */}
        {autoFilled && referenceType === "1" && (
          <div className="rounded-md border border-status-warn-border bg-status-warn-soft p-3 text-[13px] text-status-warn-fg">
            <p className="font-medium">Anulación: líneas copiadas del original</p>
            <p className="mt-0.5">
              La NC debe replicar EXACTAMENTE el monto del documento
              original ({fmtCLP.format(referenceDte?.totalAmount ?? 0)})
              para anular limpio. Si modificás los montos puede quedar
              saldo pendiente que el contador no entiende.
            </p>
          </div>
        )}
        {autoFilled && referenceType === "2" && (
          <div className="rounded-md border border-status-info-border bg-status-info-soft p-3 text-[13px] text-status-info-fg">
            <p className="font-medium">Corrección de texto</p>
            <p className="mt-0.5">
              Editá nombre o descripción si querés. Los montos quedan
              fijos (CodRef=2 no corrige montos según SII).
            </p>
          </div>
        )}
        {autoFilled && referenceType === "3" && (
          <div className="rounded-md border border-status-info-border bg-status-info-soft p-3 text-[13px] text-status-info-fg">
            <p className="font-medium">Corrección de montos</p>
            <p className="mt-0.5">
              Las líneas se cargaron del original. Ajustá las cantidades
              o precios que querés corregir. La diferencia (NC - original)
              será el ajuste contable.
            </p>
          </div>
        )}

        {/* Desktop lines */}
        <div className="hidden md:block">
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Nombre *</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Descripción</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground w-20">Cant.</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground w-28">Precio *</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground w-28">Subtotal</th>
                    <th className="px-3 py-2 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, i) => {
                    const qty = parseFloat(line.quantity) || 0;
                    const price = parseFloat(line.unitPrice) || 0;
                    const subtotal = qty * price;
                    // Anula (1) bloquea TODO: el SII espera replica exacta.
                    // Corrige texto (2) bloquea montos pero deja itemName/desc.
                    // Corrige montos (3) deja todo editable.
                    const lockAll = linesLocked && referenceType === "1";
                    const lockMoney = linesLocked; // 1 y 2 ambos bloquean montos
                    return (
                      <tr key={i} className="border-b border-border/60 last:border-0">
                        <td className="px-3 py-2">
                          <Input
                            value={line.itemName}
                            onChange={(e) => updateLine(i, "itemName", e.target.value)}
                            className="h-8 text-xs"
                            placeholder="Nombre"
                            readOnly={lockAll}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            value={line.description}
                            onChange={(e) => updateLine(i, "description", e.target.value)}
                            className="h-8 text-xs"
                            placeholder="Descripción"
                            readOnly={lockAll}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number" min={1}
                            value={line.quantity}
                            onChange={(e) => updateLine(i, "quantity", e.target.value)}
                            className="h-8 text-xs text-right"
                            readOnly={lockMoney}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number" min={0}
                            value={line.unitPrice}
                            onChange={(e) => updateLine(i, "unitPrice", e.target.value)}
                            className="h-8 text-xs text-right"
                            placeholder="0"
                            readOnly={lockMoney}
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs">
                          {fmtCLP.format(Math.round(subtotal))}
                        </td>
                        <td className="px-3 py-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeLine(i)}
                            className="h-8 w-8 p-0"
                            disabled={linesLocked}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-accent/30 font-medium">
                    <td className="px-3 py-2" colSpan={4}>
                      <span className="text-xs">TOTAL</span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {fmtCLP.format(Math.round(total))}
                    </td>
                    <td />
                  </tr>
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
            const subtotal = qty * price;
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
                    placeholder="Nombre *"
                  />
                  <div className="grid grid-cols-2 gap-2">
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
                  </div>
                  <div className="text-right text-xs font-mono">
                    Subtotal: {fmtCLP.format(Math.round(subtotal))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
          <Card>
            <CardContent className="p-3 text-right font-mono text-sm font-medium">
              Total: {fmtCLP.format(Math.round(total))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button
          variant="outline"
          onClick={() => {
            if (onCancel) onCancel();
            else router.push("/finanzas/facturacion");
          }}
          disabled={saving}
        >
          Cancelar
        </Button>
        <Button variant="outline" onClick={handleSaveDraft} disabled={saving || !referenceDte}>
          {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FileEdit className="h-4 w-4 mr-1.5" />}
          Guardar como borrador
        </Button>
        <Button onClick={handleSubmit} disabled={saving || !referenceDte}>
          {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
          Emitir nota de {isCredit ? "crédito" : "débito"}
        </Button>
      </div>

      {/* Modal de confirmación SII */}
      <EmisionConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => submitToServer()}
        loading={saving}
        dteType={isCredit ? 61 : 56}
        receiver={{
          name: referenceDte?.receiverName ?? "",
          rut: referenceDte?.receiverRut ?? "",
          email: null,
        }}
        totals={{
          netAmount: total,
          taxAmount: 0,
          totalAmount: total,
          currency: "CLP",
        }}
        lines={lines
          .filter((l) => l.itemName.trim() && parseFloat(l.unitPrice) > 0)
          .map((l) => ({
            itemName: l.itemName.trim(),
            quantity: parseFloat(l.quantity) || 1,
            unitPrice: parseFloat(l.unitPrice) || 0,
          }))}
        defaultBackofficeEmails={tenantBackoffice.emails}
        defaultBackofficeAlwaysSend={tenantBackoffice.alwaysSend}
      />
    </div>
  );
}
