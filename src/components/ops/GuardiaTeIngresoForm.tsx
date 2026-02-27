"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AddressAutocomplete, type AddressResult } from "@/components/ui/AddressAutocomplete";
import {
  CHILE_BANKS,
  BANK_ACCOUNT_TYPES,
  completeRutWithDv,
  formatRutForInput,
  isChileanRutFormat,
  isValidChileanRut,
  normalizeMobileNineDigits,
  normalizeRut,
} from "@/lib/personas";
import { hasOpsCapability } from "@/lib/ops-rbac";
import { SearchableSelect } from "@/components/ui/SearchableSelect";

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  cuenta_corriente: "Cuenta corriente",
  cuenta_vista: "Cuenta vista",
  cuenta_rut: "Cuenta RUT",
};

interface GuardiaTeIngresoFormProps {
  userRole: string;
  onSuccess?: () => void;
  compact?: boolean;
}

export function GuardiaTeIngresoForm({
  userRole,
  onSuccess,
  compact = false,
}: GuardiaTeIngresoFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [rutError, setRutError] = useState<string | null>(null);
  const canEditAntecedentes = hasOpsCapability(userRole, "guardias_manage");

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    rut: "",
    addressFormatted: "",
    googlePlaceId: "",
    commune: "",
    city: "",
    region: "",
    lat: "",
    lng: "",
    birthDate: "",
    phoneMobile: "",
    bankCode: "",
    accountType: "",
    accountNumber: "",
    holderName: "",
    os10: true as boolean,
    estadoUniforme: "completo" as "completo" | "incompleto",
    prendasFaltantes: "",
    validadoAntecedentes: null as boolean | null,
    notaEvaluacion: "" as "" | "bueno" | "regular" | "malo",
    comentarioEvaluacion: "",
  });

  const onAddressChange = (result: AddressResult) => {
    setForm((prev) => ({
      ...prev,
      addressFormatted: result.address,
      googlePlaceId: result.placeId || "",
      commune: result.commune || "",
      city: result.city || "",
      region: result.region || "",
      lat: String(result.lat || ""),
      lng: String(result.lng || ""),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const completedRut = completeRutWithDv(form.rut);
    if (!isChileanRutFormat(completedRut) || !isValidChileanRut(completedRut)) {
      setRutError("RUT inválido. Debe incluir guión y dígito verificador correcto.");
      toast.error("Corrige el RUT antes de continuar");
      return;
    }
    if (!form.googlePlaceId || !form.addressFormatted) {
      toast.error("Debes seleccionar la dirección desde Google Maps");
      return;
    }
    if (form.estadoUniforme === "incompleto" && !form.prendasFaltantes.trim()) {
      toast.error("Indica las prendas faltantes cuando el uniforme está incompleto");
      return;
    }

    const selectedBank = CHILE_BANKS.find((b) => b.code === form.bankCode);
    if (!selectedBank || !form.accountType || !form.accountNumber.trim()) {
      toast.error("Completa los datos bancarios");
      return;
    }

    setSaving(true);
    setRutError(null);
    try {
      const res = await fetch("/api/personas/guardias/te", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          rut: normalizeRut(completedRut),
          addressFormatted: form.addressFormatted,
          googlePlaceId: form.googlePlaceId || null,
          commune: form.commune || null,
          city: form.city || null,
          region: form.region || null,
          lat: form.lat ? Number(form.lat) : null,
          lng: form.lng ? Number(form.lng) : null,
          birthDate: form.birthDate || null,
          phoneMobile: normalizeMobileNineDigits(form.phoneMobile),
          bankCode: form.bankCode,
          bankName: selectedBank.name,
          accountType: form.accountType,
          accountNumber: form.accountNumber.trim(),
          holderName: form.holderName.trim() || normalizeRut(completedRut),
          os10: form.os10,
          estadoUniforme: form.estadoUniforme,
          prendasFaltantes:
            form.estadoUniforme === "incompleto" ? form.prendasFaltantes.trim() || null : null,
          validadoAntecedentes: canEditAntecedentes ? form.validadoAntecedentes : null,
          notaEvaluacion: form.notaEvaluacion || null,
          comentarioEvaluacion: form.comentarioEvaluacion.trim() || null,
        }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        throw new Error(payload.error || "No se pudo crear el guardia TE");
      }
      toast.success("Guardia Turno Extra registrado correctamente");
      setForm({
        firstName: "",
        lastName: "",
        rut: "",
        addressFormatted: "",
        googlePlaceId: "",
        commune: "",
        city: "",
        region: "",
        lat: "",
        lng: "",
        birthDate: "",
        phoneMobile: "",
        bankCode: "",
        accountType: "",
        accountNumber: "",
        holderName: "",
        os10: true,
        estadoUniforme: "completo",
        prendasFaltantes: "",
        validadoAntecedentes: null,
        notaEvaluacion: "",
        comentarioEvaluacion: "",
      });
      onSuccess?.();
      if (payload.data?.id) {
        router.push(`/personas/guardias/${payload.data.id}`);
      }
    } catch (err) {
      console.error(err);
      const msg = (err as Error)?.message || "No se pudo crear el guardia";
      if (/rut|root/i.test(msg)) {
        setRutError("RUT ya ingresado. Comunicarse con recursos humanos.");
      }
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Datos personales */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Datos personales</h3>
        <div className={`grid gap-3 ${compact ? "grid-cols-2" : "md:grid-cols-3"}`}>
          <div className="space-y-1">
            <Label htmlFor="te-firstName">Nombre *</Label>
            <Input
              id="te-firstName"
              placeholder="Nombre"
              value={form.firstName}
              onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="te-lastName">Apellido *</Label>
            <Input
              id="te-lastName"
              placeholder="Apellido"
              value={form.lastName}
              onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="te-rut">RUT *</Label>
            <Input
              id="te-rut"
              placeholder="12345678-9"
              value={form.rut}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, rut: formatRutForInput(e.target.value) }))
              }
              onBlur={() => {
                const completed = completeRutWithDv(form.rut);
                setForm((prev) => ({ ...prev, rut: completed }));
                if (
                  completed &&
                  (!isChileanRutFormat(completed) || !isValidChileanRut(completed))
                ) {
                  setRutError("RUT inválido. Debe incluir guión y dígito verificador correcto.");
                } else {
                  setRutError(null);
                }
              }}
            />
            {rutError && <p className="text-xs text-destructive">{rutError}</p>}
          </div>
        </div>

        <div className="space-y-1">
          <Label>Dirección *</Label>
          <AddressAutocomplete
            value={form.addressFormatted}
            onChange={onAddressChange}
            placeholder="Buscar dirección (Google Maps)"
            showMap={!compact}
          />
        </div>
        {!compact && (
          <div className="grid gap-3 md:grid-cols-3">
            <Input placeholder="Comuna" value={form.commune} readOnly className="bg-muted/50" />
            <Input placeholder="Ciudad" value={form.city} readOnly className="bg-muted/50" />
            <Input placeholder="Región" value={form.region} readOnly className="bg-muted/50" />
          </div>
        )}

        <div className={`grid gap-3 ${compact ? "grid-cols-2" : "md:grid-cols-2"}`}>
          <div className="space-y-1">
            <Label htmlFor="te-birthDate">Fecha de nacimiento * (edad 18-70)</Label>
            <Input
              id="te-birthDate"
              type="date"
              value={form.birthDate}
              onChange={(e) => setForm((prev) => ({ ...prev, birthDate: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="te-phoneMobile">Celular * (+56 9 XXXX XXXX)</Label>
            <Input
              id="te-phoneMobile"
              placeholder="912345678"
              maxLength={9}
              value={form.phoneMobile}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  phoneMobile: normalizeMobileNineDigits(e.target.value).slice(0, 9),
                }))
              }
              required
            />
          </div>
        </div>
      </div>

      {/* Datos bancarios */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Datos bancarios</h3>
        <div className={`grid gap-3 ${compact ? "grid-cols-2" : "md:grid-cols-3"}`}>
          <div className="space-y-1">
            <Label htmlFor="te-bankCode">Banco *</Label>
            <SearchableSelect
              value={form.bankCode}
              options={CHILE_BANKS.map((b) => ({ id: b.code, label: b.name }))}
              placeholder="Seleccionar banco"
              onChange={(val) => setForm((prev) => ({ ...prev, bankCode: val }))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="te-accountType">Tipo de cuenta *</Label>
            <select
              id="te-accountType"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.accountType}
              onChange={(e) => setForm((prev) => ({ ...prev, accountType: e.target.value }))}
              required
            >
              <option value="">Seleccionar</option>
              {BANK_ACCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ACCOUNT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="te-accountNumber">Número de cuenta *</Label>
            <Input
              id="te-accountNumber"
              placeholder="Número de cuenta"
              value={form.accountNumber}
              onChange={(e) => setForm((prev) => ({ ...prev, accountNumber: e.target.value }))}
              required
            />
          </div>
        </div>
      </div>

      {/* Credencial OS-10 */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Credencial de seguridad</h3>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="os10"
              checked={form.os10 === true}
              onChange={() => setForm((prev) => ({ ...prev, os10: true }))}
              className="rounded-full"
            />
            <span className="text-sm">Sí</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="os10"
              checked={form.os10 === false}
              onChange={() => setForm((prev) => ({ ...prev, os10: false }))}
              className="rounded-full"
            />
            <span className="text-sm">No</span>
          </label>
        </div>
      </div>

      {/* Uniforme */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Uniforme</h3>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="estadoUniforme"
              checked={form.estadoUniforme === "completo"}
              onChange={() =>
                setForm((prev) => ({
                  ...prev,
                  estadoUniforme: "completo",
                  prendasFaltantes: "",
                }))
              }
              className="rounded-full"
            />
            <span className="text-sm">Completo</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="estadoUniforme"
              checked={form.estadoUniforme === "incompleto"}
              onChange={() => setForm((prev) => ({ ...prev, estadoUniforme: "incompleto" }))}
              className="rounded-full"
            />
            <span className="text-sm">Incompleto</span>
          </label>
        </div>
        {form.estadoUniforme === "incompleto" && (
          <div className="space-y-1">
            <Label htmlFor="te-prendasFaltantes">Prendas faltantes *</Label>
            <Textarea
              id="te-prendasFaltantes"
              placeholder="Indica qué prendas faltan..."
              value={form.prendasFaltantes}
              onChange={(e) => setForm((prev) => ({ ...prev, prendasFaltantes: e.target.value }))}
              rows={2}
            />
          </div>
        )}
      </div>

      {/* Validado Antecedentes — solo Admin/RRHH */}
      {canEditAntecedentes && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Validación de antecedentes</h3>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="validadoAntecedentes"
                checked={form.validadoAntecedentes === true}
                onChange={() => setForm((prev) => ({ ...prev, validadoAntecedentes: true }))}
                className="rounded-full"
              />
              <span className="text-sm">Sí</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="validadoAntecedentes"
                checked={form.validadoAntecedentes === false}
                onChange={() => setForm((prev) => ({ ...prev, validadoAntecedentes: false }))}
                className="rounded-full"
              />
              <span className="text-sm">No</span>
            </label>
          </div>
        </div>
      )}

      {/* Evaluación */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Evaluación</h3>
        <div className="space-y-1">
          <Label htmlFor="te-notaEvaluacion">Nota</Label>
          <select
            id="te-notaEvaluacion"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm max-w-xs"
            value={form.notaEvaluacion}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                notaEvaluacion: e.target.value as "bueno" | "regular" | "malo",
              }))
            }
          >
            <option value="">Seleccionar</option>
            <option value="bueno">Bueno</option>
            <option value="regular">Regular</option>
            <option value="malo">Malo</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="te-comentarioEvaluacion">Comentario</Label>
          <Textarea
            id="te-comentarioEvaluacion"
            placeholder="Comentario opcional..."
            value={form.comentarioEvaluacion}
            onChange={(e) => setForm((prev) => ({ ...prev, comentarioEvaluacion: e.target.value }))}
            rows={2}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Guardando..." : "Registrar guardia TE"}
        </Button>
      </div>
    </form>
  );
}
