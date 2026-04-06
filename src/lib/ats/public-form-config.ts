import { prisma } from "@/lib/prisma";
import {
  getPostulacionDocumentTypesVisibleOnGuardForm,
  type PostulacionDocumentItem,
} from "@/lib/postulacion-documentos";

export interface PublicFormField {
  /** Stable key — e.g. "firstName", "lastName", "rut", "email", "phoneMobile", etc. */
  key: string;
  label: string;
  required: boolean;
  type:
    | "text"
    | "email"
    | "tel"
    | "date"
    | "select"
    | "number"
    | "checkbox"
    | "textarea"
    | "address";
  options?: Array<{ value: string; label: string }>;
}

export interface PublicFormDocument {
  code: string;
  label: string;
  required: boolean;
}

export interface PublicFormConfig {
  jobPostingId: string;
  tenantId: string;
  tenantSlug: string;
  job: {
    titulo: string;
    requiereOS10: boolean;
    requiereMovilizacion: boolean;
  };
  /** Always shown (minimum to identify a candidate). */
  baseFields: PublicFormField[];
  /** Optional fields the tenant has enabled. For now this is a fixed extended set. */
  extendedFields: PublicFormField[];
  /** Documents the tenant configured to be visible on the public guard form. */
  documents: PublicFormDocument[];
}

const BASE_FIELDS: PublicFormField[] = [
  { key: "firstName", label: "Nombre", required: true, type: "text" },
  { key: "lastName", label: "Apellido", required: true, type: "text" },
  { key: "rut", label: "RUT", required: true, type: "text" },
  { key: "email", label: "Email", required: true, type: "email" },
  { key: "phoneMobile", label: "Celular", required: true, type: "tel" },
];

export async function getPublicFormConfig(
  jobPostingId: string,
): Promise<PublicFormConfig | null> {
  const job = await prisma.atsJobPosting.findUnique({
    where: { id: jobPostingId },
    select: {
      id: true,
      tenantId: true,
      titulo: true,
      estado: true,
      requiereOS10: true,
      requiereMovilizacion: true,
      tenant: { select: { slug: true } },
    },
  });
  if (!job || job.estado !== "ACTIVO") return null;

  const visibleDocs = await getPostulacionDocumentTypesVisibleOnGuardForm(
    job.tenantId,
  );

  const extendedFields: PublicFormField[] = [
    { key: "birthDate", label: "Fecha de nacimiento", required: false, type: "date" },
    {
      key: "sex",
      label: "Sexo",
      required: false,
      type: "select",
      options: [
        { value: "M", label: "Masculino" },
        { value: "F", label: "Femenino" },
        { value: "O", label: "Otro" },
      ],
    },
    { key: "addressFormatted", label: "Dirección", required: false, type: "address" },
    { key: "comuna", label: "Comuna", required: false, type: "text" },
    { key: "ciudad", label: "Ciudad", required: false, type: "text" },
    {
      key: "experienciaAnios",
      label: "Años de experiencia en seguridad",
      required: false,
      type: "number",
    },
    { key: "tieneOS10", label: "Tengo OS10", required: job.requiereOS10, type: "checkbox" },
    {
      key: "tieneMovilizacion",
      label: "Tengo movilización",
      required: job.requiereMovilizacion,
      type: "checkbox",
    },
  ];

  return {
    jobPostingId: job.id,
    tenantId: job.tenantId,
    tenantSlug: job.tenant.slug,
    job: {
      titulo: job.titulo,
      requiereOS10: job.requiereOS10,
      requiereMovilizacion: job.requiereMovilizacion,
    },
    baseFields: BASE_FIELDS,
    extendedFields,
    documents: visibleDocs.map((d: PostulacionDocumentItem) => ({
      code: d.code,
      label: d.label,
      required: d.required,
    })),
  };
}
