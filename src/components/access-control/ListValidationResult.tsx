// ListValidationResult presenta el resultado server-side de listas.
// DecisionScreen es solo presentación — no reevalúa whitelist/blacklist.
"use client";

import React from "react";
import type { RutValidationResult } from "@/lib/access-control/types";
import { formatRut } from "@/lib/access-control/utils";
import { DecisionScreen, ResultMetaChip } from "@/app/portal/acceso/_components/DecisionScreen";

interface Props {
  result: RutValidationResult;
  rut: string;
  fullName?: string;
  config?: {
    useWhitelist: boolean;
    useBlacklist: boolean;
    whitelistRecordTypes?: string[];
    blacklistRecordTypes?: string[];
  };
  selectedType?: string;
  onContinue: () => void;
  onBack: () => void;
  onDeniedAttempt?: () => void;
}

export function ListValidationResult({
  result,
  rut,
  fullName,
  config,
  selectedType,
  onContinue,
  onBack,
  onDeniedAttempt,
}: Props) {
  const whitelistAppliesToType = (() => {
    const arr = config?.whitelistRecordTypes;
    if (Array.isArray(arr)) {
      return selectedType ? arr.includes(selectedType) : false;
    }
    return Boolean(config?.useWhitelist);
  })();

  const displayRut = formatRut(rut);

  if (result.listMatch === "blacklist") {
    return (
      <DecisionScreen
        authorized={false}
        name={result.personData?.fullName || "Persona no identificada"}
        rut={displayRut}
        context={result.personData?.blockReason ? `Motivo: ${result.personData.blockReason}` : undefined}
        chips={
          <>
            <ResultMetaChip tone="bad">Lista negra</ResultMetaChip>
            <ResultMetaChip tone="warn">Alerta enviada</ResultMetaChip>
            {result.personData?.scope === "global" && (
              <ResultMetaChip tone="bad">Bloqueo global</ResultMetaChip>
            )}
          </>
        }
        showProtocol
        confirmLabel="REGISTRAR RECHAZO"
        onConfirm={() => {
          navigator.vibrate?.([100, 50, 100]);
          onDeniedAttempt?.();
          onBack();
        }}
      />
    );
  }

  if (
    whitelistAppliesToType &&
    result.listMatch !== "whitelist" &&
    result.listMatch !== "blacklist" &&
    !result.preregistration
  ) {
    return (
      <NotInWhitelistScreen
        rut={displayRut}
        fullName={fullName || result.frequentData?.fullName}
        onBack={onBack}
        onDeniedAttempt={onDeniedAttempt}
      />
    );
  }

  if (result.listMatch === "whitelist") {
    const outOfSchedule = result.personData?.isWithinSchedule === false;
    const outOfValidity = result.personData?.isWithinValidity === false;
    return (
      <DecisionScreen
        authorized
        name={result.personData?.fullName || fullName}
        rut={displayRut}
        context={result.personData?.company}
        chips={
          <>
            <ResultMetaChip tone="ok">Lista blanca</ResultMetaChip>
            {outOfSchedule && <ResultMetaChip tone="warn">Fuera de horario</ResultMetaChip>}
            {outOfValidity && <ResultMetaChip tone="warn">Vigencia vencida</ResultMetaChip>}
          </>
        }
        confirmLabel="REGISTRAR INGRESO"
        onConfirm={onContinue}
      />
    );
  }

  const displayName =
    fullName || result.frequentData?.fullName || result.preregistration?.visitorName;
  const displayCompany = result.frequentData?.company || result.personData?.company;

  return (
    <DecisionScreen
      authorized
      name={displayName}
      rut={displayRut}
      context={
        result.preregistration
          ? [result.preregistration.hostName && `Visita a ${result.preregistration.hostName}`, result.preregistration.purpose]
              .filter(Boolean)
              .join(" · ")
          : displayCompany
      }
      chips={
        <>
          {result.preregistration && <ResultMetaChip tone="ok">Esperado</ResultMetaChip>}
          {result.isFrequent && (
            <ResultMetaChip>Frecuente · {result.frequentData?.visitCount ?? 0}</ResultMetaChip>
          )}
          {!result.preregistration && !result.isFrequent && (
            <ResultMetaChip>Verificación manual</ResultMetaChip>
          )}
        </>
      }
      confirmLabel="REGISTRAR INGRESO"
      onConfirm={onContinue}
    />
  );
}

function NotInWhitelistScreen({
  rut,
  fullName,
  onBack,
  onDeniedAttempt,
}: {
  rut: string;
  fullName?: string;
  onBack: () => void;
  onDeniedAttempt?: () => void;
}) {
  React.useEffect(() => {
    onDeniedAttempt?.();
    navigator.vibrate?.([200, 100, 200]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <DecisionScreen
      authorized={false}
      name={fullName}
      rut={rut}
      context="No está en la lista de autorizados de la instalación."
      chips={
        <>
          <ResultMetaChip tone="bad">Fuera de lista blanca</ResultMetaChip>
          <ResultMetaChip tone="warn">Alerta enviada</ResultMetaChip>
        </>
      }
      confirmLabel="REGISTRAR RECHAZO"
      onConfirm={onBack}
    />
  );
}
