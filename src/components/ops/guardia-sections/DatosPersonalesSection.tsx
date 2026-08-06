"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DetailField, DetailFieldGrid } from "@/components/opai/DetailField";
import { InlineEditField } from "@/components/opai/InlineEditField";
import {
  InlineAddressEditField,
  type GeoreferencedAddressPayload,
} from "@/components/crm/InlineAddressEditField";
import {
  AFP_CHILE,
  BANK_ACCOUNT_TYPES,
  CHILE_BANKS,
  HEALTH_SYSTEMS,
  ISAPRES_CHILE,
  PAISES_AMERICA,
  PANTS_SIZES,
  PERSON_SEX,
  REGIMEN_PREVISIONAL,
  SHOE_SIZES,
  TIPO_PENSION,
  TOP_GARMENT_SIZES,
  formatRutForInput,
  normalizeRut,
} from "@/lib/personas";
import {
  normalizeDateYmd,
  normalizeEmail,
  normalizeIntRange,
  normalizeMobileCl9,
  normalizeRut as normalizeRutField,
  rutForApi,
} from "@/lib/validations/field-normalizers";
import { Tag } from "@/components/opai-ds";
import { Label } from "@/components/ui/label";

const YES_NO_OPTIONS = [
  { value: "true", label: "Sí" },
  { value: "false", label: "No" },
];

const SEX_OPTIONS = PERSON_SEX.map((s) => ({
  value: s,
  label: s.charAt(0).toUpperCase() + s.slice(1),
}));

const NACIONALIDAD_OPTIONS = PAISES_AMERICA.map((p) => ({ value: p, label: p }));
const AFP_OPTIONS = AFP_CHILE.map((a) => ({ value: a, label: a }));
const HEALTH_OPTIONS = HEALTH_SYSTEMS.map((h) => ({
  value: h,
  label: h.toUpperCase(),
}));
const ISAPRE_OPTIONS = ISAPRES_CHILE.map((i) => ({ value: i, label: i }));
const REGIMEN_OPTIONS = REGIMEN_PREVISIONAL.map((r) => ({
  value: r.value,
  label: r.label,
}));
const TIPO_PENSION_OPTIONS = TIPO_PENSION.map((t) => ({
  value: t.value,
  label: t.label,
}));
const SHOE_OPTIONS = SHOE_SIZES.map((s) => ({ value: s, label: s }));
const PANTS_OPTIONS = PANTS_SIZES.map((s) => ({ value: s, label: s }));
const TOP_OPTIONS = TOP_GARMENT_SIZES.map((s) => ({ value: s, label: s }));

const MOBILIZATION_OPTIONS = [
  { value: "true", label: "Con movilización" },
  { value: "false", label: "Sin movilización" },
];
const TE_OPTIONS = [
  { value: "true", label: "Disponible para TE" },
  { value: "false", label: "No disponible para TE" },
];

function boolToSelect(v?: boolean | null): string | null {
  if (v === true) return "true";
  if (v === false) return "false";
  return null;
}

/** Format a date-only value using UTC to avoid timezone shift */
function formatDateUTC(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = d.getUTCFullYear();
  return `${day}-${month}-${year}`;
}

const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  cuenta_corriente: "Cuenta corriente",
  cuenta_vista: "Cuenta vista",
  cuenta_rut: "Cuenta RUT",
};

type BankAccount = {
  id: string;
  bankCode?: string | null;
  bankName: string;
  accountType: string;
  accountNumber: string;
  holderName: string;
  holderRut?: string | null;
  isDefault: boolean;
};

type Persona = {
  firstName: string;
  lastName: string;
  rut?: string | null;
  email?: string | null;
  personalEmail?: string | null;
  phoneMobile?: string | null;
  addressFormatted?: string | null;
  commune?: string | null;
  city?: string | null;
  region?: string | null;
  sex?: string | null;
  lat?: string | null;
  lng?: string | null;
  birthDate?: string | null;
  nacionalidad?: string | null;
  afp?: string | null;
  healthSystem?: string | null;
  isapreName?: string | null;
  isapreHasExtraPercent?: boolean | null;
  isapreExtraPercent?: string | null;
  hasMobilization?: boolean | null;
  regimenPrevisional?: string | null;
  tipoPension?: string | null;
  isJubilado?: boolean | null;
  cotizaAFP?: boolean | null;
  cotizaAFC?: boolean | null;
  cotizaSalud?: boolean | null;
  shoeSize?: string | null;
  pantsSize?: string | null;
  tshirtSize?: string | null;
  shirtSize?: string | null;
  geologoSize?: string | null;
  polarSize?: string | null;
  jacketSize?: string | null;
  heightCm?: string | null;
  weightKg?: string | null;
};

type AsignacionHistorial = {
  id: string;
  puestoId: string;
  slotNumber: number;
  startDate: string;
  endDate?: string | null;
  isActive: boolean;
  reason?: string | null;
  puesto: { id: string; name: string; shiftStart: string; shiftEnd: string; cargo?: { name: string } | null };
  installation: {
    id: string;
    name: string;
    account?: { id: string; name: string } | null;
  };
};

interface DatosPersonalesSectionProps {
  guardiaId: string;
  persona: Persona;
  hiredAt?: string | null;
  availableExtraShifts?: boolean;
  recibeAnticipo?: boolean;
  montoAnticipo?: number;
  bankAccounts: BankAccount[];
  asignaciones: AsignacionHistorial[];
  canManageGuardias: boolean;
  onBankAccountsChange: (bankAccounts: BankAccount[]) => void;
  /** PATCH de un solo campo (mismo patrón CRM InlineEditField). */
  onCommitField: (key: string, value: string | null) => Promise<string | null>;
  /** PATCH de dirección georreferenciada (Google Maps), igual que instalaciones. */
  onCommitAddress: (payload: GeoreferencedAddressPayload) => Promise<void>;
}

export default function DatosPersonalesSection({
  guardiaId,
  persona,
  hiredAt,
  availableExtraShifts,
  recibeAnticipo,
  montoAnticipo,
  bankAccounts,
  asignaciones,
  canManageGuardias,
  onBankAccountsChange,
  onCommitField,
  onCommitAddress,
}: DatosPersonalesSectionProps) {
  const existingAccount = bankAccounts[0] ?? null;
  const personaRutNormalized = persona.rut ? normalizeRut(persona.rut) : "";
  const [accountForm, setAccountForm] = useState({
    bankCode: "",
    accountType: "",
    accountNumber: "",
    isDefault: true,
    isThirdParty: false,
    holderRut: "",
    holderName: "",
  });
  const [creatingAccount, setCreatingAccount] = useState(false);

  useEffect(() => {
    if (existingAccount) {
      const existingHolderRut = existingAccount.holderRut
        ? normalizeRut(existingAccount.holderRut)
        : "";
      const isThirdParty = !!(
        existingHolderRut &&
        personaRutNormalized &&
        existingHolderRut !== personaRutNormalized
      );
      setAccountForm({
        bankCode: existingAccount.bankCode ?? "",
        accountType: existingAccount.accountType ?? "",
        accountNumber: existingAccount.accountNumber ?? "",
        isDefault: existingAccount.isDefault ?? true,
        isThirdParty,
        holderRut: isThirdParty ? formatRutForInput(existingHolderRut) : "",
        holderName: isThirdParty ? existingAccount.holderName ?? "" : "",
      });
    } else {
      setAccountForm({
        bankCode: "",
        accountType: "",
        accountNumber: "",
        isDefault: true,
        isThirdParty: false,
        holderRut: "",
        holderName: "",
      });
    }
  }, [
    existingAccount?.id,
    existingAccount?.bankCode,
    existingAccount?.accountType,
    existingAccount?.accountNumber,
    existingAccount?.isDefault,
    existingAccount?.holderRut,
    existingAccount?.holderName,
    personaRutNormalized,
  ]);

  const mapUrl =
    persona.lat && persona.lng && process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
      ? `https://maps.googleapis.com/maps/api/staticmap?center=${persona.lat},${persona.lng}&zoom=15&size=160x120&scale=2&markers=color:red%7C${persona.lat},${persona.lng}&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`
      : null;

  const handleCreateBankAccount = async () => {
    if (!accountForm.bankCode || !accountForm.accountType || !accountForm.accountNumber) {
      toast.error("Banco, tipo y número de cuenta son obligatorios");
      return;
    }
    let holderName: string;
    let thirdPartyRut: string | undefined;
    if (accountForm.isThirdParty) {
      const trimmedName = accountForm.holderName.trim();
      const trimmedRut = accountForm.holderRut.trim();
      if (!trimmedName || !trimmedRut) {
        toast.error("RUT y nombre del titular son obligatorios para cuenta de tercero");
        return;
      }
      holderName = trimmedName;
      thirdPartyRut = normalizeRut(trimmedRut);
    } else {
      const guardiaRut = persona.rut?.trim();
      if (!guardiaRut) {
        toast.error("El guardia debe tener RUT para agregar cuenta bancaria");
        return;
      }
      holderName = guardiaRut;
    }

    setCreatingAccount(true);
    try {
      const bank = CHILE_BANKS.find((b) => b.code === accountForm.bankCode);
      const response = await fetch(`/api/personas/guardias/${guardiaId}/bank-accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bankCode: accountForm.bankCode,
          bankName: bank?.name ?? accountForm.bankCode,
          accountType: accountForm.accountType,
          accountNumber: accountForm.accountNumber,
          holderName,
          isThirdParty: accountForm.isThirdParty,
          ...(accountForm.isThirdParty ? { holderRut: thirdPartyRut } : {}),
          isDefault: accountForm.isDefault,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "No se pudo crear cuenta bancaria");
      }
      const newAccounts = accountForm.isDefault
        ? [payload.data, ...bankAccounts.map((it) => ({ ...it, isDefault: false }))]
        : [payload.data, ...bankAccounts];
      onBankAccountsChange(newAccounts);
      setAccountForm({
        bankCode: "",
        accountType: "",
        accountNumber: "",
        isDefault: false,
        isThirdParty: false,
        holderRut: "",
        holderName: "",
      });
      toast.success("Cuenta bancaria agregada");
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "No se pudo crear cuenta bancaria");
    } finally {
      setCreatingAccount(false);
    }
  };

  const handleUpdateBankAccount = async () => {
    if (!existingAccount) return;
    if (!accountForm.bankCode || !accountForm.accountType || !accountForm.accountNumber) {
      toast.error("Banco, tipo y número de cuenta son obligatorios");
      return;
    }
    let holderNameToSend: string | undefined;
    let thirdPartyRut: string | undefined;
    if (accountForm.isThirdParty) {
      const trimmedName = accountForm.holderName.trim();
      const trimmedRut = accountForm.holderRut.trim();
      if (!trimmedName || !trimmedRut) {
        toast.error("RUT y nombre del titular son obligatorios para cuenta de tercero");
        return;
      }
      holderNameToSend = trimmedName;
      thirdPartyRut = normalizeRut(trimmedRut);
    } else {
      const guardiaRut = persona.rut?.trim();
      holderNameToSend = guardiaRut || undefined;
    }
    setCreatingAccount(true);
    try {
      const bank = CHILE_BANKS.find((b) => b.code === accountForm.bankCode);
      const response = await fetch(
        `/api/personas/guardias/${guardiaId}/bank-accounts?accountId=${existingAccount.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bankCode: accountForm.bankCode,
            bankName: bank?.name ?? accountForm.bankCode,
            accountType: accountForm.accountType,
            accountNumber: accountForm.accountNumber,
            isThirdParty: accountForm.isThirdParty,
            ...(holderNameToSend !== undefined ? { holderName: holderNameToSend } : {}),
            ...(accountForm.isThirdParty ? { holderRut: thirdPartyRut } : {}),
          }),
        }
      );
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "No se pudo actualizar cuenta bancaria");
      }
      onBankAccountsChange(
        bankAccounts.map((acc) =>
          acc.id === existingAccount.id ? { ...acc, ...payload.data } : acc
        )
      );
      toast.success("Cuenta bancaria actualizada");
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar cuenta bancaria");
    } finally {
      setCreatingAccount(false);
    }
  };

  const canEdit = canManageGuardias;
  const birthDateValue = persona.birthDate
    ? String(persona.birthDate).slice(0, 10)
    : null;
  const hiredAtValue = hiredAt ? String(hiredAt).slice(0, 10) : null;
  const heightValue =
    persona.heightCm != null && persona.heightCm !== ""
      ? String(Math.round(Number(persona.heightCm)))
      : null;
  const weightValue =
    persona.weightKg != null && persona.weightKg !== ""
      ? String(Number(persona.weightKg))
      : null;

  return (
    <div className="space-y-5">
      {/* Identificación */}
      <div>
        <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.08em] mb-2.5">Identificación</p>
        <DetailFieldGrid columns={3}>
          <InlineEditField
            label="Nombre"
            fieldKey="firstName"
            type="text"
            value={persona.firstName || null}
            canEdit={canEdit}
            required
            onCommit={onCommitField}
          />
          <InlineEditField
            label="Apellido"
            fieldKey="lastName"
            type="text"
            value={persona.lastName || null}
            canEdit={canEdit}
            required
            onCommit={onCommitField}
          />
          <InlineEditField
            label="RUT"
            fieldKey="rut"
            type="rut"
            value={persona.rut ?? null}
            canEdit={canEdit}
            mono
            normalize={normalizeRutField}
            confirm={{
              title: "¿Cambiar el RUT del guardia?",
              description: (next) =>
                `Se actualizará el RUT a ${next || "(vacío)"}. Esto afecta contratos, marcación y remuneraciones.`,
            }}
            onCommit={async (key, value) => onCommitField(key, rutForApi(value))}
          />
          <InlineEditField
            label="Fecha de nacimiento"
            fieldKey="birthDate"
            type="date"
            value={birthDateValue}
            canEdit={canEdit}
            normalize={normalizeDateYmd}
            displayValue={(v) => (v ? formatDateUTC(v) : null)}
            onCommit={onCommitField}
          />
          <InlineEditField
            label="Sexo"
            fieldKey="sex"
            type="select"
            value={persona.sex ?? null}
            canEdit={canEdit}
            options={SEX_OPTIONS}
            onCommit={onCommitField}
          />
          <InlineEditField
            label="Nacionalidad"
            fieldKey="nacionalidad"
            type="select"
            value={persona.nacionalidad ?? null}
            canEdit={canEdit}
            options={NACIONALIDAD_OPTIONS}
            onCommit={onCommitField}
          />
        </DetailFieldGrid>
      </div>

      {/* Contacto */}
      <div>
        <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.08em] mb-2.5">Contacto</p>
        <DetailFieldGrid columns={3}>
          <InlineEditField
            label="Email corporativo"
            fieldKey="email"
            type="email"
            value={persona.email ?? null}
            canEdit={canEdit}
            normalize={normalizeEmail}
            onCommit={onCommitField}
          />
          <InlineEditField
            label="Email personal"
            fieldKey="personalEmail"
            type="email"
            value={persona.personalEmail ?? null}
            canEdit={canEdit}
            normalize={normalizeEmail}
            onCommit={onCommitField}
          />
          <InlineEditField
            label="Celular"
            fieldKey="phoneMobile"
            type="phone"
            value={persona.phoneMobile ?? null}
            canEdit={canEdit}
            mono
            normalize={normalizeMobileCl9}
            onCommit={onCommitField}
          />
        </DetailFieldGrid>
      </div>

      {/* Datos previsionales */}
      <div>
        <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.08em] mb-2.5">Datos previsionales</p>
        <DetailFieldGrid columns={3}>
          <InlineEditField
            label="Régimen previsional"
            fieldKey="regimenPrevisional"
            type="select"
            value={persona.regimenPrevisional ?? null}
            canEdit={canEdit}
            options={REGIMEN_OPTIONS}
            onCommit={onCommitField}
          />
          <InlineEditField
            label="¿Jubilado?"
            fieldKey="isJubilado"
            type="select"
            value={boolToSelect(persona.isJubilado)}
            canEdit={canEdit}
            options={YES_NO_OPTIONS}
            onCommit={onCommitField}
          />
          {persona.isJubilado && (
            <>
              <InlineEditField
                label="Tipo de pensión"
                fieldKey="tipoPension"
                type="select"
                value={persona.tipoPension ?? null}
                canEdit={canEdit}
                options={TIPO_PENSION_OPTIONS}
                onCommit={onCommitField}
              />
              <InlineEditField
                label="Cotiza AFP"
                fieldKey="cotizaAFP"
                type="select"
                value={boolToSelect(persona.cotizaAFP)}
                canEdit={canEdit}
                options={YES_NO_OPTIONS}
                onCommit={onCommitField}
              />
              <InlineEditField
                label="Cotiza AFC"
                fieldKey="cotizaAFC"
                type="select"
                value={boolToSelect(persona.cotizaAFC)}
                canEdit={canEdit}
                options={YES_NO_OPTIONS}
                onCommit={onCommitField}
              />
            </>
          )}
          <InlineEditField
            label="Cotiza salud"
            fieldKey="cotizaSalud"
            type="select"
            value={boolToSelect(persona.cotizaSalud !== false)}
            canEdit={canEdit}
            options={YES_NO_OPTIONS}
            onCommit={onCommitField}
          />
          <InlineEditField
            label="AFP"
            fieldKey="afp"
            type="select"
            value={persona.afp ?? null}
            canEdit={canEdit}
            options={AFP_OPTIONS}
            onCommit={onCommitField}
          />
          <InlineEditField
            label="Sistema de salud"
            fieldKey="healthSystem"
            type="select"
            value={persona.healthSystem ?? null}
            canEdit={canEdit}
            options={HEALTH_OPTIONS}
            onCommit={onCommitField}
          />
          {persona.healthSystem === "isapre" && (
            <InlineEditField
              label="ISAPRE"
              fieldKey="isapreName"
              type="select"
              value={persona.isapreName ?? null}
              canEdit={canEdit}
              options={ISAPRE_OPTIONS}
              onCommit={onCommitField}
            />
          )}
          <InlineEditField
            label="% adicional ISAPRE"
            fieldKey="isapreExtraPercent"
            type="number"
            value={
              persona.healthSystem === "isapre" && persona.isapreHasExtraPercent
                ? persona.isapreExtraPercent != null
                  ? String(persona.isapreExtraPercent)
                  : null
                : null
            }
            canEdit={canEdit && persona.healthSystem === "isapre"}
            locked={persona.healthSystem !== "isapre"}
            lockedReason="Solo aplica con ISAPRE"
            placeholder="Cotización legal"
            normalize={(raw) => {
              const s = raw.trim();
              if (!s) return { ok: true, value: null };
              const n = Number(s.replace(",", "."));
              if (!Number.isFinite(n) || n <= 7) {
                return { ok: false, error: "Debe ser mayor a 7%" };
              }
              if (n > 100) return { ok: false, error: "Máximo 100%" };
              return { ok: true, value: String(n) };
            }}
            displayValue={(v) => (v ? `${v}%` : null)}
            onCommit={onCommitField}
          />
        </DetailFieldGrid>
      </div>

      {/* Laboral */}
      <div>
        <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.08em] mb-2.5">Laboral</p>
        <DetailFieldGrid columns={3}>
          <InlineEditField
            label="Movilización"
            fieldKey="hasMobilization"
            type="select"
            value={boolToSelect(!!persona.hasMobilization)}
            canEdit={canEdit}
            options={MOBILIZATION_OPTIONS}
            onCommit={onCommitField}
          />
          <InlineEditField
            label="Turnos extra"
            fieldKey="availableExtraShifts"
            type="select"
            value={boolToSelect(!!availableExtraShifts)}
            canEdit={canEdit}
            options={TE_OPTIONS}
            onCommit={onCommitField}
          />
          <InlineEditField
            label="Fecha de ingreso"
            fieldKey="hiredAt"
            type="date"
            value={hiredAtValue}
            canEdit={canEdit}
            normalize={normalizeDateYmd}
            displayValue={(v) => (v ? formatDateUTC(v) : null)}
            onCommit={onCommitField}
          />
          <DetailField
            label="Recibe anticipo"
            value={recibeAnticipo ? "Sí" : "No"}
          />
          <DetailField
            label="Monto anticipo"
            value={montoAnticipo ? `$ ${montoAnticipo.toLocaleString("es-CL")}` : "$ 0"}
            mono
          />
          <DetailField
            label="Cargo / Instalación"
            value={(() => {
              const current = asignaciones.find((a) => a.isActive);
              if (!current) return undefined;
              const cargoLabel = current.puesto?.cargo?.name ?? current.puesto?.name ?? "Sin cargo";
              const instLabel = `${current.installation.name}${current.installation.account ? ` · ${current.installation.account.name}` : ""}`;
              return (
                <Link href={`/crm/installations/${current.installation.id}`} className="text-primary hover:underline">
                  {cargoLabel} · {instLabel}
                </Link>
              );
            })()}
            placeholder="Sin cargo asignado"
          />
        </DetailFieldGrid>
      </div>

      {/* Datos bancarios */}
      <div>
        <div className="flex items-center gap-2 mb-2.5 flex-wrap">
          <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">Datos bancarios</p>
          {existingAccount?.holderRut &&
            personaRutNormalized &&
            normalizeRut(existingAccount.holderRut) !== personaRutNormalized && (
              <Tag variant="warn" size="sm">
                Cuenta de tercero: {existingAccount.holderName} ({formatRutForInput(existingAccount.holderRut)})
              </Tag>
            )}
        </div>
        <DetailFieldGrid columns={3} boxed>
          <DetailField
            boxed
            label="Banco"
            value={existingAccount ? (CHILE_BANKS.find((b) => b.code === existingAccount.bankCode)?.name ?? existingAccount.bankName) : undefined}
            placeholder="Sin datos"
          />
          <DetailField
            boxed
            label="Tipo cuenta"
            value={existingAccount ? (ACCOUNT_TYPE_LABEL[existingAccount.accountType] ?? existingAccount.accountType) : undefined}
            placeholder="Sin datos"
          />
          <DetailField
            boxed
            label="Número de cuenta"
            value={existingAccount?.accountNumber}
            mono
            copyable
            placeholder="Sin datos"
          />
        </DetailFieldGrid>
      </div>

      {/* Uniforme y físico */}
      <div>
        <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.08em] mb-2.5">Uniforme y físico</p>
        <DetailFieldGrid columns={3}>
          <InlineEditField label="Calzado" fieldKey="shoeSize" type="select" value={persona.shoeSize ?? null} canEdit={canEdit} options={SHOE_OPTIONS} onCommit={onCommitField} />
          <InlineEditField label="Pantalón" fieldKey="pantsSize" type="select" value={persona.pantsSize ?? null} canEdit={canEdit} options={PANTS_OPTIONS} onCommit={onCommitField} />
          <InlineEditField label="Polera" fieldKey="tshirtSize" type="select" value={persona.tshirtSize ?? null} canEdit={canEdit} options={TOP_OPTIONS} onCommit={onCommitField} />
          <InlineEditField label="Camisa" fieldKey="shirtSize" type="select" value={persona.shirtSize ?? null} canEdit={canEdit} options={TOP_OPTIONS} onCommit={onCommitField} />
          <InlineEditField label="Geólogo" fieldKey="geologoSize" type="select" value={persona.geologoSize ?? null} canEdit={canEdit} options={TOP_OPTIONS} onCommit={onCommitField} />
          <InlineEditField label="Polar" fieldKey="polarSize" type="select" value={persona.polarSize ?? null} canEdit={canEdit} options={TOP_OPTIONS} onCommit={onCommitField} />
          <InlineEditField label="Chaqueta" fieldKey="jacketSize" type="select" value={persona.jacketSize ?? null} canEdit={canEdit} options={TOP_OPTIONS} onCommit={onCommitField} />
          <InlineEditField
            label="Estatura (cm)"
            fieldKey="heightCm"
            type="int"
            value={heightValue}
            canEdit={canEdit}
            normalize={normalizeIntRange(120, 230)}
            displayValue={(v) => (v ? `${v} cm` : null)}
            onCommit={onCommitField}
          />
          <InlineEditField
            label="Peso (kg)"
            fieldKey="weightKg"
            type="number"
            value={weightValue}
            canEdit={canEdit}
            normalize={normalizeIntRange(35, 250)}
            displayValue={(v) => (v ? `${v} kg` : null)}
            onCommit={onCommitField}
          />
        </DetailFieldGrid>
      </div>

      {/* Domicilio — misma UX que instalaciones: Google Maps + pegar URL */}
      <div>
        <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.08em] mb-2.5">Domicilio</p>
        <div className="grid gap-2 sm:gap-3 md:grid-cols-[1fr_220px] md:items-stretch">
          <InlineAddressEditField
            label="Dirección"
            value={persona.addressFormatted ?? null}
            canEdit={canEdit}
            onCommit={onCommitAddress}
          />
          <div className="min-w-0 rounded-xl border border-border/60 bg-card/40 p-3 sm:p-4">
            <dt className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">Ubicación</dt>
            <dd>
              {mapUrl ? (
                <a
                  href={`https://www.google.com/maps/@${persona.lat},${persona.lng},17z`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg overflow-hidden border border-border block h-[120px] w-full"
                  title="Abrir en Google Maps"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={mapUrl} alt="Mapa guardia" className="h-full w-full object-cover" />
                </a>
              ) : (
                <div className="rounded-lg border border-dashed border-border h-[120px] w-full flex items-center justify-center text-xs text-muted-foreground">
                  <MapPin className="h-4 w-4 mr-1" />
                  Sin mapa
                </div>
              )}
            </dd>
          </div>
        </div>
        <DetailFieldGrid columns={3} className="mt-3">
          <InlineEditField label="Comuna" fieldKey="commune" type="text" value={persona.commune ?? null} canEdit={canEdit} onCommit={onCommitField} />
          <InlineEditField label="Ciudad" fieldKey="city" type="text" value={persona.city ?? null} canEdit={canEdit} onCommit={onCommitField} />
          <InlineEditField label="Región" fieldKey="region" type="text" value={persona.region ?? null} canEdit={canEdit} onCommit={onCommitField} />
        </DetailFieldGrid>
      </div>

      {canManageGuardias && (
        <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            {existingAccount ? "Edite los datos bancarios y guarde los cambios." : "Complete para registrar la cuenta bancaria."}
          </p>
          <div className="grid gap-3 md:grid-cols-4">
            <select
              className="h-9 rounded-md border border-border bg-background px-3 text-sm"
              value={accountForm.bankCode}
              onChange={(e) => setAccountForm((prev) => ({ ...prev, bankCode: e.target.value }))}
            >
              <option value="">Banco chileno</option>
              {CHILE_BANKS.map((bank) => (
                <option key={bank.code} value={bank.code}>
                  {bank.name}
                </option>
              ))}
            </select>
            <select
              className="h-9 rounded-md border border-border bg-background px-3 text-sm"
              value={accountForm.accountType}
              onChange={(e) => setAccountForm((prev) => ({ ...prev, accountType: e.target.value }))}
            >
              <option value="">Tipo de cuenta</option>
              {BANK_ACCOUNT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {ACCOUNT_TYPE_LABEL[type]}
                </option>
              ))}
            </select>
            <Input
              placeholder="Número de cuenta"
              value={accountForm.accountNumber}
              onChange={(e) => setAccountForm((prev) => ({ ...prev, accountNumber: e.target.value }))}
            />
            <Button
              onClick={existingAccount ? handleUpdateBankAccount : handleCreateBankAccount}
              disabled={creatingAccount}
            >
              {creatingAccount ? "..." : existingAccount ? "Guardar" : "Agregar"}
            </Button>
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-border">
            <input
              type="checkbox"
              id={`isThirdParty-${guardiaId}`}
              checked={accountForm.isThirdParty}
              onChange={(e) =>
                setAccountForm((prev) => ({
                  ...prev,
                  isThirdParty: e.target.checked,
                  holderRut: e.target.checked ? prev.holderRut : "",
                  holderName: e.target.checked ? prev.holderName : "",
                }))
              }
              className="h-4 w-4"
            />
            <label htmlFor={`isThirdParty-${guardiaId}`} className="text-xs cursor-pointer">
              Pago a otro RUT (cuenta de tercero)
            </label>
          </div>

          {accountForm.isThirdParty && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2 p-3 bg-status-warn-soft border border-status-warn-border rounded-md">
              <div className="sm:col-span-2">
                <p className="text-[11px] text-status-warn-fg mb-2">
                  ⚠️ Esta cuenta NO está a nombre del trabajador. La planilla de pagos usará el RUT y nombre indicados aquí.
                </p>
              </div>
              <div>
                <Label className="text-[11px]">RUT del titular *</Label>
                <Input
                  value={accountForm.holderRut}
                  onChange={(e) =>
                    setAccountForm((prev) => ({
                      ...prev,
                      holderRut: formatRutForInput(e.target.value),
                    }))
                  }
                  placeholder="12.345.678-9"
                  className="h-9 text-sm mt-1"
                />
              </div>
              <div>
                <Label className="text-[11px]">Nombre del titular *</Label>
                <Input
                  value={accountForm.holderName}
                  onChange={(e) =>
                    setAccountForm((prev) => ({ ...prev, holderName: e.target.value }))
                  }
                  placeholder="Nombre completo"
                  className="h-9 text-sm mt-1"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
