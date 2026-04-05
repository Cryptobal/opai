"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import Link from "next/link";

type Step = "access" | "datos" | "os10" | "disponibilidad" | "pin";

const STEPS: Step[] = ["access", "datos", "os10", "disponibilidad", "pin"];
const STEP_LABELS: Record<Step, string> = {
  access: "Acceso",
  datos: "Datos básicos",
  os10: "OS10",
  disponibilidad: "Disponibilidad",
  pin: "Tu PIN",
};

export default function RegistroPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("access");
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    rut: "",
    phone: "",
    region: "",
    experienciaAnios: "",
    pretensionRentaMin: "",
    pretensionRentaMax: "",
    os10: false,
    os10ExpiresAt: "",
    turnosDisponibles: [] as string[],
    availableExtraShifts: false,
  });

  const [guardiaId, setGuardiaId] = useState("");
  const [pin, setPin] = useState("");

  function toggleTurno(turno: string) {
    setForm((f) => ({
      ...f,
      turnosDisponibles: f.turnosDisponibles.includes(turno)
        ? f.turnosDisponibles.filter((t) => t !== turno)
        : [...f.turnosDisponibles, turno],
    }));
  }

  // Step 1: Simulated Google Auth (real implementation requires NextAuth Google provider)
  async function handleGoogleLogin() {
    // In production, this would redirect to Google OAuth
    // For now, proceed to data entry step
    toast.info("Integración Google OAuth pendiente. Continúa con datos manuales.");
    setStep("datos");
  }

  // Step 2: Register with basic data
  async function handleRegister() {
    if (!form.firstName || !form.lastName) {
      toast.error("Completa nombre y apellido");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/portal/ats/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          googleAuthId: `manual_${form.rut || Date.now()}`,
          googleEmail: "",
          firstName: form.firstName,
          lastName: form.lastName,
          phone: form.phone,
          rut: form.rut || undefined,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error);
        return;
      }
      // JWT cookie is set automatically by the API response
      setGuardiaId(json.data.guardiaId);
      if (json.data.pin) setPin(json.data.pin);
      setStep("os10");
    } catch {
      toast.error("Error de red");
    } finally {
      setLoading(false);
    }
  }

  // Step 3: OS10
  async function handleOS10() {
    setStep("disponibilidad");
  }

  // Step 4: Availability + save profile
  async function handleDisponibilidad() {
    setLoading(true);
    try {
      const res = await fetch("/api/portal/ats/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experienciaAnios: parseInt(form.experienciaAnios) || 0,
          turnosDisponibles: form.turnosDisponibles,
          pretensionRentaMin: parseInt(form.pretensionRentaMin) || undefined,
          pretensionRentaMax: parseInt(form.pretensionRentaMax) || undefined,
          availableExtraShifts: form.availableExtraShifts,
          os10: form.os10,
          os10ExpiresAt: form.os10ExpiresAt || undefined,
          region: form.region || undefined,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error);
        return;
      }
      setStep("pin");
    } catch {
      toast.error("Error de red");
    } finally {
      setLoading(false);
    }
  }

  const stepIndex = STEPS.indexOf(step);

  return (
    <div className="space-y-6">
      {/* Progress */}
      <div className="flex gap-2">
        {STEPS.map((s, i) => (
          <div
            key={s}
            className={`flex-1 h-1.5 rounded-full ${
              i <= stepIndex ? "bg-primary" : "bg-gray-200"
            }`}
          />
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        Paso {stepIndex + 1} de {STEPS.length}: {STEP_LABELS[step]}
      </p>

      {/* Step 1: Access */}
      {step === "access" && (
        <Card className="p-6 space-y-4">
          <h2 className="text-xl font-semibold">Bienvenido al portal de empleo</h2>
          <p className="text-muted-foreground">
            Regístrate para encontrar empleo como guardia de seguridad en Chile.
          </p>
          <Button className="w-full" onClick={handleGoogleLogin}>
            Continuar con Google
          </Button>
          <div className="text-center text-sm text-muted-foreground">o</div>
          <Button className="w-full" variant="outline" onClick={() => setStep("datos")}>
            Registrarme con mis datos
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            ¿Ya tienes PIN?{" "}
            <Link href="/portal/guardia" className="text-primary underline">
              Ingresar con RUT + PIN
            </Link>
          </p>
        </Card>
      )}

      {/* Step 2: Basic data */}
      {step === "datos" && (
        <Card className="p-6 space-y-4">
          <h2 className="text-xl font-semibold">Datos básicos</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Nombre *</Label>
              <Input
                value={form.firstName}
                onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
              />
            </div>
            <div>
              <Label>Apellido *</Label>
              <Input
                value={form.lastName}
                onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <Label>RUT</Label>
            <Input
              value={form.rut}
              onChange={(e) => setForm((f) => ({ ...f, rut: e.target.value }))}
              placeholder="12.345.678-9"
            />
          </div>
          <div>
            <Label>Teléfono</Label>
            <Input
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="+56 9 1234 5678"
            />
          </div>
          <div>
            <Label>Región de residencia</Label>
            <Input
              value={form.region}
              onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
              placeholder="Metropolitana"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Pretensión renta mínima</Label>
              <Input
                type="number"
                value={form.pretensionRentaMin}
                onChange={(e) => setForm((f) => ({ ...f, pretensionRentaMin: e.target.value }))}
                placeholder="450000"
              />
            </div>
            <div>
              <Label>Pretensión renta máxima</Label>
              <Input
                type="number"
                value={form.pretensionRentaMax}
                onChange={(e) => setForm((f) => ({ ...f, pretensionRentaMax: e.target.value }))}
                placeholder="600000"
              />
            </div>
          </div>
          <div>
            <Label>Años de experiencia</Label>
            <Input
              type="number"
              min={0}
              value={form.experienciaAnios}
              onChange={(e) => setForm((f) => ({ ...f, experienciaAnios: e.target.value }))}
            />
          </div>
          <Button className="w-full" onClick={handleRegister} disabled={loading}>
            Continuar
          </Button>
        </Card>
      )}

      {/* Step 3: OS10 */}
      {step === "os10" && (
        <Card className="p-6 space-y-4">
          <h2 className="text-xl font-semibold">Credencial OS10</h2>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={form.os10}
              onChange={(e) => setForm((f) => ({ ...f, os10: e.target.checked }))}
              className="h-4 w-4"
            />
            <Label>Tengo OS10 vigente</Label>
          </div>
          {form.os10 && (
            <div>
              <Label>Fecha de vencimiento</Label>
              <Input
                type="date"
                value={form.os10ExpiresAt}
                onChange={(e) => setForm((f) => ({ ...f, os10ExpiresAt: e.target.value }))}
              />
            </div>
          )}
          <Button className="w-full" onClick={handleOS10}>
            Continuar
          </Button>
        </Card>
      )}

      {/* Step 4: Availability */}
      {step === "disponibilidad" && (
        <Card className="p-6 space-y-4">
          <h2 className="text-xl font-semibold">Disponibilidad</h2>
          <div>
            <Label className="mb-2 block">Turnos disponibles</Label>
            <div className="grid grid-cols-2 gap-2">
              {["4x4_dia", "4x4_noche", "5x2", "6x1", "otro"].map((turno) => (
                <label key={turno} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.turnosDisponibles.includes(turno)}
                    onChange={() => toggleTurno(turno)}
                    className="h-4 w-4"
                  />
                  <span className="text-sm">
                    {turno === "4x4_dia" ? "4x4 Día" : turno === "4x4_noche" ? "4x4 Noche" : turno === "5x2" ? "5x2" : turno === "6x1" ? "6x1" : "Otro"}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={form.availableExtraShifts}
              onChange={(e) => setForm((f) => ({ ...f, availableExtraShifts: e.target.checked }))}
              className="h-4 w-4"
            />
            <div>
              <Label>Disponible para turnos extra urgentes</Label>
              <p className="text-xs text-muted-foreground">
                Te notificaremos cuando haya turnos urgentes cerca de ti
              </p>
            </div>
          </div>
          <Button className="w-full" onClick={handleDisponibilidad} disabled={loading}>
            Continuar
          </Button>
        </Card>
      )}

      {/* Step 5: PIN */}
      {step === "pin" && (
        <Card className="p-6 space-y-4 text-center">
          <h2 className="text-xl font-semibold">Tu PIN de acceso</h2>
          <p className="text-muted-foreground">
            Guárdalo — te sirve para entrar desde cualquier dispositivo.
          </p>
          <div className="text-5xl font-mono font-bold tracking-[0.5em] py-4">
            {pin || "****"}
          </div>
          <p className="text-sm text-muted-foreground">
            Puedes cambiarlo cuando quieras desde tu perfil.
          </p>
          <Button
            className="w-full"
            onClick={() => router.push("/portal/guardia-postulante/ofertas")}
          >
            Ver ofertas de empleo
          </Button>
        </Card>
      )}
    </div>
  );
}
