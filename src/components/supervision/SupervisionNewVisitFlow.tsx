"use client";

import { useEffect, useMemo, useState } from "react";
import { MapPin, Camera, CheckCircle2, FileCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type NearbyInstallation = {
  id: string;
  name: string;
  address: string | null;
  commune: string | null;
  city: string | null;
  geoRadiusM: number;
  distanceM: number | null;
  insideGeofence: boolean | null;
};

type Visit = {
  id: string;
  installationId: string;
  status: string;
};

type DocumentType = { code: string; label: string; required: boolean };

type DotacionRow = {
  id: string;
  slotNumber: number;
  guardia: {
    id: string;
    code: string | null;
    persona: {
      firstName: string;
      lastName: string;
      rut: string | null;
    };
  };
  puesto: {
    id: string;
    name: string;
    shiftStart: string;
    shiftEnd: string;
  };
};

export function SupervisionNewVisitFlow() {
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [loadingInstallations, setLoadingInstallations] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [installations, setInstallations] = useState<NearbyInstallation[]>([]);
  const [selectedInstallationId, setSelectedInstallationId] = useState<string>("");
  const [visit, setVisit] = useState<Visit | null>(null);
  const [generalComments, setGeneralComments] = useState("");
  const [guardsCounted, setGuardsCounted] = useState<string>("");
  const [installationState, setInstallationState] = useState<string>("normal");
  const [ratingPresentacion, setRatingPresentacion] = useState<string>("5");
  const [ratingOrden, setRatingOrden] = useState<string>("5");
  const [ratingProtocolo, setRatingProtocolo] = useState<string>("5");
  const [images, setImages] = useState<File[]>([]);
  const [dotacion, setDotacion] = useState<DotacionRow[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [documentChecklist, setDocumentChecklist] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const selectedInstallation = useMemo(
    () => installations.find((i) => i.id === selectedInstallationId) ?? null,
    [installations, selectedInstallationId],
  );

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
          setSelectedInstallationId("");
        }
      } catch {
        setInstallations([]);
        setSelectedInstallationId("");
      } finally {
        setLoadingInstallations(false);
      }
    }
    void fetchAssigned();
  }, []);

  useEffect(() => {
    async function fetchDocumentTypes() {
      try {
        const res = await fetch("/api/ops/supervision/document-types");
        const json = await res.json();
        if (res.ok && json.success && Array.isArray(json.data)) {
          setDocumentTypes(json.data);
          setDocumentChecklist(
            (json.data as DocumentType[]).reduce<Record<string, boolean>>(
              (acc, d) => ({ ...acc, [d.code]: false }),
              {}
            )
          );
        }
      } catch {
        setDocumentTypes([]);
      }
    }
    void fetchDocumentTypes();
  }, []);

  useEffect(() => {
    async function fetchDotacion() {
      if (!selectedInstallationId) {
        setDotacion([]);
        return;
      }
      try {
        const res = await fetch(`/api/crm/installations/${selectedInstallationId}/asignaciones?activeOnly=true`);
        const json = await res.json();
        if (res.ok && json.success) {
          setDotacion(json.data ?? []);
        } else {
          setDotacion([]);
        }
      } catch {
        setDotacion([]);
      }
    }
    void fetchDotacion();
  }, [selectedInstallationId]);

  async function fetchNearby(lat: number, lng: number) {
    const res = await fetch(`/api/ops/supervision/nearby?lat=${lat}&lng=${lng}&maxDistanceM=30000`);
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error ?? "No se pudieron obtener instalaciones cercanas");
    }
    if (json.data.length > 0) {
      setInstallations(json.data);
      setSelectedInstallationId(json.data[0].id);
    }
  }

  async function handleGetLocation() {
    setLoadingLocation(true);
    setError(null);
    setSuccessMessage(null);

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
      await fetchNearby(nextLocation.lat, nextLocation.lng);
    } catch (e) {
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
    setSuccessMessage(null);

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
      setVisit(json.data);
      setSuccessMessage("Check-in registrado. Completa el reporte y finaliza la visita.");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Error al iniciar visita";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function uploadImages(visitId: string) {
    for (const file of images) {
      const form = new FormData();
      form.append("file", file);
      form.append("caption", "Evidencia supervisión");
      const res = await fetch(`/api/ops/supervision/${visitId}/images`, {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "No se pudo subir una imagen");
      }
    }
  }

  async function handleCompleteVisit() {
    if (!visit?.id || !location) {
      setError("Debes iniciar una visita antes de finalizar.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const patchRes = await fetch(`/api/ops/supervision/${visit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          generalComments,
          guardsCounted: guardsCounted ? Number(guardsCounted) : null,
          installationState,
          ratings: {
            presentacion: Number(ratingPresentacion),
            orden: Number(ratingOrden),
            protocolo: Number(ratingProtocolo),
          },
          documentChecklist: Object.keys(documentChecklist).length > 0 ? documentChecklist : null,
        }),
      });
      const patchJson = await patchRes.json();
      if (!patchRes.ok || !patchJson.success) {
        throw new Error(patchJson.error ?? "No se pudo guardar el reporte");
      }

      if (images.length > 0) {
        await uploadImages(visit.id);
      }

      const currentCoords = await new Promise<GeolocationCoordinates>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve(pos.coords),
          (err) => reject(err),
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
        );
      });

      const checkoutRes = await fetch(`/api/ops/supervision/${visit.id}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: currentCoords.latitude,
          lng: currentCoords.longitude,
          completedVia: "mobile",
        }),
      });
      const checkoutJson = await checkoutRes.json();
      if (!checkoutRes.ok || !checkoutJson.success) {
        throw new Error(checkoutJson.error ?? "No se pudo cerrar la visita");
      }

      setSuccessMessage("Visita finalizada correctamente.");
      setVisit(null);
      setGeneralComments("");
      setGuardsCounted("");
      setImages([]);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Error al finalizar visita";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Paso 1: Ubicación y check-in</CardTitle>
          <CardDescription>
            Obtén tu GPS, selecciona instalación y registra inicio de visita.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={handleGetLocation} disabled={loadingLocation || submitting} className="w-full">
            <MapPin className="mr-2 h-4 w-4" />
            {loadingLocation ? "Obteniendo ubicación..." : "Usar mi ubicación"}
          </Button>

          {location && (
            <p className="text-xs text-muted-foreground">
              Ubicación actual: {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
            </p>
          )}

          <div className="space-y-2">
            <Label>Instalación</Label>
            <Select
              value={selectedInstallationId}
              onValueChange={setSelectedInstallationId}
              disabled={loadingInstallations || installations.length === 0}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    loadingInstallations
                      ? "Cargando instalaciones..."
                      : installations.length === 0
                        ? "No tienes instalaciones asignadas"
                        : "Selecciona instalación"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {installations.map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>
                    {inst.name}
                    {inst.distanceM != null ? ` (${inst.distanceM}m)` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!loadingInstallations && installations.length === 0 && (
              <p className="text-xs text-amber-600">
                No tienes instalaciones asignadas. Contacta al administrador para que te asigne instalaciones en Supervisión.
              </p>
            )}
          </div>

          {selectedInstallation && (
            <div className="rounded-md border p-3 text-sm">
              <p className="font-medium">{selectedInstallation.name}</p>
              <p className="text-muted-foreground">{selectedInstallation.address ?? "Sin dirección"}</p>
              {selectedInstallation.distanceM != null && (
                <p className="mt-1 text-xs">
                  Distancia: {selectedInstallation.distanceM}m | Radio: {selectedInstallation.geoRadiusM}m
                </p>
              )}
              {selectedInstallation.distanceM == null && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Usa &quot;Usar mi ubicación&quot; para ver distancia y validar geocerca.
                </p>
              )}
            </div>
          )}

          <Button
            onClick={handleStartVisit}
            disabled={submitting || !location || !selectedInstallationId || installations.length === 0}
            className="w-full"
          >
            Iniciar visita (check-in)
          </Button>

          {selectedInstallationId && (
            <div className="rounded-md border p-3">
              <p className="mb-2 text-sm font-medium">Dotación actual (asignada)</p>
              {dotacion.length === 0 ? (
                <p className="text-xs text-muted-foreground">No hay guardias asignados para esta instalación.</p>
              ) : (
                <div className="space-y-1">
                  {dotacion.slice(0, 8).map((row) => (
                    <p key={row.id} className="text-xs">
                      {row.puesto.name} #{row.slotNumber} - {row.guardia.persona.firstName} {row.guardia.persona.lastName}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Paso 2: Reporte de visita</CardTitle>
          <CardDescription>Completa estado, observaciones y evidencia.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>Estado de la instalación</Label>
            <Select value={installationState} onValueChange={setInstallationState}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="incidencia">Con observaciones</SelectItem>
                <SelectItem value="critico">Crítico</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {documentTypes.length > 0 && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <FileCheck className="h-4 w-4" /> Documentos en instalación
              </Label>
              <p className="text-xs text-muted-foreground">
                Marca si cada documento está presente y al día en la instalación.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {documentTypes.map((doc) => (
                  <label
                    key={doc.code}
                    className="flex cursor-pointer items-center gap-2 rounded-md border p-3 transition hover:bg-muted/40"
                  >
                    <input
                      type="checkbox"
                      checked={documentChecklist[doc.code] ?? false}
                      onChange={(e) =>
                        setDocumentChecklist((prev) => ({
                          ...prev,
                          [doc.code]: e.target.checked,
                        }))
                      }
                      className="rounded border-border"
                    />
                    <span className="text-sm">{doc.label}</span>
                    {doc.required && (
                      <span className="text-[10px] text-amber-600">(obligatorio)</span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Guardias presentes contados</Label>
            <Input
              type="number"
              min={0}
              value={guardsCounted}
              onChange={(e) => setGuardsCounted(e.target.value)}
              placeholder="Ej: 6"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">Presentación</Label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Button
                    key={n}
                    type="button"
                    variant={Number(ratingPresentacion) === n ? "default" : "outline"}
                    size="sm"
                    className="h-9 w-9 p-0"
                    onClick={() => setRatingPresentacion(String(n))}
                  >
                    {n}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Orden</Label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Button
                    key={n}
                    type="button"
                    variant={Number(ratingOrden) === n ? "default" : "outline"}
                    size="sm"
                    className="h-9 w-9 p-0"
                    onClick={() => setRatingOrden(String(n))}
                  >
                    {n}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Protocolo</Label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Button
                    key={n}
                    type="button"
                    variant={Number(ratingProtocolo) === n ? "default" : "outline"}
                    size="sm"
                    className="h-9 w-9 p-0"
                    onClick={() => setRatingProtocolo(String(n))}
                  >
                    {n}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Comentarios</Label>
            <Textarea
              value={generalComments}
              onChange={(e) => setGeneralComments(e.target.value)}
              placeholder="Observaciones, hallazgos, acciones tomadas..."
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Camera className="h-4 w-4" /> Imágenes de evidencia
            </Label>
            <Input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => setImages(Array.from(e.target.files ?? []))}
            />
            {images.length > 0 && (
              <p className="text-xs text-muted-foreground">{images.length} imagen(es) seleccionadas</p>
            )}
          </div>

          <Button onClick={handleCompleteVisit} disabled={submitting || !visit} className="w-full">
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Finalizar visita (checkout)
          </Button>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {successMessage && <p className="text-sm text-emerald-700">{successMessage}</p>}
    </div>
  );
}
