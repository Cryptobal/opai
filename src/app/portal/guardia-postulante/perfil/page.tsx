"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

interface Profile {
  id: string;
  os10: boolean | null;
  os10ExpiresAt: string | null;
  experienciaAnios: number | null;
  turnosDisponibles: string[];
  pretensionRentaMin: number | null;
  pretensionRentaMax: number | null;
  availableExtraShifts: boolean;
  googleEmail: string | null;
  persona: {
    firstName: string;
    lastName: string;
    rut: string | null;
    phone: string | null;
    region: string | null;
    commune: string | null;
  };
}

const TURNOS = [
  { value: "4x4_dia", label: "4x4 Día" },
  { value: "4x4_noche", label: "4x4 Noche" },
  { value: "5x2", label: "5x2" },
  { value: "6x1", label: "6x1" },
  { value: "otro", label: "Otro" },
];

export default function PerfilPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch("/api/portal/ats/profile");
      if (res.status === 401) {
        router.push("/portal/guardia-postulante/registro");
        return;
      }
      const json = await res.json();
      if (json.success) setProfile(json.data);
    } catch {
      toast.error("Error al cargar perfil");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  async function save() {
    if (!profile) return;
    setSaving(true);
    try {
      const res = await fetch("/api/portal/ats/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experienciaAnios: profile.experienciaAnios ?? 0,
          turnosDisponibles: profile.turnosDisponibles,
          pretensionRentaMin: profile.pretensionRentaMin,
          pretensionRentaMax: profile.pretensionRentaMax,
          availableExtraShifts: profile.availableExtraShifts,
          os10: profile.os10 ?? false,
          os10ExpiresAt: profile.os10ExpiresAt,
          region: profile.persona.region,
          commune: profile.persona.commune,
          phone: profile.persona.phone,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Perfil actualizado");
      } else {
        toast.error(json.error);
      }
    } catch {
      toast.error("Error de red");
    } finally {
      setSaving(false);
    }
  }

  function toggleTurno(turno: string) {
    if (!profile) return;
    const current = profile.turnosDisponibles;
    setProfile({
      ...profile,
      turnosDisponibles: current.includes(turno)
        ? current.filter((t) => t !== turno)
        : [...current, turno],
    });
  }

  if (loading) return <p className="text-center py-8 text-muted-foreground">Cargando perfil...</p>;
  if (!profile) return <p className="text-center py-8 text-muted-foreground">No se pudo cargar el perfil.</p>;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Mi perfil</h2>

      <Card className="p-6 space-y-4">
        <h3 className="font-medium">Datos personales</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-muted-foreground">Nombre:</span>{" "}
            {profile.persona.firstName} {profile.persona.lastName}
          </div>
          <div>
            <span className="text-muted-foreground">RUT:</span>{" "}
            {profile.persona.rut ?? "—"}
          </div>
        </div>
        <div>
          <Label>Teléfono</Label>
          <Input
            value={profile.persona.phone ?? ""}
            onChange={(e) =>
              setProfile({ ...profile, persona: { ...profile.persona, phone: e.target.value } })
            }
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Región</Label>
            <Input
              value={profile.persona.region ?? ""}
              onChange={(e) =>
                setProfile({ ...profile, persona: { ...profile.persona, region: e.target.value } })
              }
            />
          </div>
          <div>
            <Label>Comuna</Label>
            <Input
              value={profile.persona.commune ?? ""}
              onChange={(e) =>
                setProfile({ ...profile, persona: { ...profile.persona, commune: e.target.value } })
              }
            />
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h3 className="font-medium">Experiencia y renta</h3>
        <div>
          <Label>Años de experiencia</Label>
          <Input
            type="number"
            min={0}
            value={profile.experienciaAnios ?? 0}
            onChange={(e) => setProfile({ ...profile, experienciaAnios: parseInt(e.target.value) || 0 })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Pretensión mínima (CLP)</Label>
            <Input
              type="number"
              value={profile.pretensionRentaMin ?? ""}
              onChange={(e) =>
                setProfile({ ...profile, pretensionRentaMin: parseInt(e.target.value) || null })
              }
            />
          </div>
          <div>
            <Label>Pretensión máxima (CLP)</Label>
            <Input
              type="number"
              value={profile.pretensionRentaMax ?? ""}
              onChange={(e) =>
                setProfile({ ...profile, pretensionRentaMax: parseInt(e.target.value) || null })
              }
            />
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h3 className="font-medium">Disponibilidad</h3>
        <div className="grid grid-cols-2 gap-2">
          {TURNOS.map((t) => (
            <label key={t.value} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={profile.turnosDisponibles.includes(t.value)}
                onChange={() => toggleTurno(t.value)}
                className="h-4 w-4"
              />
              <span className="text-sm">{t.label}</span>
            </label>
          ))}
        </div>
        <div className="flex items-center gap-3 pt-2">
          <Switch
            checked={profile.availableExtraShifts}
            onCheckedChange={(v) => setProfile({ ...profile, availableExtraShifts: v })}
          />
          <Label>Disponible para turnos extra urgentes</Label>
        </div>
      </Card>

      <Button onClick={save} disabled={saving}>
        Guardar cambios
      </Button>
    </div>
  );
}
