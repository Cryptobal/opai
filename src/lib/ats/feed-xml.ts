/**
 * Shared helpers for building job board XML feeds.
 * Used by both the unified feed and per-tenant feeds.
 */

export interface FeedJobInput {
  id: string;
  titulo: string;
  descripcion: string;
  funciones: string | null;
  turno: string;
  region: string;
  commune: string | null;
  installationCommune?: string | null;
  rentaMin: number | null;
  rentaMax: number | null;
  experienciaMinAnios: number | null;
  jsonLdSlug: string | null;
  createdAt: Date;
  updatedAt: Date;
  expiraAt: Date | null;
  tenantSlug: string;
  companyName: string;
  logo: string;
  requiereOS10?: boolean;
  requiereMovilizacion?: boolean;
  genero?: string | null;
  vacantes?: number;
}

export interface FeedJobContext {
  siteUrl: string;
  source: string;
  cpaEmail?: string;
}

/** Convierte códigos internos de turno en texto legible para candidatos. */
export function formatTurnoLegible(turno: string): string {
  if (!turno) return "Turno a convenir";
  const key = turno.toLowerCase().trim();
  const map: Record<string, string> = {
    "4x4_dia": "4x4 día (07:00 a 19:00 hrs)",
    "4x4_noche": "4x4 noche (19:00 a 07:00 hrs)",
    "4x4": "4x4",
    "5x2": "5x2 (lunes a viernes)",
    "5x2_dia": "5x2 día (lunes a viernes)",
    "5x2_noche": "5x2 noche (lunes a viernes)",
    "6x1": "6x1",
    "6x1_dia": "6x1 día",
    "6x1_noche": "6x1 noche",
    "7x7_dia": "7x7 día",
    "7x7_noche": "7x7 noche",
    "full_time": "Jornada completa",
    "part_time": "Media jornada",
    "rotativo": "Turnos rotativos",
  };
  return map[key] || turno;
}

/** Map internal turno code to a feed-friendly job type label. */
export function mapTurnoToJobType(turno: string): string {
  const t = (turno || "").toLowerCase();
  if (t.includes("part") || t.includes("medio")) return "Part time";
  if (t.includes("rotativ") || t.includes("4x4") || t.includes("5x2")) {
    return "Turnos rotativos";
  }
  return "Full time";
}

/** Format date as DD.MM.YYYY (Jooble compatibility). */
export function formatDateDdMmYyyy(date: Date): string {
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = date.getUTCFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

/** Build experience string from years if present. */
export function buildExperience(years: number | null | undefined): string {
  if (!years || years <= 0) return "Sin experiencia previa requerida";
  if (years === 1) return "1 año de experiencia";
  return `${years} años de experiencia`;
}

/** Try to derive an education requirement from text fields. */
export function buildEducation(text: string | null | undefined): string {
  if (!text) return "Enseñanza media completa";
  const lower = text.toLowerCase();
  if (lower.includes("universitar")) return "Educación universitaria";
  if (lower.includes("técnic") || lower.includes("tecnic")) return "Educación técnica";
  if (lower.includes("media")) return "Enseñanza media completa";
  return "Enseñanza media completa";
}

/** Formatea un monto CLP sin decimales. */
function formatCLP(amount: number): string {
  return `$${amount.toLocaleString("es-CL")} CLP`;
}

/** Arma bloque de Requisitos derivado de los campos estructurados. */
function buildRequisitosBlock(job: FeedJobInput): string {
  const reqs: string[] = [];

  if (job.experienciaMinAnios && job.experienciaMinAnios > 0) {
    reqs.push(
      `• Experiencia mínima: ${job.experienciaMinAnios} ${
        job.experienciaMinAnios === 1 ? "año" : "años"
      } en cargos similares de seguridad o vigilancia.`,
    );
  } else {
    reqs.push("• Sin experiencia previa requerida — capacitación incluida.");
  }

  if (job.requiereOS10) {
    reqs.push(
      "• Curso OS-10 vigente otorgado por Carabineros de Chile (obligatorio según Ley 21.659).",
    );
  }

  reqs.push("• Enseñanza media completa.");

  if (job.requiereMovilizacion) {
    reqs.push("• Movilización propia o residencia cercana al lugar de trabajo.");
  }

  reqs.push(`• Disponibilidad para trabajar en turno ${formatTurnoLegible(job.turno)}.`);
  reqs.push(
    "• Documentación al día: cédula de identidad vigente y antecedentes sin observaciones.",
  );
  reqs.push("• Buena presentación personal y disposición de servicio al cliente.");

  return `\n\nRequisitos:\n${reqs.join("\n")}`;
}

/** Arma bloque de Beneficios estándar. */
function buildBeneficiosBlock(job: FeedJobInput): string {
  const benefits: string[] = ["• Contrato indefinido tras período de prueba"];

  if (job.rentaMin) {
    const renta =
      job.rentaMax && job.rentaMax > job.rentaMin
        ? `${formatCLP(job.rentaMin)} a ${formatCLP(job.rentaMax)}`
        : formatCLP(job.rentaMin);
    benefits.push(`• Renta líquida: ${renta} mensuales`);
  }

  benefits.push(
    "• Imposiciones legales (AFP, salud, seguro de cesantía)",
    "• Uniforme y equipamiento completo proporcionado por la empresa",
    "• Capacitación continua y oportunidades de crecimiento profesional",
    "• Pago puntual mensual",
    "• Estabilidad laboral en empresa consolidada del rubro",
  );

  return `\n\nBeneficios:\n${benefits.join("\n")}`;
}

/** Bloque de ubicación legible. */
function buildUbicacionBlock(job: FeedJobInput): string {
  const ciudad = job.commune || job.installationCommune || "";
  if (!ciudad) return "";
  return `\n\nUbicación del puesto: ${ciudad}, Región ${job.region}, Chile.`;
}

/** Bloque de vacantes si hay más de 1. */
function buildVacantesBlock(job: FeedJobInput): string {
  if (!job.vacantes || job.vacantes <= 1) return "";
  return `\n\nVacantes disponibles: ${job.vacantes}.`;
}

export function buildJobXml(job: FeedJobInput, ctx: FeedJobContext): string {
  const slug = job.jsonLdSlug || job.id;
  const utm = `utm_source=${encodeURIComponent(ctx.source)}&utm_medium=job_board&utm_campaign=ats_feed`;
  const jobUrl = `${ctx.siteUrl}/empleos/${job.tenantSlug}/${slug}?${utm}`;
  const applyUrl = `${ctx.siteUrl}/empleos/${job.tenantSlug}/${slug}?${utm}#postular`;
  const descripcionBase = (job.descripcion || "").trim();
  const funcionesBlock = job.funciones?.trim()
    ? `\n\nFunciones y Responsabilidades:\n${job.funciones.trim()}`
    : "";
  const requisitosBlock = buildRequisitosBlock(job);
  const beneficiosBlock = buildBeneficiosBlock(job);
  const ubicacionBlock = buildUbicacionBlock(job);
  const vacantesBlock = buildVacantesBlock(job);

  const description =
    descripcionBase +
    funcionesBlock +
    requisitosBlock +
    beneficiosBlock +
    ubicacionBlock +
    vacantesBlock;
  const jobType = mapTurnoToJobType(job.turno);

  let salaryXml = "";
  if (job.rentaMin) {
    salaryXml = `
      <salary>
        <min><![CDATA[${job.rentaMin}]]></min>
        <max><![CDATA[${job.rentaMax || job.rentaMin}]]></max>
        <currency><![CDATA[CLP]]></currency>
        <period><![CDATA[Monthly]]></period>
        <type><![CDATA[gross]]></type>
      </salary>`;
  }

  const expirationIso = job.expiraAt ? job.expiraAt.toISOString() : "";
  const expireDdMm = job.expiraAt ? formatDateDdMmYyyy(job.expiraAt) : "";

  return `
    <job>
      <referencenumber><![CDATA[${job.id}]]></referencenumber>
      <title><![CDATA[${job.titulo}]]></title>
      <company><![CDATA[${job.companyName}]]></company>
      <city><![CDATA[${job.commune || job.installationCommune || ""}]]></city>
      <state><![CDATA[${job.region}]]></state>
      <country><![CDATA[CL]]></country>
      <dateposted><![CDATA[${job.createdAt.toISOString()}]]></dateposted>
      <updated><![CDATA[${job.updatedAt.toISOString()}]]></updated>
      <url><![CDATA[${jobUrl}]]></url>
      <apply_url><![CDATA[${applyUrl}]]></apply_url>
      <description><![CDATA[${description}]]></description>
      <jobtype><![CDATA[${jobType}]]></jobtype>
      <category><![CDATA[Seguridad Privada]]></category>
      <logo><![CDATA[${job.logo}]]></logo>
      ${expirationIso ? `<expirationdate><![CDATA[${expirationIso}]]></expirationdate>` : ""}
      ${expireDdMm ? `<expire><![CDATA[${expireDdMm}]]></expire>` : ""}
      <experience><![CDATA[${buildExperience(job.experienciaMinAnios)}]]></experience>
      <education><![CDATA[${buildEducation(job.funciones)}]]></education>
      <jobboard_source><![CDATA[opai]]></jobboard_source>
      <language><![CDATA[es]]></language>
      ${ctx.cpaEmail ? `<cpa_email><![CDATA[${ctx.cpaEmail}]]></cpa_email>` : ""}${salaryXml}
    </job>`;
}
