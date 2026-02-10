/**
 * API Route: /api/crm/leads/[id]/approve
 * POST - Aprobar prospecto y convertir a cuenta + contacto + negocio + instalaciones.
 * - Cuenta/contacto/instalaciones solo se crean aquí (no al crear el lead).
 * - checkDuplicates: true devuelve cuentas con mismo nombre, contacto con mismo email e instalaciones duplicadas.
 * - Resoluciones: useExistingAccountId, contactResolution + contactId, por instalación useExistingInstallationId.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";

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
      const names = installationsPayload.map((i: { name?: string }) => (i?.name || "").trim()).filter(Boolean);
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
      body?.contactFirstName?.trim() || lead.firstName?.trim() || "Contacto";
    const contactLastName = body?.contactLastName?.trim() || lead.lastName?.trim() || "";
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

    const result = await prisma.$transaction(async (tx) => {
      let account: { id: string };
      if (useExistingAccountId) {
        const existing = await tx.crmAccount.findFirst({
          where: { id: useExistingAccountId, tenantId: ctx.tenantId },
        });
        if (!existing) {
          throw new Error("Cuenta existente no encontrada");
        }
        account = { id: existing.id };
      } else {
        const created = await tx.crmAccount.create({
          data: {
            tenantId: ctx.tenantId,
            name: accountName,
            type: "prospect",
            rut: body?.rut?.trim() || null,
            industry: body?.industry?.trim() || null,
            size: body?.size?.trim() || null,
            segment: body?.segment?.trim() || null,
            website: body?.website?.trim() || null,
            address: body?.address?.trim() || null,
            notes: body?.accountNotes?.trim() || lead.notes || null,
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
        },
      });

      await tx.crmDealStageHistory.create({
        data: {
          tenantId: ctx.tenantId,
          dealId: deal.id,
          fromStageId: null,
          toStageId: pipelineStage.id,
          changedBy: ctx.userId,
        },
      });

      await tx.crmLead.update({
        where: { id: lead.id },
        data: {
          status: "approved",
          approvedAt: new Date(),
          approvedBy: ctx.userId,
          convertedAccountId: account.id,
          convertedContactId: contact.id,
          convertedDealId: deal.id,
        },
      });

      // ── Instalaciones + Cotización CPQ ──
      // Obtener defaults para CPQ (cargo y rol por defecto)
      const defaultCargo = await tx.cpqCargo.findFirst({ where: { active: true }, orderBy: { name: "asc" } });
      const defaultRol = await tx.cpqRol.findFirst({ where: { active: true }, orderBy: { name: "asc" } });

      // Generar código de cotización
      const year = new Date().getFullYear();
      let quoteCodeCounter = await tx.cpqQuote.count({ where: { tenantId: ctx.tenantId } });

      for (const inst of installationsPayload) {
        const instName = inst?.name?.trim();
        if (!instName) continue;
        const useExistingInstallationId = inst?.useExistingInstallationId?.trim() || null;
        let installationId: string;

        if (useExistingInstallationId) {
          installationId = useExistingInstallationId;
        } else {
          const existingSameName = await tx.crmInstallation.findFirst({
            where: {
              tenantId: ctx.tenantId,
              accountId: account.id,
              name: { equals: instName, mode: "insensitive" },
            },
          });
          if (existingSameName) {
            const e = new Error("CONFLICT_INSTALLATION") as Error & { conflictName?: string; existingId?: string };
            e.conflictName = instName;
            e.existingId = existingSameName.id;
            throw e;
          }
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

        // Crear cotización CPQ si la instalación tiene dotación
        const dotacion = Array.isArray(inst?.dotacion) ? inst.dotacion : [];
        if (dotacion.length > 0 && defaultCargo && defaultRol) {
          // Generar código único
          quoteCodeCounter++;
          let quoteCode = `CPQ-${year}-${String(quoteCodeCounter).padStart(3, "0")}`;
          // Retry en caso de colisión
          let codeAttempts = 0;
          let quote = null;
          while (!quote && codeAttempts < 10) {
            codeAttempts++;
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
                },
              });
            } catch (codeErr: any) {
              if (codeErr?.code === "P2002") {
                quoteCodeCounter++;
                quoteCode = `CPQ-${year}-${String(quoteCodeCounter).padStart(3, "0")}`;
                continue;
              }
              throw codeErr;
            }
          }

          if (quote) {
            // Crear posiciones CPQ a partir de la dotación
            for (const d of dotacion) {
              const puestoName = (d.puesto || "Guardia de Seguridad").trim();
              // Buscar o crear puesto de trabajo
              let puesto = await tx.cpqPuestoTrabajo.findFirst({
                where: { name: { equals: puestoName, mode: "insensitive" } },
              });
              if (!puesto) {
                puesto = await tx.cpqPuestoTrabajo.create({
                  data: { name: puestoName, active: true },
                });
              }

              const weekdays = Array.isArray(d.dias) && d.dias.length > 0
                ? d.dias
                : ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];

              await tx.cpqPosition.create({
                data: {
                  quoteId: quote.id,
                  puestoTrabajoId: puesto.id,
                  customName: puestoName,
                  weekdays,
                  startTime: d.horaInicio || "08:00",
                  endTime: d.horaFin || "20:00",
                  numGuards: d.cantidad || 1,
                  cargoId: defaultCargo.id,
                  rolId: defaultRol.id,
                  baseSalary: 500000, // Salario base por defecto, se ajusta en CPQ
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

      if (installationsPayload.length === 0 && body?.installationName?.trim()) {
        await tx.crmInstallation.create({
          data: {
            tenantId: ctx.tenantId,
            accountId: account.id,
            name: body.installationName.trim(),
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
    console.error("Error approving CRM lead:", error);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to approve lead" },
      { status: 500 }
    );
  }
}
