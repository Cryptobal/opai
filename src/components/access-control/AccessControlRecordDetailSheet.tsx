"use client";

import React, { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Loader2, MapPin, Camera, FileImage, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { AccessRecordType, ListMatch, QrSource } from "@/lib/access-control/types";
import { RECORD_TYPE_CONFIG } from "@/lib/access-control/types";
import { formatRut, formatDuration, elapsedMinutes } from "@/lib/access-control/utils";

interface RecordDetail {
  id: string;
  recordType: AccessRecordType;
  rut: string | null;
  fullName: string | null;
  company: string | null;
  documentSerial: string | null;
  entryAt: string;
  exitAt: string | null;
  entryGuardId: string;
  exitGuardId: string | null;
  entryGpsLat: number | null;
  entryGpsLng: number | null;
  exitGpsLat?: number | null;
  exitGpsLng?: number | null;
  vehiclePlate: string | null;
  vehicleType: string | null;
  vehicleBrandModel: string | null;
  vehiclePlatePhotoUrl: string | null;
  visitorPhotoUrl: string | null;
  credentialPhotoUrl: string | null;
  entrySignatureUrl: string | null;
  customFields: Record<string, unknown> | null;
  exitCustomFields: Record<string, unknown> | null;
  qrSource: QrSource | null;
  idValidationStatus: string | null;
  listMatch: ListMatch | null;
  entryObservations: string | null;
  preregistration?: {
    id: string;
    visitorName: string;
    hostName: string | null;
    purpose: string | null;
    expectedDate: string;
    expectedEndDate: string | null;
  } | null;
}

interface Props {
  recordId: string | null;
  onClose: () => void;
}

const QR_SOURCE_LABELS: Record<string, string> = {
  cedula_2024: "Cédula 2024 (QR completo)",
  cedula_2013: "Cédula 2013 (QR + MRZ OCR)",
  manual: "Ingreso manual",
  preregistered: "Pre-registrado",
};

export function AccessControlRecordDetailSheet({ recordId, onClose }: Props) {
  const [data, setData] = useState<RecordDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!recordId) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/access-control/records/item/${recordId}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.success) setData(json.data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [recordId]);

  return (
    <Sheet open={!!recordId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto bg-zinc-900 border-zinc-700">
        <SheetHeader>
          <SheetTitle className="text-zinc-100">Detalle de registro</SheetTitle>
        </SheetHeader>

        {loading || !data ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
          </div>
        ) : (
          <div className="mt-4 space-y-5 text-sm">
            <Header data={data} />

            <Section title="Identificación">
              <Row label="RUT" value={data.rut ? formatRut(data.rut) : "—"} />
              <Row label="Documento" value={data.documentSerial || "—"} />
              <Row
                label="Origen del QR"
                value={data.qrSource ? QR_SOURCE_LABELS[data.qrSource] : "—"}
              />
              <Row
                label="Validación de cédula"
                value={data.idValidationStatus || "—"}
              />
              <Row
                label="Lista"
                value={
                  data.listMatch === "whitelist" ? (
                    <Badge className="bg-status-ok-soft text-status-ok-fg border-status-ok-border text-xs">
                      Lista blanca
                    </Badge>
                  ) : data.listMatch === "blacklist" ? (
                    <Badge className="bg-status-danger-soft text-status-danger-fg border-status-danger-border text-xs">
                      Lista negra
                    </Badge>
                  ) : (
                    <span className="text-zinc-500">Sin lista</span>
                  )
                }
              />
            </Section>

            <Section title="Tiempos">
              <Row
                label="Entrada"
                value={new Date(data.entryAt).toLocaleString("es-CL")}
              />
              <Row
                label="Salida"
                value={
                  data.exitAt
                    ? new Date(data.exitAt).toLocaleString("es-CL")
                    : "En sitio"
                }
              />
              <Row
                label="Duración"
                value={formatDuration(
                  data.exitAt
                    ? elapsedMinutes(data.entryAt, data.exitAt)
                    : elapsedMinutes(data.entryAt)
                )}
              />
            </Section>

            {(data.vehiclePlate || data.vehicleType) && (
              <Section title="Vehículo">
                <Row label="Patente" value={data.vehiclePlate || "—"} />
                <Row label="Tipo" value={data.vehicleType || "—"} />
                <Row label="Marca / Modelo" value={data.vehicleBrandModel || "—"} />
              </Section>
            )}

            {(data.entryGpsLat != null && data.entryGpsLng != null) && (
              <Section title="Ubicación">
                <a
                  href={`https://www.google.com/maps?q=${data.entryGpsLat},${data.entryGpsLng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-status-info-fg hover:underline text-xs"
                >
                  <MapPin className="h-3 w-3" />
                  {data.entryGpsLat.toFixed(5)}, {data.entryGpsLng.toFixed(5)}
                  <ExternalLink className="h-3 w-3 ml-1" />
                </a>
              </Section>
            )}

            {(data.visitorPhotoUrl ||
              data.credentialPhotoUrl ||
              data.vehiclePlatePhotoUrl ||
              data.entrySignatureUrl) && (
              <Section title="Adjuntos">
                <div className="grid grid-cols-2 gap-2">
                  {data.visitorPhotoUrl && (
                    <PhotoLink
                      url={data.visitorPhotoUrl}
                      label="Foto del visitante"
                      icon={<Camera className="h-4 w-4" />}
                    />
                  )}
                  {data.credentialPhotoUrl && (
                    <PhotoLink
                      url={data.credentialPhotoUrl}
                      label="Cédula"
                      icon={<FileImage className="h-4 w-4" />}
                    />
                  )}
                  {data.vehiclePlatePhotoUrl && (
                    <PhotoLink
                      url={data.vehiclePlatePhotoUrl}
                      label="Patente"
                      icon={<FileImage className="h-4 w-4" />}
                    />
                  )}
                  {data.entrySignatureUrl && (
                    <PhotoLink
                      url={data.entrySignatureUrl}
                      label="Firma"
                      icon={<FileImage className="h-4 w-4" />}
                    />
                  )}
                </div>
              </Section>
            )}

            {data.preregistration && (
              <Section title="Pre-registro asociado">
                <Row
                  label="Visitante"
                  value={data.preregistration.visitorName}
                />
                <Row
                  label="Recibe"
                  value={data.preregistration.hostName || "—"}
                />
                <Row
                  label="Motivo"
                  value={data.preregistration.purpose || "—"}
                />
                <Row
                  label="Fecha esperada"
                  value={
                    new Date(data.preregistration.expectedDate).toLocaleDateString("es-CL") +
                    (data.preregistration.expectedEndDate
                      ? ` – ${new Date(data.preregistration.expectedEndDate).toLocaleDateString("es-CL")}`
                      : "")
                  }
                />
              </Section>
            )}

            {data.customFields && Object.keys(data.customFields).length > 0 && (
              <Section title="Capturado a la entrada">
                {Object.entries(data.customFields).map(([k, v]) => (
                  <Row key={k} label={k} value={String(v ?? "—")} />
                ))}
              </Section>
            )}

            {data.exitCustomFields && Object.keys(data.exitCustomFields).length > 0 && (
              <Section title="Capturado a la salida">
                {Object.entries(data.exitCustomFields).map(([k, v]) => (
                  <Row key={k} label={k} value={String(v ?? "—")} />
                ))}
              </Section>
            )}

            {data.entryObservations && (
              <Section title="Observaciones">
                <p className="text-zinc-300 text-xs whitespace-pre-wrap">
                  {data.entryObservations}
                </p>
              </Section>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Header({ data }: { data: RecordDetail }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-zinc-700 bg-zinc-800/50 p-3">
      <div className="h-12 w-12 rounded-full bg-zinc-700 flex items-center justify-center text-sm font-medium text-zinc-200">
        {(data.fullName || data.vehiclePlate || "?")
          .split(" ")
          .map((s) => s[0])
          .filter(Boolean)
          .slice(0, 2)
          .join("")
          .toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-zinc-100 truncate">
            {data.fullName || data.vehiclePlate || "—"}
          </p>
          <Badge variant="outline" className="text-xs border-zinc-600">
            {RECORD_TYPE_CONFIG[data.recordType]?.label || data.recordType}
          </Badge>
        </div>
        {data.company && (
          <p className="text-xs text-zinc-500 truncate">{data.company}</p>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs uppercase tracking-wider text-zinc-500 mb-2">
        {title}
      </h4>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2 text-xs">
      <span className="text-zinc-500">{label}</span>
      <span className="text-zinc-200 text-right">{value}</span>
    </div>
  );
}

function PhotoLink({
  url,
  label,
  icon,
}: {
  url: string;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-zinc-300 hover:border-status-info-border hover:bg-zinc-800/80"
    >
      {icon}
      <span className="flex-1 truncate">{label}</span>
      <ExternalLink className="h-3 w-3 text-zinc-500" />
    </a>
  );
}
