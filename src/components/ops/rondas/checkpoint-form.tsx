"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AddressAutocomplete, type AddressResult } from "@/components/ui/AddressAutocomplete";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MapCoordinatePicker } from "@/components/ui/MapCoordinatePicker";

export interface CheckpointFormValue {
  installationId: string;
  name: string;
  description?: string;
  lat?: number;
  lng?: number;
  geoRadiusM: number;
  verificationType?: string;
  isCritical?: boolean;
  sortOrder?: number;
}

export function CheckpointForm({
  installationId,
  installationName,
  installationAddress,
  installationLat,
  installationLng,
  onSubmit,
}: {
  installationId: string;
  installationName?: string;
  installationAddress?: string;
  installationLat?: number | null;
  installationLng?: number | null;
  onSubmit: (payload: CheckpointFormValue) => Promise<void> | void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [geoRadiusM, setGeoRadiusM] = useState(30);
  const [verificationType, setVerificationType] = useState("GEOFENCE");
  const [isCritical, setIsCritical] = useState(false);
  const [sortOrder, setSortOrder] = useState(0);
  const [saving, setSaving] = useState(false);
  const [geoModalOpen, setGeoModalOpen] = useState(false);
  const [geoDraft, setGeoDraft] = useState<AddressResult | null>(null);

  const applyInstallationCoords = () => {
    if (installationLat == null || installationLng == null) return;
    setLat(String(installationLat));
    setLng(String(installationLng));
  };

  return (
    <form
      className="rounded-lg border border-border bg-card p-4 space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
          await onSubmit({
            installationId,
            name,
            description: description || undefined,
            lat: lat ? Number(lat) : undefined,
            lng: lng ? Number(lng) : undefined,
            geoRadiusM,
            verificationType,
            isCritical,
            sortOrder,
          });
          setName("");
          setDescription("");
          setLat("");
          setLng("");
          setGeoRadiusM(30);
          setVerificationType("GEOFENCE");
          setIsCritical(false);
          setSortOrder(0);
        } finally {
          setSaving(false);
        }
      }}
    >
      <div>
        <h3 className="text-sm font-semibold">Nuevo Checkpoint</h3>
        <p className="text-xs text-muted-foreground">Define un punto de control con su ubicacion y tipo de verificacion.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Nombre *</label>
          <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Acceso principal" className="h-9" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Descripcion</label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripcion opcional" className="h-9" />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">Ubicacion</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <Input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="Latitud" className="h-9" />
          <Input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="Longitud" className="h-9" />
          <Button type="button" variant="outline" className="h-9 w-full text-xs" onClick={() => setGeoModalOpen(true)}>
            Georreferenciar en mapa
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-9 w-full text-xs"
            onClick={applyInstallationCoords}
            disabled={installationLat == null || installationLng == null}
          >
            Usar ubicacion instalacion
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Radio (m)</label>
          <Input
            value={String(geoRadiusM)}
            onChange={(e) => setGeoRadiusM(Number(e.target.value))}
            className="h-9"
            type="number"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Verificacion</label>
          <select
            value={verificationType}
            onChange={(e) => setVerificationType(e.target.value)}
            className="h-9 w-full rounded border border-border bg-background px-2 text-sm"
          >
            <option value="GEOFENCE">Geocerca</option>
            <option value="QR">QR</option>
            <option value="BOTH">Ambos</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Orden</label>
          <Input
            value={String(sortOrder)}
            onChange={(e) => setSortOrder(Number(e.target.value))}
            className="h-9"
            type="number"
          />
        </div>
        <div className="flex items-end pb-0.5">
          <label className="flex items-center gap-2 text-sm h-9">
            <input type="checkbox" checked={isCritical} onChange={(e) => setIsCritical(e.target.checked)} className="rounded" />
            Punto critico
          </label>
        </div>
      </div>

      <Button className="h-9" type="submit" disabled={saving}>
        {saving ? "Guardando..." : "Crear checkpoint"}
      </Button>

      <Dialog open={geoModalOpen} onOpenChange={setGeoModalOpen}>
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Georreferencia del checkpoint</DialogTitle>
            <DialogDescription>
              Busca dirección, cambia a vista satélite y mueve el pin para definir coordenadas exactas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <AddressAutocomplete
              value={geoDraft?.address || installationAddress || ""}
              onChange={(result) => setGeoDraft(result)}
              placeholder={`Buscar punto en ${installationName || "la instalación"}...`}
              showMap={false}
            />
            <MapCoordinatePicker
              lat={geoDraft?.lat ?? installationLat ?? null}
              lng={geoDraft?.lng ?? installationLng ?? null}
              onChange={(coords) =>
                setGeoDraft((prev) => ({
                  address: prev?.address || installationAddress || "",
                  city: prev?.city || "",
                  commune: prev?.commune || "",
                  region: prev?.region,
                  placeId: prev?.placeId,
                  lat: coords.lat,
                  lng: coords.lng,
                }))
              }
            />
            {geoDraft && (
              <div className="rounded border border-border p-3 text-xs text-muted-foreground space-y-1">
                <p><span className="font-medium text-foreground">Dirección:</span> {geoDraft.address}</p>
                <p><span className="font-medium text-foreground">Latitud:</span> {geoDraft.lat}</p>
                <p><span className="font-medium text-foreground">Longitud:</span> {geoDraft.lng}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setGeoModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!geoDraft) return;
                setLat(String(geoDraft.lat));
                setLng(String(geoDraft.lng));
                setGeoModalOpen(false);
              }}
              disabled={!geoDraft}
            >
              Usar estas coordenadas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}
