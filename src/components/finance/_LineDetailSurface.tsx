"use client";

/**
 * LineDetailSurface — Surface por línea de DTE (compartido entre
 * `DteForm.tsx` y `RecurringTemplateForm.tsx`).
 *
 * Estructura:
 *   - Header: "Línea N" + botón eliminar.
 *   - Nombre del ítem (input full-width) + picker de placeholders.
 *   - Descripción (textarea opcional, multi-línea) + picker.
 *     Vista previa cuando el texto contiene tokens.
 *   - Grid: cantidad / unidad / precio / descuento (% o $).
 *   - Subtotal a la derecha.
 *
 * Mobile: el grid colapsa en columnas verticales, todos los inputs
 * `h-10 sm:h-9` para touch ≥44px (regla DS v3).
 */

import * as React from "react";
import { Surface } from "@/components/opai-ds";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2 } from "lucide-react";
import { PlaceholderPicker } from "./_PlaceholderPicker";
import {
  hasPlaceholders,
  resolvePlaceholders,
  type PlaceholderContext,
} from "@/modules/finance/billing/placeholders";

export type DiscountKind = "PCT" | "AMOUNT";
export type LinePriceCurrency = "CLP" | "UF";

export interface LineDetailValue {
  itemName: string;
  description: string;
  quantity: string;
  unit: string;
  /** Precio unitario en la moneda activa (CLP o UF). */
  unitPrice: string;
  discountKind: DiscountKind;
  /** Valor del descuento. Si kind=PCT es 0–100; si kind=AMOUNT es monto. */
  discountValue: string;
  isExempt?: boolean;
  /**
   * Moneda del precio de ESTA línea. Solo aplica cuando el caller habilita
   * `allowPerLineCurrency` (plantillas recurrentes). En DTEs one-shot la
   * moneda viaja a nivel DTE y este campo queda undefined.
   */
  priceCurrency?: LinePriceCurrency;
}

interface Props {
  index: number;
  value: LineDetailValue;
  onChange: (next: Partial<LineDetailValue>) => void;
  onRemove: () => void;
  canRemove?: boolean;
  /**
   * Moneda "por defecto" del DTE/plantilla. En modo one-shot manda;
   * en modo `allowPerLineCurrency`, la moneda efectiva la define
   * `value.priceCurrency` y este `currency` solo se usa como fallback
   * cuando la línea aún no decide.
   */
  currency: "CLP" | "UF";
  /**
   * Si true, expone un toggle CLP/UF en cada línea (caso plantillas
   * recurrentes: la plantilla emite siempre en CLP pero una línea puede
   * traer su precio en UF y el cron convierte usando la política UF al
   * momento de generar el borrador). Default false: la moneda viaja a
   * nivel DTE/plantilla, como hoy en DteForm.
   */
  allowPerLineCurrency?: boolean;
  /**
   * Modo de placeholders:
   *   - "literal": en plantillas recurrentes inserta `{{token}}`.
   *   - "resolved": en DTE one-shot inserta el valor resuelto.
   *   - "off": sin picker (caller no quiere placeholders).
   */
  placeholderMode: "literal" | "resolved" | "off";
  /**
   * Contexto del resolver (período + UF + cliente + instalación).
   * Requerido si placeholderMode != "off".
   */
  placeholderContext?: PlaceholderContext;
  /** Mostrar checkbox "Exenta" (mixta). */
  showExempt?: boolean;
  /** Subtotal calculado (formateado por el caller). */
  subtotalFormatted: string;
}

const fmtClpQuick = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  minimumFractionDigits: 0,
});

export function LineDetailSurface({
  index,
  value,
  onChange,
  onRemove,
  canRemove = true,
  currency,
  allowPerLineCurrency = false,
  placeholderMode,
  placeholderContext,
  showExempt = false,
  subtotalFormatted,
}: Props) {
  // Moneda efectiva de la línea. Cuando el caller habilita
  // `allowPerLineCurrency`, la línea decide (CLP por default). En modo
  // one-shot ignoramos `value.priceCurrency` y usamos la moneda global.
  const lineCurrency: "CLP" | "UF" = allowPerLineCurrency
    ? value.priceCurrency ?? "CLP"
    : currency;
  const nameRef = React.useRef<HTMLInputElement | null>(null);
  const descRef = React.useRef<HTMLTextAreaElement | null>(null);

  // El textarea se muestra solo si la descripción NO está vacía O el
  // usuario tocó el botón "+ Agregar descripción".
  const [descOpen, setDescOpen] = React.useState(value.description.length > 0);

  React.useEffect(() => {
    if (value.description.length > 0 && !descOpen) setDescOpen(true);
  }, [value.description, descOpen]);

  // Cuando placeholderMode === "off" no mostramos el picker. El cast a
  // este shape angosto evita que TS se queje cuando pasamos `mode` al
  // PlaceholderPicker dentro del JSX (sabemos que ya filtramos "off"
  // con showPicker).
  const pickerMode: "literal" | "resolved" =
    placeholderMode === "off" ? "literal" : placeholderMode;
  const showPicker =
    placeholderMode !== "off" && placeholderContext !== undefined;

  // Línea-specific context: para que {{uf_monto}} resuelva el monto
  // total de la línea en UF (precio * cantidad). Solo se usa para
  // preview/inserción en el picker; el resolver del cron arma el suyo.
  // Importante: cuando la línea está en UF (allowPerLineCurrency)
  // forzamos `currency: "UF"` en el contexto para que el picker exponga
  // los tokens UF aunque la plantilla en sí emita en CLP.
  const lineCtx: PlaceholderContext | undefined = React.useMemo(() => {
    if (!placeholderContext) return undefined;
    const qty = parseFloat(value.quantity) || 1;
    const ufPrice =
      lineCurrency === "UF" ? parseFloat(value.unitPrice) || 0 : undefined;
    return {
      ...placeholderContext,
      currency: lineCurrency,
      ufMonto: ufPrice,
      ufMontoQuantity: qty,
    };
  }, [placeholderContext, value.quantity, value.unitPrice, lineCurrency]);

  const showPreview =
    placeholderMode === "literal" &&
    lineCtx !== undefined &&
    (hasPlaceholders(value.itemName) || hasPlaceholders(value.description));

  return (
    <Surface elevation={1} padding="md" className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium uppercase tracking-wide text-ds-text-3">
          Línea {index + 1}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          disabled={!canRemove}
          className="h-9 w-9 p-0"
          aria-label="Eliminar línea"
        >
          <Trash2 className="h-4 w-4 text-status-danger-fg" />
        </Button>
      </div>

      {/* Nombre del ítem */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label
            className="text-[12px] uppercase tracking-wide text-ds-text-3"
            htmlFor={`line-name-${index}`}
          >
            Nombre *
          </label>
          {showPicker && lineCtx && (
            <PlaceholderPicker
              targetRef={nameRef}
              value={value.itemName}
              onInsert={(v) => onChange({ itemName: v })}
              mode={pickerMode}
              ctx={lineCtx}
              triggerLabel="Placeholder"
            />
          )}
        </div>
        <Input
          id={`line-name-${index}`}
          ref={nameRef}
          value={value.itemName}
          onChange={(e) => onChange({ itemName: e.target.value })}
          className="h-10 sm:h-9 text-sm"
          placeholder="Ej: Servicio de Seguridad — Algarrobo 111"
          autoComplete="off"
        />
      </div>

      {/* Descripción (opcional) */}
      <div className="space-y-1">
        {!descOpen ? (
          <button
            type="button"
            onClick={() => {
              setDescOpen(true);
              requestAnimationFrame(() => descRef.current?.focus());
            }}
            className="text-[12px] text-primary hover:underline"
          >
            + Agregar descripción
          </button>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <label
                className="text-[12px] uppercase tracking-wide text-ds-text-3"
                htmlFor={`line-desc-${index}`}
              >
                Descripción (opcional)
              </label>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-ds-text-3 tabular-nums">
                  {value.description.length} / 1000
                </span>
                {showPicker && lineCtx && (
                  <PlaceholderPicker
                    targetRef={descRef}
                    value={value.description}
                    onInsert={(v) => onChange({ description: v })}
                    mode={pickerMode}
                    ctx={lineCtx}
                    triggerLabel="Placeholder"
                  />
                )}
              </div>
            </div>
            <Textarea
              id={`line-desc-${index}`}
              ref={descRef}
              value={value.description}
              onChange={(e) => onChange({ description: e.target.value })}
              maxLength={1000}
              rows={3}
              className="text-sm resize-y min-h-[72px] max-h-[240px]"
              placeholder={
                placeholderMode === "literal"
                  ? "Período {{periodo}}\nValor UF al día {{uf_fecha}}: {{uf_valor}}\nMonto: {{uf_monto}}"
                  : "Detalles adicionales del servicio…"
              }
              autoComplete="off"
            />
            {value.description.length === 0 && (
              <button
                type="button"
                onClick={() => {
                  setDescOpen(false);
                }}
                className="text-[11px] text-ds-text-3 hover:underline"
              >
                Ocultar descripción
              </button>
            )}
          </>
        )}
        {showPreview && lineCtx && (
          <div className="rounded-md bg-ds-surface-2 border border-ds-border-subtle px-2 py-1.5 mt-2">
            <div className="text-[11px] uppercase tracking-wide text-ds-text-3 mb-0.5">
              Vista previa
            </div>
            {hasPlaceholders(value.itemName) && (
              <p className="text-[12px] text-ds-text-2">
                <span className="text-ds-text-3">Nombre: </span>
                {resolvePlaceholders(value.itemName, lineCtx)}
              </p>
            )}
            {hasPlaceholders(value.description) && (
              <p className="text-[12px] text-ds-text-2 whitespace-pre-line">
                <span className="text-ds-text-3">Descripción: </span>
                {resolvePlaceholders(value.description, lineCtx)}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Grid: cantidad / unidad / precio / descuento */}
      <div className="grid grid-cols-2 sm:grid-cols-12 gap-3">
        <div className="space-y-1 sm:col-span-2">
          <label
            className="text-[12px] uppercase tracking-wide text-ds-text-3"
            htmlFor={`line-qty-${index}`}
          >
            Cantidad *
          </label>
          <Input
            id={`line-qty-${index}`}
            type="number"
            min={0.01}
            step={lineCurrency === "UF" ? "0.0001" : "0.01"}
            inputMode="decimal"
            value={value.quantity}
            onChange={(e) => onChange({ quantity: e.target.value })}
            className="h-10 sm:h-9 text-sm text-right tabular-nums"
            autoComplete="off"
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <label
            className="text-[12px] uppercase tracking-wide text-ds-text-3"
            htmlFor={`line-unit-${index}`}
          >
            Unidad
          </label>
          <Input
            id={`line-unit-${index}`}
            value={value.unit}
            onChange={(e) => onChange({ unit: e.target.value })}
            className="h-10 sm:h-9 text-sm"
            placeholder="UN"
            autoComplete="off"
          />
        </div>
        <div className="space-y-1 col-span-2 sm:col-span-4">
          <div className="flex items-center justify-between">
            <label
              className="text-[12px] uppercase tracking-wide text-ds-text-3"
              htmlFor={`line-price-${index}`}
            >
              Precio *
            </label>
            {/* Toggle CLP/UF por línea (solo en plantillas recurrentes).
                Si UF, el cron multiplica unitPriceUf × valor_UF según la
                política configurada a nivel plantilla y emite en CLP. */}
            {allowPerLineCurrency && (
              <Select
                value={lineCurrency}
                onValueChange={(v) =>
                  onChange({ priceCurrency: v as LinePriceCurrency })
                }
              >
                <SelectTrigger className="h-7 w-[88px] text-[12px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CLP">$ CLP</SelectItem>
                  <SelectItem value="UF">UF</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="relative">
            <Input
              id={`line-price-${index}`}
              type="number"
              min={0}
              step={lineCurrency === "UF" ? "0.0001" : "1"}
              inputMode="decimal"
              value={value.unitPrice}
              onChange={(e) => onChange({ unitPrice: e.target.value })}
              className="h-10 sm:h-9 text-sm text-right tabular-nums pr-12"
              placeholder="0"
              autoComplete="off"
            />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-mono text-ds-text-3">
              {lineCurrency}
            </span>
          </div>
        </div>
        <div className="space-y-1 col-span-2 sm:col-span-4">
          <label
            className="text-[12px] uppercase tracking-wide text-ds-text-3"
            htmlFor={`line-disc-${index}`}
          >
            Descuento
          </label>
          <div className="grid grid-cols-[1fr_auto] gap-1.5">
            <Input
              id={`line-disc-${index}`}
              type="number"
              min={0}
              max={value.discountKind === "PCT" ? 100 : undefined}
              step={
                value.discountKind === "PCT"
                  ? "0.01"
                  : lineCurrency === "UF"
                    ? "0.0001"
                    : "1"
              }
              inputMode="decimal"
              value={value.discountValue}
              onChange={(e) => onChange({ discountValue: e.target.value })}
              className="h-10 sm:h-9 text-sm text-right tabular-nums"
              placeholder="0"
              autoComplete="off"
            />
            <Select
              value={value.discountKind}
              onValueChange={(v) =>
                onChange({ discountKind: v as DiscountKind })
              }
            >
              <SelectTrigger className="h-10 sm:h-9 w-16 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PCT">%</SelectItem>
                <SelectItem value="AMOUNT">
                  {lineCurrency === "UF" ? "UF" : "$"}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Subtotal + checkbox exenta */}
      <div className="flex items-center justify-between gap-3 pt-1">
        {showExempt ? (
          <label className="flex items-center gap-2 text-[12px] text-ds-text-2 cursor-pointer">
            <input
              type="checkbox"
              checked={value.isExempt ?? false}
              onChange={(e) => onChange({ isExempt: e.target.checked })}
              className="size-4"
            />
            Línea exenta de IVA
          </label>
        ) : (
          <span />
        )}
        <span className="text-[13px] font-mono tabular-nums text-ds-text-2">
          Subtotal:{" "}
          <span className="font-medium text-ds-text-1">{subtotalFormatted}</span>
        </span>
      </div>
    </Surface>
  );
}

/**
 * Calcula el subtotal de una línea (qty * unitPrice - descuento). El
 * caller decide cómo formatearlo (CLP / UF). Devuelve número en la
 * misma moneda del unitPrice (CLP o UF).
 */
export function computeLineSubtotal(line: LineDetailValue): number {
  const qty = parseFloat(line.quantity) || 0;
  const price = parseFloat(line.unitPrice) || 0;
  const gross = qty * price;
  if (line.discountKind === "AMOUNT") {
    const amount = parseFloat(line.discountValue) || 0;
    return Math.max(0, gross - amount);
  }
  const pct = parseFloat(line.discountValue) || 0;
  return gross * (1 - pct / 100);
}

/**
 * Convierte el descuento de la UI (kind+value) a `discountPct` que es
 * lo que la API/persistencia espera. Para AMOUNT calcula el % efectivo
 * contra el bruto de la línea.
 */
export function lineDiscountToPct(line: LineDetailValue): number {
  if (line.discountKind === "PCT") {
    const pct = parseFloat(line.discountValue) || 0;
    if (pct < 0) return 0;
    if (pct > 100) return 100;
    return pct;
  }
  const qty = parseFloat(line.quantity) || 0;
  const price = parseFloat(line.unitPrice) || 0;
  const gross = qty * price;
  if (gross <= 0) return 0;
  const amount = parseFloat(line.discountValue) || 0;
  const pct = (amount / gross) * 100;
  if (pct < 0) return 0;
  if (pct > 100) return 100;
  return Math.round(pct * 100) / 100;
}

// Re-export para evitar import duplicado en formularios.
export { fmtClpQuick };
