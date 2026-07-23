import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { requireCorreosAccess } from "@/lib/api-auth-productividad";
import { isExtractorBudgetExceeded } from "@/lib/crm/ai-budget";
import {
  runThreadExtractor,
  EXTRACTORS,
  type ExtractorVertical,
} from "@/modules/crm/email/extractors";

/**
 * Handler compartido de los extractores bajo demanda (F3). Gate: correos +
 * capability de la vertical + presupuesto. Devuelve la propuesta (no crea nada).
 */
export async function handleThreadExtractor(
  vertical: ExtractorVertical,
  paramsPromise: Promise<{ threadId: string }>,
): Promise<NextResponse> {
  const mod = await requireCorreosAccess();
  if (!mod.authorized) return mod.response;
  const ctx = mod.ctx;

  const perms = await resolveApiPerms(ctx);
  if (!hasCapability(perms, EXTRACTORS[vertical].capability)) {
    return NextResponse.json({ error: "Sin permiso para este extractor" }, { status: 403 });
  }

  if (await isExtractorBudgetExceeded(ctx.tenantId)) {
    return NextResponse.json(
      { error: "Presupuesto mensual de IA agotado. Los extractores están pausados; la clasificación sigue activa." },
      { status: 429 },
    );
  }

  const account = await prisma.crmEmailAccount.findFirst({
    where: { tenantId: ctx.tenantId, userId: ctx.userId, provider: "gmail", status: "active" },
    select: { id: true },
  });
  if (!account) return NextResponse.json({ error: "Gmail no conectado" }, { status: 400 });

  const { threadId } = await paramsPromise;
  const result = await runThreadExtractor({
    tenantId: ctx.tenantId,
    emailAccountId: account.id,
    threadId,
    vertical,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
