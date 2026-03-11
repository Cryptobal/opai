"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Camera, Loader2, MapPin, Send, X } from "lucide-react";
import { toast } from "sonner";
import { SupervisorInstallation } from "@/lib/portal-supervisor";

interface Props {
  installations: SupervisorInstallation[];
  onBack: () => void;
  onCreated: () => void;
}

type DocType = "BOLETA" | "FACTURA" | "SIN_RESPALDO";
type RendType = "PURCHASE" | "MILEAGE";

interface GeolocationData {
  lat: number;
  lng: number;
  timestamp: number;
}

interface RoutePoint {
  lat: number;
  lng: number;
  ts: number;
}

interface KmConfig {
  kmPerLiter: number;
  fuelPricePerLiter: number;
  vehicleFeePct: number;
}

const fmtCLP = (n: number) =>
  "$" + n.toLocaleString("es-CL");

export function SupervisorCrearRendicion({ installations, onBack, onCreated }: Props) {
  const [type, setType] = useState<RendType>("PURCHASE");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [docType, setDocType] = useState<DocType>("BOLETA");
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Mileage GPS state
  const [startLocation, setStartLocation] = useState<GeolocationData | null>(null);
  const [endLocation, setEndLocation] = useState<GeolocationData | null>(null);
  const [locatingStart, setLocatingStart] = useState(false);
  const [locatingEnd, setLocatingEnd] = useState(false);
  const [tollAmount, setTollAmount] = useState("0");
  const [kmConfig, setKmConfig] = useState<KmConfig | null>(null);
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);
  const watchIdRef = useRef<number | null>(null);
  const lastPointRef = useRef<{ lat: number; lng: number } | null>(null);

  // Fetch km config on mount
  useEffect(() => {
    fetch("/api/finance/config")
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data) {
          setKmConfig({
            kmPerLiter: Number(json.data.kmPerLiter) || 10,
            fuelPricePerLiter: Number(json.data.fuelPricePerLiter) || 1500,
            vehicleFeePct: Number(json.data.vehicleFeePct) || 10,
          });
        }
      })
      .catch(() => {});
  }, []);

  // Start background route tracking
  const startTracking = useCallback(() => {
    if (watchIdRef.current !== null || !navigator.geolocation) return;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const pt = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        // Only store point if moved > 100m from last point
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

  // Cleanup on unmount
  useEffect(() => () => stopTracking(), [stopTracking]);

  // GPS capture
  const captureLocation = useCallback((target: "start" | "end") => {
    if (!navigator.geolocation) {
      toast.error("Geolocalización no disponible.");
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
          toast.success("Inicio capturado — rastreando ruta");
        } else {
          stopTracking();
          toast.success("Fin capturado");
        }
      },
      (err) => {
        setLocating(false);
        toast.error(`Error GPS: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [startTracking, stopTracking]);

  // Haversine distance
  const estimatedDistance = useMemo(() => {
    if (!startLocation || !endLocation) return null;
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

  // Cost breakdown
  const mileageCost = useMemo(() => {
    if (!estimatedDistance || !kmConfig) return null;
    const liters = estimatedDistance / kmConfig.kmPerLiter;
    const fuelCost = Math.round(liters * kmConfig.fuelPricePerLiter);
    const vehicleFee = Math.round(fuelCost * (kmConfig.vehicleFeePct / 100));
    const toll = parseInt(tollAmount) || 0;
    const total = fuelCost + vehicleFee + toll;
    return { liters: Math.round(liters * 100) / 100, fuelCost, vehicleFee, toll, total };
  }, [estimatedDistance, kmConfig, tollAmount]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/finance/rendiciones/attachments/upload", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (json.success && json.url) {
        setAttachmentUrl(json.url);
        toast.success("Comprobante subido");
      } else {
        toast.error("Error al subir comprobante");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleSubmit(asDraft: boolean) {
    // Validate based on type
    if (type === "MILEAGE") {
      if (!startLocation) { toast.error("Captura la ubicación de inicio."); return; }
      if (!endLocation) { toast.error("Captura la ubicación de fin."); return; }
    } else {
      const amountNum = Number(amount.replace(/\./g, "").replace(",", ""));
      if (!amount || isNaN(amountNum) || amountNum < 0) {
        toast.error("Ingresa un monto válido.");
        return;
      }
    }

    setSubmitting(true);
    try {
      let rendId: string | undefined;

      if (type === "MILEAGE" && startLocation && endLocation) {
        // Step 1: Start trip
        const tripStartRes = await fetch("/api/finance/trips/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            startLat: startLocation.lat,
            startLng: startLocation.lng,
          }),
        });
        const tripStartData = await tripStartRes.json();
        if (!tripStartRes.ok) throw new Error(tripStartData.error || "Error al iniciar trayecto");

        const tripId = tripStartData.data?.id;

        // Step 2: End trip (calculates distance and creates rendicion)
        const tripEndRes = await fetch(`/api/finance/trips/${tripId}/end`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endLat: endLocation.lat,
            endLng: endLocation.lng,
            tollAmount: parseInt(tollAmount.replace(/[^\d]/g, "")) || 0,
            routePoints: routePoints.length > 0 ? routePoints : undefined,
          }),
        });
        const tripEndData = await tripEndRes.json();
        if (!tripEndRes.ok) throw new Error(tripEndData.error || "Error al finalizar trayecto");

        rendId = tripEndData.data?.rendicionId || tripEndData.rendicionId;

        // Update with description/date
        if (rendId && (description || date)) {
          await fetch(`/api/finance/rendiciones/${rendId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              description: description.trim() || null,
              date,
            }),
          });
        }
      } else {
        // Purchase flow
        const amountNum = Number(amount.replace(/\./g, "").replace(",", ""));
        const body: Record<string, unknown> = {
          type,
          amount: amountNum,
          date,
          description: description.trim() || undefined,
          documentType: docType,
        };

        const res = await fetch("/api/finance/rendiciones", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!json.success) {
          toast.error(json.error ?? "Error al crear rendición");
          return;
        }
        rendId = json.data?.id;
      }

      // Submit if not draft
      if (!asDraft && rendId) {
        await fetch(`/api/finance/rendiciones/${rendId}/submit`, { method: "POST" });
      }

      toast.success(asDraft ? "Guardado como borrador" : "Rendición enviada");
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error de conexión");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = type === "MILEAGE"
    ? !!(startLocation && endLocation)
    : !!amount;

  return (
    <div className="flex flex-col gap-4 px-4 py-4 pb-32">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300"
        >
          <ArrowLeft size={18} />
        </button>
        <h2 className="text-lg font-semibold">Nueva Rendición</h2>
      </div>

      {/* Tipo */}
      <Field label="Tipo">
        <div className="flex gap-2">
          {(["PURCHASE", "MILEAGE"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                type === t
                  ? "bg-emerald-600 text-white"
                  : "bg-zinc-900 border border-zinc-800 text-zinc-400"
              }`}
            >
              {t === "PURCHASE" ? "Compra / Gasto" : "Kilometraje"}
            </button>
          ))}
        </div>
      </Field>

      {/* Purchase fields */}
      {type === "PURCHASE" && (
        <>
          <Field label="Monto (CLP) *">
            <input
              type="number"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </Field>

          <Field label="Tipo de documento">
            <div className="flex gap-2">
              {(["BOLETA", "FACTURA", "SIN_RESPALDO"] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDocType(d)}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                    docType === d
                      ? "bg-zinc-700 text-white"
                      : "bg-zinc-900 border border-zinc-800 text-zinc-400"
                  }`}
                >
                  {d === "BOLETA" ? "Boleta" : d === "FACTURA" ? "Factura" : "Sin respaldo"}
                </button>
              ))}
            </div>
          </Field>
        </>
      )}

      {/* Mileage GPS fields */}
      {type === "MILEAGE" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Punto de inicio">
              <button
                onClick={() => captureLocation("start")}
                disabled={locatingStart}
                className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-xs font-medium transition-colors ${
                  startLocation
                    ? "bg-emerald-600/20 border border-emerald-500/40 text-emerald-400"
                    : "bg-emerald-600 text-white"
                }`}
              >
                {locatingStart ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <MapPin size={14} />
                )}
                {startLocation
                  ? `${startLocation.lat.toFixed(4)}, ${startLocation.lng.toFixed(4)}`
                  : "Capturar inicio"}
              </button>
            </Field>
            <Field label="Punto de fin">
              <button
                onClick={() => captureLocation("end")}
                disabled={locatingEnd}
                className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-xs font-medium transition-colors ${
                  endLocation
                    ? "bg-emerald-600/20 border border-emerald-500/40 text-emerald-400"
                    : "bg-emerald-600 text-white"
                }`}
              >
                {locatingEnd ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <MapPin size={14} />
                )}
                {endLocation
                  ? `${endLocation.lat.toFixed(4)}, ${endLocation.lng.toFixed(4)}`
                  : "Capturar fin"}
              </button>
            </Field>
          </div>

          <Field label="Peaje (CLP)">
            <input
              type="number"
              min="0"
              value={tollAmount}
              onChange={(e) => setTollAmount(e.target.value)}
              placeholder="0"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </Field>

          {/* Cost breakdown */}
          {estimatedDistance !== null && mileageCost && (
            <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-3 space-y-1.5">
              <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                Cálculo estimado
              </p>
              <div className="space-y-1 text-xs">
                <Row label="Distancia" value={`${estimatedDistance} km`} />
                <Row label="Litros" value={`${mileageCost.liters} L`} />
                <Row label="Combustible" value={fmtCLP(mileageCost.fuelCost)} />
                <Row label={`Vehículo (${kmConfig?.vehicleFeePct}%)`} value={fmtCLP(mileageCost.vehicleFee)} />
                {mileageCost.toll > 0 && (
                  <Row label="Peaje" value={fmtCLP(mileageCost.toll)} />
                )}
                <div className="flex justify-between border-t border-zinc-700 pt-1 font-medium text-sm">
                  <span className="text-white">Total</span>
                  <span className="text-emerald-400">{fmtCLP(mileageCost.total)}</span>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Fecha */}
      <Field label="Fecha *">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
      </Field>

      {/* Descripción */}
      <Field label="Descripción / Observaciones">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Detalle del gasto..."
          rows={2}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
        />
      </Field>

      {/* Foto comprobante - solo para compras */}
      {type === "PURCHASE" && (
        <Field label="Comprobante">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            className="hidden"
          />
          {attachmentUrl ? (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-zinc-900 border border-emerald-500/30">
              <img src={attachmentUrl} alt="comprobante" className="w-12 h-12 object-cover rounded-md" />
              <p className="text-xs text-emerald-400 flex-1">Comprobante subido</p>
              <button onClick={() => setAttachmentUrl(null)} className="text-zinc-500">
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 w-full p-3 rounded-lg bg-zinc-900 border border-zinc-800 border-dashed text-zinc-400 hover:border-zinc-600 transition-colors disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Camera size={16} />
              )}
              <span className="text-sm">{uploading ? "Subiendo..." : "Tomar foto del comprobante"}</span>
            </button>
          )}
        </Field>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <button
          onClick={() => handleSubmit(true)}
          disabled={submitting}
          className="flex-1 py-3 rounded-xl bg-zinc-800 text-zinc-300 text-sm font-medium hover:bg-zinc-700 disabled:opacity-50 transition-colors"
        >
          Guardar borrador
        </button>
        <button
          onClick={() => handleSubmit(false)}
          disabled={submitting || !canSubmit}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-500 disabled:opacity-50 transition-colors"
        >
          {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          Enviar
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-zinc-400">{label}</label>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-zinc-500">{label}</span>
      <span className="text-zinc-300">{value}</span>
    </div>
  );
}
