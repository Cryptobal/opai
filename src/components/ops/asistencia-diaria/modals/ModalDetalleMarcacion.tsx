"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MapPin, Smartphone, Shield, Camera, X } from "lucide-react";
import type { MarcacionItem } from "@/types/ops-asistencia";

interface ModalDetalleMarcacionProps {
  marcaciones: MarcacionItem[] | null;
  onClose: () => void;
}

function MetodoBadge({ metodoId }: { metodoId?: string | null }) {
  if (!metodoId) return null;
  const map: Record<string, { label: string; color: string }> = {
    face_id: { label: "Face ID", color: "bg-purple-500/20 text-purple-300" },
    foto: { label: "Foto", color: "bg-blue-500/20 text-blue-300" },
    pin_fallback: { label: "PIN", color: "bg-amber-500/20 text-amber-300" },
    rut_pin: { label: "RUT+PIN", color: "bg-amber-500/20 text-amber-300" },
    manual: { label: "Manual", color: "bg-slate-500/20 text-slate-300" },
  };
  const m = map[metodoId] ?? { label: metodoId, color: "bg-slate-500/20 text-slate-300" };
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${m.color}`}>
      <Shield className="h-2.5 w-2.5" />
      {m.label}
    </span>
  );
}

function PhotoViewer({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 right-4 text-white/80 hover:text-white">
        <X className="h-6 w-6" />
      </button>
      <img src={url} alt="Foto de evidencia" className="max-h-[80vh] max-w-[90vw] rounded-lg object-contain" />
    </div>
  );
}

export function ModalDetalleMarcacion({
  marcaciones,
  onClose,
}: ModalDetalleMarcacionProps) {
  const [expandedPhoto, setExpandedPhoto] = useState<string | null>(null);

  return (
    <>
      {expandedPhoto && (
        <PhotoViewer url={expandedPhoto} onClose={() => setExpandedPhoto(null)} />
      )}
      <Dialog open={!!marcaciones} onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalle de marcación digital</DialogTitle>
          </DialogHeader>
          {marcaciones && marcaciones.length > 0 && (
            <div className="space-y-3 max-h-[70vh] overflow-y-auto">
              {marcaciones.map((m) => {
                const isEntrada = m.tipo === "entrada";
                return (
                  <div
                    key={m.id}
                    className={`rounded-lg border p-3 text-sm space-y-2.5 ${
                      isEntrada
                        ? "border-emerald-500/30 bg-emerald-500/5"
                        : "border-red-500/30 bg-red-500/5"
                    }`}
                  >
                    {/* Header: tipo + timestamp + method */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                            isEntrada
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-red-500/20 text-red-400"
                          }`}
                        >
                          {isEntrada ? "Entrada" : "Salida"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(m.timestamp).toLocaleString("es-CL")}
                        </span>
                      </div>
                      <MetodoBadge metodoId={m.metodoId} />
                    </div>

                    {/* Photo */}
                    {m.fotoEvidenciaUrl && (
                      <div className="flex items-start gap-2">
                        <Camera className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                        <button
                          onClick={() => setExpandedPhoto(m.fotoEvidenciaUrl!)}
                          className="group relative rounded-lg overflow-hidden border border-border/40 hover:border-border"
                        >
                          <img
                            src={m.fotoEvidenciaUrl}
                            alt="Evidencia"
                            className="h-20 w-20 object-cover rounded-lg group-hover:opacity-90 transition-opacity"
                          />
                          <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 text-white text-[10px] font-medium">
                            Ver foto
                          </span>
                        </button>
                      </div>
                    )}

                    {/* Details */}
                    <div className="text-xs text-muted-foreground space-y-1">
                      {/* GPS */}
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {m.gpsStatus === "dentro_rango" ? (
                          <span className="text-emerald-400">
                            GPS OK ({m.geoDistanciaM}m)
                          </span>
                        ) : m.gpsStatus === "fuera_rango" ? (
                          <span className="text-amber-400">
                            Fuera de rango ({m.geoDistanciaM}m)
                          </span>
                        ) : (
                          <span className="text-slate-500">Sin GPS</span>
                        )}
                        {m.lat != null && m.lng != null && (
                          <a
                            href={`https://www.google.com/maps?q=${m.lat},${m.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:underline ml-1"
                          >
                            Ver mapa
                          </a>
                        )}
                      </div>

                      {/* Device */}
                      {(m.deviceDisplay ?? m.userAgent) && (
                        <div className="flex items-center gap-1.5">
                          <Smartphone className="h-3 w-3 shrink-0" />
                          <span className="truncate">
                            {m.deviceDisplay ?? m.userAgent!.slice(0, 60)}
                          </span>
                        </div>
                      )}

                      {/* Hash */}
                      <p className="text-[10px] text-muted-foreground/50 break-all">
                        Hash: {m.hashIntegridad}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
