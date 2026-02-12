/* eslint-disable @typescript-eslint/no-misused-promises */
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, ExternalLink, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/opai/EmptyState";
import { CrmDetailLayout, type DetailSection } from "./CrmDetailLayout";
import { DetailField, DetailFieldGrid } from "./DetailField";
import { CrmRelatedRecordCard } from "./CrmRelatedRecordCard";
import { CRM_MODULES } from "./CrmModuleIcons";
import { NotesSection } from "./NotesSection";
import { toast } from "sonner";

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

export type InstallationDetail = {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  commune?: string | null;
  lat?: number | null;
  lng?: number | null;
  isActive?: boolean;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
  puestosActivos?: Array<{
    id: string;
    name: string;
    shiftStart: string;
    shiftEnd: string;
    weekdays: string[];
    requiredGuards: number;
    teMontoClp?: number | string | null;
  }>;
  quotesInstalacion?: Array<{
    id: string;
    code: string;
    status: string;
    totalPositions: number;
    totalGuards: number;
    updatedAt: string;
  }>;
  account?: { id: string; name: string; type?: "prospect" | "client"; status?: string; isActive?: boolean } | null;
};

export function CrmInstallationDetailClient({
  installation,
}: {
  installation: InstallationDetail;
}) {
  const router = useRouter();
  const hasCoords = installation.lat != null && installation.lng != null;
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [statusConfirmOpen, setStatusConfirmOpen] = useState(false);
  const [statusNextValue, setStatusNextValue] = useState(false);
  const [statusActivateAccount, setStatusActivateAccount] = useState(false);
  const isActive = useMemo(() => installation.isActive === true, [installation.isActive]);

  const dotacionDesdeCotizacion = (
    installation.metadata &&
    typeof installation.metadata === "object" &&
    "dotacionActiva" in installation.metadata &&
    (installation.metadata.dotacionActiva as Record<string, unknown>) &&
    typeof installation.metadata.dotacionActiva === "object"
      ? (installation.metadata.dotacionActiva as Record<string, unknown>)
      : null
  );

  const dotacionItems = Array.isArray(dotacionDesdeCotizacion?.items)
    ? (dotacionDesdeCotizacion?.items as Array<Record<string, unknown>>)
    : [];

  const sourceQuoteId =
    typeof dotacionDesdeCotizacion?.sourceQuoteId === "string"
      ? dotacionDesdeCotizacion.sourceQuoteId
      : null;
  const sourceQuoteCode =
    typeof dotacionDesdeCotizacion?.sourceQuoteCode === "string"
      ? dotacionDesdeCotizacion.sourceQuoteCode
      : null;
  const sourceUpdatedAt =
    typeof dotacionDesdeCotizacion?.updatedAt === "string"
      ? dotacionDesdeCotizacion.updatedAt
      : null;

  const deleteInstallation = async () => {
    try {
      const res = await fetch(`/api/crm/installations/${installation.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Instalación eliminada");
      router.push("/crm/installations");
    } catch {
      toast.error("No se pudo eliminar");
    }
  };

  const openToggleInstallationStatus = () => {
    const next = !isActive;
    setStatusNextValue(next);
    setStatusActivateAccount(next && installation.account?.isActive === false);
    setStatusConfirmOpen(true);
  };

  const toggleInstallationStatus = async () => {
    setStatusUpdating(true);
    try {
      const res = await fetch(`/api/crm/installations/${installation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isActive: statusNextValue,
          activateAccount: Boolean(statusActivateAccount),
        }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error(payload.error || "No se pudo actualizar estado");

      setStatusConfirmOpen(false);
      toast.success(statusNextValue ? "Instalación activada" : "Instalación desactivada");
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error("No se pudo cambiar el estado de la instalación");
    } finally {
      setStatusUpdating(false);
    }
  };

  // ── Helpers ──
  const AccountIcon = CRM_MODULES.accounts.icon;
  const StaffingIcon = CRM_MODULES.installations.icon;

  const subtitle = [
    installation.account?.name,
    [installation.commune, installation.city].filter(Boolean).join(", "),
  ].filter(Boolean).join(" · ") || "Sin ubicación";

  // ── Sections ──
  const sections: DetailSection[] = [
    {
      key: "general",
      children: (
        <div className="flex flex-col lg:flex-row lg:gap-6">
          <DetailFieldGrid className="flex-1">
            <DetailField
              label="Dirección"
              value={installation.address}
              icon={installation.address ? <MapPin className="h-3 w-3" /> : undefined}
            />
            <DetailField
              label="Comuna / Ciudad"
              value={
                (installation.commune || installation.city)
                  ? [installation.commune, installation.city].filter(Boolean).join(", ")
                  : undefined
              }
            />
            {installation.notes && (
              <DetailField
                label="Notas"
                value={installation.notes}
                fullWidth
              />
            )}
          </DetailFieldGrid>

          {/* Mapa */}
          {hasCoords && MAPS_KEY ? (
            <a
              href={`https://www.google.com/maps/@${installation.lat},${installation.lng},17z`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 lg:mt-0 shrink-0 block rounded-lg overflow-hidden border border-border hover:opacity-95 transition-opacity lg:w-[220px] lg:h-[160px]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://maps.googleapis.com/maps/api/staticmap?center=${installation.lat},${installation.lng}&zoom=16&size=440x320&scale=2&markers=color:red%7C${installation.lat},${installation.lng}&key=${MAPS_KEY}`}
                alt={`Mapa de ${installation.name}`}
                className="w-full h-[140px] lg:h-[130px] object-cover"
              />
              <div className="flex items-center justify-center gap-1 py-1.5 text-xs text-muted-foreground hover:text-foreground">
                <ExternalLink className="h-3 w-3" />
                Google Maps
              </div>
            </a>
          ) : (
            <div className="mt-4 lg:mt-0 shrink-0 lg:w-[220px] flex items-center justify-center rounded-lg border border-dashed border-border p-4">
              <p className="text-xs text-muted-foreground text-center">
                {hasCoords && !MAPS_KEY ? "Configura GOOGLE_MAPS_API_KEY" : "Sin ubicación"}
              </p>
            </div>
          )}
        </div>
      ),
    },
    {
      key: "account",
      children: installation.account ? (
        <CrmRelatedRecordCard
          module="accounts"
          title={installation.account.name}
          badge={
            installation.account.type === "client"
              ? { label: "Cliente", variant: "success" }
              : { label: "Prospecto", variant: "warning" }
          }
          href={`/crm/accounts/${installation.account.id}`}
        />
      ) : (
        <EmptyState icon={<AccountIcon className="h-8 w-8" />} title="Sin cuenta" description="Esta instalación no está vinculada a una cuenta." compact />
      ),
    },
    {
      key: "staffing",
      label: "Dotación activa",
      children: (
        <div className="space-y-3">
          {sourceQuoteId && sourceQuoteCode ? (
            <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3 text-xs text-emerald-200">
              Dotación sincronizada desde cotización{" "}
              <Link href={`/cpq/${sourceQuoteId}`} className="underline underline-offset-2 hover:text-emerald-100">
                {sourceQuoteCode}
              </Link>
              {sourceUpdatedAt ? (
                <span className="text-emerald-300/80"> · {new Date(sourceUpdatedAt).toLocaleString("es-CL")}</span>
              ) : null}
            </div>
          ) : null}

          {dotacionItems.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="min-w-full text-xs sm:text-sm">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Puesto</th>
                    <th className="px-3 py-2 text-left font-medium">Cargo / Rol</th>
                    <th className="px-3 py-2 text-left font-medium">Horario</th>
                    <th className="px-3 py-2 text-left font-medium">Días</th>
                    <th className="px-3 py-2 text-right font-medium">Dotación</th>
                    <th className="px-3 py-2 text-right font-medium">Sueldo base</th>
                  </tr>
                </thead>
                <tbody>
                  {dotacionItems.map((item, idx) => {
                    const puesto = (typeof item.customName === "string" && item.customName) || (item.puestoTrabajoName as string) || "Puesto";
                    const cargo = (item.cargoName as string) || "—";
                    const rol = (item.rolName as string) || "—";
                    const shiftStart = (item.shiftStart as string) || "--:--";
                    const shiftEnd = (item.shiftEnd as string) || "--:--";
                    const weekdays = Array.isArray(item.weekdays) ? item.weekdays.join(", ") : "—";
                    const requiredGuards = Number(item.requiredGuards ?? 0);
                    const baseSalary = Number(item.baseSalary ?? 0);

                    return (
                      <tr key={`${String(item.positionId ?? idx)}-${idx}`} className="border-t border-border/60">
                        <td className="px-3 py-2">{puesto}</td>
                        <td className="px-3 py-2 text-muted-foreground">{cargo} / {rol}</td>
                        <td className="px-3 py-2">{shiftStart} - {shiftEnd}</td>
                        <td className="px-3 py-2 text-muted-foreground">{weekdays}</td>
                        <td className="px-3 py-2 text-right">{requiredGuards}</td>
                        <td className="px-3 py-2 text-right">${baseSalary.toLocaleString("es-CL")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : installation.puestosActivos && installation.puestosActivos.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="min-w-full text-xs sm:text-sm">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Puesto</th>
                    <th className="px-3 py-2 text-left font-medium">Horario</th>
                    <th className="px-3 py-2 text-left font-medium">Días</th>
                    <th className="px-3 py-2 text-right font-medium">Dotación</th>
                  </tr>
                </thead>
                <tbody>
                  {installation.puestosActivos.map((item) => (
                    <tr key={item.id} className="border-t border-border/60">
                      <td className="px-3 py-2">{item.name}</td>
                      <td className="px-3 py-2">{item.shiftStart} - {item.shiftEnd}</td>
                      <td className="px-3 py-2 text-muted-foreground">{item.weekdays.join(", ")}</td>
                      <td className="px-3 py-2 text-right">{item.requiredGuards}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={<StaffingIcon className="h-8 w-8" />}
              title="Sin dotación activa"
              description="Aún no hay estructura activa para esta instalación."
              compact
            />
          )}

          {installation.quotesInstalacion && installation.quotesInstalacion.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Cotizaciones asociadas</p>
              <div className="space-y-2">
                {installation.quotesInstalacion.map((quote) => (
                  <CrmRelatedRecordCard
                    key={quote.id}
                    module="quotes"
                    title={quote.code}
                    subtitle={`${quote.totalPositions} puestos · ${quote.totalGuards} guardias`}
                    badge={{ label: quote.status, variant: "secondary" }}
                    meta={new Date(quote.updatedAt).toLocaleDateString("es-CL")}
                    href={`/cpq/${quote.id}`}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ),
    },
    /* Notas: se habilitará cuando NotesSection soporte entityType "installation" */
  ];

  return (
    <>
      <CrmDetailLayout
        module="installations"
        title={installation.name}
        subtitle={subtitle}
        badge={isActive ? { label: "Activa", variant: "success" } : { label: "Inactiva", variant: "warning" }}
        backHref="/crm/installations"
        actions={[
          { label: "Eliminar instalación", icon: Trash2, onClick: () => setDeleteConfirm(true), variant: "destructive" },
        ]}
        extra={
          <Button
            size="sm"
            variant={isActive ? "outline" : "secondary"}
            onClick={openToggleInstallationStatus}
            disabled={statusUpdating}
          >
            {statusUpdating ? "Guardando..." : isActive ? "Desactivar" : "Activar"}
          </Button>
        }
        sections={sections}
      />

      <ConfirmDialog
        open={deleteConfirm}
        onOpenChange={setDeleteConfirm}
        title="Eliminar instalación"
        description="La instalación será eliminada permanentemente. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        onConfirm={deleteInstallation}
      />
      <ConfirmDialog
        open={statusConfirmOpen}
        onOpenChange={setStatusConfirmOpen}
        title={statusNextValue ? "Activar instalación" : "Desactivar instalación"}
        description={
          statusNextValue
            ? statusActivateAccount
              ? "La instalación quedará activa y también se activará la cuenta asociada para mantener consistencia."
              : "La instalación quedará activa."
            : "La instalación quedará inactiva."
        }
        confirmLabel={statusNextValue ? "Activar" : "Desactivar"}
        variant="default"
        loading={statusUpdating}
        loadingLabel="Guardando..."
        onConfirm={toggleInstallationStatus}
      />
    </>
  );
}
