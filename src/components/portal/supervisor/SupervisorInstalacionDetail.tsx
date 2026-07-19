"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  MapPin,
  Users,
  ClipboardCheck,
  AlertTriangle,
  MessageSquare,
  Plus,
  Clock,
  FileText,
  Ticket,
  Loader2,
  ExternalLink,
  Briefcase,
  Copy,
  LinkIcon,
  CheckCircle2,
} from "lucide-react";
import { EmptyState } from "@/components/opai/EmptyState";
import { SupervisorInstallation } from "@/lib/portal-supervisor";

interface Props {
  installation: SupervisorInstallation;
  onBack: () => void;
  onAction: (
    action: "nueva-visita" | "turno-extra" | "ticket" | "novedad" | "visita-tecnica",
    installationId: string
  ) => void;
}

interface Guard {
  id: string;
  guardName: string;
  guardRut?: string | null;
  puestoName?: string;
}

interface Finding {
  id: string;
  description: string;
  severity: string;
  status: string;
  createdAt: string;
}

interface LastVisit {
  id: string;
  status: string;
  checkInAt: string;
  healthScore?: number;
}

export function SupervisorInstalacionDetail({ installation, onBack, onAction }: Props) {
  const [guards, setGuards] = useState<Guard[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [lastVisit, setLastVisit] = useState<LastVisit | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [guardsRes, findingsRes, visitsRes] = await Promise.allSettled([
        fetch(`/api/ops/supervision/installation-dotacion/${installation.id}`),
        fetch(`/api/ops/supervision/installation-findings/${installation.id}`),
        fetch(`/api/ops/supervision?installationId=${installation.id}&limit=1`),
      ]);

      if (guardsRes.status === "fulfilled" && guardsRes.value.ok) {
        const j = await guardsRes.value.json();
        const d = j.data;
        // API returns { regular: [...], reinforcement: [...] } — flatten to a single array
        const allGuards = Array.isArray(d) ? d : [...(d?.regular ?? []), ...(d?.reinforcement ?? [])];
        setGuards(allGuards);
      }
      if (findingsRes.status === "fulfilled" && findingsRes.value.ok) {
        const j = await findingsRes.value.json();
        setFindings((j.data ?? []).filter((f: Finding) => f.status === "open").slice(0, 5));
      }
      if (visitsRes.status === "fulfilled" && visitsRes.value.ok) {
        const j = await visitsRes.value.json();
        setLastVisit(j.data?.[0] ?? null);
      }
      setLoading(false);
    }
    load();
  }, [installation.id]);

  return (
    <div className="flex flex-col gap-4 px-4 py-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 rounded-lg bg-card opai-glass-soft-m border border-border text-muted-foreground"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0">
          <h2 className="text-base font-semibold truncate">{installation.name}</h2>
          <p className="text-xs text-muted-foreground truncate">{installation.accountName}</p>
        </div>
        <span
          className={`ml-auto flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full ${
            installation.status === "active"
              ? "bg-emerald-500/15 text-emerald-400"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {installation.status === "active" ? "Activa" : installation.status === "inactive" ? "Inactiva" : "Prospecto"}
        </span>
      </div>

      {/* Address */}
      {installation.address && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin size={14} />
          <span>{installation.address}</span>
        </div>
      )}

      {/* Pairing Code */}
      {installation.pairingCode && (
        <div className="rounded-xl border border-border bg-card opai-glass-soft-m p-4">
          <div className="flex items-center gap-2 mb-3">
            <LinkIcon size={14} className="text-blue-400" />
            <span className="text-sm font-medium text-foreground">Código de Pareo</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-lg border border-border bg-muted px-5 py-3">
              <span className="font-mono text-2xl font-bold tracking-[0.25em] text-foreground">
                {installation.pairingCode}
              </span>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(installation.pairingCode!);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-card opai-glass-soft-m border border-border text-sm text-muted-foreground hover:border-border transition-colors"
            >
              {copied ? (
                <>
                  <CheckCircle2 size={14} className="text-green-400" />
                  Copiado
                </>
              ) : (
                <>
                  <Copy size={14} />
                  Copiar
                </>
              )}
            </button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Ingresa este código en el dispositivo para vincularlo a esta instalación.
          </p>
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Visita", icon: ClipboardCheck, action: "nueva-visita" as const, color: "text-blue-400" },
          { label: "Turno Extra", icon: Clock, action: "turno-extra" as const, color: "text-purple-400" },
          { label: "Ticket", icon: Ticket, action: "ticket" as const, color: "text-red-400" },
          { label: "Novedad", icon: MessageSquare, action: "novedad" as const, color: "text-amber-400" },
        ].map(({ label, icon: Icon, action, color }) => (
          <button
            key={action}
            onClick={() => onAction(action, installation.id)}
            className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-card opai-glass-soft-m border border-border hover:border-border transition-colors"
          >
            <Icon size={18} className={color} />
            <span className="text-[10px] text-muted-foreground text-center leading-tight">{label}</span>
          </button>
        ))}
      </div>

      {/* Visita Técnica CTA */}
      <button
        onClick={() => onAction("visita-tecnica", installation.id)}
        className="flex items-center gap-3 w-full p-3.5 rounded-xl bg-card opai-glass-soft-m border border-border hover:border-blue-800 hover:bg-blue-950/20 transition-colors"
      >
        <Briefcase size={16} className="text-blue-400 flex-shrink-0" />
        <span className="text-sm text-muted-foreground">Nueva visita técnica comercial</span>
      </button>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="animate-spin text-muted-foreground" size={24} />
        </div>
      ) : (
        <>
          {/* Guardias */}
          <Section title="Guardias" icon={<Users size={14} />} count={guards.length}>
            {guards.length === 0 ? (
              <EmptyState title="Sin guardias asignados" compact inline />
            ) : (
              <div className="flex flex-col gap-1.5">
                {guards.slice(0, 5).map((g) => {
                  const initials = g.guardName
                    .split(" ")
                    .map((w) => w[0])
                    .slice(0, 2)
                    .join("");
                  return (
                  <div
                    key={g.id}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted"
                  >
                    <div className="w-7 h-7 rounded-full bg-card flex items-center justify-center text-xs text-muted-foreground font-medium">
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-foreground truncate">
                        {g.guardName}
                      </p>
                      {g.guardRut && <p className="text-xs text-muted-foreground">{g.guardRut}</p>}
                    </div>
                  </div>
                  );
                })}
                {guards.length > 5 && (
                  <p className="text-xs text-muted-foreground text-center">+{guards.length - 5} más</p>
                )}
              </div>
            )}
          </Section>

          {/* Última visita */}
          <Section title="Última visita" icon={<ClipboardCheck size={14} />}>
            {!lastVisit ? (
              <EmptyState title="Sin visitas registradas" compact inline />
            ) : (
              <div className="px-3 py-2 rounded-lg bg-muted flex items-center justify-between">
                <div>
                  <p className="text-sm text-foreground">
                    {new Date(lastVisit.checkInAt).toLocaleDateString("es-CL")}
                  </p>
                  <p className="text-xs text-muted-foreground capitalize">{lastVisit.status}</p>
                </div>
                {lastVisit.healthScore != null && (
                  <span
                    className={`text-sm font-semibold ${
                      lastVisit.healthScore >= 80
                        ? "text-emerald-400"
                        : lastVisit.healthScore >= 60
                        ? "text-amber-400"
                        : "text-red-400"
                    }`}
                  >
                    {lastVisit.healthScore}%
                  </span>
                )}
              </div>
            )}
          </Section>

          {/* Hallazgos abiertos */}
          <Section
            title="Hallazgos abiertos"
            icon={<AlertTriangle size={14} />}
            count={findings.length}
          >
            {findings.length === 0 ? (
              <EmptyState title="Sin hallazgos abiertos" compact inline />
            ) : (
              <div className="flex flex-col gap-1.5">
                {findings.map((f) => (
                  <div
                    key={f.id}
                    className="px-3 py-2 rounded-lg bg-muted flex items-start gap-2"
                  >
                    <span
                      className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
                        f.severity === "critical"
                          ? "bg-red-400"
                          : f.severity === "high"
                          ? "bg-amber-400"
                          : "bg-muted-foreground"
                      }`}
                    />
                    <p className="text-xs text-muted-foreground line-clamp-2">{f.description}</p>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

function Section({
  title,
  icon,
  count,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card opai-glass-soft-m overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-sm font-medium text-foreground">{title}</span>
        {count != null && (
          <span className="ml-auto text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            {count}
          </span>
        )}
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}
