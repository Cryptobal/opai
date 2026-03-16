"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { MarcacionItem } from "@/types/ops-asistencia";

interface ModalDetalleMarcacionProps {
  marcaciones: MarcacionItem[] | null;
  onClose: () => void;
}

export function ModalDetalleMarcacion({
  marcaciones,
  onClose,
}: ModalDetalleMarcacionProps) {
  return (
    <Dialog open={!!marcaciones} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Detalle de marcación digital</DialogTitle>
        </DialogHeader>
        {marcaciones && marcaciones.length > 0 && (
          <div className="space-y-4">
            {marcaciones.map((m) => (
              <div key={m.id} className="rounded border border-border/60 p-3 text-sm space-y-2">
                <div className="font-medium">
                  {m.tipo === "entrada" ? "Entrada" : "Salida"}:{" "}
                  {new Date(m.timestamp).toLocaleString("es-CL")}
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>
                    <span className="font-medium">Hash:</span>{" "}
                    <code className="text-[10px] break-all">{m.hashIntegridad}</code>
                  </p>
                  <p>
                    <span className="font-medium">Geo:</span>{" "}
                    {m.gpsStatus === "dentro_rango"
                      ? `Dentro de rango (${m.geoDistanciaM}m)`
                      : m.gpsStatus === "fuera_rango"
                        ? (
                            <span className="text-yellow-400">
                              Fuera de rango ({m.geoDistanciaM}m)
                            </span>
                          )
                        : "Sin GPS"}
                  </p>
                  {m.lat != null && m.lng != null && (
                    <p>
                      <span className="font-medium">Coordenadas:</span> {m.lat}, {m.lng}
                    </p>
                  )}
                  {m.ipAddress && (
                    <p>
                      <span className="font-medium">IP:</span> {m.ipAddress}
                    </p>
                  )}
                  {m.userAgent && (
                    <p>
                      <span className="font-medium">Dispositivo:</span>{" "}
                      <span className="break-all">{m.userAgent.slice(0, 80)}…</span>
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
