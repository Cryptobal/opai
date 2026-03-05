"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  MapPin,
  Shield,
  Users,
} from "lucide-react";

interface VisitaDetail {
  id: string;
  status: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  durationMinutes: number | null;
  currentSecurityCompany: string | null;
  hasSecurityCurrently: boolean | null;
  guardsNeeded: number | null;
  guardShiftType: string | null;
  guardSalaryRange: string | null;
  requiresTransport: boolean;
  transportNotes: string | null;
  requiresMeals: boolean;
  mealNotes: string | null;
  requiresExams: boolean;
  examNotes: string | null;
  requiresEquipment: boolean;
  equipmentNotes: string | null;
  requiresUniform: boolean;
  uniformNotes: string | null;
  generalReport: string | null;
  securityRisks: string | null;
  recommendations: string | null;
  photos: string[] | null;
  surveyContactName: string | null;
  surveyContactRole: string | null;
  surveyHowDidYouHear: string | null;
  surveyVisitOpinion: string | null;
  surveyExpectations: string | null;
  surveyCurrentPainPoints: string | null;
  surveySignatureUrl: string | null;
  createdAt: string;
  installation: { id: string; name: string; address: string | null } | null;
  account: { id: string; name: string } | null;
  deal: { id: string; title: string } | null;
}

interface Props {
  visitaId: string;
  onBack: () => void;
}

const STATUS_CFG: Record<string, { label: string; color: string }> = {
  borrador: { label: "Borrador", color: "text-zinc-400" },
  en_curso: { label: "En curso", color: "text-blue-400" },
  completada: { label: "Completada", color: "text-emerald-400" },
};

export function VisitaTecnicaDetail({ visitaId, onBack }: Props) {
  const [visita, setVisita] = useState<VisitaDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/portal/supervisor/visitas-tecnicas/${visitaId}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setVisita(json.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [visitaId]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin text-zinc-600" size={24} />
      </div>
    );
  }

  if (!visita) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-zinc-600">
        <FileText size={32} />
        <p className="text-sm">No encontrado</p>
        <button onClick={onBack} className="text-sm text-blue-400">Volver</button>
      </div>
    );
  }

  const cfg = STATUS_CFG[visita.status] ?? { label: visita.status, color: "text-zinc-400" };

  return (
    <div className="flex flex-col gap-4 px-4 py-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-base font-semibold truncate">{visita.account?.name ?? "Visita técnica"}</p>
          <p className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</p>
        </div>
      </div>

      {/* Meta */}
      <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 flex flex-col gap-2">
        {visita.installation && (
          <div className="flex items-start gap-2">
            <Building2 size={14} className="text-zinc-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-zinc-300">{visita.installation.name}</p>
          </div>
        )}
        {visita.installation?.address && (
          <div className="flex items-start gap-2">
            <MapPin size={14} className="text-zinc-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-zinc-400">{visita.installation.address}</p>
          </div>
        )}
        {visita.checkInAt && (
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-zinc-500 flex-shrink-0" />
            <p className="text-xs text-zinc-400">
              Check-in: {new Date(visita.checkInAt).toLocaleString("es-CL")}
              {visita.durationMinutes && ` · ${visita.durationMinutes} min`}
            </p>
          </div>
        )}
      </div>

      {/* Seguridad actual */}
      {(visita.hasSecurityCurrently !== null || visita.guardsNeeded) && (
        <Section title="Seguridad actual" icon={<Shield size={14} />}>
          {visita.hasSecurityCurrently !== null && (
            <Row label="¿Tiene seguridad?" value={visita.hasSecurityCurrently ? "Sí" : "No"} />
          )}
          {visita.currentSecurityCompany && (
            <Row label="Empresa actual" value={visita.currentSecurityCompany} />
          )}
          {visita.guardsNeeded && (
            <Row label="Guardias requeridos" value={String(visita.guardsNeeded)} />
          )}
          {visita.guardShiftType && (
            <Row label="Tipo de turno" value={visita.guardShiftType} />
          )}
          {visita.guardSalaryRange && (
            <Row label="Rango salarial" value={visita.guardSalaryRange} />
          )}
        </Section>
      )}

      {/* Servicios */}
      {(visita.requiresTransport || visita.requiresMeals || visita.requiresExams || visita.requiresEquipment || visita.requiresUniform) && (
        <Section title="Servicios requeridos" icon={<Users size={14} />}>
          {visita.requiresTransport && <ServiceRow label="Transporte" notes={visita.transportNotes} />}
          {visita.requiresMeals && <ServiceRow label="Alimentación" notes={visita.mealNotes} />}
          {visita.requiresExams && <ServiceRow label="Exámenes médicos" notes={visita.examNotes} />}
          {visita.requiresEquipment && <ServiceRow label="Equipamiento" notes={visita.equipmentNotes} />}
          {visita.requiresUniform && <ServiceRow label="Uniforme" notes={visita.uniformNotes} />}
        </Section>
      )}

      {/* Informe */}
      {(visita.generalReport || visita.securityRisks || visita.recommendations) && (
        <Section title="Informe" icon={<FileText size={14} />}>
          {visita.generalReport && (
            <div className="flex flex-col gap-1">
              <p className="text-[10px] text-zinc-500">Informe general</p>
              <p className="text-xs text-zinc-300 leading-relaxed">{visita.generalReport}</p>
            </div>
          )}
          {visita.securityRisks && (
            <div className="flex flex-col gap-1">
              <p className="text-[10px] text-zinc-500">Riesgos de seguridad</p>
              <p className="text-xs text-zinc-300 leading-relaxed">{visita.securityRisks}</p>
            </div>
          )}
          {visita.recommendations && (
            <div className="flex flex-col gap-1">
              <p className="text-[10px] text-zinc-500">Recomendaciones</p>
              <p className="text-xs text-zinc-300 leading-relaxed">{visita.recommendations}</p>
            </div>
          )}
        </Section>
      )}

      {/* Fotos */}
      {visita.photos && visita.photos.length > 0 && (
        <Section title="Fotos" icon={<FileText size={14} />}>
          <div className="flex flex-wrap gap-2">
            {visita.photos.map((url, i) => (
              <img key={i} src={url} alt="foto" className="w-20 h-20 object-cover rounded-lg" />
            ))}
          </div>
        </Section>
      )}

      {/* Encuesta */}
      {visita.surveyContactName && (
        <Section title="Encuesta del cliente" icon={<CheckCircle2 size={14} />}>
          {visita.surveyContactName && <Row label="Contacto" value={`${visita.surveyContactName}${visita.surveyContactRole ? ` — ${visita.surveyContactRole}` : ""}`} />}
          {visita.surveyHowDidYouHear && <Row label="¿Cómo nos conoció?" value={visita.surveyHowDidYouHear} />}
          {visita.surveyVisitOpinion && <Row label="Opinión de la visita" value={visita.surveyVisitOpinion} />}
          {visita.surveyExpectations && (
            <div className="flex flex-col gap-1">
              <p className="text-[10px] text-zinc-500">Expectativas</p>
              <p className="text-xs text-zinc-300">{visita.surveyExpectations}</p>
            </div>
          )}
          {visita.surveyCurrentPainPoints && (
            <div className="flex flex-col gap-1">
              <p className="text-[10px] text-zinc-500">Problemas actuales</p>
              <p className="text-xs text-zinc-300">{visita.surveyCurrentPainPoints}</p>
            </div>
          )}
          {visita.surveySignatureUrl && (
            <div className="flex flex-col gap-1">
              <p className="text-[10px] text-zinc-500">Firma</p>
              <img src={visita.surveySignatureUrl} alt="firma" className="h-16 object-contain rounded-lg bg-zinc-950" />
            </div>
          )}
        </Section>
      )}
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 p-4 rounded-xl bg-zinc-900 border border-zinc-800">
      <div className="flex items-center gap-2">
        <span className="text-zinc-500">{icon}</span>
        <p className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">{title}</p>
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-[11px] text-zinc-500">{label}</p>
      <p className="text-xs text-zinc-300 text-right">{value}</p>
    </div>
  );
}

function ServiceRow({ label, notes }: { label: string; notes: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-2">
        <CheckCircle2 size={12} className="text-emerald-400 flex-shrink-0" />
        <p className="text-xs text-zinc-300">{label}</p>
      </div>
      {notes && <p className="text-[11px] text-zinc-500 ml-5">{notes}</p>}
    </div>
  );
}
