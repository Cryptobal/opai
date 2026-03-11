"use client";

import React, { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Smartphone,
  Loader2,
  RefreshCw,
  Copy,
  Trash2,
  LinkIcon,
  CheckCircle2,
  Wifi,
  Battery,
  Signal,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface DevicePairingRecord {
  id: string;
  tenantId: string;
  installationId: string;
  deviceToken: string | null;
  pairingCode: string | null;
  pairingCodeExpiresAt: string | null;
  name: string | null;
  status: string;
  portalRondasEnabled: boolean;
  portalAccesoEnabled: boolean;
  deviceModel: string | null;
  androidVersion: string | null;
  browserVersion: string | null;
  screenResolution: string | null;
  cpuCores: number | null;
  ramGB: number | null;
  deviceFingerprint: string | null;
  userAgent: string | null;
  lastSeenAt: string | null;
  lastBatteryLevel: number | null;
  lastConnectionType: string | null;
  lastIpAddress: string | null;
  currentGuardId: string | null;
  linkedAt: string | null;
  createdAt: string;
  updatedAt: string;
  currentGuard: {
    persona: { firstName: string | null; lastName: string | null };
  } | null;
}

interface Props {
  installationId: string;
  pairingCode: string | null;
}

function getRelativeTime(dateStr: string | null): { label: string; color: string } {
  if (!dateStr) return { label: "Sin actividad", color: "text-zinc-600" };
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = diff / (1000 * 60 * 60);
  if (hours < 1) return { label: "Activo ahora", color: "text-green-400" };
  if (hours < 24) return { label: "Hoy", color: "text-green-400" };
  if (hours < 48) return { label: "Ayer", color: "text-yellow-400" };
  return { label: `Hace ${Math.floor(hours / 24)} días`, color: "text-zinc-500" };
}

function parseDeviceDisplayName(device: DevicePairingRecord): string {
  if (device.name) return device.name;
  if (device.deviceModel) return device.deviceModel;
  if (!device.userAgent) return "Dispositivo desconocido";
  const ua = device.userAgent;
  if (ua.includes("Samsung")) return "Samsung Galaxy";
  if (ua.includes("Pixel")) return "Google Pixel";
  if (ua.includes("Huawei")) return "Huawei";
  if (ua.includes("Xiaomi") || ua.includes("Redmi")) return "Xiaomi";
  if (ua.includes("Android")) return "Dispositivo Android";
  return "Dispositivo";
}

function connectionIcon(type: string | null) {
  if (!type) return null;
  const lower = type.toLowerCase();
  if (lower.includes("wifi")) return <Wifi className="h-3 w-3" />;
  return <Signal className="h-3 w-3" />;
}

export function UnifiedDevicesSection({ installationId, pairingCode: initialPairingCode }: Props) {
  const [devices, setDevices] = useState<DevicePairingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentCode, setCurrentCode] = useState<string | null>(initialPairingCode);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<DevicePairingRecord | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [devicesSectionOpen, setDevicesSectionOpen] = useState(false);

  const fetchDevices = useCallback(async () => {
    try {
      const res = await fetch(`/api/devices/admin/${installationId}`);
      const json = await res.json();
      if (json.success) setDevices(json.data ?? []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [installationId]);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  const regenerateCode = async () => {
    setGeneratingCode(true);
    try {
      const res = await fetch(`/api/devices/generate-code/${installationId}`, {
        method: "POST",
      });
      const json = await res.json();
      if (json.success) {
        setCurrentCode(json.data.code);
        toast.success("Código regenerado");
      } else {
        toast.error(json.error || "Error al regenerar código");
      }
    } catch {
      toast.error("Error al regenerar código");
    } finally {
      setGeneratingCode(false);
    }
  };

  const copyCode = () => {
    if (currentCode) {
      navigator.clipboard.writeText(currentCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Código copiado");
    }
  };

  const revokeDevice = async (deviceId: string) => {
    setRevokingId(deviceId);
    try {
      const res = await fetch(`/api/devices/admin/${installationId}/${deviceId}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Dispositivo revocado");
        setDevices((prev) =>
          prev.map((d) => (d.id === deviceId ? { ...d, status: "REVOKED" } : d))
        );
      } else {
        toast.error(json.error || "Error al revocar");
      }
    } catch {
      toast.error("Error al revocar dispositivo");
    } finally {
      setRevokingId(null);
      setConfirmRevoke(null);
    }
  };

  const togglePortal = async (
    device: DevicePairingRecord,
    field: "portalRondasEnabled" | "portalAccesoEnabled"
  ) => {
    const key = `${device.id}-${field}`;
    setTogglingId(key);
    try {
      const res = await fetch(`/api/devices/admin/${installationId}/${device.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: !device[field] }),
      });
      const json = await res.json();
      if (json.success) {
        setDevices((prev) =>
          prev.map((d) => (d.id === device.id ? { ...d, [field]: !d[field] } : d))
        );
      } else {
        toast.error(json.error || "Error al actualizar");
      }
    } catch {
      toast.error("Error al actualizar permisos");
    } finally {
      setTogglingId(null);
    }
  };

  const activeDevices = devices.filter(
    (d) => d.status === "ACTIVE" && d.deviceToken
  );
  const inactiveDevices = devices.filter(
    (d) => d.status === "REVOKED" || d.status === "DISABLED"
  );

  return (
    <div className="space-y-4">
      {/* 1. Vincular Nuevo Dispositivo — arriba */}
      <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-900/50 p-4">
        <div className="flex items-center gap-2 text-sm text-zinc-300">
          <LinkIcon className="h-4 w-4" />
          Vincular Nuevo Dispositivo
        </div>

        {currentCode ? (
          <div className="mt-3 space-y-3">
            <div className="flex items-center gap-3">
              <div className="rounded-lg border border-zinc-600 bg-zinc-800 px-5 py-3">
                <span className="font-mono text-2xl font-bold tracking-[0.25em] text-zinc-100">
                  {currentCode}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={copyCode}
                  className="text-zinc-400 hover:text-zinc-200"
                >
                  {copied ? (
                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5 text-green-400" />
                  ) : (
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {copied ? "Copiado" : "Copiar"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={regenerateCode}
                  disabled={generatingCode}
                  className="text-zinc-500 hover:text-zinc-300"
                >
                  {generatingCode ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Regenerar
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3 w-3 text-green-500" />
              <span className="text-xs text-zinc-500">
                Código permanente · Rondas y Acceso
              </span>
            </div>
          </div>
        ) : (
          <div className="mt-3">
            <Button
              onClick={regenerateCode}
              disabled={generatingCode}
              variant="outline"
              size="sm"
              className="border-zinc-600"
            >
              {generatingCode ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <LinkIcon className="mr-2 h-3.5 w-3.5" />
              )}
              Generar Código de Emparejamiento
            </Button>
          </div>
        )}
      </div>

      {/* 2. Dispositivos Vinculados — sección contraíble con lista en scroll */}
      <div className="rounded-lg border border-zinc-700 bg-zinc-900/30 overflow-hidden">
        <button
          type="button"
          onClick={() => setDevicesSectionOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-zinc-800/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            {devicesSectionOpen ? (
              <ChevronDown className="h-4 w-4 text-zinc-400 shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 text-zinc-400 shrink-0" />
            )}
            <Smartphone className="h-5 w-5 text-zinc-400" />
            <h4 className="text-sm font-medium text-zinc-300">
              Dispositivos Vinculados
            </h4>
            <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
              {activeDevices.length}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-zinc-400 shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              setLoading(true);
              fetchDevices();
            }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </button>

        {devicesSectionOpen && (
          <>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
              </div>
            ) : activeDevices.length === 0 ? (
              <div className="rounded-lg border-t border-zinc-700/80 bg-zinc-900/50 p-6 text-center mx-3 mb-3">
                <Smartphone className="mx-auto h-8 w-8 text-zinc-600" />
                <p className="mt-2 text-sm text-zinc-500">No hay dispositivos vinculados</p>
                <p className="mt-1 text-xs text-zinc-600">
                  Genera un código de emparejamiento para vincular un dispositivo.
                </p>
              </div>
            ) : (
              <div className="max-h-[min(18rem,50vh)] overflow-y-auto overscroll-contain border-t border-zinc-700/80 px-3 py-2 space-y-2">
                {activeDevices.map((device) => {
                  const activity = getRelativeTime(device.lastSeenAt);
                  return (
                    <div
                      key={device.id}
                      className="rounded-lg border border-zinc-700 bg-zinc-900 p-3"
                    >
                      {/* Line 1 */}
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-800">
                          <Smartphone className="h-5 w-5 text-zinc-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-zinc-200">
                            {parseDeviceDisplayName(device)}
                          </p>
                        </div>
                        <span className={`text-xs ${activity.color}`}>{activity.label}</span>
                        <span className="relative flex h-2.5 w-2.5">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
                        </span>

                        {/* Portal toggles */}
                        <label className="flex items-center gap-1 text-xs text-zinc-400 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={device.portalRondasEnabled}
                            onChange={() => togglePortal(device, "portalRondasEnabled")}
                            disabled={togglingId === `${device.id}-portalRondasEnabled`}
                            className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-800 accent-blue-500"
                          />
                          Rondas
                        </label>
                        <label className="flex items-center gap-1 text-xs text-zinc-400 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={device.portalAccesoEnabled}
                            onChange={() => togglePortal(device, "portalAccesoEnabled")}
                            disabled={togglingId === `${device.id}-portalAccesoEnabled`}
                            className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-800 accent-blue-500"
                          />
                          Acceso
                        </label>

                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-zinc-500 hover:text-red-400"
                          onClick={() => setConfirmRevoke(device)}
                          disabled={revokingId === device.id}
                        >
                          {revokingId === device.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>

                      {/* Line 2 - device details */}
                      <div className="mt-1.5 ml-[52px] flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-zinc-500">
                        {device.androidVersion && <span>{device.androidVersion}</span>}
                        {device.browserVersion && (
                          <>
                            <span>·</span>
                            <span>{device.browserVersion}</span>
                          </>
                        )}
                        {device.lastConnectionType && (
                          <>
                            <span>·</span>
                            <span className="flex items-center gap-0.5">
                              {connectionIcon(device.lastConnectionType)}
                              {device.lastConnectionType}
                            </span>
                          </>
                        )}
                        {device.lastBatteryLevel != null && (
                          <>
                            <span>·</span>
                            <span className="flex items-center gap-0.5">
                              <Battery className="h-3 w-3" />
                              {Math.round(device.lastBatteryLevel)}%
                            </span>
                          </>
                        )}
                        {device.currentGuard?.persona && (
                          <>
                            <span>·</span>
                            <span className="text-blue-400">
                              Guardia: {device.currentGuard.persona.firstName}{" "}
                              {device.currentGuard.persona.lastName}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {/* Inactive / Revoked Devices — dentro de la sección contraíble */}
            {inactiveDevices.length > 0 && (
              <details className="group px-3 pb-2">
                <summary className="cursor-pointer text-xs text-zinc-600 hover:text-zinc-400">
                  ▸ {inactiveDevices.length} dispositivo(s) desvinculado(s)
                </summary>
                <div className="mt-2 space-y-1">
                  {inactiveDevices.map((device) => (
                    <div
                      key={device.id}
                      className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/30 p-2.5 opacity-60"
                    >
                      <Smartphone className="h-4 w-4 text-zinc-600" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-zinc-500">{parseDeviceDisplayName(device)}</p>
                        <p className="text-[11px] text-zinc-600">
                          {device.status === "REVOKED" ? "Revocado" : "Deshabilitado"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </>
        )}
      </div>

      {/* Confirm Revoke Dialog */}
      <Dialog
        open={!!confirmRevoke}
        onOpenChange={(open) => !open && setConfirmRevoke(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revocar dispositivo</DialogTitle>
            <DialogDescription>
              ¿Revocar{" "}
              <strong>
                {confirmRevoke ? parseDeviceDisplayName(confirmRevoke) : ""}
              </strong>
              ? El dispositivo perderá acceso y deberá vincularse nuevamente con un
              nuevo código.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRevoke(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmRevoke && revokeDevice(confirmRevoke.id)}
              disabled={!!revokingId}
            >
              {revokingId ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Revocar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
