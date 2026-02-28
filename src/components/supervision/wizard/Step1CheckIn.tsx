"use client";

import { useEffect, useMemo, useState } from "react";
import { MapPin, AlertTriangle, CheckCircle2, Users, Shield, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import type { NearbyInstallation, DotacionGuard, VisitData } from "./types";

type Props = {
  onCheckedIn: (visit: VisitData, dotacion: DotacionGuard[], guardsExpected: number) => void;
};

export function Step1CheckIn({ onCheckedIn }: Props) {
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [loadingInstallations, setLoadingInstallations] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [installations, setInstallations] = useState<NearbyInstallation[]>([]);
  const [selectedInstallationId, setSelectedInstallationId] = useState<string>("");
  const [dotacion, setDotacion] = useState<{ regular: DotacionGuard[]; reinforcement: DotacionGuard[]; totalExpected: number }>({
    regular: [],
    reinforcement: [],
    totalExpected: 0,
  });
  const [loadingDotacion, setLoadingDotacion] = useState(false);
  const [guardsPresent, setGuardsPresent] = useState<string>("");
  const [geofenceReason, setGeofenceReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selectedInstallation = useMemo(
    () => installations.find((i) => i.id === selectedInstallationId) ?? null,
    [installations, selectedInstallationId],
  );

  const isOutsideGeofence = selectedInstallation?.insideGeofence === false;

  // Fetch assigned installations
  useEffect(() => {
    async function fetchAssigned() {
      setLoadingInstallations(true);
      try {
        const res = await fetch("/api/ops/supervision/installations");
        const json = await res.json();
        if (res.ok && json.success && Array.isArray(json.data)) {
          setInstallations(json.data);
          // Don't auto-select; let user choose or wait for GPS to suggest nearest
        } else {
          setInstallations([]);
        }
      } catch {
        setInstallations([]);
      } finally {
        setLoadingInstallations(false);
      }
    }
    void fetchAssigned();
  }, []);

  // Fetch dotacion when installation changes
  useEffect(() => {
    async function fetchDotacion() {
      if (!selectedInstallationId) {
        setDotacion({ regular: [], reinforcement: [], totalExpected: 0 });
        return;
      }
      setLoadingDotacion(true);
      try {
        const now = new Date();
        const today = now.toISOString().slice(0, 10);
        const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
        const res = await fetch(
          `/api/ops/supervision/installation-dotacion/${selectedInstallationId}?date=${today}&time=${currentTime}`,
        );
        const json = await res.json();
        if (res.ok && json.success) {
          setDotacion(json.data);
        } else {
          setDotacion({ regular: [], reinforcement: [], totalExpected: 0 });
        }
      } catch {
        setDotacion({ regular: [], reinforcement: [], totalExpected: 0 });
      } finally {
        setLoadingDotacion(false);
      }
    }
    void fetchDotacion();
  }, [selectedInstallationId]);

  async function handleGetLocation() {
    setLoadingLocation(true);
    setError(null);
    try {
      const coords = await new Promise<GeolocationCoordinates>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve(pos.coords),
          (err) => reject(err),
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
        );
      });
      const nextLocation = { lat: coords.latitude, lng: coords.longitude };
      setLocation(nextLocation);

      // Update installations with distance and auto-suggest nearest
      const res = await fetch(
        `/api/ops/supervision/nearby?lat=${nextLocation.lat}&lng=${nextLocation.lng}&maxDistanceM=30000`,
      );
      const json = await res.json();
      if (res.ok && json.success && json.data.length > 0) {
        setInstallations(json.data);
        // Auto-select nearest installation
        setSelectedInstallationId(json.data[0].id);
      }
    } catch {
      setError("No se pudo obtener tu ubicacion actual.");
    } finally {
      setLoadingLocation(false);
    }
  }

  async function handleStartVisit() {
    if (!location || !selectedInstallationId) {
      setError("Debes obtener ubicacion y seleccionar una instalacion.");
      return;
    }
    if (isOutsideGeofence && !geofenceReason.trim()) {
      setError("Debes indicar un motivo para check-in fuera de geocerca.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/ops/supervision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          installationId: selectedInstallationId,
          lat: location.lat,
          lng: location.lng,
          startedVia: "mobile",
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "No se pudo iniciar la visita");
      }

      // Save guards expected
      const guardsExpected = dotacion.totalExpected;
      const guardsFound = guardsPresent ? Number(guardsPresent) : null;

      // Build patch data
      const patchData: Record<string, unknown> = {
        guardsExpected,
        guardsFound,
        wizardStep: 2,
      };

      // If outside geofence, store the reason in draft
      if (isOutsideGeofence) {
        patchData.draftData = { geofenceReason: geofenceReason.trim() };
      }

      // Update visit with guards data
      await fetch(`/api/ops/supervision/${json.data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchData),
      });

      const allGuards = [...dotacion.regular, ...dotacion.reinforcement];
      onCheckedIn(
        { ...json.data, guardsExpected, guardsFound, wizardStep: 2 },
        allGuards,
        guardsExpected,
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : "Error al iniciar visita";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  const guardsMismatch =
    guardsPresent !== "" &&
    dotacion.totalExpected > 0 &&
    Number(guardsPresent) !== dotacion.totalExpected;

  // Build searchable options with searchText including client name, address, commune
  const installationOptions = useMemo(
    () =>
      installations.map((inst) => {
        const parts = [inst.name];
        if (inst.clientName) parts.push(inst.clientName);
        if (inst.address) parts.push(inst.address);
        if (inst.commune) parts.push(inst.commune);
        if (inst.city) parts.push(inst.city);

        let description = "";
        if (inst.distanceM != null) {
          description = `${inst.distanceM}m`;
          if (inst.clientName) description += ` - ${inst.clientName}`;
        } else if (inst.clientName) {
          description = inst.clientName;
          if (inst.commune) description += ` - ${inst.commune}`;
        } else if (inst.commune) {
          description = inst.commune;
        }

        return {
          id: inst.id,
          label: inst.name,
          description: description || undefined,
          searchText: parts.join(" "),
        };
      }),
    [installations],
  );

  const showDirectList = !loadingInstallations && installations.length > 0 && installations.length <= 10 && !location;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="h-4 w-4 text-primary" />
          Check-in
          <Badge variant="outline" className="ml-auto text-xs">
            Paso 1/5
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* GPS Button */}
        <Button
          onClick={handleGetLocation}
          disabled={loadingLocation || submitting}
          className="w-full"
          size="lg"
        >
          <MapPin className="mr-2 h-4 w-4" />
          {loadingLocation ? "Obteniendo ubicacion..." : location ? "Actualizar ubicacion" : "Obtener ubicacion"}
        </Button>

        {/* GPS Result Indicator */}
        {location && (
          <div className="space-y-2">
            {/* Check-in position */}
            <div className="flex items-center gap-2 rounded-lg bg-muted/30 p-2 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 flex-shrink-0" />
              <span>Tu ubicacion: {location.lat.toFixed(6)}, {location.lng.toFixed(6)}</span>
            </div>

            {/* Distance to installation */}
            {selectedInstallation && (
              <div
                className={`flex items-center gap-3 rounded-lg border-2 p-3 ${
                  selectedInstallation.distanceM == null
                    ? "border-border bg-muted/30"
                    : selectedInstallation.insideGeofence
                      ? "border-emerald-500/50 bg-emerald-500/10"
                      : "border-amber-500/50 bg-amber-500/10"
                }`}
              >
                <Navigation className={`h-5 w-5 flex-shrink-0 ${
                  selectedInstallation.distanceM != null && selectedInstallation.insideGeofence
                    ? "text-emerald-400"
                    : "text-amber-400"
                }`} />
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">
                    {selectedInstallation.name}
                    {selectedInstallation.address ? ` — ${selectedInstallation.address}` : ""}
                  </p>
                  {selectedInstallation.distanceM != null ? (
                    <>
                      <p className="text-sm font-medium">
                        Distancia: {selectedInstallation.distanceM}m
                      </p>
                      <p className={`text-xs ${
                        selectedInstallation.insideGeofence ? "text-emerald-400" : "text-amber-400"
                      }`}>
                        {selectedInstallation.insideGeofence
                          ? `Dentro del rango (${selectedInstallation.geoRadiusM}m)`
                          : `Fuera del rango (radio: ${selectedInstallation.geoRadiusM}m)`}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-amber-400">
                      Obtene ubicacion para calcular distancia
                    </p>
                  )}
                </div>
                {selectedInstallation.distanceM != null && (
                  selectedInstallation.insideGeofence ? (
                    <CheckCircle2 className="h-6 w-6 flex-shrink-0 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="h-6 w-6 flex-shrink-0 text-amber-400" />
                  )
                )}
              </div>
            )}
          </div>
        )}

        {/* Geofence reason (when outside) */}
        {isOutsideGeofence && (
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-xs text-amber-400">
              <AlertTriangle className="h-3 w-3" />
              Motivo de check-in fuera de geocerca (obligatorio)
            </Label>
            <Textarea
              value={geofenceReason}
              onChange={(e) => setGeofenceReason(e.target.value)}
              placeholder="Indica por que realizas check-in fuera del rango..."
              rows={2}
              className="text-sm"
            />
          </div>
        )}

        {/* Installation selector */}
        <div className="space-y-2">
          <Label>Instalacion</Label>
          <SearchableSelect
            value={selectedInstallationId}
            options={installationOptions}
            placeholder={
              loadingInstallations
                ? "Cargando instalaciones..."
                : installations.length === 0
                  ? "No tienes instalaciones asignadas"
                  : "Buscar por nombre, cliente, direccion..."
            }
            emptyText="Sin instalaciones"
            disabled={loadingInstallations || installations.length === 0}
            onChange={setSelectedInstallationId}
          />
        </div>

        {/* Direct list for few installations */}
        {showDirectList && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Instalaciones asignadas</p>
            <div className="space-y-1">
              {installations.map((inst) => (
                <button
                  key={inst.id}
                  type="button"
                  onClick={() => setSelectedInstallationId(inst.id)}
                  className={`flex w-full items-center gap-3 rounded-lg border-2 p-3 text-left transition ${
                    selectedInstallationId === inst.id
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-muted/40"
                  }`}
                >
                  <MapPin className={`h-4 w-4 flex-shrink-0 ${
                    selectedInstallationId === inst.id ? "text-primary" : "text-muted-foreground"
                  }`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{inst.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[inst.clientName, inst.commune].filter(Boolean).join(" - ") || inst.address || ""}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Installation info card */}
        {selectedInstallation && (
          <div className="rounded-lg border p-3 text-sm">
            <p className="font-medium">{selectedInstallation.name}</p>
            {selectedInstallation.clientName && (
              <p className="text-xs text-muted-foreground">Cliente: {selectedInstallation.clientName}</p>
            )}
            <p className="text-muted-foreground">{selectedInstallation.address ?? "Sin direccion"}</p>
            {selectedInstallation.commune && (
              <p className="text-xs text-muted-foreground">{selectedInstallation.commune}</p>
            )}
          </div>
        )}

        {/* Dotacion section */}
        {selectedInstallationId && (
          <div className="rounded-lg border p-3">
            <p className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Users className="h-4 w-4" />
              Dotacion del dia
            </p>

            {loadingDotacion ? (
              <p className="text-xs text-muted-foreground">Cargando dotacion...</p>
            ) : (
              <>
                {/* Regular guards */}
                {dotacion.regular.length > 0 && (
                  <div className="mb-2">
                    <p className="mb-1 text-xs font-medium text-muted-foreground">
                      Dotacion regular ({dotacion.regular.length})
                    </p>
                    <div className="space-y-1">
                      {dotacion.regular.map((g) => (
                        <div key={g.id} className="flex items-center gap-2 text-xs">
                          <Shield className="h-3 w-3 text-emerald-400" />
                          <span>{g.guardName}</span>
                          <span className="text-muted-foreground">
                            — {g.puestoName} {g.shiftStart ?? ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Reinforcement guards */}
                {dotacion.reinforcement.length > 0 && (
                  <div className="mb-2">
                    <p className="mb-1 text-xs font-medium text-amber-400">
                      Refuerzo hoy ({dotacion.reinforcement.length})
                    </p>
                    <div className="space-y-1">
                      {dotacion.reinforcement.map((g) => (
                        <div key={g.id} className="flex items-center gap-2 text-xs">
                          <Shield className="h-3 w-3 text-amber-400" />
                          <span>{g.guardName}</span>
                          <span className="text-muted-foreground">— Refuerzo</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {dotacion.regular.length === 0 && dotacion.reinforcement.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No hay guardias asignados para esta instalacion hoy.
                  </p>
                )}

                <div className="mt-2 rounded-md bg-muted/50 p-2 text-xs font-medium">
                  Total esperado: {dotacion.totalExpected} guardias
                </div>
              </>
            )}
          </div>
        )}

        {/* Guards present input */}
        <div className="space-y-2">
          <Label>Guardias presentes encontrados</Label>
          <Input
            type="number"
            min={0}
            inputMode="numeric"
            value={guardsPresent}
            onChange={(e) => setGuardsPresent(e.target.value)}
            placeholder={`Esperados: ${dotacion.totalExpected}`}
            className="h-12 text-lg"
          />
          {guardsMismatch && (
            <div className="flex items-center gap-2 rounded-md bg-amber-500/10 p-2 text-xs text-amber-400">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              Discrepancia de dotacion: esperados {dotacion.totalExpected}, encontrados {guardsPresent}
            </div>
          )}
        </div>

        {/* Start button */}
        <Button
          onClick={handleStartVisit}
          disabled={submitting || !location || !selectedInstallationId || installations.length === 0 || (isOutsideGeofence && !geofenceReason.trim())}
          className="w-full"
          size="lg"
        >
          {submitting ? "Iniciando visita..." : "Iniciar visita →"}
        </Button>

        {error && (
          <p className="rounded-md bg-destructive/10 p-2 text-sm text-red-400">{error}</p>
        )}
      </CardContent>
    </Card>
  );
}
