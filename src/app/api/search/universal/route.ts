/**
 * API Route: /api/search/universal
 * GET — Universal entity search for # and / references in notes
 *       q=texto&limit=5
 *       Returns results grouped by category for easy entity referencing.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasModuleAccess } from "@/lib/permissions";

type SearchItem = {
  id: string;
  label: string;
  code?: string | null;
  subtitle?: string;
};

type UniversalSearchResult = {
  quotations: SearchItem[];
  installations: SearchItem[];
  accounts: SearchItem[];
  contacts: SearchItem[];
  deals: SearchItem[];
  guards: SearchItem[];
  documents: SearchItem[];
};

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const q = request.nextUrl.searchParams.get("q")?.trim();
    const limit = Math.min(
      10,
      Math.max(1, parseInt(request.nextUrl.searchParams.get("limit") || "5", 10)),
    );

    if (!q || q.length < 2) {
      return NextResponse.json({
        success: true,
        data: {
          quotations: [],
          installations: [],
          accounts: [],
          contacts: [],
          deals: [],
          guards: [],
          documents: [],
        } satisfies UniversalSearchResult,
      });
    }

    const perms = await resolveApiPerms(ctx);
    const hasCrm = hasModuleAccess(perms, "crm");
    const hasCpq = hasModuleAccess(perms, "cpq") || hasCrm;
    const hasOps = hasModuleAccess(perms, "ops");
    const hasDocs = hasModuleAccess(perms, "docs");
    const tenantId = ctx.tenantId;
    const contains = { contains: q, mode: "insensitive" as const };

    const result: UniversalSearchResult = {
      quotations: [],
      installations: [],
      accounts: [],
      contacts: [],
      deals: [],
      guards: [],
      documents: [],
    };

    // Run all searches in parallel
    const searches = await Promise.all([
      // Quotations
      hasCpq
        ? prisma.cpqQuote.findMany({
            where: {
              tenantId,
              OR: [{ code: contains }, { clientName: contains }],
            },
            take: limit,
            orderBy: { createdAt: "desc" },
            select: { id: true, code: true, clientName: true, status: true },
          })
        : [],
      // Installations
      hasCrm
        ? prisma.crmInstallation.findMany({
            where: {
              tenantId,
              OR: [{ name: contains }, { address: contains }, { commune: contains }],
            },
            take: limit,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              name: true,
              address: true,
              account: { select: { name: true } },
            },
          })
        : [],
      // Accounts
      hasCrm
        ? prisma.crmAccount.findMany({
            where: {
              tenantId,
              OR: [{ name: contains }, { rut: contains }],
            },
            take: limit,
            orderBy: { createdAt: "desc" },
            select: { id: true, name: true, rut: true, type: true },
          })
        : [],
      // Contacts
      hasCrm
        ? prisma.crmContact.findMany({
            where: {
              tenantId,
              OR: [
                { firstName: contains },
                { lastName: contains },
                { email: contains },
              ],
            },
            take: limit,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              account: { select: { name: true } },
            },
          })
        : [],
      // Deals
      hasCrm
        ? prisma.crmDeal.findMany({
            where: { tenantId, OR: [{ title: contains }] },
            take: limit,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              title: true,
              account: { select: { name: true } },
              stage: { select: { name: true } },
            },
          })
        : [],
      // Guards
      hasOps
        ? prisma.opsGuardia.findMany({
            where: {
              tenantId,
              OR: [
                { persona: { firstName: contains } },
                { persona: { lastName: contains } },
                { persona: { rut: { contains: q.replace(/[.\s-]/g, ""), mode: "insensitive" } } },
                { code: contains },
              ],
            },
            take: limit,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              code: true,
              persona: {
                select: { firstName: true, lastName: true, rut: true },
              },
            },
          })
        : [],
      // Documents
      hasDocs
        ? prisma.document.findMany({
            where: { tenantId, OR: [{ title: contains }] },
            take: limit,
            orderBy: { createdAt: "desc" },
            select: { id: true, title: true, status: true, category: true },
          })
        : [],
    ]);

    const [quotations, installations, accounts, contacts, deals, guards, documents] = searches;

    result.quotations = (quotations as any[]).map((q) => ({
      id: q.id,
      label: `${q.code} - ${q.clientName || "Sin cliente"}`,
      code: q.code,
      subtitle: q.status,
    }));

    result.installations = (installations as any[]).map((i) => ({
      id: i.id,
      label: i.name,
      subtitle: [i.address, i.account?.name].filter(Boolean).join(" · "),
    }));

    result.accounts = (accounts as any[]).map((a) => ({
      id: a.id,
      label: a.name,
      code: a.rut,
      subtitle: a.type === "client" ? "Cliente" : "Prospecto",
    }));

    result.contacts = (contacts as any[]).map((c) => ({
      id: c.id,
      label: `${c.firstName} ${c.lastName}`.trim(),
      subtitle: [c.email, c.account?.name].filter(Boolean).join(" · "),
    }));

    result.deals = (deals as any[]).map((d) => ({
      id: d.id,
      label: d.title,
      subtitle: [d.account?.name, d.stage?.name].filter(Boolean).join(" · "),
    }));

    result.guards = (guards as any[]).map((g) => ({
      id: g.id,
      label: `${g.persona.firstName} ${g.persona.lastName}`.trim(),
      code: g.code,
      subtitle: g.persona.rut ?? "",
    }));

    result.documents = (documents as any[]).map((d) => ({
      id: d.id,
      label: d.title,
      subtitle: [d.category, d.status].filter(Boolean).join(" · "),
    }));

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("Error in universal search:", error);
    return NextResponse.json(
      { success: false, error: "Error en la búsqueda" },
      { status: 500 },
    );
  }
}
