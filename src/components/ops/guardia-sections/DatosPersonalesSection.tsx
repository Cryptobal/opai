"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DetailField, DetailFieldGrid } from "@/components/crm/DetailField";
import {
  BANK_ACCOUNT_TYPES,
  CHILE_BANKS,
  getRegimenPrevisionalLabel,
} from "@/lib/personas";

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
  const [accountForm, setAccountForm] = useState({
    bankCode: "",
    accountType: "",
    accountNumber: "",
    isDefault: true,
  });
  const [creatingAccount, setCreatingAccount] = useState(false);

  useEffect(() => {
    if (existingAccount) {
      setAccountForm({
        bankCode: existingAccount.bankCode ?? "",
        accountType: existingAccount.accountType ?? "",
        accountNumber: existingAccount.accountNumber ?? "",
        isDefault: existingAccount.isDefault ?? true,
      });
    } else {
      setAccountForm({ bankCode: "", accountType: "", accountNumber: "", isDefault: true });
    }
  }, [existingAccount?.id, existingAccount?.bankCode, existingAccount?.accountType, existingAccount?.accountNumber, existingAccount?.isDefault]);

  const mapUrl =
    persona.lat && persona.lng && process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
      ? `https://maps.googleapis.com/maps/api/staticmap?center=${persona.lat},${persona.lng}&zoom=15&size=160x120&scale=2&markers=color:red%7C${persona.lat},${persona.lng}&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`
      : null;

  const handleCreateBankAccount = async () => {
    if (!accountForm.bankCode || !accountForm.accountType || !accountForm.accountNumber) {
      toast.error("Banco, tipo y número de cuenta son obligatorios");
      return;
    }
    const holderName = persona.rut?.trim();
    if (!holderName) {
      toast.error("El guardia debe tener RUT para agregar cuenta bancaria");
      return;
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
      });
      toast.success("Cuenta bancaria agregada");
    } catch (error) {
      console.error(error);
      toast.error("No se pudo crear cuenta bancaria");
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
      toast.error("No se pudo actualizar cuenta bancaria");
    } finally {
      setCreatingAccount(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Identificación */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Identificación</p>
        <DetailFieldGrid columns={3}>
          <DetailField label="Nombre completo" value={`${persona.firstName} ${persona.lastName}`} />
          <DetailField label="RUT" value={persona.rut} mono copyable />
          <DetailField label="Fecha de nacimiento" value={persona.birthDate ? formatDateUTC(persona.birthDate) : undefined} />
          <DetailField
            label="Sexo"
            value={persona.sex ? persona.sex.charAt(0).toUpperCase() + persona.sex.slice(1) : undefined}
          />
          <DetailField label="Nacionalidad" value={persona.nacionalidad} />
        </DetailFieldGrid>
      </div>

      <div className="border-t border-border" />

      {/* Contacto */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Contacto</p>
        <DetailFieldGrid columns={3}>
          <DetailField label="Email" value={persona.email} copyable />
          <DetailField label="Celular" value={persona.phoneMobile} mono copyable />
        </DetailFieldGrid>
      </div>

      <div className="border-t border-border" />

      {/* Datos previsionales */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Datos previsionales</p>
        <DetailFieldGrid columns={3}>
          <DetailField label="Régimen previsional" value={getRegimenPrevisionalLabel(persona.regimenPrevisional)} />
          <DetailField label="¿Jubilado?" value={persona.isJubilado ? "Sí" : "No"} />
          {persona.isJubilado && (
            <>
              <DetailField label="Cotiza AFP" value={persona.cotizaAFP ? "Sí" : "No"} />
              <DetailField label="Cotiza AFC" value={persona.cotizaAFC ? "Sí" : "No"} />
            </>
          )}
          <DetailField label="Cotiza salud" value={persona.cotizaSalud !== false ? "Sí" : "No"} />
          <DetailField label="AFP" value={persona.afp} />
          <DetailField
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
            label="Cotización"
            value={
              persona.healthSystem === "isapre" && persona.isapreHasExtraPercent
                ? `${persona.isapreExtraPercent || "N/D"}%`
                : "Cotización legal"
            }
          />
        </DetailFieldGrid>
      </div>

      <div className="border-t border-border" />

      {/* Laboral */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Laboral</p>
        <DetailFieldGrid columns={3}>
          <DetailField label="Movilización" value={persona.hasMobilization ? "Con movilización" : "Sin movilización"} />
          <DetailField label="Turnos extra" value={availableExtraShifts ? "Disponible para TE" : "No disponible para TE"} />
          <DetailField label="Fecha de ingreso" value={hiredAt ? formatDateUTC(hiredAt) : undefined} />
          <DetailField label="Recibe anticipo" value={recibeAnticipo ? "Sí" : "No"} />
          <DetailField label="Monto anticipo" value={montoAnticipo ? `$ ${montoAnticipo.toLocaleString("es-CL")}` : "$ 0"} mono />
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

      <div className="border-t border-border" />

      {/* Datos bancarios */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Datos bancarios</p>
        <DetailFieldGrid columns={3}>
          <DetailField
            label="Banco"
            value={existingAccount ? (CHILE_BANKS.find((b) => b.code === existingAccount.bankCode)?.name ?? existingAccount.bankName) : undefined}
            placeholder="Sin datos"
          />
          <DetailField
            label="Tipo cuenta"
            value={existingAccount ? (ACCOUNT_TYPE_LABEL[existingAccount.accountType] ?? existingAccount.accountType) : undefined}
            placeholder="Sin datos"
          />
          <DetailField
            label="Número de cuenta"
            value={existingAccount?.accountNumber}
            mono
            copyable
            placeholder="Sin datos"
          />
        </DetailFieldGrid>
      </div>

      <div className="border-t border-border" />

      {/* Domicilio */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Domicilio</p>
        <div className="grid gap-x-6 gap-y-4 md:grid-cols-[1fr_200px] md:items-start">
          <DetailField
            label="Dirección"
            value={persona.addressFormatted}
            icon={persona.addressFormatted ? <MapPin className="h-3 w-3" /> : undefined}
          />
          <div className="min-w-0">
            <dt className="text-xs font-medium text-muted-foreground mb-0.5 uppercase tracking-wide">Ubicación</dt>
            <dd>
              {mapUrl ? (
                <a
                  href={`https://www.google.com/maps/@${persona.lat},${persona.lng},17z`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg overflow-hidden border border-border block h-[120px] w-[200px]"
                  title="Abrir en Google Maps"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={mapUrl} alt="Mapa guardia" className="h-full w-full object-cover" />
                </a>
              ) : (
                <div className="rounded-lg border border-dashed border-border h-[120px] w-[200px] flex items-center justify-center text-xs text-muted-foreground">
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
        </div>
      )}
    </div>
  );
}
