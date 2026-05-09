"use client";

import React, { useState, useCallback } from "react";
import { toast } from "sonner";
import {
  ArrowLeft, UserPlus, Truck, Car, BadgeCheck, Package,
  QrCode, Keyboard, Loader2, Check, AlertTriangle,
  ShieldAlert, ShieldCheck, Camera, ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CedulaQRScanner } from "./CedulaQRScanner";
import { MrzCameraCapture } from "./MrzCameraCapture";
import { DynamicFormRenderer } from "./DynamicFormRenderer";
import { VehiclePlateOCR } from "./VehiclePlateOCR";
import { ListValidationResult } from "./ListValidationResult";
import type {
  AccessRecordType, AccessControlConfigData,
  RutValidationResult, FormFieldConfig, CedulaQRData,
} from "@/lib/access-control/types";
import { RECORD_TYPE_CONFIG, DEFAULT_FORM_FIELDS } from "@/lib/access-control/types";
import { validateRut, formatRut, cleanRut, formatRutDash, computeRutDv } from "@/lib/access-control/utils";

// ═══════════════════════════════════════════════════════════════

const TYPE_ICONS: Record<AccessRecordType, React.ReactNode> = {
  visit: <UserPlus className="h-6 w-6" />,
  provider: <Truck className="h-6 w-6" />,
  vehicle: <Car className="h-6 w-6" />,
  staff: <BadgeCheck className="h-6 w-6" />,
  delivery: <Package className="h-6 w-6" />,
};

type EntryStep = "type" | "identify" | "validation" | "form" | "confirm";

interface Props {
  installationId: string;
  guardId: string;
  tenantId: string;
  config: AccessControlConfigData;
  onClose: () => void;
}

export function AccessControlEntry({
  installationId,
  guardId,
  tenantId,
  config,
  onClose,
}: Props) {
  const [step, setStep] = useState<EntryStep>("type");
  const [selectedType, setSelectedType] = useState<AccessRecordType | null>(null);
  const [showQR, setShowQR] = useState(false);

  // Identification
  const [rut, setRut] = useState("");
  const [rutBody, setRutBody] = useState("");
  const [qrData, setQrData] = useState<CedulaQRData | null>(null);
  const [needsMrzCapture, setNeedsMrzCapture] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<RutValidationResult | null>(null);

  // Form data
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);

  // GPS
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);

  // Get GPS on mount
  React.useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {} // silently fail
    );
  }, []);

  // ── Step 1: Select Type ──
  const handleSelectType = (type: AccessRecordType) => {
    setSelectedType(type);
    if (type === "vehicle") {
      setStep("form"); // Vehicles skip person identification
    } else {
      setStep("identify");
    }
  };

  // ── Step 2: QR Scan Result ──
  const handleQRResult = (data: CedulaQRData) => {
    setQrData(data);
    setRut(data.rut);
    setRutBody(cleanRut(data.rut).replace(/[^0-9]/g, ""));
    setFormData((prev) => ({
      ...prev,
      rut: data.rut,
      documentSerial: data.serial,
      qrSource: data.source,
      ...(data.parsedMrz?.fullName ? { full_name: data.parsedMrz.fullName } : {}),
    }));
    setShowQR(false);
    validateRutAgainstLists(data.rut, !data.parsedMrz?.fullName);
  };

  // ── Step 2b: MRZ OCR Result (after validation, if still no name) ──
  const handleMrzResult = (data: { fullName: string; rut?: string }) => {
    setNeedsMrzCapture(false);
    setFormData((prev) => ({
      ...prev,
      full_name: data.fullName,
      ...(data.rut ? { rut: data.rut } : {}),
    }));
    setStep("validation");
  };

  const handleMrzSkip = () => {
    setNeedsMrzCapture(false);
    setStep("validation");
  };

  // ── Step 2: Manual RUT ──
  const handleManualRut = () => {
    if (!validateRut(rut)) {
      toast.error("RUT inválido");
      return;
    }
    setFormData((prev) => ({ ...prev, rut: cleanRut(rut), qrSource: "manual" }));
    validateRutAgainstLists(rut, false);
  };

  // ── Validate RUT against lists ──
  const validateRutAgainstLists = async (rutValue: string, qrWithoutName = false) => {
    setValidating(true);
    try {
      const res = await fetch("/api/access-control/validate-rut", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rut: rutValue, installationId }),
      });
      const json = await res.json();
      if (json.success) {
        setValidationResult(json.data);

        if (json.data.listMatch === "blacklist") {
          setStep("validation");
          return;
        }

        const autoData: Record<string, unknown> = { rut: cleanRut(rutValue) };
        if (json.data.listMatch === "whitelist" && json.data.personData) {
          autoData.full_name = json.data.personData.fullName;
          autoData.company = json.data.personData.company;
        } else if (json.data.isFrequent && json.data.frequentData) {
          autoData.full_name = json.data.frequentData.fullName;
          autoData.company = json.data.frequentData.company;
        }
        if (json.data.preregistration) {
          autoData.full_name = json.data.preregistration.visitorName;
          autoData.contact_person = json.data.preregistration.hostName;
          autoData.purpose = json.data.preregistration.purpose;
          autoData.preregistrationId = json.data.preregistration.id;
        }

        setFormData((prev) => ({ ...prev, ...autoData }));

        if (!autoData.full_name && qrWithoutName) {
          setNeedsMrzCapture(true);
        } else {
          setStep("validation");
        }
      }
    } catch {
      setFormData((prev) => ({ ...prev, rut: cleanRut(rutValue) }));
      setStep("form");
    } finally {
      setValidating(false);
    }
  };

  // ── Step 3: Continue from validation ──
  const handleContinueFromValidation = () => {
    setStep("form");
  };

  // ── Step 4: Form submit ──
  const handleFormSubmit = (data: Record<string, unknown>) => {
    setFormData((prev) => ({ ...prev, ...data }));
    setStep("confirm");
  };

  // ── Step 5: Confirm entry ──
  const handleConfirmEntry = async () => {
    if (!selectedType) return;
    setSubmitting(true);

    try {
      const payload = {
        recordType: selectedType,
        rut: formData.rut || null,
        fullName: formData.full_name || null,
        company: formData.company || null,
        documentSerial: formData.documentSerial || null,
        entryGuardId: guardId,
        gpsLat: gps?.lat,
        gpsLng: gps?.lng,
        vehiclePlate: formData.vehicle_plate || null,
        vehicleType: formData.vehicle_type || null,
        vehicleBrandModel: formData.vehicle_brand_model || null,
        qrSource: formData.qrSource || "manual",
        listMatch: validationResult?.listMatch || null,
        preregistrationId: formData.preregistrationId || null,
        observations: formData.observations || null,
        customFields: formData,
      };

      const res = await fetch(
        `/api/access-control/records/${installationId}/entry`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      const json = await res.json();
      if (json.success) {
        toast.success("Entrada registrada exitosamente");
        onClose();
      } else {
        toast.error(json.error || "Error al registrar");
      }
    } catch {
      // Save offline
      const offlineRecords = JSON.parse(
        localStorage.getItem(`ac_offline_records_${installationId}`) || "[]"
      );
      offlineRecords.push({
        localId: `local_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        installationId,
        recordType: selectedType,
        ...formData,
        entryGuardId: guardId,
        entryAt: new Date().toISOString(),
        gpsLat: gps?.lat,
        gpsLng: gps?.lng,
        deviceId: `device_${navigator.userAgent.slice(0, 20)}`,
      });
      localStorage.setItem(
        `ac_offline_records_${installationId}`,
        JSON.stringify(offlineRecords)
      );
      toast.success("Entrada guardada offline. Se sincronizará al recuperar conexión.");
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  // ── Get form fields for the selected type ──
  const getFields = (): FormFieldConfig[] => {
    if (!selectedType) return [];
    const configFields = (config.formConfig as Record<string, FormFieldConfig[]>)[selectedType];
    return configFields || DEFAULT_FORM_FIELDS[selectedType] || [];
  };

  return (
    <div className="flex flex-col min-h-full bg-zinc-950">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800">
        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-200">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h3 className="text-base font-semibold text-zinc-100">Registrar Entrada</h3>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {/* Step 1: Select Type */}
        {step === "type" && (
          <div className="space-y-3">
            <p className="text-sm text-zinc-400">Selecciona el tipo de registro</p>
            <div className="grid grid-cols-2 gap-3">
              {config.enabledRecordTypes.map((type) => {
                const tc = RECORD_TYPE_CONFIG[type];
                return (
                  <button
                    key={type}
                    onClick={() => handleSelectType(type)}
                    className="flex flex-col items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 p-5 transition-colors hover:border-status-info-border hover:bg-status-info-soft active:bg-status-info-soft"
                  >
                    {TYPE_ICONS[type]}
                    <span className="text-sm font-medium text-zinc-200">{tc.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 2: Identification */}
        {step === "identify" && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-400">Identifica a la persona</p>

            {showQR ? (
              <CedulaQRScanner
                onResult={handleQRResult}
                onCancel={() => setShowQR(false)}
              />
            ) : needsMrzCapture ? (
              <div className="space-y-3">
                {rut && (
                  <div className="flex items-center gap-2 rounded-lg bg-status-ok-soft border border-status-ok-border px-3 py-2">
                    <Check className="h-4 w-4 text-status-ok-fg" />
                    <span className="text-sm text-status-ok-fg">
                      RUT: <span className="font-mono font-medium">{rut}</span>
                    </span>
                  </div>
                )}
                <MrzCameraCapture
                  onResult={handleMrzResult}
                  onSkip={handleMrzSkip}
                  existingRut={rut}
                />
              </div>
            ) : (
              <>
                <Button
                  onClick={() => setShowQR(true)}
                  className="w-full h-16 text-base bg-status-info hover:bg-status-info"
                  size="lg"
                >
                  <QrCode className="mr-2 h-6 w-6" />
                  Escanear Cédula (QR)
                </Button>

                <div className="flex items-center gap-3 text-zinc-600">
                  <div className="flex-1 border-t border-zinc-700" />
                  <span className="text-xs">o ingreso manual</span>
                  <div className="flex-1 border-t border-zinc-700" />
                </div>

                <div className="space-y-2">
                  <Label className="text-zinc-400">RUT</Label>
                  <div className="flex gap-2">
                    <div className="flex items-center flex-1 rounded-md border border-zinc-600 bg-zinc-800 overflow-hidden">
                      <input
                        value={rutBody}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/[^0-9]/g, "").slice(0, 8);
                          setRutBody(digits);
                          if (digits.length >= 7) {
                            const fullRut = `${digits}-${computeRutDv(digits)}`;
                            setRut(fullRut);
                            if (digits.length === 8) {
                              e.target.blur();
                            }
                          } else {
                            setRut(digits);
                          }
                        }}
                        maxLength={8}
                        placeholder="Ej: 13255838"
                        className="w-0 flex-1 bg-transparent px-3 py-2 text-lg font-mono text-white placeholder:text-zinc-500 outline-none"
                        inputMode="numeric"
                      />
                      {rutBody.length >= 7 && (
                        <span className="pr-3 text-lg font-mono font-bold text-status-ok-fg select-none animate-in fade-in">
                          -{computeRutDv(rutBody)}
                        </span>
                      )}
                    </div>
                    <Button
                      onClick={handleManualRut}
                      disabled={rutBody.length < 7 || !validateRut(rut) || validating}
                      className={rutBody.length >= 7 ? "bg-status-ok hover:brightness-110" : ""}
                    >
                      {validating ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ChevronRight className="h-5 w-5" />
                      )}
                    </Button>
                  </div>
                </div>
              </>
            )}

            {validating && (
              <div className="flex items-center justify-center gap-2 py-4 text-sm text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Validando RUT...
              </div>
            )}
          </div>
        )}

        {/* Step 3: Validation Result */}
        {step === "validation" && validationResult && (
          <ListValidationResult
            result={validationResult}
            rut={rut}
            fullName={formData.full_name as string | undefined}
            config={{ useWhitelist: config.useWhitelist, useBlacklist: config.useBlacklist }}
            onContinue={handleContinueFromValidation}
            onBack={onClose}
            onDeniedAttempt={() => {
              fetch(`/api/access-control/denied-attempts/${installationId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  rut: cleanRut(rut),
                  fullName: (formData.full_name as string | undefined) || null,
                  guardId,
                  blockReason:
                    validationResult.listMatch === "blacklist"
                      ? validationResult.personData?.blockReason || "blacklist_match"
                      : "no_in_whitelist",
                  blacklistEntryId:
                    validationResult.listMatch === "blacklist"
                      ? validationResult.personData?.id
                      : undefined,
                  gpsLat: gps?.lat,
                  gpsLng: gps?.lng,
                }),
              }).catch(() => {});
            }}
          />
        )}

        {/* Step 4: Dynamic Form */}
        {step === "form" && selectedType && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              {TYPE_ICONS[selectedType]}
              <span>{RECORD_TYPE_CONFIG[selectedType].label}</span>
              {validationResult?.listMatch === "whitelist" && (
                <Badge className="bg-status-ok-soft text-status-ok-fg border-status-ok-border">
                  Autorizado
                </Badge>
              )}
              {validationResult?.isFrequent && (
                <Badge className="bg-status-info-soft text-status-info-fg border-status-info-border">
                  Frecuente
                </Badge>
              )}
            </div>

            {selectedType === "vehicle" && (
              <VehiclePlateOCR
                tenantId={tenantId}
                onPlateDetected={(plate) =>
                  setFormData((p) => ({ ...p, vehicle_plate: plate }))
                }
              />
            )}

            <DynamicFormRenderer
              fields={getFields()}
              initialData={formData}
              onSubmit={handleFormSubmit}
            />
          </div>
        )}

        {/* Step 5: Confirm */}
        {step === "confirm" && (
          <div className="space-y-4">
            <h4 className="text-base font-semibold text-zinc-100">Confirmar Entrada</h4>
            <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-4 space-y-2">
              {selectedType && (
                <div className="flex items-center gap-2 text-zinc-300">
                  {TYPE_ICONS[selectedType]}
                  <span className="font-medium">{RECORD_TYPE_CONFIG[selectedType].label}</span>
                </div>
              )}
              {Boolean(formData.full_name) && (
                <div className="text-sm text-zinc-300">
                  <span className="text-zinc-500">Nombre:</span>{" "}
                  {String(formData.full_name)}
                </div>
              )}
              {Boolean(formData.rut) && (
                <div className="text-sm text-zinc-300">
                  <span className="text-zinc-500">RUT:</span>{" "}
                  {formatRut(String(formData.rut))}
                </div>
              )}
              {Boolean(formData.company) && (
                <div className="text-sm text-zinc-300">
                  <span className="text-zinc-500">Empresa:</span>{" "}
                  {String(formData.company)}
                </div>
              )}
              {Boolean(formData.vehicle_plate) && (
                <div className="text-sm text-zinc-300">
                  <span className="text-zinc-500">Patente:</span>{" "}
                  {String(formData.vehicle_plate)}
                </div>
              )}
              {Boolean(formData.contact_person) && (
                <div className="text-sm text-zinc-300">
                  <span className="text-zinc-500">Visita a:</span>{" "}
                  {String(formData.contact_person)}
                </div>
              )}
            </div>

            <Button
              onClick={handleConfirmEntry}
              disabled={submitting}
              className="w-full h-12 bg-status-ok hover:bg-status-ok text-white text-base"
            >
              {submitting ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <Check className="mr-2 h-5 w-5" />
              )}
              Confirmar Entrada
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
