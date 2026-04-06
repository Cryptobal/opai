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
}

export interface FeedJobContext {
  siteUrl: string;
  source: string;
  cpaEmail?: string;
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

export function buildJobXml(job: FeedJobInput, ctx: FeedJobContext): string {
  const slug = job.jsonLdSlug || job.id;
  const utm = `utm_source=${encodeURIComponent(ctx.source)}&utm_medium=job_board&utm_campaign=ats_feed`;
  const jobUrl = `${ctx.siteUrl}/empleos/${job.tenantSlug}/${slug}?${utm}`;
  const applyUrl = `${ctx.siteUrl}/empleos/${job.tenantSlug}/${slug}?${utm}#postular`;
  const description =
    job.descripcion + (job.funciones ? `\n\nFunciones:\n${job.funciones}` : "");
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
