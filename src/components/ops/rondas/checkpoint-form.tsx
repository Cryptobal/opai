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
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2"
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
          });
          setName("");
          setDescription("");
          setLat("");
          setLng("");
          setGeoRadiusM(30);
        } finally {
          setSaving(false);
        }
      }}
    >
      <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre checkpoint" className="h-9" />
      <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción" className="h-9" />
      <Input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="Latitud" className="h-9" />
      <Input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="Longitud" className="h-9" />
      <Button type="button" variant="outline" className="h-10 w-full sm:w-auto" onClick={() => setGeoModalOpen(true)}>
        Georreferenciar en mapa
      </Button>
      <Button
        type="button"
        variant="outline"
        className="h-10 w-full sm:w-auto"
        onClick={applyInstallationCoords}
        disabled={installationLat == null || installationLng == null}
      >
        Usar ubicación instalación
      </Button>
      <Input
        value={String(geoRadiusM)}
        onChange={(e) => setGeoRadiusM(Number(e.target.value))}
        placeholder="Radio metros"
        className="h-9"
        type="number"
      />
      <Button className="h-10 w-full sm:w-auto" type="submit" disabled={saving}>
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
