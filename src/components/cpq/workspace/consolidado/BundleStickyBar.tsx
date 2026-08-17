"use client";

/**
 * Barra KPI sticky consolidada (desktop) del workspace multi-instalación:
 * código/nombre/estado + Total mensual, margen ponderado, dotación e
 * instalaciones, con acciones Enviar y PDF. Va bajo el topbar; las pestañas
 * sticky quedan debajo.
 */

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  FileDown,
  Loader2,
  MessageCircle,
  MoreVertical,
  Send,
  Trash2,
  Unlink,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Tag } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BundleDetail } from "@/components/cpq/bundle/useBundle";
import { fmtBundleMoney, type BundleBilling } from "./bundle-billing";

const STATUS_LABEL: Record<string, string> = {
  draft: "Borrador",
  sent: "Enviada",
  accepted: "Aceptada",
  rejected: "Rechazada",
};

function buildWaMeUrl(phone: string | null | undefined, message: string): string {
  const encoded = encodeURIComponent(message);
  const cleaned = (phone ?? "").trim();
  return cleaned
    ? `https://wa.me/${cleaned}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
}

export function BundleStickyBar({
  bundle,
  billing,
  ufValue,
  saving,
  onSend,
  onRequestDeleteBundle,
}: {
  bundle: BundleDetail;
  billing: BundleBilling;
  ufValue: number | null;
  saving: boolean;
  onSend: () => void;
  onRequestDeleteBundle?: (mode: "unlink" | "cascade") => void;
}) {
  const [pdfLoading, setPdfLoading] = useState(false);
  const [waLoading, setWaLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const t = bundle.totals;
  const margin =
    t.weightedMarginPct != null ? `${t.weightedMarginPct.toFixed(1)}%` : "—";
  const canResendWhatsApp = Boolean(bundle.contactId);

  const downloadPdf = async () => {
    setPdfLoading(true);
    try {
      const res = await fetch(`/api/cpq/bundles/${bundle.id}/proposal-pdf`);
      const contentType = res.headers.get("content-type") || "";
      if (!res.ok || !contentType.includes("pdf")) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Error al generar PDF");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${bundle.code}-propuesta-tecnica.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      console.error("[Bundle PDF]", e);
      toast.error(e instanceof Error ? e.message : "Error al generar el PDF");
    } finally {
      setPdfLoading(false);
    }
  };

  const resendWhatsApp = async () => {
    setWaLoading(true);
    try {
      const res = await fetch(`/api/cpq/bundles/${bundle.id}/whatsapp-share`, {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        throw new Error(json.error || "No se pudo armar el mensaje de WhatsApp");
      }
      const url = buildWaMeUrl(json.data?.whatsappPhone, json.data?.whatsappMessage ?? "");
      window.open(url, "_blank");
      toast.success("WhatsApp listo para enviar");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al abrir WhatsApp");
    } finally {
      setWaLoading(false);
    }
  };

  return (
    <div className="hidden lg:flex sticky top-[var(--app-topbar-offset)] z-30 items-center justify-between gap-4 rounded-lg border border-border/60 bg-card/95 backdrop-blur-md px-4 py-2.5 shadow-md">
      <div className="flex items-center gap-3 min-w-0">
        <Link href="/crm/cotizaciones" className="shrink-0">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="truncate text-base font-bold tracking-tight" title={bundle.code}>
              {bundle.code}
            </h1>
            {bundle.name && (
              <span className="truncate text-sm font-medium text-muted-foreground" title={bundle.name}>
                {bundle.name}
              </span>
            )}
            <Tag variant={bundle.status === "sent" ? "ok" : "neutral"} size="sm">
              {STATUS_LABEL[bundle.status] || bundle.status}
            </Tag>
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="truncate">
              {[bundle.account?.name, bundle.deal?.title].filter(Boolean).join(" · ") ||
                "Propuesta multi-instalación"}
            </span>
            {saving && <span className="shrink-0">Guardando…</span>}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <div className="flex items-stretch overflow-hidden rounded-lg border border-border/60 bg-background/40">
          <div className="flex flex-col justify-center px-3 py-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Total mensual
            </span>
            <span className="font-mono text-sm font-bold text-status-ok-fg tabular-nums">
              {fmtBundleMoney(billing.monthlyClp, bundle.currency, ufValue)}
            </span>
          </div>
          <div className="hidden xl:flex flex-col justify-center border-l border-border/50 px-3 py-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Margen
            </span>
            <span
              className={cn(
                "text-sm font-bold leading-tight tabular-nums",
                t.weightedMarginPct != null && t.weightedMarginPct >= 15
                  ? "text-status-ok-fg"
                  : t.weightedMarginPct != null && t.weightedMarginPct >= 10
                    ? "text-status-warn-fg"
                    : "text-status-danger-fg",
              )}
            >
              {margin}
            </span>
          </div>
          <div className="hidden xl:flex flex-col justify-center border-l border-border/50 px-3 py-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Dotación
            </span>
            <span className="flex items-center gap-1 text-sm font-bold leading-tight text-status-info-fg tabular-nums">
              <Users className="h-3.5 w-3.5" />
              {t.totalGuards}
            </span>
          </div>
          <div className="hidden xl:flex flex-col justify-center border-l border-border/50 px-3 py-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Instalaciones
            </span>
            <span className="text-sm font-bold leading-tight tabular-nums">
              {t.includedCount}/{t.installationCount}
            </span>
          </div>
        </div>
        <Button
          variant="outline"
          className="h-9 gap-1.5"
          disabled={t.includedCount === 0 || pdfLoading}
          onClick={() => void downloadPdf()}
        >
          <FileDown className="h-4 w-4" />
          {pdfLoading ? "Generando…" : "PDF técnico"}
        </Button>
        <Button
          className="h-9 gap-1.5 bg-status-ok text-white hover:brightness-110"
          disabled={t.includedCount === 0 || !bundle.accountId}
          title={
            t.includedCount === 0
              ? "Incluye al menos una instalación en la propuesta"
              : !bundle.accountId
                ? "La propuesta no tiene cuenta: asígnala en el negocio"
                : undefined
          }
          onClick={onSend}
        >
          <Send className="h-4 w-4" />
          Enviar
        </Button>
        <div className="relative">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9"
            aria-label="Acciones de propuesta"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
          {menuOpen ? (
            <>
              <button
                type="button"
                className="fixed inset-0 z-20 cursor-default"
                aria-label="Cerrar menú"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 top-full z-30 mt-1 min-w-[280px] rounded-md border border-ds-border-subtle bg-popover p-1 shadow-md">
                <button
                  type="button"
                  className="flex w-full items-start gap-2 rounded-sm px-2 py-2 text-left text-[13px] hover:bg-accent disabled:opacity-50"
                  disabled={!canResendWhatsApp || waLoading}
                  title={
                    !canResendWhatsApp
                      ? "Asigna un contacto a la propuesta"
                      : undefined
                  }
                  onClick={() => {
                    setMenuOpen(false);
                    void resendWhatsApp();
                  }}
                >
                  {waLoading ? (
                    <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
                  ) : (
                    <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-status-ok-fg" />
                  )}
                  <span>
                    <span className="block font-medium">Reenviar por WhatsApp</span>
                    <span className="block text-[12px] text-ds-text-3">
                      Abre el mensaje con PIN y link al portal.
                    </span>
                  </span>
                </button>
                {onRequestDeleteBundle ? (
                  <>
                    <div className="my-1 h-px bg-border" />
                    <p className="px-2 py-1.5 text-[12px] font-semibold uppercase tracking-wide text-ds-text-3">
                      Eliminar propuesta
                    </p>
                    <button
                      type="button"
                      className="flex w-full items-start gap-2 rounded-sm px-2 py-2 text-left text-[13px] hover:bg-accent"
                      onClick={() => {
                        setMenuOpen(false);
                        onRequestDeleteBundle("unlink");
                      }}
                    >
                      <Unlink className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>
                        <span className="block font-medium">Eliminar solo propuesta</span>
                        <span className="block text-[12px] text-ds-text-3">
                          Conserva las cotizaciones en el negocio.
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-start gap-2 rounded-sm px-2 py-2 text-left text-[13px] text-status-danger-fg hover:bg-accent"
                      onClick={() => {
                        setMenuOpen(false);
                        onRequestDeleteBundle("cascade");
                      }}
                    >
                      <Trash2 className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>
                        <span className="block font-medium">Eliminar propuesta y cotizaciones</span>
                        <span className="block text-[12px] text-status-danger-fg/80">
                          Envía las cotizaciones a la papelera.
                        </span>
                      </span>
                    </button>
                  </>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
