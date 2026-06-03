"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Building2, Camera, Loader2, MapPin, Navigation, Send, X } from "lucide-react";
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
  address?: string;
  timestamp: number;
}

type LocationMode = "gps" | "installation";

interface TripEstimate {
  distanceKm: number;
  liters: number;
  fuelCost: number;
  vehicleFee: number;
  subtotal: number;
  tollAmount: number;
  totalAmount: number;
  source: "google" | "haversine";
  vehicleFeePct: number;
}

interface RoutePoint {
  lat: number;
  lng: number;
  ts: number;
}

const fmtCLP = (n: number) =>
  "$" + n.toLocaleString("es-CL");

export function SupervisorCrearRendicion({ installations, onBack, onCreated }: Props) {
  const [type, setType] = useState<RendType>("PURCHASE");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [docType, setDocType] = useState<DocType>("BOLETA");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Beneficiary guardia
  const [forThirdParty, setForThirdParty] = useState(false);
  const [beneficiaryGuardiaId, setBeneficiaryGuardiaId] = useState<string | null>(null);
  const [beneficiaryName, setBeneficiaryName] = useState("");
  const [beneficiaryResults, setBeneficiaryResults] = useState<Array<{ id: string; nombreCompleto: string; code?: string; rut?: string }>>([]);
  const [beneficiarySearching, setBeneficiarySearching] = useState(false);
  const [beneficiaryOpen, setBeneficiaryOpen] = useState(false);
  const beneficiaryDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchBeneficiary = useCallback(async (q: string) => {
    if (!q || q.length < 2) {
      setBeneficiaryResults([]);
      setBeneficiaryOpen(false);
      return;
    }
    setBeneficiarySearching(true);
    try {
      const res = await fetch(`/api/finance/guardias-search?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      if (res.ok && json.success && Array.isArray(json.data)) {
        setBeneficiaryResults(json.data);
        setBeneficiaryOpen(json.data.length > 0);
      }
    } catch { /* noop */ }
    finally { setBeneficiarySearching(false); }
  }, []);

  useEffect(() => () => {
    if (beneficiaryDebounceRef.current) clearTimeout(beneficiaryDebounceRef.current);
  }, []);

  // Mileage GPS state
  const [startLocation, setStartLocation] = useState<GeolocationData | null>(null);
  const [endLocation, setEndLocation] = useState<GeolocationData | null>(null);
  const [locatingStart, setLocatingStart] = useState(false);
  const [locatingEnd, setLocatingEnd] = useState(false);
  const [startMode, setStartMode] = useState<LocationMode>("gps");
  const [endMode, setEndMode] = useState<LocationMode>("gps");
  const [tollAmount, setTollAmount] = useState("0");
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);
  const [estimate, setEstimate] = useState<TripEstimate | null>(null);
  const [estimating, setEstimating] = useState(false);
  const estimateAbortRef = useRef<AbortController | null>(null);

  // Instalaciones activas con GPS (de props)
  const geoInstallations = useMemo(
    () =>
      installations.filter(
        (i) => typeof i.lat === "number" && typeof i.lng === "number",
      ),
    [installations],
  );
  const watchIdRef = useRef<number | null>(null);
  const lastPointRef = useRef<{ lat: number; lng: number } | null>(null);

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
        // Reverse-geocode para mostrar/guardar la dirección legible
        fetch(`/api/finance/geocode/reverse?lat=${loc.lat}&lng=${loc.lng}`)
          .then((r) => r.json())
          .then((j) => {
            if (j?.success && j.data?.address) {
              setLocation((prev) =>
                prev ? { ...prev, address: j.data.address } : prev,
              );
            }
          })
          .catch(() => {});
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

  // Estimate vía /estimate (distancia por carretera = lo que se guardará)
  useEffect(() => {
    if (type !== "MILEAGE" || !startLocation || !endLocation) {
      setEstimate(null);
      return;
    }
    const toll = parseInt(tollAmount.replace(/[^\d]/g, "")) || 0;
    estimateAbortRef.current?.abort();
    const ac = new AbortController();
    estimateAbortRef.current = ac;
    setEstimating(true);
    const t = setTimeout(() => {
      fetch("/api/finance/trips/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startLat: startLocation.lat,
          startLng: startLocation.lng,
          endLat: endLocation.lat,
          endLng: endLocation.lng,
          tollAmount: toll,
        }),
        signal: ac.signal,
      })
        .then((r) => r.json())
        .then((json) => {
          if (json?.success && json.data) setEstimate(json.data);
        })
        .catch(() => {})
        .finally(() => setEstimating(false));
    }, 400);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [type, startLocation, endLocation, tollAmount]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttachmentFile(file);
    setAttachmentPreview(URL.createObjectURL(file));
    if (fileRef.current) fileRef.current.value = "";
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
            startAddress: startLocation.address?.trim() || undefined,
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
            endAddress: endLocation.address?.trim() || undefined,
            tollAmount: parseInt(tollAmount.replace(/[^\d]/g, "")) || 0,
            routePoints: routePoints.length > 0 ? routePoints : undefined,
          }),
        });
        const tripEndData = await tripEndRes.json();
        if (!tripEndRes.ok) throw new Error(tripEndData.error || "Error al finalizar trayecto");

        rendId = tripEndData.data?.rendicion?.id;

        // Update with description/date/beneficiary
        if (rendId && (description || date || beneficiaryGuardiaId)) {
          await fetch(`/api/finance/rendiciones/${rendId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              description: description.trim() || null,
              date,
              beneficiaryGuardiaId: beneficiaryGuardiaId || null,
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
          beneficiaryGuardiaId: beneficiaryGuardiaId || undefined,
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

      // Upload attachment if file selected
      if (rendId && attachmentFile) {
        const fd = new FormData();
        fd.append("file", attachmentFile);
        fd.append("rendicionId", rendId);
        fd.append("attachmentType", docType === "FACTURA" ? "INVOICE" : "RECEIPT");
        await fetch("/api/finance/attachments/upload", { method: "POST", body: fd });
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
          <LocationField
            label="Punto de inicio (¿dónde estoy?)"
            mode={startMode}
            setMode={setStartMode}
            location={startLocation}
            locating={locatingStart}
            onCapture={() => captureLocation("start")}
            installations={geoInstallations}
            onPickInstallation={(loc) => setStartLocation(loc)}
            captureLabel="Capturar inicio"
          />

          <LocationField
            label="Punto de fin (¿a qué instalación voy?)"
            mode={endMode}
            setMode={setEndMode}
            location={endLocation}
            locating={locatingEnd}
            onCapture={() => captureLocation("end")}
            installations={geoInstallations}
            onPickInstallation={(loc) => setEndLocation(loc)}
            captureLabel="Capturar fin"
          />

          <Field label="Peaje / TAG (CLP)">
            <input
              type="number"
              min="0"
              value={tollAmount}
              onChange={(e) => setTollAmount(e.target.value)}
              placeholder="0"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <p className="text-[10px] text-zinc-500 mt-1">Costo de peajes/TAG. Se suma al total.</p>
          </Field>

          {/* Cost breakdown */}
          {(estimating || estimate) && startLocation && endLocation && (
            <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-3 space-y-1.5">
              <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                Cálculo estimado
                {estimating && <Loader2 size={11} className="animate-spin" />}
              </p>
              {estimate && (
                <div className="space-y-1 text-xs">
                  <Row label="Distancia" value={`${estimate.distanceKm} km`} />
                  <Row label="Litros" value={`${estimate.liters} L`} />
                  <Row label="Combustible" value={fmtCLP(estimate.fuelCost)} />
                  <Row label={`Vehículo (${estimate.vehicleFeePct}%)`} value={fmtCLP(estimate.vehicleFee)} />
                  {estimate.tollAmount > 0 && (
                    <Row label="Peaje / TAG" value={fmtCLP(estimate.tollAmount)} />
                  )}
                  <div className="flex justify-between border-t border-zinc-700 pt-1 font-medium text-sm">
                    <span className="text-white">Total</span>
                    <span className="text-emerald-400">{fmtCLP(estimate.totalAmount)}</span>
                  </div>
                  {estimate.source === "haversine" && (
                    <p className="text-[10px] text-amber-400 pt-0.5">
                      Distancia aproximada en línea recta (no se pudo calcular la ruta).
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Beneficiary guardia */}
      <Field label="¿Para quién es esta rendición?">
        <div className="flex gap-2">
          <button
            onClick={() => { setForThirdParty(false); setBeneficiaryGuardiaId(null); setBeneficiaryName(""); }}
            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
              !forThirdParty
                ? "bg-emerald-600 text-white"
                : "bg-zinc-900 border border-zinc-800 text-zinc-400"
            }`}
          >
            Para mí
          </button>
          <button
            onClick={() => setForThirdParty(true)}
            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
              forThirdParty
                ? "bg-emerald-600 text-white"
                : "bg-zinc-900 border border-zinc-800 text-zinc-400"
            }`}
          >
            Para un guardia
          </button>
        </div>
      </Field>

      {forThirdParty && (
        <Field label="Guardia beneficiario">
          <div className="relative">
            <input
              value={beneficiaryName}
              onChange={(e) => {
                const v = e.target.value;
                setBeneficiaryName(v);
                setBeneficiaryGuardiaId(null);
                if (beneficiaryDebounceRef.current) clearTimeout(beneficiaryDebounceRef.current);
                beneficiaryDebounceRef.current = setTimeout(() => searchBeneficiary(v), 250);
              }}
              placeholder="Buscar por nombre, código o RUT..."
              className={`w-full bg-zinc-900 border rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
                beneficiaryGuardiaId ? "border-emerald-500/50" : "border-zinc-800"
              }`}
            />
            {beneficiarySearching && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <Loader2 size={14} className="animate-spin text-zinc-500" />
              </div>
            )}
            {beneficiaryGuardiaId && (
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500"
                onClick={() => { setBeneficiaryGuardiaId(null); setBeneficiaryName(""); }}
              >
                <X size={14} />
              </button>
            )}
            {beneficiaryOpen && beneficiaryResults.length > 0 && (
              <ul className="absolute left-0 right-0 z-50 mt-1 max-h-48 overflow-auto rounded-lg border border-zinc-700 bg-zinc-900 py-1 text-sm shadow-xl">
                {beneficiaryResults.map((g) => (
                  <li
                    key={g.id}
                    className="cursor-pointer px-3 py-2.5 hover:bg-zinc-800 text-white"
                    onClick={() => {
                      setBeneficiaryGuardiaId(g.id);
                      setBeneficiaryName(g.nombreCompleto);
                      setBeneficiaryOpen(false);
                      setBeneficiaryResults([]);
                    }}
                  >
                    <span className="font-medium">{g.nombreCompleto}</span>
                    {g.rut && <span className="ml-2 text-xs text-zinc-500">{g.rut}</span>}
                    {g.code && <span className="ml-2 text-xs text-zinc-500">Cód. {g.code}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {beneficiaryGuardiaId && (
            <p className="text-[10px] text-emerald-400 mt-1">El pago irá a la cuenta bancaria de este guardia.</p>
          )}
        </Field>
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
          {attachmentPreview ? (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-zinc-900 border border-emerald-500/30">
              <img src={attachmentPreview} alt="comprobante" className="w-12 h-12 object-cover rounded-md" />
              <p className="text-xs text-emerald-400 flex-1">Comprobante listo</p>
              <button onClick={() => { setAttachmentFile(null); setAttachmentPreview(null); }} className="text-zinc-500">
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 w-full p-3 rounded-lg bg-zinc-900 border border-zinc-800 border-dashed text-zinc-400 hover:border-zinc-600 transition-colors"
            >
              <Camera size={16} />
              <span className="text-sm">Tomar foto del comprobante</span>
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

function LocationField({
  label,
  mode,
  setMode,
  location,
  locating,
  onCapture,
  installations,
  onPickInstallation,
  captureLabel,
}: {
  label: string;
  mode: LocationMode;
  setMode: (m: LocationMode) => void;
  location: GeolocationData | null;
  locating: boolean;
  onCapture: () => void;
  installations: SupervisorInstallation[];
  onPickInstallation: (loc: GeolocationData) => void;
  captureLabel: string;
}) {
  return (
    <Field label={label}>
      <div className="flex gap-1.5 mb-1.5">
        <button
          onClick={() => setMode("gps")}
          className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
            mode === "gps"
              ? "bg-emerald-600 text-white"
              : "bg-zinc-900 border border-zinc-800 text-zinc-400"
          }`}
        >
          <Navigation size={12} />
          GPS
        </button>
        <button
          onClick={() => setMode("installation")}
          className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
            mode === "installation"
              ? "bg-emerald-600 text-white"
              : "bg-zinc-900 border border-zinc-800 text-zinc-400"
          }`}
        >
          <Building2 size={12} />
          Instalación
        </button>
      </div>

      {mode === "gps" ? (
        <button
          onClick={onCapture}
          disabled={locating}
          className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-xs font-medium transition-colors ${
            location
              ? "bg-emerald-600/20 border border-emerald-500/40 text-emerald-400"
              : "bg-emerald-600 text-white"
          }`}
        >
          {locating ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />}
          {location
            ? location.address || `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`
            : captureLabel}
        </button>
      ) : (
        <select
          value=""
          onChange={(e) => {
            const inst = installations.find((i) => i.id === e.target.value);
            if (inst && typeof inst.lat === "number" && typeof inst.lng === "number") {
              onPickInstallation({
                lat: inst.lat,
                lng: inst.lng,
                address: inst.address ? `${inst.name} · ${inst.address}` : inst.name,
                timestamp: Date.now(),
              });
            }
          }}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
        >
          <option value="">
            {installations.length === 0
              ? "Sin instalaciones con GPS"
              : "Seleccionar instalación..."}
          </option>
          {installations.map((inst) => (
            <option key={inst.id} value={inst.id}>
              {inst.name}
            </option>
          ))}
        </select>
      )}

      {mode === "installation" && location?.address && (
        <p className="text-[11px] text-zinc-400 mt-1 flex items-center gap-1">
          <Building2 size={11} />
          {location.address}
        </p>
      )}
    </Field>
  );
}
