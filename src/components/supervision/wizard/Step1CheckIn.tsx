"use client";

import { useEffect, useMemo, useState } from "react";
import { MapPin, AlertTriangle, CheckCircle2, Users, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [error, setError] = useState<string | null>(null);

  const selectedInstallation = useMemo(
    () => installations.find((i) => i.id === selectedInstallationId) ?? null,
    [installations, selectedInstallationId],
  );

  // Fetch assigned installations
  useEffect(() => {
    async function fetchAssigned() {
      setLoadingInstallations(true);
      try {
        const res = await fetch("/api/ops/supervision/installations");
        const json = await res.json();
        if (res.ok && json.success && Array.isArray(json.data)) {
          setInstallations(json.data);
          if (json.data.length > 0 && !selectedInstallationId) {
            setSelectedInstallationId(json.data[0].id);
          }
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
        const today = new Date().toISOString().slice(0, 10);
        const res = await fetch(
          `/api/ops/supervision/installation-dotacion/${selectedInstallationId}?date=${today}`,
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

      // Update installations with distance
      const res = await fetch(
        `/api/ops/supervision/nearby?lat=${nextLocation.lat}&lng=${nextLocation.lng}&maxDistanceM=30000`,
      );
      const json = await res.json();
      if (res.ok && json.success && json.data.length > 0) {
        setInstallations(json.data);
        setSelectedInstallationId(json.data[0].id);
      }
    } catch {
      setError("No se pudo obtener tu ubicación actual.");
    } finally {
      setLoadingLocation(false);
    }
  }

  async function handleStartVisit() {
    if (!location || !selectedInstallationId) {
      setError("Debes obtener ubicación y seleccionar una instalación.");
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

      // Update visit with guards data
      await fetch(`/api/ops/supervision/${json.data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guardsExpected,
          guardsFound,
          wizardStep: 2,
        }),
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
          {loadingLocation ? "Obteniendo ubicación..." : "Obtener ubicación"}
        </Button>

        {location && (
          <p className="text-xs text-muted-foreground">
            GPS: {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
          </p>
        )}

        {/* Installation selector */}
        <div className="space-y-2">
          <Label>Instalación</Label>
          <SearchableSelect
            value={selectedInstallationId}
            options={installations.map((inst) => ({
              id: inst.id,
              label: inst.name,
              description: inst.distanceM != null ? `${inst.distanceM}m` : inst.commune ?? undefined,
            }))}
            placeholder={
              loadingInstallations
                ? "Cargando instalaciones..."
                : installations.length === 0
                  ? "No tienes instalaciones asignadas"
                  : "Selecciona instalación"
            }
            emptyText="Sin instalaciones"
            disabled={loadingInstallations || installations.length === 0}
            onChange={setSelectedInstallationId}
          />
        </div>

        {/* Installation info card */}
        {selectedInstallation && (
          <div className="rounded-lg border p-3 text-sm">
            <p className="font-medium">{selectedInstallation.name}</p>
            <p className="text-muted-foreground">{selectedInstallation.address ?? "Sin dirección"}</p>
            {selectedInstallation.distanceM != null && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs">
                  Distancia: {selectedInstallation.distanceM}m
                </span>
                {selectedInstallation.insideGeofence ? (
                  <Badge variant="success" className="text-[10px]">
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    Dentro del radio
                  </Badge>
                ) : (
                  <Badge variant="warning" className="text-[10px]">
                    <AlertTriangle className="mr-1 h-3 w-3" />
                    Fuera del radio ({selectedInstallation.geoRadiusM}m)
                  </Badge>
                )}
              </div>
            )}
          </div>
        )}

        {/* Dotacion section */}
        {selectedInstallationId && (
          <div className="rounded-lg border p-3">
            <p className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Users className="h-4 w-4" />
              Dotación del día
            </p>

            {loadingDotacion ? (
              <p className="text-xs text-muted-foreground">Cargando dotación...</p>
            ) : (
              <>
                {/* Regular guards */}
                {dotacion.regular.length > 0 && (
                  <div className="mb-2">
                    <p className="mb-1 text-xs font-medium text-muted-foreground">
                      Dotación regular ({dotacion.regular.length})
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
                    No hay guardias asignados para esta instalación hoy.
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
              Discrepancia: esperados {dotacion.totalExpected}, encontrados {guardsPresent}
            </div>
          )}
        </div>

        {/* Start button */}
        <Button
          onClick={handleStartVisit}
          disabled={submitting || !location || !selectedInstallationId || installations.length === 0}
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
