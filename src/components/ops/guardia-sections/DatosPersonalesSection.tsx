"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DetailField, DetailFieldGrid } from "@/components/opai/DetailField";
import {
  BANK_ACCOUNT_TYPES,
  CHILE_BANKS,
  formatPersonName,
  formatRutForInput,
  getRegimenPrevisionalLabel,
  normalizeRut,
} from "@/lib/personas";
import { Tag } from "@/components/opai-ds";
import { Label } from "@/components/ui/label";

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

  return (
    <div className="space-y-5">
      {/* Identificación */}
      <div>
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.08em] mb-2.5">Identificación</p>
        <DetailFieldGrid columns={3} boxed>
          <DetailField boxed label="Nombre completo" value={formatPersonName(persona.firstName, persona.lastName)} />
          <DetailField boxed label="RUT" value={persona.rut} mono copyable />
          <DetailField boxed label="Fecha de nacimiento" value={persona.birthDate ? formatDateUTC(persona.birthDate) : undefined} />
          <DetailField
            boxed
            label="Sexo"
            value={persona.sex ? persona.sex.charAt(0).toUpperCase() + persona.sex.slice(1) : undefined}
          />
          <DetailField boxed label="Nacionalidad" value={persona.nacionalidad} />
        </DetailFieldGrid>
      </div>

      {/* Contacto */}
      <div>
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.08em] mb-2.5">Contacto</p>
        <DetailFieldGrid columns={3} boxed>
          <DetailField boxed label="Email" value={persona.email} copyable />
          <DetailField boxed label="Celular" value={persona.phoneMobile} mono copyable />
        </DetailFieldGrid>
      </div>

      {/* Datos previsionales */}
      <div>
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.08em] mb-2.5">Datos previsionales</p>
        <DetailFieldGrid columns={3} boxed>
          <DetailField boxed label="Régimen previsional" value={getRegimenPrevisionalLabel(persona.regimenPrevisional)} />
          <DetailField boxed label="¿Jubilado?" value={persona.isJubilado ? "Sí" : "No"} />
          {persona.isJubilado && (
            <>
              <DetailField boxed label="Cotiza AFP" value={persona.cotizaAFP ? "Sí" : "No"} />
              <DetailField boxed label="Cotiza AFC" value={persona.cotizaAFC ? "Sí" : "No"} />
            </>
          )}
          <DetailField boxed label="Cotiza salud" value={persona.cotizaSalud !== false ? "Sí" : "No"} />
          <DetailField boxed label="AFP" value={persona.afp} />
          <DetailField
            boxed
            label="Sistema de salud"
            value={
              persona.healthSystem === "isapre"
                ? `ISAPRE${persona.isapreName ? ` · ${persona.isapreName}` : ""}`
                : persona.healthSystem
                  ? persona.healthSystem.toUpperCase()
                  : undefined
            }
          />
          <DetailField
            boxed
            label="Cotización"
            value={
              persona.healthSystem === "isapre" && persona.isapreHasExtraPercent
                ? `${persona.isapreExtraPercent || "N/D"}%`
                : "Cotización legal"
            }
          />
        </DetailFieldGrid>
      </div>

      {/* Laboral */}
      <div>
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.08em] mb-2.5">Laboral</p>
        <DetailFieldGrid columns={3} boxed>
          <DetailField boxed label="Movilización" value={persona.hasMobilization ? "Con movilización" : "Sin movilización"} />
          <DetailField boxed label="Turnos extra" value={availableExtraShifts ? "Disponible para TE" : "No disponible para TE"} />
          <DetailField boxed label="Fecha de ingreso" value={hiredAt ? formatDateUTC(hiredAt) : undefined} />
          <DetailField boxed label="Recibe anticipo" value={recibeAnticipo ? "Sí" : "No"} />
          <DetailField boxed label="Monto anticipo" value={montoAnticipo ? `$ ${montoAnticipo.toLocaleString("es-CL")}` : "$ 0"} mono />
          <DetailField
            boxed
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
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">Datos bancarios</p>
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
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.08em] mb-2.5">Uniforme y físico</p>
        <DetailFieldGrid columns={3} boxed>
          <DetailField boxed label="Calzado" value={persona.shoeSize} />
          <DetailField boxed label="Pantalón" value={persona.pantsSize} />
          <DetailField boxed label="Polera" value={persona.tshirtSize} />
          <DetailField boxed label="Camisa" value={persona.shirtSize} />
          <DetailField boxed label="Geólogo" value={persona.geologoSize} />
          <DetailField boxed label="Polar" value={persona.polarSize} />
          <DetailField boxed label="Chaqueta" value={persona.jacketSize} />
          <DetailField boxed label="Estatura" value={persona.heightCm ? `${persona.heightCm} cm` : undefined} />
          <DetailField boxed label="Peso" value={persona.weightKg ? `${persona.weightKg} kg` : undefined} />
        </DetailFieldGrid>
      </div>

      {/* Domicilio */}
      <div>
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.08em] mb-2.5">Domicilio</p>
        <div className="grid gap-2 sm:gap-3 md:grid-cols-[1fr_220px] md:items-stretch">
          <DetailField
            boxed
            label="Dirección"
            value={persona.addressFormatted}
            icon={persona.addressFormatted ? <MapPin className="h-3 w-3" /> : undefined}
          />
          <div className="min-w-0 rounded-xl border border-border/60 bg-card/40 p-3 sm:p-4">
            <dt className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">Ubicación</dt>
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
