import { NextResponse } from "next/server";
import { resolveApiPerms } from "@/lib/api-auth";
import { canView, hasCapability, hasModuleAccess } from "@/lib/permissions";
import { requireCorreosAccess } from "@/lib/api-auth-productividad";
import { isExtractorBudgetExceeded } from "@/lib/crm/ai-budget";
import {
  runThreadExtractor,
  EXTRACTORS,
  type ExtractorVertical,
} from "@/modules/crm/email/extractors";
import { requireThreadMailbox } from "@/modules/crm/email/mailbox-scope";

/**
 * Handler compartido de los extractores bajo demanda (F3).
 * Gate: correos + copiloto_correos + módulo destino + presupuesto.
 * Devuelve la propuesta (no crea nada).
 */
export async function handleThreadExtractor(
  vertical: ExtractorVertical,
  paramsPromise: Promise<{ threadId: string }>,
): Promise<NextResponse> {
  const mod = await requireCorreosAccess();
  if (!mod.authorized) return mod.response;
  const ctx = mod.ctx;

  const perms = await resolveApiPerms(ctx);
  if (!hasCapability(perms, "copiloto_correos")) {
    return NextResponse.json({ error: "Sin permiso para este extractor" }, { status: 403 });
  }
  const dest = EXTRACTORS[vertical].destinationModule;
  const destOk = dest.submodule
    ? canView(perms, dest.module, dest.submodule)
    : hasModuleAccess(perms, dest.module);
  if (!destOk) {
    return NextResponse.json({ error: "Sin permiso para este extractor" }, { status: 403 });
  }

  if (await isExtractorBudgetExceeded(ctx.tenantId)) {
    return NextResponse.json(
      { error: "Presupuesto mensual de IA agotado. Los extractores están pausados." },
      { status: 429 },
    );
  }

  const { threadId } = await paramsPromise;
  const owned = await requireThreadMailbox({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    threadId,
  });
  if (!owned.ok) return NextResponse.json({ error: owned.error }, { status: owned.status });
  const { account } = owned;

  const result = await runThreadExtractor({
    tenantId: ctx.tenantId,
    emailAccountId: account.id,
    threadId,
    vertical,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
