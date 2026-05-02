"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete";
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
  Users,
  Navigation,
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
  isFromInstallation: boolean;
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

  // Find combustible item for auto-selection on mileage
  const combustibleItem = items.find(
    (i) => i.code === "CMB" || i.name.toLowerCase() === "combustible"
  );

  // Form state
  const [type, setTypeRaw] = useState(initialData?.type ?? "PURCHASE");
  const setType = (newType: string) => {
    setTypeRaw(newType);
    // Auto-seleccionar ítem Combustible al cambiar a Kilometraje
    if (newType === "MILEAGE" && combustibleItem) {
      setItemId(combustibleItem.id);
    }
  };
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

  // Beneficiary guardia (rendición para tercero)
  const [forThirdParty, setForThirdParty] = useState(false);
  const [beneficiaryGuardiaId, setBeneficiaryGuardiaId] = useState<string | null>(null);
  const [beneficiaryAdminId, setBeneficiaryAdminId] = useState<string | null>(null);
  const [beneficiaryName, setBeneficiaryName] = useState("");
  const [beneficiaryResults, setBeneficiaryResults] = useState<Array<{ id: string; type: "guardia" | "admin"; nombreCompleto: string; code?: string; rut?: string; email?: string }>>([]);
  const [beneficiarySearching, setBeneficiarySearching] = useState(false);
  const [beneficiaryOpen, setBeneficiaryOpen] = useState(false);
  const beneficiaryDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const beneficiaryAbortRef = useRef<AbortController | null>(null);

  // Attachments
  const [attachments, setAttachments] = useState<AttachmentPreview[]>([]);

  // Geolocation (mileage)
  const [startLocation, setStartLocation] = useState<GeolocationData | null>(null);
  const [endLocation, setEndLocation] = useState<GeolocationData | null>(null);
  const [locatingStart, setLocatingStart] = useState(false);
  const [locatingEnd, setLocatingEnd] = useState(false);
  const [startMode, setStartMode] = useState<"gps" | "manual">("gps");
  const [endMode, setEndMode] = useState<"gps" | "manual">("gps");
  const [tollAmount, setTollAmount] = useState("0");

  // Route tracking
  const [routePoints, setRoutePoints] = useState<Array<{lat: number; lng: number; ts: number}>>([]);
  const watchIdRef = useRef<number | null>(null);
  const lastPointRef = useRef<{ lat: number; lng: number } | null>(null);

  // Submit state
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  /* ── Beneficiary search ── */

  const searchBeneficiary = useCallback(async (q: string) => {
    if (!q || q.length < 2) {
      setBeneficiaryResults([]);
      setBeneficiaryOpen(false);
      return;
    }
    beneficiaryAbortRef.current?.abort();
    beneficiaryAbortRef.current = new AbortController();
    setBeneficiarySearching(true);
    try {
      const res = await fetch(
        `/api/finance/guardias-search?q=${encodeURIComponent(q)}`,
        { signal: beneficiaryAbortRef.current.signal },
      );
      const json = await res.json();
      if (res.ok && json.success && Array.isArray(json.data)) {
        setBeneficiaryResults(json.data);
        setBeneficiaryOpen(json.data.length > 0);
      }
    } catch {
      /* aborted */
    } finally {
      setBeneficiarySearching(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (beneficiaryDebounceRef.current) clearTimeout(beneficiaryDebounceRef.current);
      beneficiaryAbortRef.current?.abort();
    };
  }, []);

  /* ── Route tracking ── */

  const startTracking = useCallback(() => {
    if (watchIdRef.current !== null || !navigator.geolocation) return;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const pt = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const last = lastPointRef.current;
        if (last) {
          const R = 6371000;
          const dLat = ((pt.lat - last.lat) * Math.PI) / 180;
          const dLng = ((pt.lng - last.lng) * Math.PI) / 180;
          const a = Math.sin(dLat / 2) ** 2 + Math.cos((last.lat * Math.PI) / 180) * Math.cos((pt.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
          const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          if (dist < 100) return;
        }
        lastPointRef.current = pt;
        setRoutePoints((prev) => [...prev, { ...pt, ts: Date.now() }]);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
  }, []);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  useEffect(() => () => stopTracking(), [stopTracking]);

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
          const loc = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            timestamp: Date.now(),
          };
          setLocation(loc);
          setLocating(false);
          if (target === "start") {
            lastPointRef.current = { lat: loc.lat, lng: loc.lng };
            setRoutePoints([{ lat: loc.lat, lng: loc.lng, ts: loc.timestamp }]);
            startTracking();
            toast.success("Ubicación de inicio capturada — rastreando ruta");
          } else {
            stopTracking();
            toast.success("Ubicación de fin capturada");
          }
        },
        (err) => {
          setLocating(false);
          toast.error(`Error de geolocalización: ${err.message}`);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    },
    [startTracking, stopTracking]
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

      // "Sin respaldo" requiere descripción obligatoria, no requiere imagen
      if (documentType === "SIN_RESPALDO" && !description.trim()) {
        errs.description = "Al seleccionar 'Sin respaldo' debes indicar el motivo en las observaciones";
      }
    }

    if (type === "MILEAGE") {
      if (!startLocation) errs.startLocation = "Captura la ubicación de inicio";
      if (!endLocation) errs.endLocation = "Captura la ubicación de fin";
    }

    // Si no adjunta imagen y no es "sin respaldo", la observación es obligatoria
    if (documentType !== "SIN_RESPALDO" && attachments.length === 0 && !description.trim()) {
      errs.description = "Si no adjuntas imagen, debes indicar el motivo en las observaciones";
    }

    // Solo exigir imagen si la config lo requiere, no es "sin respaldo" y no es kilometraje
    if (
      config?.requireImage &&
      type !== "MILEAGE" &&
      documentType !== "SIN_RESPALDO" &&
      attachments.length === 0
    ) {
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
              startAddress: startLocation.address?.trim() || undefined,
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
              endAddress: endLocation.address?.trim() || undefined,
              tollAmount: parseInt(tollAmount.replace(/[^\d]/g, "")) || 0,
              routePoints: routePoints.length > 0 ? routePoints : undefined,
            }),
          });
          const tripEndData = await tripEndRes.json();
          if (!tripEndRes.ok) throw new Error(tripEndData.error || "Error al finalizar trayecto");

          rendicionId = tripEndData.data?.rendicion?.id;

          // Update rendicion with extra fields if needed
          if (rendicionId && (description || costCenterId || beneficiaryGuardiaId)) {
            await fetch(`/api/finance/rendiciones/${rendicionId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                description: description || null,
                costCenterId: costCenterId || null,
                date,
                beneficiaryGuardiaId: beneficiaryGuardiaId || null,
                beneficiaryAdminId: beneficiaryAdminId || null,
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
            beneficiaryGuardiaId: beneficiaryGuardiaId || null,
            beneficiaryAdminId: beneficiaryAdminId || null,
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
      routePoints,
      mileageCost,
      initialData,
      router,
      beneficiaryGuardiaId,
      beneficiaryAdminId,
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
                  ? "border-status-ok-border bg-status-ok-soft"
                  : "border-border hover:bg-accent/30"
              )}
            >
              <Receipt
                className={cn(
                  "h-5 w-5",
                  type === "PURCHASE"
                    ? "text-status-ok-fg"
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
                  ? "border-status-info-border bg-status-info-soft"
                  : "border-border hover:bg-accent/30"
              )}
            >
              <Car
                className={cn(
                  "h-5 w-5",
                  type === "MILEAGE"
                    ? "text-status-info-fg"
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
              className={cn("mt-1", errors.date && "border-status-danger-border")}
            />
            {errors.date && (
              <p className="text-xs text-status-danger-fg mt-1">{errors.date}</p>
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
                  value={amount ? Number(amount).toLocaleString("es-CL") : ""}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="0"
                  className={cn("mt-1", errors.amount && "border-status-danger-border")}
                />
                {errors.amount && (
                  <p className="text-xs text-status-danger-fg mt-1">{errors.amount}</p>
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
                      errors.documentType && "border-status-danger-border"
                    )}
                  >
                    <SelectValue placeholder="Seleccionar tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BOLETA">Boleta</SelectItem>
                    <SelectItem value="FACTURA">Factura</SelectItem>
                    <SelectItem value="SIN_RESPALDO">Sin respaldo</SelectItem>
                  </SelectContent>
                </Select>
                {errors.documentType && (
                  <p className="text-xs text-status-danger-fg mt-1">
                    {errors.documentType}
                  </p>
                )}
              </div>
            </>
          )}

          {/* Mileage-specific fields */}
          {type === "MILEAGE" && (
            <div className="space-y-4">
              {/* Punto de inicio */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label>Punto de inicio</Label>
                  <div className="flex rounded-md overflow-hidden border border-border text-xs">
                    <button
                      type="button"
                      onClick={() => setStartMode("gps")}
                      className={cn("px-2.5 py-1 flex items-center gap-1 transition-colors", startMode === "gps" ? "bg-status-ok-soft text-status-ok-fg" : "text-muted-foreground hover:text-foreground")}
                    >
                      <Navigation className="h-3 w-3" />
                      GPS
                    </button>
                    <button
                      type="button"
                      onClick={() => setStartMode("manual")}
                      className={cn("px-2.5 py-1 flex items-center gap-1 transition-colors border-l border-border", startMode === "manual" ? "bg-status-info-soft text-status-info-fg" : "text-muted-foreground hover:text-foreground")}
                    >
                      <MapPin className="h-3 w-3" />
                      Manual
                    </button>
                  </div>
                </div>
                {startMode === "gps" ? (
                  <Button
                    type="button"
                    variant={startLocation ? "outline" : "default"}
                    size="sm"
                    onClick={() => captureLocation("start")}
                    disabled={locatingStart}
                    className={cn("w-full", errors.startLocation && "border-status-danger-border")}
                  >
                    {locatingStart ? (
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    ) : (
                      <Navigation className="h-4 w-4 mr-1.5" />
                    )}
                    {startLocation?.address
                      ? startLocation.address
                      : startLocation
                      ? `${startLocation.lat.toFixed(5)}, ${startLocation.lng.toFixed(5)}`
                      : "Capturar inicio (ubicación actual)"}
                  </Button>
                ) : (
                  <AddressAutocomplete
                    value={startLocation?.address ?? ""}
                    placeholder="Buscar dirección de inicio..."
                    showMap={false}
                    className={cn(errors.startLocation && "border-status-danger-border")}
                    onChange={(result) => {
                      setStartLocation({ lat: result.lat, lng: result.lng, address: result.address, timestamp: Date.now() });
                    }}
                  />
                )}
                {errors.startLocation && (
                  <p className="text-xs text-status-danger-fg mt-1">{errors.startLocation}</p>
                )}
                {startLocation && (
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {startLocation.address || `${startLocation.lat.toFixed(5)}, ${startLocation.lng.toFixed(5)}`}
                    <button type="button" onClick={() => setStartLocation(null)} className="ml-auto text-muted-foreground hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </p>
                )}
              </div>

              {/* Punto de fin */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label>Punto de fin</Label>
                  <div className="flex rounded-md overflow-hidden border border-border text-xs">
                    <button
                      type="button"
                      onClick={() => setEndMode("gps")}
                      className={cn("px-2.5 py-1 flex items-center gap-1 transition-colors", endMode === "gps" ? "bg-status-ok-soft text-status-ok-fg" : "text-muted-foreground hover:text-foreground")}
                    >
                      <Navigation className="h-3 w-3" />
                      GPS
                    </button>
                    <button
                      type="button"
                      onClick={() => setEndMode("manual")}
                      className={cn("px-2.5 py-1 flex items-center gap-1 transition-colors border-l border-border", endMode === "manual" ? "bg-status-info-soft text-status-info-fg" : "text-muted-foreground hover:text-foreground")}
                    >
                      <MapPin className="h-3 w-3" />
                      Manual
                    </button>
                  </div>
                </div>
                {endMode === "gps" ? (
                  <Button
                    type="button"
                    variant={endLocation ? "outline" : "default"}
                    size="sm"
                    onClick={() => captureLocation("end")}
                    disabled={locatingEnd}
                    className={cn("w-full", errors.endLocation && "border-status-danger-border")}
                  >
                    {locatingEnd ? (
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    ) : (
                      <Navigation className="h-4 w-4 mr-1.5" />
                    )}
                    {endLocation?.address
                      ? endLocation.address
                      : endLocation
                      ? `${endLocation.lat.toFixed(5)}, ${endLocation.lng.toFixed(5)}`
                      : "Capturar fin (ubicación actual)"}
                  </Button>
                ) : (
                  <AddressAutocomplete
                    value={endLocation?.address ?? ""}
                    placeholder="Buscar dirección de fin..."
                    showMap={false}
                    className={cn(errors.endLocation && "border-status-danger-border")}
                    onChange={(result) => {
                      setEndLocation({ lat: result.lat, lng: result.lng, address: result.address, timestamp: Date.now() });
                    }}
                  />
                )}
                {errors.endLocation && (
                  <p className="text-xs text-status-danger-fg mt-1">{errors.endLocation}</p>
                )}
                {endLocation && (
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {endLocation.address || `${endLocation.lat.toFixed(5)}, ${endLocation.lng.toFixed(5)}`}
                    <button type="button" onClick={() => setEndLocation(null)} className="ml-auto text-muted-foreground hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </p>
                )}
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
                  <CardContent className="pt-4">
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
                        <span className="text-status-ok-fg">
                          {fmtCLP.format(mileageCost.total)}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Item selector - oculto en kilometraje (auto Combustible) */}
          {type === "MILEAGE" ? (
            <div>
              <Label>Ítem</Label>
              <p className="text-sm text-muted-foreground mt-1 px-3 py-2 rounded-md border border-border bg-muted/30">
                Combustible (asignado automáticamente)
              </p>
            </div>
          ) : (
            <div>
              <Label htmlFor="item">Ítem</Label>
              <SearchableSelect
                value={itemId}
                options={items.map((item) => ({
                  id: item.id,
                  label: item.name + (item.code ? ` (${item.code})` : ""),
                  description: item.category || undefined,
                }))}
                placeholder="Seleccionar ítem (opcional)"
                emptyText="No se encontraron ítems"
                onChange={(id) => setItemId(id)}
              />
            </div>
          )}

          {/* Centro de costo */}
          {costCenters.length > 0 && (
            <div>
              <Label htmlFor="costCenter">Centro de costo</Label>
              <SearchableSelect
                value={costCenterId}
                options={costCenters.map((cc) => ({
                  id: cc.id,
                  label: cc.name,
                  description: cc.code ?? undefined,
                }))}
                placeholder="Seleccionar centro de costo (opcional)"
                emptyText="No se encontraron centros de costo"
                onChange={(id) => setCostCenterId(id)}
              />
            </div>
          )}

          {/* Beneficiary guardia (rendición para tercero) */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="forThirdParty"
                checked={forThirdParty}
                onChange={(e) => {
                  setForThirdParty(e.target.checked);
                  if (!e.target.checked) {
                    setBeneficiaryGuardiaId(null);
                    setBeneficiaryAdminId(null);
                    setBeneficiaryName("");
                    setBeneficiaryResults([]);
                  }
                }}
                className="h-4 w-4 rounded border-border text-status-ok-fg focus:ring-emerald-500"
              />
              <Label htmlFor="forThirdParty" className="cursor-pointer flex items-center gap-1.5 text-sm">
                <Users className="h-4 w-4 text-muted-foreground" />
                Rendición para un tercero (guardia o usuario)
              </Label>
            </div>

            {forThirdParty && (
              <div className="relative">
                <Input
                  value={beneficiaryName}
                  onChange={(e) => {
                    const v = e.target.value;
                    setBeneficiaryName(v);
                    setBeneficiaryGuardiaId(null);
                    if (beneficiaryDebounceRef.current) clearTimeout(beneficiaryDebounceRef.current);
                    beneficiaryDebounceRef.current = setTimeout(() => searchBeneficiary(v), 250);
                  }}
                  placeholder="Buscar guardia o usuario por nombre, RUT o código..."
                  className={cn(beneficiaryGuardiaId && "border-status-ok-border bg-status-ok-soft")}
                />
                {beneficiarySearching && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                )}
                {beneficiaryGuardiaId && (
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setBeneficiaryGuardiaId(null);
                      setBeneficiaryAdminId(null);
                      setBeneficiaryName("");
                    }}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                {!beneficiaryGuardiaId && beneficiaryAdminId && (
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setBeneficiaryGuardiaId(null);
                      setBeneficiaryAdminId(null);
                      setBeneficiaryName("");
                    }}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                {beneficiaryOpen && beneficiaryResults.length > 0 && (
                  <ul className="absolute left-0 right-0 z-50 mt-1 max-h-48 overflow-auto rounded-lg border border-border bg-popover py-1 text-sm shadow-xl">
                    {beneficiaryResults.map((g) => (
                      <li
                        key={g.id}
                        className="cursor-pointer px-3 py-2.5 hover:bg-accent/60"
                        onClick={() => {
                          if (g.type === "guardia") {
                            setBeneficiaryGuardiaId(g.id);
                            setBeneficiaryAdminId(null);
                          } else {
                            setBeneficiaryAdminId(g.id);
                            setBeneficiaryGuardiaId(null);
                          }
                          setBeneficiaryName(g.nombreCompleto);
                          setBeneficiaryOpen(false);
                          setBeneficiaryResults([]);
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{g.nombreCompleto}</span>
                          <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", g.type === "guardia" ? "bg-status-ok-soft text-status-ok-fg" : "bg-status-info-soft text-status-info-fg")}>
                            {g.type === "guardia" ? "Guardia" : "Usuario"}
                          </span>
                        </div>
                        <div className="flex gap-2 mt-0.5">
                          {g.rut && <span className="text-xs text-muted-foreground">{g.rut}</span>}
                          {g.code && <span className="text-xs text-muted-foreground">Cód. {g.code}</span>}
                          {g.email && <span className="text-xs text-muted-foreground">{g.email}</span>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {(beneficiaryGuardiaId || beneficiaryAdminId) && (
                  <p className="text-xs text-status-ok-fg mt-1">
                    {beneficiaryGuardiaId
                      ? "El pago se realizará a la cuenta bancaria de este guardia."
                      : "El pago se realizará a este usuario del sistema."}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="description">
              Descripción / Observaciones
              {(config?.requireObservations || documentType === "SIN_RESPALDO") && (
                <span className="text-status-danger-fg ml-1">*</span>
              )}
            </Label>
            {documentType === "SIN_RESPALDO" && (
              <p className="text-xs text-status-warn-fg mt-0.5">Obligatorio indicar motivo al no tener respaldo documental.</p>
            )}
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalle del gasto..."
              rows={3}
              className={cn(
                "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none",
                errors.description && "border-status-danger-border"
              )}
            />
            {errors.description && (
              <p className="text-xs text-status-danger-fg mt-1">{errors.description}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Attachments */}
      <Card>
        <CardContent className="pt-5">
          <Label className="mb-3 block">
            Imágenes / Documentos
            {config?.requireImage && type !== "MILEAGE" && (
              <span className="text-status-danger-fg ml-1">*</span>
            )}
          </Label>

          {/* Drop zone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors hover:border-primary/50 hover:bg-accent/20",
              errors.attachments ? "border-status-danger-border" : "border-border"
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
            <p className="text-xs text-status-danger-fg mt-1">{errors.attachments}</p>
          )}

          {/* Previews */}
          {attachments.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
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
                    className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full p-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
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

