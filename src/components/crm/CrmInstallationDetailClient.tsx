/* eslint-disable @typescript-eslint/no-misused-promises */
"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Building2, ExternalLink, Trash2, ArrowLeft, Info, Pencil } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/opai/EmptyState";
import { CollapsibleSection } from "./CollapsibleSection";
import { RecordActions } from "./RecordActions";
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
  notes?: string | null;
  account?: { id: string; name: string } | null;
};

export function CrmInstallationDetailClient({
  installation,
}: {
  installation: InstallationDetail;
}) {
  const router = useRouter();
  const hasCoords = installation.lat != null && installation.lng != null;
  const [deleteConfirm, setDeleteConfirm] = useState(false);

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

  return (
    <div className="space-y-4">
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between">
        <Link
          href="/crm/installations"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a instalaciones
        </Link>
        <RecordActions
          actions={[
            { label: "Eliminar instalación", icon: Trash2, onClick: () => setDeleteConfirm(true), variant: "destructive" },
          ]}
        />
      </div>

      {/* ── Section 1: Datos generales + mapa a la derecha (desktop) ── */}
      <CollapsibleSection
        icon={<Info className="h-4 w-4" />}
        title="Datos generales"
      >
        <div className="flex flex-col lg:flex-row lg:gap-6">
          {/* Datos */}
          <div className="flex-1 space-y-3 text-sm">
            <InfoRow label="Dirección">
              {installation.address ? (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3 shrink-0" />
                  {installation.address}
                </span>
              ) : (
                <span className="text-muted-foreground">Sin dirección</span>
              )}
            </InfoRow>
            <InfoRow label="Comuna / Ciudad">
              {(installation.commune || installation.city)
                ? [installation.commune, installation.city].filter(Boolean).join(", ")
                : "—"}
            </InfoRow>
            {installation.notes && (
              <div className="rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground mt-2">
                {installation.notes}
              </div>
            )}
          </div>

          {/* Mapa — a la derecha en desktop, abajo en móvil */}
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
                {hasCoords && !MAPS_KEY
                  ? "Configura GOOGLE_MAPS_API_KEY"
                  : "Sin ubicación"}
              </p>
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* ── Section 2: Cuenta ── */}
      <CollapsibleSection
        icon={<Building2 className="h-4 w-4" />}
        title="Cuenta"
      >
        {installation.account ? (
          <Link
            href={`/crm/accounts/${installation.account.id}`}
            className="flex items-center justify-between rounded-lg border p-3 sm:p-4 transition-colors hover:bg-accent/30 group"
          >
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              <p className="font-medium text-sm">{installation.account.name}</p>
            </div>
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
          </Link>
        ) : (
          <EmptyState icon={<Building2 className="h-8 w-8" />} title="Sin cuenta" description="Esta instalación no está vinculada a una cuenta." compact />
        )}
      </CollapsibleSection>

      <ConfirmDialog
        open={deleteConfirm}
        onOpenChange={setDeleteConfirm}
        title="Eliminar instalación"
        description="La instalación será eliminada permanentemente. Esta acción no se puede deshacer."
        onConfirm={deleteInstallation}
      />
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{children}</span>
    </div>
  );
}
