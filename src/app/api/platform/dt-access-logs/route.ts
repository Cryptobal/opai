import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAuth } from "@/lib/platform-api-auth";
import { tableToExcelBuffer } from "@/modules/reportes-dt/export-excel";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requirePlatformAuth({ minRole: 'support' });
  if (!auth.ok) return auth.response;
  const ctx = auth.ctx;

  const sp = request.nextUrl.searchParams;
  const email = (sp.get("email") ?? "").trim().toLowerCase();
  const from = sp.get("from");
  const to = sp.get("to");
  const format = (sp.get("format") || "json").toLowerCase();

  const where: Record<string, unknown> = {};
  if (email) where.email = { contains: email, mode: "insensitive" };
  if (from || to) {
    const at: Record<string, Date> = {};
    if (from) at.gte = new Date(from);
    if (to) at.lte = new Date(`${to}T23:59:59.999Z`);
    where.at = at;
  }

  const rows = await prisma.dtFiscalizacionAccessLog.findMany({
    where,
    orderBy: { at: "desc" },
    take: 2000,
    include: { tenant: { select: { legalName: true, name: true, companyRut: true } } },
  });

  const data = rows.map((r) => ({
    id: r.id,
    at: r.at.toISOString(),
    email: r.email,
    action: r.action,
    tenantName: r.tenant ? r.tenant.legalName || r.tenant.name : "",
    tenantRut: r.tenantRut || r.tenant?.companyRut || "",
    ip: r.ip || "",
    userAgent: r.userAgent || "",
  }));

  if (format === "xlsx") {
    const buf = await tableToExcelBuffer(
      "Conexiones portal fiscalización DT",
      [
        { key: "at", label: "Fecha/hora" },
        { key: "email", label: "Correo" },
        { key: "action", label: "Acción" },
        { key: "tenantName", label: "Empleador" },
        { key: "tenantRut", label: "RUT" },
        { key: "ip", label: "IP" },
        { key: "userAgent", label: "User-Agent" },
      ],
      data,
    );
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="dt-access-logs.xlsx"',
      },
    });
  }

  return NextResponse.json({ success: true, data });
}
