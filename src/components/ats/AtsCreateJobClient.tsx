"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { AtsSnippetsConfig, Snippet } from "@/lib/ats/snippets";

interface Installation {
  id: string;
  name: string;
  commune: string | null;
  lat: number | null;
  lng: number | null;
}

function SnippetPicker({
  snippets,
  onSelect,
  mode = "replace",
}: {
  snippets: Snippet[];
  onSelect: (text: string) => void;
  /** "replace" sets the field value; "append" appends to existing */
  mode?: "replace" | "append";
}) {
  if (!snippets.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {snippets.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onSelect(s.text)}
          className="inline-flex items-center rounded-md border border-border bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-colors"
          title={mode === "append" ? `Agregar: ${s.text.slice(0, 80)}...` : s.text.slice(0, 80)}
        >
          {mode === "append" ? "+ " : ""}{s.label}
        </button>
      ))}
    </div>
  );
}

const TURNOS = [
  { value: "4x4_dia", label: "4×4 Día" },
  { value: "4x4_noche", label: "4×4 Noche" },
  { value: "5x2", label: "5×2" },
  { value: "6x1", label: "6×1" },
  { value: "otro", label: "Otro" },
];

const REGIONES = [
  "Arica y Parinacota", "Tarapacá", "Antofagasta", "Atacama", "Coquimbo",
  "Valparaíso", "Metropolitana", "O'Higgins", "Maule", "Ñuble", "Biobío",
  "La Araucanía", "Los Ríos", "Los Lagos", "Aysén", "Magallanes",
];

const CANALES = [
  { value: "google_jobs", label: "Google Empleos", desc: "JSON-LD · Gratis · Automático" },
  { value: "indeed", label: "Indeed", desc: "Job Sync API · Requiere partner" },
  { value: "computrabajo", label: "Computrabajo", desc: "XML feed · Requiere partner" },
  { value: "bumeran", label: "Bumeran Chile", desc: "ATS API · Requiere partner" },
  { value: "talent", label: "Talent.com", desc: "XML feed · Requiere partner" },
  { value: "base_opai", label: "Base Opai", desc: "Push a guardias con match · Gratis" },
  { value: "jooble", label: "Jooble", desc: "Buscador de empleo · Gratis · Automático" },
  { value: "yapo", label: "Yapo.cl", desc: "Manual · Solo trazabilidad" },
];

export function AtsCreateJobClient({
  installations,
  snippets,
}: {
  installations: Installation[];
  snippets: AtsSnippetsConfig;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    titulo: "",
    descripcion: "",
    turno: "",
    region: "",
    commune: "",
    installationId: "",
    rentaMin: "",
    rentaMax: "",
    vacantes: "1",
    requiereOS10: true,
    requiereMovilizacion: false,
    genero: "",
    experienciaMinAnios: "0",
    funciones: "",
    canales: ["google_jobs", "base_opai", "jooble"] as string[],
  });

  function toggleCanal(canal: string) {
    setForm((f) => ({
      ...f,
      canales: f.canales.includes(canal)
        ? f.canales.filter((c) => c !== canal)
        : [...f.canales, canal],
    }));
  }

  async function submit(activar: boolean) {
    if (!form.titulo || !form.descripcion || !form.turno || !form.region) {
      toast.error("Completa los campos obligatorios");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/ops/ats/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: form.titulo,
          descripcion: form.descripcion,
          turno: form.turno,
          region: form.region,
          commune: form.commune || undefined,
          installationId: form.installationId || undefined,
          rentaMin: form.rentaMin ? parseInt(form.rentaMin) : undefined,
          rentaMax: form.rentaMax ? parseInt(form.rentaMax) : undefined,
          vacantes: parseInt(form.vacantes) || 1,
          requiereOS10: form.requiereOS10,
          requiereMovilizacion: form.requiereMovilizacion,
          genero: form.genero || null,
          experienciaMinAnios: parseInt(form.experienciaMinAnios) || 0,
          funciones: form.funciones || undefined,
          canales: form.canales,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error || "Error al crear aviso");
        return;
      }

      if (activar) {
        await fetch(`/api/ops/ats/jobs/${json.data.id}/activar`, { method: "POST" });
        toast.success("Aviso creado y activado");
      } else {
        toast.success("Aviso guardado como borrador");
      }

      router.push("/ops/ats");
      router.refresh();
    } catch {
      toast.error("Error de red");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left column: Job info */}
      <div className="lg:col-span-2 space-y-6">
        <Card className="p-6 space-y-4">
          <h3 className="font-semibold">Información del cargo</h3>

          <div>
            <Label htmlFor="titulo">Título del cargo *</Label>
            <Input
              id="titulo"
              value={form.titulo}
              onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
              placeholder="Guardia de seguridad — Santiago Centro"
            />
            <SnippetPicker
              snippets={snippets.titulo}
              onSelect={(text) => setForm((f) => ({ ...f, titulo: text }))}
            />
          </div>

          <div>
            <Label htmlFor="descripcion">Descripción *</Label>
            <Textarea
              id="descripcion"
              value={form.descripcion}
              onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
              rows={4}
              placeholder="Describe las funciones, horario y condiciones del cargo..."
            />
            <SnippetPicker
              snippets={snippets.descripcion}
              onSelect={(text) => setForm((f) => ({ ...f, descripcion: text }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Turno *</Label>
              <Select value={form.turno} onValueChange={(v) => setForm((f) => ({ ...f, turno: v }))}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  {TURNOS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Región *</Label>
              <Select value={form.region} onValueChange={(v) => setForm((f) => ({ ...f, region: v }))}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  {REGIONES.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Instalación (opcional)</Label>
              <Select
                value={form.installationId}
                onValueChange={(v) => setForm((f) => ({ ...f, installationId: v }))}
              >
                <SelectTrigger><SelectValue placeholder="Sin instalación" /></SelectTrigger>
                <SelectContent>
                  {installations.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name} {i.commune ? `(${i.commune})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Vacantes</Label>
              <Input
                type="number"
                min={1}
                value={form.vacantes}
                onChange={(e) => setForm((f) => ({ ...f, vacantes: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Renta mínima (CLP)</Label>
              <Input
                type="number"
                value={form.rentaMin}
                onChange={(e) => setForm((f) => ({ ...f, rentaMin: e.target.value }))}
                placeholder="450000"
              />
            </div>
            <div>
              <Label>Renta máxima (CLP)</Label>
              <Input
                type="number"
                value={form.rentaMax}
                onChange={(e) => setForm((f) => ({ ...f, rentaMax: e.target.value }))}
                placeholder="600000"
              />
            </div>
          </div>
        </Card>

        <Card className="p-6 space-y-4">
          <h3 className="font-semibold">Requisitos</h3>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <Switch
                checked={form.requiereOS10}
                onCheckedChange={(v) => setForm((f) => ({ ...f, requiereOS10: v }))}
              />
              <Label>Requiere OS10</Label>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={form.requiereMovilizacion}
                onCheckedChange={(v) => setForm((f) => ({ ...f, requiereMovilizacion: v }))}
              />
              <Label>Requiere movilización</Label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Género</Label>
              <Select value={form.genero} onValueChange={(v) => setForm((f) => ({ ...f, genero: v }))}>
                <SelectTrigger><SelectValue placeholder="Cualquiera" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Cualquiera</SelectItem>
                  <SelectItem value="M">Masculino</SelectItem>
                  <SelectItem value="F">Femenino</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Experiencia mínima (años)</Label>
              <Input
                type="number"
                min={0}
                value={form.experienciaMinAnios}
                onChange={(e) => setForm((f) => ({ ...f, experienciaMinAnios: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <Label>Funciones específicas</Label>
            <Textarea
              value={form.funciones}
              onChange={(e) => setForm((f) => ({ ...f, funciones: e.target.value }))}
              rows={3}
              placeholder="Detalla las funciones específicas del cargo..."
            />
            <SnippetPicker
              snippets={snippets.funciones}
              mode="append"
              onSelect={(text) =>
                setForm((f) => ({
                  ...f,
                  funciones: f.funciones
                    ? `${f.funciones}\n${text}`
                    : text,
                }))
              }
            />
          </div>
        </Card>
      </div>

      {/* Right column: Channels + Actions */}
      <div className="space-y-6">
        <Card className="p-6 space-y-4">
          <h3 className="font-semibold">Canales de publicación</h3>
          <div className="space-y-3">
            {CANALES.map((canal) => (
              <div
                key={canal.value}
                className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                  form.canales.includes(canal.value)
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
                onClick={() => toggleCanal(canal.value)}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{canal.label}</span>
                  {form.canales.includes(canal.value) && (
                    <Badge variant="default" className="text-xs">Activo</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{canal.desc}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6 space-y-3">
          <Button className="w-full" onClick={() => submit(true)} disabled={saving}>
            Activar y publicar
          </Button>
          <Button
            className="w-full"
            variant="outline"
            onClick={() => submit(false)}
            disabled={saving}
          >
            Guardar como borrador
          </Button>
        </Card>
      </div>
    </div>
  );
}
