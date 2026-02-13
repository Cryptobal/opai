"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  onSubmit,
}: {
  installationId: string;
  onSubmit: (payload: CheckpointFormValue) => Promise<void> | void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [geoRadiusM, setGeoRadiusM] = useState(30);
  const [saving, setSaving] = useState(false);

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
      <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre checkpoint" className="h-10" />
      <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción" className="h-10" />
      <Input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="Latitud" className="h-10" />
      <Input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="Longitud" className="h-10" />
      <Input
        value={String(geoRadiusM)}
        onChange={(e) => setGeoRadiusM(Number(e.target.value))}
        placeholder="Radio metros"
        className="h-10"
        type="number"
      />
      <Button className="h-10 w-full sm:w-auto" type="submit" disabled={saving}>
        {saving ? "Guardando..." : "Crear checkpoint"}
      </Button>
    </form>
  );
}
