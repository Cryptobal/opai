/**
 * API Route: /api/crm/leads/[id]/approve
 * POST - Aprobar prospecto y convertir a cuenta + contacto + negocio + instalaciones.
 * - Cuenta/contacto/instalaciones solo se crean aquí (no al crear el lead).
 * - checkDuplicates: true devuelve cuentas con mismo nombre, contacto con mismo email e instalaciones duplicadas.
 * - Resoluciones: useExistingAccountId, contactResolution + contactId, por instalación useExistingInstallationId.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { toSentenceCase } from "@/lib/text-format";

const CPQ_WEEKDAYS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"] as const;
const WEEKDAY_ALIAS: Record<string, string> = {
  lunes: "lunes", Lunes: "lunes", LUNES: "lunes",
  martes: "martes", Martes: "martes", MARTES: "martes",
  miercoles: "miercoles", Miercoles: "miercoles", "Miércoles": "miercoles", MIERCOLES: "miercoles",
  jueves: "jueves", Jueves: "jueves", JUEVES: "jueves",
  viernes: "viernes", Viernes: "viernes", VIERNES: "viernes",
  sabado: "sabado", Sabado: "sabado", "Sábado": "sabado", SABADO: "sabado",
  domingo: "domingo", Domingo: "domingo", DOMINGO: "domingo",
};

const ACCOUNT_LOGO_MARKER_PREFIX = "[[ACCOUNT_LOGO_URL:";
const ACCOUNT_LOGO_MARKER_SUFFIX = "]]";

function sanitizeAccountLogoUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/uploads/company-logos/")) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.protocol === "https:" || url.protocol === "http:") return url.toString();
  } catch {
    return null;
  }
  return null;
}

function buildAccountNotesWithLogo(baseNotes: string | null, logoUrl: string | null): string | null {
  const cleanBase = (baseNotes || "").trim();
  if (!logoUrl && !cleanBase) return null;
  if (!logoUrl) return cleanBase || null;
  const marker = `${ACCOUNT_LOGO_MARKER_PREFIX}${logoUrl}${ACCOUNT_LOGO_MARKER_SUFFIX}`;
  return cleanBase ? `${marker}\n${cleanBase}` : marker;
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isNotAvailable(value: string | null): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "not available" || normalized === "n/a" || normalized === "no disponible";
}

function normalizeWeekdays(dias: unknown): string[] {
  if (!Array.isArray(dias) || dias.length === 0) return [...CPQ_WEEKDAYS];
  const normalized = dias
    .filter((d): d is string => typeof d === "string" && d != null)
    .map((d) => WEEKDAY_ALIAS[d.trim()])
    .filter((x): x is string => Boolean(x));
  const unique = [...new Set(normalized)];
  return unique.length > 0 ? unique : [...CPQ_WEEKDAYS];
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id } = await params;
    const body = await request.json();

    const lead = await prisma.crmLead.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });

    if (!lead) {
      return NextResponse.json(
        { success: false, error: "Lead no encontrado" },
        { status: 404 }
      );
    }

    if (lead.status === "approved") {
      return NextResponse.json(
        { success: false, error: "Lead ya aprobado" },
        { status: 400 }
      );
    }

    const accountName =
      body?.accountName?.trim() ||
      lead.companyName?.trim() ||
      [lead.firstName, lead.lastName].filter(Boolean).join(" ") ||
      "Cliente sin nombre";

    const contactEmail = (body?.email?.trim() || lead.email || "").trim().toLowerCase();

    // Detección de conflictos: cuenta por nombre, contacto por email
    const duplicates = await prisma.crmAccount.findMany({
      where: {
        tenantId: ctx.tenantId,
        name: { equals: accountName, mode: "insensitive" },
      },
      select: { id: true, name: true, rut: true, type: true },
      take: 10,
    });

    const existingContact =
      contactEmail &&
      (await prisma.crmContact.findFirst({
        where: {
          tenantId: ctx.tenantId,
          email: { equals: contactEmail, mode: "insensitive" },
        },
        select: { id: true, firstName: true, lastName: true, email: true, accountId: true },
      }));

    const useExistingAccountId = body?.useExistingAccountId?.trim() || null;
    let installationConflicts: { name: string; id: string }[] = [];

    if (useExistingAccountId) {
      const installationsPayload = Array.isArray(body?.installations) ? body.installations : [];
      const names = installationsPayload
        .map((i: { name?: string }) => toSentenceCase(i?.name))
        .filter((name: string | null): name is string => Boolean(name));
      if (names.length > 0) {
        const existing = await prisma.crmInstallation.findMany({
          where: {
            tenantId: ctx.tenantId,
            accountId: useExistingAccountId,
            name: { in: names, mode: "insensitive" },
          },
          select: { id: true, name: true },
        });
        installationConflicts = existing.map((e) => ({ name: e.name, id: e.id }));
      }
    }

    // Solo devolver conflictos, no crear nada
    if (body?.checkDuplicates) {
      return NextResponse.json({
        success: true,
        duplicates,
        existingContact: existingContact
          ? {
              id: existingContact.id,
              firstName: existingContact.firstName,
              lastName: existingContact.lastName,
              email: existingContact.email,
            }
          : null,
        installationConflicts: installationConflicts.length > 0 ? installationConflicts : null,
        message:
          duplicates.length > 0 || existingContact || installationConflicts.length > 0
            ? "Revisa los conflictos y elige cómo resolverlos antes de aprobar."
            : undefined,
      });
    }

    const contactFirstName =
      toSentenceCase(body?.contactFirstName) ||
      toSentenceCase(lead.firstName) ||
      "Contacto";
    const contactLastName = toSentenceCase(body?.contactLastName) || toSentenceCase(lead.lastName) || "";
    const contactResolution = body?.contactResolution || "create"; // create | overwrite | use_existing
    const contactIdForResolution = body?.contactId?.trim() || null;

    const pipelineStage = await prisma.crmPipelineStage.findFirst({
      where: { tenantId: ctx.tenantId, isActive: true },
      orderBy: { order: "asc" },
    });

    if (!pipelineStage) {
      return NextResponse.json(
        { success: false, error: "No hay etapas de pipeline configuradas" },
        { status: 400 }
      );
    }

    const dealTitle = body?.dealTitle?.trim() || `Oportunidad ${accountName}`;
    const installationsPayload = Array.isArray(body?.installations) ? body.installations : [];
    const accountLogoUrl = sanitizeAccountLogoUrl(body?.accountLogoUrl);
    const accountNotesBase = body?.accountNotes?.trim() || lead.notes || null;
    const accountNotesWithLogo = buildAccountNotesWithLogo(accountNotesBase, accountLogoUrl);
    const legalName = normalizeOptionalText(body?.legalName);
    const legalRepresentativeName = normalizeOptionalText(body?.legalRepresentativeName);
    const legalRepresentativeRut = normalizeOptionalText(body?.legalRepresentativeRut);
    const accountRut = normalizeOptionalText(body?.rut);
    const accountIndustry = normalizeOptionalText(body?.industry);
    const accountSegment = normalizeOptionalText(body?.segment);
    const accountWebsite = normalizeOptionalText(body?.website);

    const result = await prisma.$transaction(async (tx) => {
      let account: { id: string };
      if (useExistingAccountId) {
        const existing = await tx.crmAccount.findFirst({
          where: { id: useExistingAccountId, tenantId: ctx.tenantId },
        });
        if (!existing) {
          throw new Error("Cuenta existente no encontrada");
        }
        await tx.crmAccount.update({
          where: { id: existing.id },
          data: {
            rut: accountRut && !isNotAvailable(accountRut) ? accountRut : existing.rut,
            legalName: legalName && !isNotAvailable(legalName) ? legalName : existing.legalName,
            legalRepresentativeName:
              legalRepresentativeName && !isNotAvailable(legalRepresentativeName)
                ? legalRepresentativeName
                : existing.legalRepresentativeName,
            legalRepresentativeRut:
              legalRepresentativeRut && !isNotAvailable(legalRepresentativeRut)
                ? legalRepresentativeRut
                : existing.legalRepresentativeRut,
            industry:
              accountIndustry && !isNotAvailable(accountIndustry)
                ? accountIndustry
                : existing.industry,
            segment:
              accountSegment && !isNotAvailable(accountSegment)
                ? accountSegment
                : existing.segment,
            website: accountWebsite ?? existing.website,
          },
        });
        account = { id: existing.id };
      } else {
        const created = await tx.crmAccount.create({
          data: {
            tenantId: ctx.tenantId,
            name: accountName,
            type: "prospect",
            rut: accountRut,
            legalName,
            legalRepresentativeName,
            legalRepresentativeRut,
            industry: accountIndustry,
            segment: accountSegment,
            website: accountWebsite,
            address: body?.address?.trim() || null,
            notes: accountNotesWithLogo,
            ownerId: ctx.userId,
          },
        });
        account = { id: created.id };
      }

      let contact: { id: string };
      if (contactResolution === "use_existing" && contactIdForResolution) {
        const existing = await tx.crmContact.findFirst({
          where: { id: contactIdForResolution, tenantId: ctx.tenantId },
        });
        if (!existing) throw new Error("Contacto existente no encontrado");
        contact = { id: existing.id };
        // Opcional: asociar contacto a esta cuenta si estaba en otra
        await tx.crmContact.update({
          where: { id: existing.id },
          data: { accountId: account.id },
        });
      } else if (contactResolution === "overwrite" && contactIdForResolution) {
        const existing = await tx.crmContact.findFirst({
          where: { id: contactIdForResolution, tenantId: ctx.tenantId },
        });
        if (!existing) throw new Error("Contacto existente no encontrado");
        await tx.crmContact.update({
          where: { id: existing.id },
          data: {
            accountId: account.id,
            firstName: contactFirstName,
            lastName: contactLastName,
            email: body?.email?.trim() || lead.email || null,
            phone: body?.phone?.trim() || lead.phone || null,
            roleTitle: body?.roleTitle?.trim() || null,
            isPrimary: true,
          },
        });
        contact = { id: existing.id };
      } else {
        const created = await tx.crmContact.create({
          data: {
            tenantId: ctx.tenantId,
            accountId: account.id,
            firstName: contactFirstName,
            lastName: contactLastName,
            email: body?.email?.trim() || lead.email || null,
            phone: body?.phone?.trim() || lead.phone || null,
            roleTitle: body?.roleTitle?.trim() || null,
            isPrimary: true,
          },
        });
        contact = { id: created.id };
      }

      const dealNotes = body?.notes?.trim() || null;

      const deal = await tx.crmDeal.create({
        data: {
          tenantId: ctx.tenantId,
          accountId: account.id,
          primaryContactId: contact.id,
          title: dealTitle,
          amount: body?.amount ? Number(body.amount) : 0,
          stageId: pipelineStage.id,
          probability: body?.probability ? Number(body.probability) : 0,
          expectedCloseDate: body?.expectedCloseDate
            ? new Date(body.expectedCloseDate)
            : null,
          status: "open",
          notes: dealNotes,
        },
      });

      // Create initial note on the deal if notes were provided
      if (dealNotes) {
        await tx.crmNote.create({
          data: {
            tenantId: ctx.tenantId,
            entityType: "deal",
            entityId: deal.id,
            content: dealNotes,
            createdBy: ctx.userId,
          },
        });
      }

      await tx.crmDealStageHistory.create({
        data: {
          tenantId: ctx.tenantId,
          dealId: deal.id,
          fromStageId: null,
          toStageId: pipelineStage.id,
          changedBy: ctx.userId,
        },
      });

      const previousMetadata =
        lead.metadata && typeof lead.metadata === "object" && !Array.isArray(lead.metadata)
          ? (lead.metadata as Record<string, unknown>)
          : {};
      const updatedMetadata = {
        ...previousMetadata,
        companyEnrichment: {
          website: accountWebsite,
          accountRut,
          legalName,
          legalRepresentativeName,
          legalRepresentativeRut,
          industry: accountIndustry,
          segment: accountSegment,
          accountLogoUrl,
          accountNotes: accountNotesBase,
          capturedAt: new Date().toISOString(),
        },
      };

      await tx.crmLead.update({
        where: { id: lead.id },
        data: {
          status: "approved",
          approvedAt: new Date(),
          approvedBy: ctx.userId,
          convertedAccountId: account.id,
          convertedContactId: contact.id,
          convertedDealId: deal.id,
          metadata: updatedMetadata as Prisma.InputJsonValue,
        },
      });

      // ── Instalaciones + Cotización CPQ ──
      // Obtener defaults y catálogos CPQ activos
      const defaultCargo = await tx.cpqCargo.findFirst({ where: { active: true }, orderBy: { name: "asc" } });
      const defaultRol = await tx.cpqRol.findFirst({ where: { active: true }, orderBy: { name: "asc" } });
      const [activeCargos, activeRoles] = await Promise.all([
        tx.cpqCargo.findMany({ where: { active: true }, select: { id: true } }),
        tx.cpqRol.findMany({ where: { active: true }, select: { id: true } }),
      ]);
      const activeCargoIds = new Set(activeCargos.map((c) => c.id));
      const activeRolIds = new Set(activeRoles.map((r) => r.id));

      // Generar código de cotización
      const year = new Date().getFullYear();
      let quoteCodeCounter = await tx.cpqQuote.count({ where: { tenantId: ctx.tenantId } });

      for (const inst of installationsPayload) {
        const instName = toSentenceCase(inst?.name);
        if (!instName) continue;
        const useExistingInstallationId = inst?.useExistingInstallationId?.trim() || null;
        let installationId: string;

        if (useExistingInstallationId) {
          const existingInst = await tx.crmInstallation.findFirst({
            where: {
              id: useExistingInstallationId,
              tenantId: ctx.tenantId,
              accountId: account.id,
            },
            select: { id: true },
          });
          if (!existingInst) {
            throw new Error(
              "La instalación seleccionada no existe o no pertenece a la cuenta. Elige otra o crea una nueva."
            );
          }
          installationId = useExistingInstallationId;
        } else {
          const existingSameName = await tx.crmInstallation.findFirst({
            where: {
              tenantId: ctx.tenantId,
              accountId: account.id,
              name: { equals: instName, mode: "insensitive" },
            },
            select: { id: true },
          });
          if (existingSameName) {
            installationId = existingSameName.id;
          } else {
            const newInst = await tx.crmInstallation.create({
              data: {
                tenantId: ctx.tenantId,
                accountId: account.id,
                name: instName,
                address: inst?.address?.trim() || null,
                city: inst?.city?.trim() || null,
                commune: inst?.commune?.trim() || null,
                lat: inst?.lat ? Number(inst.lat) : null,
                lng: inst?.lng ? Number(inst.lng) : null,
                metadata:
                  Array.isArray(inst?.dotacion) && inst.dotacion.length > 0
                    ? { dotacion: inst.dotacion }
                    : undefined,
              },
            });
            installationId = newInst.id;
          }
        }

        // Crear cotización CPQ si la instalación tiene dotación
        const dotacion = Array.isArray(inst?.dotacion) ? inst.dotacion : [];
        if (dotacion.length > 0) {
          quoteCodeCounter++;
          const baseCode = `CPQ-${year}-${String(quoteCodeCounter).padStart(3, "0")}`;
          const quoteCode = `${baseCode}-${randomBytes(2).toString("hex")}`;
          let quote;
          try {
            quote = await tx.cpqQuote.create({
              data: {
                tenantId: ctx.tenantId,
                code: quoteCode,
                status: "draft",
                clientName: accountName,
                accountId: account.id,
                contactId: contact.id,
                dealId: deal.id,
                installationId,
                totalPositions: dotacion.length,
                totalGuards: dotacion.reduce((sum: number, d: { cantidad?: number }) => sum + (d.cantidad || 1), 0),
                notes: dealNotes,
              },
            });

            // Create initial note on the quote if notes were provided
            if (dealNotes) {
              await tx.crmNote.create({
                data: {
                  tenantId: ctx.tenantId,
                  entityType: "quote",
                  entityId: quote.id,
                  content: dealNotes,
                  createdBy: ctx.userId,
                },
              });
            }
          } catch (quoteErr: unknown) {
            const prismaErr = quoteErr as { code?: string; meta?: { code?: string }; message?: string };
            const code = prismaErr?.code ?? prismaErr?.meta?.code;
            if (code === "P2002" || (typeof prismaErr?.message === "string" && prismaErr.message.includes("25P02"))) {
              throw new Error(
                "Conflicto al crear la cotización (código duplicado o transacción abortada). Por favor intenta aprobar de nuevo."
              );
            }
            throw quoteErr;
          }

          if (quote) {
            // Crear posiciones CPQ a partir de la dotación
            for (const d of dotacion) {
              const customName =
                typeof d.customName === "string" && d.customName.trim().length > 0
                  ? d.customName.trim()
                  : null;
              const fallbackPuestoName = (d.puesto || customName || "Guardia de Seguridad").trim();
              const requestedPuestoTrabajoId =
                typeof d.puestoTrabajoId === "string" && d.puestoTrabajoId.trim().length > 0
                  ? d.puestoTrabajoId.trim()
                  : null;
              let puestoIdToUse: string;
              let puestoNameToUse = fallbackPuestoName;

              if (requestedPuestoTrabajoId) {
                const existingPuesto = await tx.cpqPuestoTrabajo.findFirst({
                  where: { id: requestedPuestoTrabajoId, active: true },
                  select: { id: true, name: true },
                });
                if (existingPuesto) {
                  puestoIdToUse = existingPuesto.id;
                  puestoNameToUse = existingPuesto.name;
                } else {
                  const fallbackPuesto = await tx.cpqPuestoTrabajo.findFirst({
                    where: { name: { equals: fallbackPuestoName, mode: "insensitive" } },
                    select: { id: true, name: true },
                  });
                  if (fallbackPuesto) {
                    puestoIdToUse = fallbackPuesto.id;
                    puestoNameToUse = fallbackPuesto.name;
                  } else {
                    const createdPuesto = await tx.cpqPuestoTrabajo.create({
                      data: { name: fallbackPuestoName, active: true },
                      select: { id: true, name: true },
                    });
                    puestoIdToUse = createdPuesto.id;
                    puestoNameToUse = createdPuesto.name;
                  }
                }
              } else {
                const fallbackPuesto = await tx.cpqPuestoTrabajo.findFirst({
                  where: { name: { equals: fallbackPuestoName, mode: "insensitive" } },
                  select: { id: true, name: true },
                });
                if (fallbackPuesto) {
                  puestoIdToUse = fallbackPuesto.id;
                  puestoNameToUse = fallbackPuesto.name;
                } else {
                  const createdPuesto = await tx.cpqPuestoTrabajo.create({
                    data: { name: fallbackPuestoName, active: true },
                    select: { id: true, name: true },
                  });
                  puestoIdToUse = createdPuesto.id;
                  puestoNameToUse = createdPuesto.name;
                }
              }

              const weekdays = normalizeWeekdays(d.dias);
              const requestedCargoId =
                typeof d.cargoId === "string" && activeCargoIds.has(d.cargoId) ? d.cargoId : null;
              const requestedRolId =
                typeof d.rolId === "string" && activeRolIds.has(d.rolId) ? d.rolId : null;
              const cargoIdToUse = requestedCargoId || defaultCargo?.id || null;
              const rolIdToUse = requestedRolId || defaultRol?.id || null;
              if (!cargoIdToUse || !rolIdToUse) {
                throw new Error(
                  "No hay configuración CPQ suficiente para crear posiciones (faltan cargo o rol activos)."
                );
              }
              const baseSalaryValue =
                typeof d.baseSalary === "number" && Number.isFinite(d.baseSalary) && d.baseSalary > 0
                  ? Number(d.baseSalary)
                  : 550000;
              const startTime = typeof d.horaInicio === "string" && d.horaInicio ? d.horaInicio : "08:00";
              const endTime = typeof d.horaFin === "string" && d.horaFin ? d.horaFin : "20:00";

              await tx.cpqPosition.create({
                data: {
                  quoteId: quote.id,
                  puestoTrabajoId: puestoIdToUse,
                  customName: customName || puestoNameToUse,
                  weekdays,
                  startTime,
                  endTime,
                  numGuards: d.cantidad || 1,
                  cargoId: cargoIdToUse,
                  rolId: rolIdToUse,
                  baseSalary: baseSalaryValue,
                  employerCost: 0, // Se recalcula al abrir en CPQ
                  netSalary: 0,
                  monthlyPositionCost: 0,
                },
              });
            }

            // Vincular cotización al negocio via CrmDealQuote
            await tx.crmDealQuote.create({
              data: {
                tenantId: ctx.tenantId,
                dealId: deal.id,
                quoteId: quote.id,
              },
            });
          }
        }
      }

      const fallbackInstallationName = toSentenceCase(body?.installationName);
      if (installationsPayload.length === 0 && fallbackInstallationName) {
        await tx.crmInstallation.create({
          data: {
            tenantId: ctx.tenantId,
            accountId: account.id,
            name: fallbackInstallationName,
            address: body?.installationAddress?.trim() || null,
            city: body?.installationCity?.trim() || null,
            commune: body?.installationCommune?.trim() || null,
          },
        });
      }

      await tx.crmDealContact.create({
        data: {
          tenantId: ctx.tenantId,
          dealId: deal.id,
          contactId: contact.id,
          role: "primary",
        },
      });

      await tx.crmHistoryLog.create({
        data: {
          tenantId: ctx.tenantId,
          entityType: "lead",
          entityId: lead.id,
          action: "lead_approved",
          details: {
            accountId: account.id,
            contactId: contact.id,
            dealId: deal.id,
          },
          createdBy: ctx.userId,
        },
      });

      return { account, contact, deal };
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    const err = error as Error & { conflictName?: string; existingId?: string };
    if (err?.message === "CONFLICT_INSTALLATION") {
      return NextResponse.json(
        {
          success: false,
          error: "Conflicto de instalación",
          conflict: "installation",
          installationName: err.conflictName,
          existingId: err.existingId,
        },
        { status: 409 }
      );
    }
    const msg = err?.message ?? "";
    if (msg.includes("La instalación seleccionada no existe")) {
      return NextResponse.json({ success: false, error: msg }, { status: 400 });
    }
    const isTransactionAborted =
      msg.includes("25P02") ||
      msg.includes("transaction is aborted") ||
      msg.includes("transacción abortada") ||
      msg.includes("Conflicto al crear la cotización");
    if (isTransactionAborted) {
      console.error("Error approving CRM lead (transaction aborted or conflict):", error);
      return NextResponse.json(
        {
          success: false,
          error:
            msg.includes("Conflicto al crear la cotización")
              ? msg
              : "La operación falló (posible conflicto de datos). Por favor intenta aprobar de nuevo.",
        },
        { status: 500 }
      );
    }
    console.error("Error approving CRM lead:", error);
    return NextResponse.json(
      { success: false, error: msg || "Error al aprobar el lead" },
      { status: 500 }
    );
  }
}
