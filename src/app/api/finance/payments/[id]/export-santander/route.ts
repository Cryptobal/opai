import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { CHILE_BANKS } from "@/lib/personas";

type Params = { id: string };

// ── GET: generate Santander XLSX ──

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!hasCapability(perms, "rendicion_pay")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para exportar pagos" },
        { status: 403 },
      );
    }

    const { id } = await params;

    const payment = await prisma.financePayment.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        rendiciones: {
          select: {
            id: true,
            code: true,
            amount: true,
            submitterId: true,
            beneficiaryGuardiaId: true,
          },
        },
      },
    });

    if (!payment) {
      return NextResponse.json(
        { success: false, error: "Pago no encontrado" },
        { status: 404 },
      );
    }

    const config = await prisma.financeRendicionConfig.findUnique({
      where: { tenantId: ctx.tenantId },
      select: { santanderAccountNumber: true },
    });
    const cuentaOrigen = config?.santanderAccountNumber ?? "";

    // Separate rendiciones: with beneficiary guardia vs submitter-based
    const guardiaRendiciones = payment.rendiciones.filter((r) => r.beneficiaryGuardiaId);
    const submitterRendiciones = payment.rendiciones.filter((r) => !r.beneficiaryGuardiaId);

    // Fetch beneficiary guardias with bank accounts
    const guardiaIds = [...new Set(guardiaRendiciones.map((r) => r.beneficiaryGuardiaId!))];
    const beneficiaryGuardias = guardiaIds.length > 0
      ? await prisma.opsGuardia.findMany({
          where: { id: { in: guardiaIds } },
          select: {
            id: true,
            persona: { select: { firstName: true, lastName: true, rut: true, email: true } },
            bankAccounts: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] },
          },
        })
      : [];
    const guardiaMap = new Map(beneficiaryGuardias.map((g) => [g.id, g]));

    // Fetch Admin submitters (for rendiciones without beneficiary)
    const submitterIds = [...new Set(submitterRendiciones.map((r) => r.submitterId))];
    const admins = submitterIds.length > 0
      ? await prisma.admin.findMany({
          where: { id: { in: submitterIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const adminMap = new Map(admins.map((a) => [a.id, a]));

    const adminEmails = admins.map((a) => a.email).filter(Boolean);
    const personas = adminEmails.length > 0
      ? await prisma.opsPersona.findMany({
          where: { tenantId: ctx.tenantId, email: { in: adminEmails } },
          select: {
            email: true,
            firstName: true,
            lastName: true,
            rut: true,
            guardia: {
              select: {
                bankAccounts: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] },
              },
            },
          },
        })
      : [];
    const personaByEmail = new Map(personas.map((p) => [p.email, p]));

    // Group amounts by beneficiary key
    type BeneficiaryRow = {
      accountNumber: string;
      sbifCode: string;
      rut: string;
      fullName: string;
      amount: number;
      email: string;
    };
    const rows: BeneficiaryRow[] = [];

    // Group guardia-beneficiary rendiciones by guardiaId
    const byGuardia = new Map<string, number>();
    for (const r of guardiaRendiciones) {
      byGuardia.set(r.beneficiaryGuardiaId!, (byGuardia.get(r.beneficiaryGuardiaId!) ?? 0) + r.amount);
    }
    for (const [guardiaId, amount] of byGuardia.entries()) {
      const g = guardiaMap.get(guardiaId);
      if (!g) continue;
      const account = g.bankAccounts?.[0];
      rows.push({
        accountNumber: account?.accountNumber ?? "",
        sbifCode: account?.bankCode
          ? CHILE_BANKS.find((b) => b.code === account.bankCode)?.sbifCode ?? ""
          : "",
        rut: g.persona?.rut ?? "",
        fullName: `${g.persona?.firstName ?? ""} ${g.persona?.lastName ?? ""}`.trim(),
        amount,
        email: g.persona?.email ?? "",
      });
    }

    // Group submitter rendiciones by submitterId
    const bySubmitter = new Map<string, number>();
    for (const r of submitterRendiciones) {
      bySubmitter.set(r.submitterId, (bySubmitter.get(r.submitterId) ?? 0) + r.amount);
    }
    for (const [submitterId, amount] of bySubmitter.entries()) {
      const admin = adminMap.get(submitterId);
      if (!admin) continue;
      const persona = personaByEmail.get(admin.email);
      const account = persona?.guardia?.bankAccounts?.[0];
      rows.push({
        accountNumber: account?.accountNumber ?? "",
        sbifCode: account?.bankCode
          ? CHILE_BANKS.find((b) => b.code === account.bankCode)?.sbifCode ?? ""
          : "",
        rut: persona?.rut ?? "",
        fullName: persona
          ? `${persona.firstName ?? ""} ${persona.lastName ?? ""}`.trim()
          : admin.name,
        amount,
        email: admin.email ?? "",
      });
    }

    // Build Excel
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Santander", {
      views: [{ state: "frozen", ySplit: 1 }],
    });

    const headers = [
      "Cuenta origen",
      "Moneda origen",
      "Cuenta destino",
      "Moneda destino",
      "Codigo banco destino",
      "RUT beneficiario",
      "Nombre beneficiario",
      "Monto transferencia",
      "Glosa personalizada transferencia",
      "Correo beneficiario",
      "Mensaje correo beneficiario",
      "Glosa cartola originador",
      "Glosa cartola beneficiario",
    ];
    sheet.addRow(headers);
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };

    for (const row of rows) {
      sheet.addRow([
        cuentaOrigen,
        "CLP",
        row.accountNumber,
        "CLP",
        row.sbifCode,
        row.rut,
        row.fullName,
        row.amount,
        payment.code,
        row.email,
        "",
        "",
        "",
      ]);
    }

    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${payment.code}-santander.xlsx"`,
      },
    });
  } catch (error) {
    console.error("[Finance] Error exporting Santander XLSX:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo exportar el archivo Santander" },
      { status: 500 },
    );
  }
}
