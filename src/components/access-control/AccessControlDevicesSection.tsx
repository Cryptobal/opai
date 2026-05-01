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
  Clock,
  CheckCircle2,
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

interface Device {
  id: string;
  deviceName: string | null;
  deviceFingerprint: string;
  isActive: boolean;
  pairedAt: string;
  lastActivityAt: string;
  lastIp: string | null;
  currentGuardId: string | null;
  userAgent: string | null;
  screenResolution: string | null;
}

interface PairingCode {
  code: string;
  expiresAt: string;
}

interface Props {
  installationId: string;
}

export function AccessControlDevicesSection({ installationId }: Props) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [pairingCode, setPairingCode] = useState<PairingCode | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);
  const [confirmUnlink, setConfirmUnlink] = useState<Device | null>(null);

  const fetchDevices = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/access-control/devices/${installationId}`
      );
      const json = await res.json();
      if (json.success) {
        setDevices(json.data ?? []);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [installationId]);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  const generateCode = async () => {
    setGeneratingCode(true);
    try {
      const res = await fetch(
        `/api/access-control/pairing-codes/${installationId}/generate`,
        { method: "POST" }
      );
      const json = await res.json();
      if (json.success) {
        setPairingCode(json.data);
        toast.success("Código generado");
      } else {
        toast.error(json.error || "Error al generar código");
      }
    } catch {
      toast.error("Error al generar código");
    } finally {
      setGeneratingCode(false);
    }
  };

  const copyCode = () => {
    if (pairingCode?.code) {
      navigator.clipboard.writeText(pairingCode.code);
      toast.success("Código copiado al portapapeles");
    }
  };

  const unlinkDevice = async (deviceId: string) => {
    setUnlinkingId(deviceId);
    try {
      const res = await fetch(
        `/api/access-control/devices/${installationId}/${deviceId}`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (json.success) {
        toast.success("Dispositivo desvinculado");
        setDevices((prev) =>
          prev.map((d) =>
            d.id === deviceId ? { ...d, isActive: false } : d
          )
        );
      } else {
        toast.error(json.error || "Error al desvincular");
      }
    } catch {
      toast.error("Error al desvincular dispositivo");
    } finally {
      setUnlinkingId(null);
      setConfirmUnlink(null);
    }
  };

  function getActivityStatus(lastActivityAt: string): {
    label: string;
    color: string;
  } {
    const diff = Date.now() - new Date(lastActivityAt).getTime();
    const hours = diff / (1000 * 60 * 60);
    if (hours < 1) return { label: "Activo ahora", color: "text-status-ok-fg" };
    if (hours < 24) return { label: "Hoy", color: "text-status-ok-fg" };
    if (hours < 48) return { label: "Ayer", color: "text-status-warn-fg" };
    return {
      label: `Hace ${Math.floor(hours / 24)} días`,
      color: "text-zinc-500",
    };
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString("es-CL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  function parseDeviceName(device: Device): string {
    if (device.deviceName) return device.deviceName;
    if (!device.userAgent) return "Dispositivo desconocido";
    // Simple UA parsing
    const ua = device.userAgent;
    if (ua.includes("Samsung")) return "Samsung Galaxy";
    if (ua.includes("iPhone")) return "iPhone";
    if (ua.includes("iPad")) return "iPad";
    if (ua.includes("Pixel")) return "Google Pixel";
    if (ua.includes("Huawei")) return "Huawei";
    if (ua.includes("Xiaomi") || ua.includes("Redmi")) return "Xiaomi";
    if (ua.includes("Android")) return "Dispositivo Android";
    if (ua.includes("Chrome")) return "Navegador Chrome";
    return "Dispositivo";
  }

  const activeDevices = devices.filter((d) => d.isActive);
  const inactiveDevices = devices.filter((d) => !d.isActive);

  const codeExpiresIn = pairingCode
    ? Math.max(
        0,
        Math.floor(
          (new Date(pairingCode.expiresAt).getTime() - Date.now()) /
            (1000 * 60 * 60)
        )
      )
    : 0;

  return (
    <div className="space-y-4">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Smartphone className="h-5 w-5 text-zinc-400" />
          <h4 className="text-sm font-medium text-zinc-300">
            Dispositivos Vinculados
          </h4>
          <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
            {activeDevices.length}
          </span>
        </div>
        <Button
          onClick={fetchDevices}
          variant="ghost"
          size="sm"
          className="text-zinc-400"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Active Devices */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
        </div>
      ) : activeDevices.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-900/50 p-6 text-center">
          <Smartphone className="mx-auto h-8 w-8 text-zinc-600" />
          <p className="mt-2 text-sm text-zinc-500">
            No hay dispositivos vinculados
          </p>
          <p className="mt-1 text-xs text-zinc-600">
            Genera un código de emparejamiento para vincular un dispositivo.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {activeDevices.map((device) => {
            const activity = getActivityStatus(device.lastActivityAt);
            return (
              <div
                key={device.id}
                className="flex items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-900 p-3"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-800">
                  <Smartphone className="h-5 w-5 text-zinc-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-200">
                    {parseDeviceName(device)}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <span>Vinculado: {formatDate(device.pairedAt)}</span>
                    <span>·</span>
                    <span className={activity.color}>
                      {activity.label}
                    </span>
                  </div>
                  {device.screenResolution && (
                    <p className="text-[11px] text-zinc-600">
                      {device.screenResolution}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <span className="relative flex h-2 w-2">
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-status-ok" />
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-zinc-500 hover:text-status-danger-fg"
                  onClick={() => setConfirmUnlink(device)}
                  disabled={unlinkingId === device.id}
                >
                  {unlinkingId === device.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Inactive Devices */}
      {inactiveDevices.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-xs text-zinc-600 hover:text-zinc-400">
            {inactiveDevices.length} dispositivo(s) desvinculado(s)
          </summary>
          <div className="mt-2 space-y-1">
            {inactiveDevices.map((device) => (
              <div
                key={device.id}
                className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/30 p-2.5 opacity-60"
              >
                <Smartphone className="h-4 w-4 text-zinc-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-zinc-500">
                    {parseDeviceName(device)}
                  </p>
                  <p className="text-[11px] text-zinc-600">
                    Desvinculado
                  </p>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Generate Pairing Code */}
      <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-900/50 p-4">
        <div className="flex items-center gap-2 text-sm text-zinc-300">
          <LinkIcon className="h-4 w-4" />
          Vincular Nuevo Dispositivo
        </div>

        {pairingCode && codeExpiresIn > 0 ? (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-3">
              <div className="rounded-lg border border-zinc-600 bg-zinc-800 px-4 py-2.5">
                <span className="font-mono text-xl font-bold tracking-widest text-zinc-100">
                  {pairingCode.code}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={copyCode}
                  className="text-zinc-400 hover:text-zinc-200"
                >
                  <Copy className="mr-1 h-3.5 w-3.5" />
                  Copiar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={generateCode}
                  disabled={generatingCode}
                  className="text-zinc-500 hover:text-zinc-300"
                >
                  <RefreshCw className="mr-1 h-3.5 w-3.5" />
                  Regenerar
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-1 text-xs text-zinc-500">
              <Clock className="h-3 w-3" />
              Expira en {codeExpiresIn}h
            </div>
          </div>
        ) : (
          <Button
            onClick={generateCode}
            disabled={generatingCode}
            variant="outline"
            size="sm"
            className="mt-3 border-zinc-600"
          >
            {generatingCode ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <LinkIcon className="mr-2 h-3.5 w-3.5" />
            )}
            Generar Código de Emparejamiento
          </Button>
        )}
      </div>

      {/* Confirm Unlink Dialog */}
      <Dialog
        open={!!confirmUnlink}
        onOpenChange={(open) => !open && setConfirmUnlink(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Desvincular dispositivo</DialogTitle>
            <DialogDescription>
              ¿Desvincular{" "}
              <strong>
                {confirmUnlink ? parseDeviceName(confirmUnlink) : ""}
              </strong>
              ? Deberá vincularse nuevamente con un nuevo código.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmUnlink(null)}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmUnlink && unlinkDevice(confirmUnlink.id)}
              disabled={!!unlinkingId}
            >
              {unlinkingId ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Desvincular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
