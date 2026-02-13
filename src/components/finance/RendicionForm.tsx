"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import {
  Receipt,
  Car,
  Upload,
  X,
  MapPin,
  Loader2,
  Save,
  Send,
  Image as ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Types ── */

interface ItemOption {
  id: string;
  name: string;
  code: string | null;
  category: string | null;
}

interface CostCenterOption {
  id: string;
  name: string;
  code: string | null;
}

interface KmConfig {
  kmPerLiter: number;
  fuelPricePerLiter: number;
  vehicleFeePct: number;
  requireImage: boolean;
  requireObservations: boolean;
  requireTollImage: boolean;
}

interface RendicionFormProps {
  items: ItemOption[];
  costCenters: CostCenterOption[];
  config: KmConfig | null;
  /** If editing, pass initial data */
  initialData?: {
    id: string;
    type: string;
    amount: number;
    date: string;
    description: string;
    documentType: string | null;
    itemId: string | null;
    costCenterId: string | null;
  };
}

interface GeolocationData {
  lat: number;
  lng: number;
  address?: string;
  timestamp: number;
}

interface AttachmentPreview {
  file: File;
  previewUrl: string;
  id: string;
}

/* ── Helpers ── */

function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

const fmtCLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  minimumFractionDigits: 0,
});

/* ── Component ── */

export function RendicionForm({
  items,
  costCenters,
  config,
  initialData,
}: RendicionFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [type, setType] = useState(initialData?.type ?? "PURCHASE");
  const [amount, setAmount] = useState(
    initialData?.amount ? String(initialData.amount) : ""
  );
  const [date, setDate] = useState(
    initialData?.date
      ? initialData.date.slice(0, 10)
      : new Date().toISOString().slice(0, 10)
  );
  const [description, setDescription] = useState(
    initialData?.description ?? ""
  );
  const [documentType, setDocumentType] = useState(
    initialData?.documentType ?? ""
  );
  const [itemId, setItemId] = useState(initialData?.itemId ?? "");
  const [costCenterId, setCostCenterId] = useState(
    initialData?.costCenterId ?? ""
  );

  // Attachments
  const [attachments, setAttachments] = useState<AttachmentPreview[]>([]);

  // Geolocation (mileage)
  const [startLocation, setStartLocation] = useState<GeolocationData | null>(
    null
  );
  const [endLocation, setEndLocation] = useState<GeolocationData | null>(null);
  const [locatingStart, setLocatingStart] = useState(false);
  const [locatingEnd, setLocatingEnd] = useState(false);
  const [tollAmount, setTollAmount] = useState("0");

  // Submit state
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  /* ── Geolocation ── */

  const captureLocation = useCallback(
    (target: "start" | "end") => {
      if (!navigator.geolocation) {
        toast.error("Geolocalización no disponible en este navegador.");
        return;
      }

      const setLocating = target === "start" ? setLocatingStart : setLocatingEnd;
      const setLocation = target === "start" ? setStartLocation : setEndLocation;

      setLocating(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocation({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            timestamp: Date.now(),
          });
          setLocating(false);
          toast.success(
            target === "start"
              ? "Ubicación de inicio capturada"
              : "Ubicación de fin capturada"
          );
        },
        (err) => {
          setLocating(false);
          toast.error(`Error de geolocalización: ${err.message}`);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    },
    []
  );

  /* ── Mileage calculation ── */

  const estimatedDistance = useMemo(() => {
    if (!startLocation || !endLocation) return null;
    // Haversine formula
    const R = 6371;
    const dLat = ((endLocation.lat - startLocation.lat) * Math.PI) / 180;
    const dLng = ((endLocation.lng - startLocation.lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((startLocation.lat * Math.PI) / 180) *
        Math.cos((endLocation.lat * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 100) / 100;
  }, [startLocation, endLocation]);

  const mileageCost = useMemo(() => {
    if (!estimatedDistance || !config) return null;
    const liters = estimatedDistance / config.kmPerLiter;
    const fuelCost = Math.round(liters * config.fuelPricePerLiter);
    const vehicleFee = Math.round(fuelCost * (config.vehicleFeePct / 100));
    const toll = parseInt(tollAmount) || 0;
    const total = fuelCost + vehicleFee + toll;
    return { liters: Math.round(liters * 100) / 100, fuelCost, vehicleFee, toll, total };
  }, [estimatedDistance, config, tollAmount]);

  /* ── File handling ── */

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const newAttachments: AttachmentPreview[] = Array.from(files).map(
      (file) => ({
        file,
        previewUrl: URL.createObjectURL(file),
        id: generateId(),
      })
    );
    setAttachments((prev) => [...prev, ...newAttachments]);
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const item = prev.find((a) => a.id === id);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  /* ── Validation ── */

  const validate = useCallback(() => {
    const errs: Record<string, string> = {};

    if (!date) errs.date = "Fecha requerida";

    if (type === "PURCHASE") {
      if (!amount || parseInt(amount) <= 0)
        errs.amount = "Monto debe ser mayor a 0";
      if (!documentType) errs.documentType = "Tipo de documento requerido";
    }

    if (type === "MILEAGE") {
      if (!startLocation) errs.startLocation = "Captura la ubicación de inicio";
      if (!endLocation) errs.endLocation = "Captura la ubicación de fin";
    }

    // Si no adjunta imagen, la observación es obligatoria (explicar por qué no hay comprobante)
    if (attachments.length === 0 && !description.trim()) {
      errs.description = "Si no adjuntas imagen, debes indicar el motivo en las observaciones";
    }

    if (config?.requireImage && attachments.length === 0) {
      errs.attachments = "Debes adjuntar al menos una imagen";
    }

    if (config?.requireObservations && !description.trim()) {
      errs.description = "Observaciones requeridas";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }, [
    type,
    amount,
    date,
    documentType,
    startLocation,
    endLocation,
    attachments,
    description,
    config,
  ]);

  /* ── Submit ── */

  const handleSubmit = useCallback(
    async (asDraft: boolean) => {
      if (!validate()) {
        toast.error("Corrige los errores antes de continuar.");
        return;
      }

      const setLoading = asDraft ? setSaving : setSubmitting;
      setLoading(true);

      try {
        let rendicionId = initialData?.id;
        const cleanAmount = amount ? parseInt(amount.replace(/[^\d]/g, "")) : 0;

        // Step 1: For MILEAGE, start trip first
        if (type === "MILEAGE" && startLocation && endLocation && !initialData) {
          // Start trip
          const tripStartRes = await fetch("/api/finance/trips/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              startLat: startLocation.lat,
              startLng: startLocation.lng,
              startAddress: startLocation.address || null,
            }),
          });
          const tripStartData = await tripStartRes.json();
          if (!tripStartRes.ok) throw new Error(tripStartData.error || "Error al iniciar trayecto");

          const tripId = tripStartData.data?.id;

          // End trip (calculates distance and creates rendicion)
          const tripEndRes = await fetch(`/api/finance/trips/${tripId}/end`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              endLat: endLocation.lat,
              endLng: endLocation.lng,
              endAddress: endLocation.address || null,
              tollAmount: parseInt(tollAmount.replace(/[^\d]/g, "")) || 0,
            }),
          });
          const tripEndData = await tripEndRes.json();
          if (!tripEndRes.ok) throw new Error(tripEndData.error || "Error al finalizar trayecto");

          rendicionId = tripEndData.data?.rendicionId || tripEndData.rendicionId;

          // Update rendicion with extra fields if needed
          if (rendicionId && (description || costCenterId)) {
            await fetch(`/api/finance/rendiciones/${rendicionId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                description: description || null,
                costCenterId: costCenterId || null,
                date,
              }),
            });
          }
        } else if (type === "PURCHASE" || initialData) {
          // Step 1: Create or update rendicion with JSON
          const body: Record<string, unknown> = {
            type,
            amount: cleanAmount,
            date,
            description: description || null,
            documentType: documentType || null,
            itemId: itemId || null,
            costCenterId: costCenterId || null,
          };

          const url = initialData
            ? `/api/finance/rendiciones/${initialData.id}`
            : "/api/finance/rendiciones";
          const method = initialData ? "PATCH" : "POST";

          const res = await fetch(url, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Error al guardar rendición");
          rendicionId = data.data?.id || data.id;
        }

        // Step 2: Upload attachments
        if (rendicionId && attachments.length > 0) {
          for (const att of attachments) {
            const fd = new FormData();
            fd.append("file", att.file);
            fd.append("rendicionId", rendicionId);
            fd.append("attachmentType", documentType === "FACTURA" ? "INVOICE" : "RECEIPT");
            await fetch("/api/finance/attachments/upload", { method: "POST", body: fd });
          }
        }

        // Step 3: Submit for approval if not draft
        if (!asDraft && rendicionId) {
          const submitRes = await fetch(`/api/finance/rendiciones/${rendicionId}/submit`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          });
          const submitData = await submitRes.json();
          if (!submitRes.ok) throw new Error(submitData.error || "Error al enviar para aprobación");
        }

        toast.success(
          asDraft
            ? "Rendición guardada como borrador"
            : "Rendición enviada para aprobación"
        );
        router.push(rendicionId ? `/finanzas/rendiciones/${rendicionId}` : "/finanzas/rendiciones");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al guardar");
      } finally {
        setLoading(false);
      }
    },
    [
      validate,
      type,
      date,
      description,
      amount,
      documentType,
      itemId,
      costCenterId,
      attachments,
      startLocation,
      endLocation,
      tollAmount,
      mileageCost,
      initialData,
      router,
    ]
  );

  return (
    <div className="max-w-2xl space-y-6">
      {/* Type selector */}
      <Card>
        <CardContent className="pt-5">
          <Label className="text-sm font-medium mb-3 block">
            Tipo de rendición
          </Label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setType("PURCHASE")}
              className={cn(
                "flex items-center gap-3 rounded-lg border p-4 transition-colors text-left",
                type === "PURCHASE"
                  ? "border-emerald-500/50 bg-emerald-500/10"
                  : "border-border hover:bg-accent/30"
              )}
            >
              <Receipt
                className={cn(
                  "h-5 w-5",
                  type === "PURCHASE"
                    ? "text-emerald-400"
                    : "text-muted-foreground"
                )}
              />
              <div>
                <p className="text-sm font-medium">Compra</p>
                <p className="text-xs text-muted-foreground">
                  Boleta o factura
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setType("MILEAGE")}
              className={cn(
                "flex items-center gap-3 rounded-lg border p-4 transition-colors text-left",
                type === "MILEAGE"
                  ? "border-blue-500/50 bg-blue-500/10"
                  : "border-border hover:bg-accent/30"
              )}
            >
              <Car
                className={cn(
                  "h-5 w-5",
                  type === "MILEAGE"
                    ? "text-blue-400"
                    : "text-muted-foreground"
                )}
              />
              <div>
                <p className="text-sm font-medium">Kilometraje</p>
                <p className="text-xs text-muted-foreground">
                  Trayecto en vehículo
                </p>
              </div>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Main form */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          {/* Date */}
          <div>
            <Label htmlFor="date">Fecha</Label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={cn("mt-1", errors.date && "border-red-500")}
            />
            {errors.date && (
              <p className="text-xs text-red-400 mt-1">{errors.date}</p>
            )}
          </div>

          {/* Purchase-specific fields */}
          {type === "PURCHASE" && (
            <>
              <div>
                <Label htmlFor="amount">Monto (CLP)</Label>
                <Input
                  id="amount"
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="0"
                  className={cn("mt-1", errors.amount && "border-red-500")}
                />
                {errors.amount && (
                  <p className="text-xs text-red-400 mt-1">{errors.amount}</p>
                )}
                {amount && parseInt(amount) > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {fmtCLP.format(parseInt(amount))}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="documentType">Tipo de documento</Label>
                <Select value={documentType} onValueChange={setDocumentType}>
                  <SelectTrigger
                    className={cn(
                      "mt-1",
                      errors.documentType && "border-red-500"
                    )}
                  >
                    <SelectValue placeholder="Seleccionar tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BOLETA">Boleta</SelectItem>
                    <SelectItem value="FACTURA">Factura</SelectItem>
                  </SelectContent>
                </Select>
                {errors.documentType && (
                  <p className="text-xs text-red-400 mt-1">
                    {errors.documentType}
                  </p>
                )}
              </div>
            </>
          )}

          {/* Mileage-specific fields */}
          {type === "MILEAGE" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Punto de inicio</Label>
                  <Button
                    type="button"
                    variant={startLocation ? "outline" : "default"}
                    size="sm"
                    onClick={() => captureLocation("start")}
                    disabled={locatingStart}
                    className={cn(
                      "mt-1 w-full",
                      errors.startLocation && "border-red-500"
                    )}
                  >
                    {locatingStart ? (
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    ) : (
                      <MapPin className="h-4 w-4 mr-1.5" />
                    )}
                    {startLocation
                      ? `${startLocation.lat.toFixed(5)}, ${startLocation.lng.toFixed(5)}`
                      : "Capturar inicio"}
                  </Button>
                  {errors.startLocation && (
                    <p className="text-xs text-red-400 mt-1">
                      {errors.startLocation}
                    </p>
                  )}
                </div>
                <div>
                  <Label>Punto de fin</Label>
                  <Button
                    type="button"
                    variant={endLocation ? "outline" : "default"}
                    size="sm"
                    onClick={() => captureLocation("end")}
                    disabled={locatingEnd}
                    className={cn(
                      "mt-1 w-full",
                      errors.endLocation && "border-red-500"
                    )}
                  >
                    {locatingEnd ? (
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    ) : (
                      <MapPin className="h-4 w-4 mr-1.5" />
                    )}
                    {endLocation
                      ? `${endLocation.lat.toFixed(5)}, ${endLocation.lng.toFixed(5)}`
                      : "Capturar fin"}
                  </Button>
                  {errors.endLocation && (
                    <p className="text-xs text-red-400 mt-1">
                      {errors.endLocation}
                    </p>
                  )}
                </div>
              </div>

              {/* Toll amount */}
              <div>
                <Label htmlFor="tollAmount">Peaje (CLP)</Label>
                <Input
                  id="tollAmount"
                  inputMode="numeric"
                  value={tollAmount}
                  onChange={(e) => setTollAmount(e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="0"
                  className="mt-1"
                />
              </div>

              {/* Mileage cost breakdown */}
              {estimatedDistance !== null && mileageCost && (
                <Card className="bg-muted/30">
                  <CardContent className="pt-4 pb-4">
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      Cálculo estimado
                    </p>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Distancia
                        </span>
                        <span>{estimatedDistance} km</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Litros consumidos
                        </span>
                        <span>{mileageCost.liters} L</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Costo combustible
                        </span>
                        <span>{fmtCLP.format(mileageCost.fuelCost)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Fee vehículo ({config?.vehicleFeePct}%)
                        </span>
                        <span>{fmtCLP.format(mileageCost.vehicleFee)}</span>
                      </div>
                      {mileageCost.toll > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Peaje</span>
                          <span>{fmtCLP.format(mileageCost.toll)}</span>
                        </div>
                      )}
                      <div className="flex justify-between border-t border-border pt-1 font-medium">
                        <span>Total</span>
                        <span className="text-emerald-400">
                          {fmtCLP.format(mileageCost.total)}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Item selector */}
          <div>
            <Label htmlFor="item">Ítem</Label>
            <Select value={itemId} onValueChange={setItemId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Seleccionar ítem (opcional)" />
              </SelectTrigger>
              <SelectContent>
                {items.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                    {item.code && (
                      <span className="text-muted-foreground ml-1">
                        ({item.code})
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Cost center selector */}
          <div>
            <Label htmlFor="costCenter">Centro de costo</Label>
            <Select value={costCenterId} onValueChange={setCostCenterId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Seleccionar centro de costo (opcional)" />
              </SelectTrigger>
              <SelectContent>
                {costCenters.map((cc) => (
                  <SelectItem key={cc.id} value={cc.id}>
                    {cc.name}
                    {cc.code && (
                      <span className="text-muted-foreground ml-1">
                        ({cc.code})
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="description">
              Descripción / Observaciones
              {config?.requireObservations && (
                <span className="text-red-400 ml-1">*</span>
              )}
            </Label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalle del gasto..."
              rows={3}
              className={cn(
                "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none",
                errors.description && "border-red-500"
              )}
            />
            {errors.description && (
              <p className="text-xs text-red-400 mt-1">{errors.description}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Attachments */}
      <Card>
        <CardContent className="pt-5">
          <Label className="mb-3 block">
            Imágenes / Documentos
            {config?.requireImage && (
              <span className="text-red-400 ml-1">*</span>
            )}
          </Label>

          {/* Drop zone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors hover:border-primary/50 hover:bg-accent/20",
              errors.attachments ? "border-red-500/50" : "border-border"
            )}
          >
            <Upload className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">
              Arrastra imágenes aquí o{" "}
              <span className="text-primary underline">selecciona archivos</span>
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              JPG, PNG o PDF. Máx. 10 MB cada uno.
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf"
            multiple
            onChange={(e) => handleFiles(e.target.files)}
            className="hidden"
          />
          {errors.attachments && (
            <p className="text-xs text-red-400 mt-1">{errors.attachments}</p>
          )}

          {/* Previews */}
          {attachments.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-3">
              {attachments.map((a) => (
                <div key={a.id} className="relative group">
                  {a.file.type.startsWith("image/") ? (
                    <img
                      src={a.previewUrl}
                      alt={a.file.name}
                      className="w-full h-20 object-cover rounded-md border border-border"
                    />
                  ) : (
                    <div className="w-full h-20 flex items-center justify-center rounded-md border border-border bg-muted">
                      <ImageIcon className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removeAttachment(a.id)}
                    className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3" />
                  </button>
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                    {a.file.name}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
        <Button
          variant="outline"
          onClick={() => router.back()}
          disabled={saving || submitting}
        >
          Cancelar
        </Button>
        <Button
          variant="outline"
          onClick={() => handleSubmit(true)}
          disabled={saving || submitting}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-1.5" />
          )}
          Guardar borrador
        </Button>
        <Button
          onClick={() => handleSubmit(false)}
          disabled={saving || submitting}
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Send className="h-4 w-4 mr-1.5" />
          )}
          Enviar a aprobación
        </Button>
      </div>
    </div>
  );
}

