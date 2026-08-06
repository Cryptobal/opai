import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { STORAGE_PROVIDER } from "@/lib/storage";
import { enqueueCrmFileToDrive } from "@/lib/google-workspace/drive-enqueue-hooks";
import { parseGoogleMapsUrl } from "@/lib/google-maps-url";
import {
  WEEKDAYS_FULL,
  emptyLeadExtraction,
  type LeadExtraction,
  type LeadExtractionPuesto,
  type StagedFile,
  type CreateLeadMode,
} from "./email-to-lead.types";

function splitName(nombre: string | null): { firstName: string | null; lastName: string | null } {
  if (!nombre) return { firstName: null, lastName: null };
  const parts = nombre.trim().split(/\s+/);
  return parts.length === 1
    ? { firstName: parts[0], lastName: null }
    : { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

async function attach(
  tenantId: string,
  userId: string,
  file: StagedFile,
  entityType: "lead" | "deal",
  entityId: string,
) {
  const crmFile = await prisma.crmFile.create({
    data: {
      tenantId, fileName: file.fileName, mimeType: file.mimeType, size: file.size,
      storageProvider: STORAGE_PROVIDER, storageKey: file.storageKey, createdBy: userId,
    },
  });
  await prisma.crmFileLink.create({ data: { tenantId, fileId: crmFile.id, entityType, entityId } });
  void enqueueCrmFileToDrive({
    tenantId, entityType, entityId,
    file: { id: crmFile.id, storageKey: file.storageKey, fileName: file.fileName, mimeType: file.mimeType },
  });
}

/** Asegura shape completo aunque el cliente mande una propuesta parcial (chat / UI vieja). */
export function coerceProposal(raw: LeadExtraction | Record<string, unknown>): LeadExtraction {
  const base = emptyLeadExtraction();
  const p = raw as Partial<LeadExtraction> & Record<string, unknown>;
  const c = (p.contacto ?? {}) as Record<string, unknown>;
  const puestosRaw = Array.isArray(p.puestos) ? p.puestos : [];
  const puestos: LeadExtractionPuesto[] = puestosRaw.map((item) => {
    const x = (item ?? {}) as Record<string, unknown>;
    return {
      nombre: typeof x.nombre === "string" ? x.nombre : null,
      tipoPuesto: typeof x.tipoPuesto === "string" ? x.tipoPuesto : null,
      cargo: typeof x.cargo === "string" ? x.cargo : null,
      rol: typeof x.rol === "string" ? x.rol : null,
      descripcion: typeof x.descripcion === "string" ? x.descripcion : null,
      dias: Array.isArray(x.dias) && x.dias.length > 0
        ? (x.dias.filter((d): d is string => typeof d === "string") as string[])
        : [...WEEKDAYS_FULL],
      horaInicio: typeof x.horaInicio === "string" ? x.horaInicio : "08:00",
      horaFin: typeof x.horaFin === "string" ? x.horaFin : "20:00",
      numGuards: typeof x.numGuards === "number" ? x.numGuards : null,
      numPuestos: typeof x.numPuestos === "number" ? x.numPuestos : null,
      sueldoBruto: typeof x.sueldoBruto === "number" ? x.sueldoBruto : null,
    };
  });

  return {
    ...base,
    empresa: typeof p.empresa === "string" ? p.empresa : null,
    rut: typeof p.rut === "string" ? p.rut : null,
    contacto: {
      nombre: typeof c.nombre === "string" ? c.nombre : null,
      cargo: typeof c.cargo === "string" ? c.cargo : null,
      email: typeof c.email === "string" ? c.email : null,
      telefono: typeof c.telefono === "string" ? c.telefono : null,
    },
    requerimiento: typeof p.requerimiento === "string" ? p.requerimiento : null,
    dotacionEstimada: typeof p.dotacionEstimada === "number" ? p.dotacionEstimada : null,
    instalacionComuna: typeof p.instalacionComuna === "string" ? p.instalacionComuna : null,
    instalacionNombre: typeof p.instalacionNombre === "string" ? p.instalacionNombre : null,
    direccion: typeof p.direccion === "string" ? p.direccion : null,
    ciudad: typeof p.ciudad === "string" ? p.ciudad : null,
    mapsUrl: typeof p.mapsUrl === "string" ? p.mapsUrl : null,
    lat: typeof p.lat === "number" ? p.lat : null,
    lng: typeof p.lng === "number" ? p.lng : null,
    nombreCotizacion: typeof p.nombreCotizacion === "string" ? p.nombreCotizacion : null,
    isOngoingService: p.isOngoingService !== false,
    mesesContrato: typeof p.mesesContrato === "number" ? p.mesesContrato : null,
    puestos,
    fechaLimite: typeof p.fechaLimite === "string" ? p.fechaLimite : null,
    esLicitacion: Boolean(p.esLicitacion),
    confianza: p.confianza && typeof p.confianza === "object" ? (p.confianza as Record<string, number>) : {},
  };
}

function puestosToDotacion(puestos: LeadExtractionPuesto[]) {
  return puestos.map((p) => ({
    // Tipo de puesto es el catálogo "puesto" del CPQ; rol/nombre como fallback.
    puesto: p.tipoPuesto || p.rol || p.nombre || "Guardia",
    cargo: p.cargo || undefined,
    rol: p.rol || undefined,
    customName: p.nombre || p.tipoPuesto || p.rol || undefined,
    cantidad: p.numGuards && p.numGuards > 0 ? Math.floor(p.numGuards) : 1,
    numPuestos: p.numPuestos && p.numPuestos > 0 ? Math.floor(p.numPuestos) : 1,
    horaInicio: p.horaInicio || "08:00",
    horaFin: p.horaFin || "20:00",
    dias: p.dias?.length ? p.dias : [...WEEKDAYS_FULL],
    baseSalary: p.sueldoBruto && p.sueldoBruto > 0 ? p.sueldoBruto : undefined,
    serviceGroupName: p.nombre || undefined,
    description: p.descripcion || undefined,
    shiftType: (p.horaInicio || "").startsWith("20") ? "night" : "day",
  }));
}

export type CreateLeadResult = {
  ok: boolean;
  leadId?: string;
  leadUrl?: string;
  dealId?: string;
  contactId?: string;
  note?: string;
  error?: string;
};

/** Crea el lead (+ contacto/negocio opcional) desde la propuesta editada. */
export async function createLeadFromExtraction(params: {
  tenantId: string;
  userId: string;
  emailAccountId: string;
  threadId: string;
  proposal: LeadExtraction;
  mode: CreateLeadMode;
  stagedFiles: StagedFile[];
}): Promise<CreateLeadResult> {
  const { tenantId, userId, emailAccountId, threadId, mode } = params;
  const proposal = coerceProposal(params.proposal);
  const thread = await prisma.crmEmailThread.findFirst({
    where: { id: threadId, tenantId, emailAccountId },
    select: { id: true, accountId: true, contactId: true },
  });
  if (!thread) return { ok: false, error: "Hilo no encontrado" };

  const files = params.stagedFiles.filter(
    (f) => f.storageKey.startsWith(`${tenantId}/`) && f.storageKey.includes("chat-staged"),
  );
  const { firstName, lastName } = splitName(proposal.contacto.nombre);

  let lat = proposal.lat;
  let lng = proposal.lng;
  if ((lat == null || lng == null) && proposal.mapsUrl) {
    const coords = parseGoogleMapsUrl(proposal.mapsUrl);
    if (coords) {
      lat = coords.lat;
      lng = coords.lng;
    }
  }

  const notes = [
    proposal.requerimiento,
    proposal.rut ? `RUT: ${proposal.rut}` : null,
    proposal.dotacionEstimada ? `Dotación estimada: ${proposal.dotacionEstimada}` : null,
    proposal.direccion ? `Dirección: ${proposal.direccion}` : null,
    proposal.mapsUrl ? `Maps: ${proposal.mapsUrl}` : null,
    proposal.isOngoingService
      ? "Servicio: continuo/indefinido"
      : proposal.mesesContrato
        ? `Servicio: ${proposal.mesesContrato} meses`
        : null,
    proposal.esLicitacion ? "Marcado como licitación." : null,
  ].filter(Boolean).join(" · ");

  const dotacion = puestosToDotacion(proposal.puestos);
  const instName =
    proposal.instalacionNombre ||
    (proposal.empresa && proposal.instalacionComuna
      ? `${proposal.empresa} - ${proposal.instalacionComuna}`
      : proposal.empresa) ||
    "Instalación";

  const installationsDraft = [
    {
      _key: `inst_correo_${Date.now()}`,
      name: instName,
      address: proposal.direccion || "",
      city: proposal.ciudad || "",
      commune: proposal.instalacionComuna || "",
      ...(lat != null ? { lat } : {}),
      ...(lng != null ? { lng } : {}),
      ...(proposal.mapsUrl ? { mapsUrl: proposal.mapsUrl } : {}),
      dotacion,
    },
  ];

  const extracted = {
    rut: proposal.rut,
    contactRole: proposal.contacto.cargo,
    address: proposal.direccion,
    city: proposal.ciudad,
    commune: proposal.instalacionComuna,
    serviceDuration: proposal.isOngoingService
      ? "indefinido"
      : proposal.mesesContrato
        ? `${proposal.mesesContrato} meses`
        : null,
    summary: proposal.requerimiento,
    mapsUrl: proposal.mapsUrl,
    instalacionNombre: proposal.instalacionNombre,
    nombreCotizacion: proposal.nombreCotizacion,
    isOngoingService: proposal.isOngoingService,
    mesesContrato: proposal.mesesContrato,
  };

  const lead = await prisma.crmLead.create({
    data: {
      tenantId,
      status: "pending",
      source: "correo_ia",
      companyName: proposal.empresa,
      firstName,
      lastName,
      email: proposal.contacto.email,
      phone: proposal.contacto.telefono,
      address: proposal.direccion,
      commune: proposal.instalacionComuna,
      city: proposal.ciudad,
      serviceType: proposal.requerimiento?.slice(0, 120) || null,
      estimatedDuration: proposal.isOngoingService ? null : proposal.mesesContrato,
      notes: notes || null,
      metadata: {
        origen: "correo_ia",
        threadId,
        extraction: proposal,
        extracted,
        installationsDraft,
        dotacion,
        ...(lat != null ? { lat } : {}),
        ...(lng != null ? { lng } : {}),
        ...(proposal.mapsUrl ? { mapsUrl: proposal.mapsUrl } : {}),
        isOngoingService: proposal.isOngoingService,
        contractDuration: proposal.mesesContrato,
        nombreCotizacion: proposal.nombreCotizacion,
      } as Prisma.InputJsonValue,
    },
  });
  for (const f of files) await attach(tenantId, userId, f, "lead", lead.id);

  let contactId = thread.contactId;
  if (thread.accountId && proposal.contacto.email && !contactId) {
    const existing = await prisma.crmContact.findFirst({
      where: { tenantId, accountId: thread.accountId, email: { equals: proposal.contacto.email, mode: "insensitive" } },
      select: { id: true },
    });
    contactId = existing?.id ?? (
      await prisma.crmContact.create({
        data: {
          tenantId, accountId: thread.accountId,
          firstName: firstName ?? "Contacto", lastName: lastName ?? "",
          email: proposal.contacto.email, phone: proposal.contacto.telefono, roleTitle: proposal.contacto.cargo,
        },
      })
    ).id;
  }

  let dealId: string | undefined;
  let note: string | undefined;
  if (mode === "lead_y_negocio" && proposal.esLicitacion) {
    const stage = thread.accountId
      ? await prisma.crmPipelineStage.findFirst({ where: { tenantId, isActive: true }, orderBy: { order: "asc" }, select: { id: true } })
      : null;
    if (thread.accountId && stage) {
      const dealTitle =
        proposal.nombreCotizacion ||
        (proposal.empresa ? `Licitación ${proposal.empresa}` : "Licitación");
      const deal = await prisma.crmDeal.create({
        data: {
          tenantId, accountId: thread.accountId, stageId: stage.id,
          title: dealTitle,
          amount: 0, isLicitacion: true, primaryContactId: contactId,
          fechaEntrega: proposal.fechaLimite ? new Date(`${proposal.fechaLimite}T12:00:00Z`) : null,
          installationName: proposal.instalacionNombre,
          address: proposal.direccion,
          city: proposal.ciudad,
          commune: proposal.instalacionComuna,
          ...(lat != null ? { lat } : {}),
          ...(lng != null ? { lng } : {}),
        },
      });
      dealId = deal.id;
      for (const f of files) await attach(tenantId, userId, f, "deal", deal.id);
      // La entrega se agenda como hito en Agenda del negocio (no banda all-day).
    } else {
      note = "Asociá el hilo a una cuenta para crear el negocio de licitación.";
    }
  }

  await prisma.crmEmailThread.update({
    where: { id: thread.id },
    data: { leadId: lead.id, ...(contactId ? { contactId } : {}) },
  });

  // Verdad Verificada: read-after-write.
  const check = await prisma.crmLead.findFirst({ where: { id: lead.id, tenantId }, select: { id: true } });
  if (!check) return { ok: false, error: "No se pudo confirmar la creación del lead." };

  return {
    ok: true,
    leadId: lead.id,
    leadUrl: `/crm/leads/${lead.id}`,
    dealId,
    contactId: contactId ?? undefined,
    note: note || "Lead listo para cotizar: instalación, Maps y puestos quedaron prellenados al aprobar.",
  };
}
