/**
 * Guards para las API routes internas del módulo psych.
 * Compone requireAuth + isTenantModuleEnabled('psych') + check de rol.
 *
 * Para MVP el check de rol usa userRole legacy (admin/owner/rrhh/gerencia/editor).
 * Cuando se añadan permisos granulares al sistema central de permissions.ts,
 * migrar a canView/canEdit para submódulo psych.
 */

import { NextResponse } from "next/server";
import { requireAuth, unauthorized, type AuthContext } from "@/lib/api-auth";
import { isTenantModuleEnabled } from "@/lib/tenant-modules";

const READ_ROLES = new Set([
  "owner",
  "admin",
  "manager",
  "rrhh",
  "gerencia",
  "editor",
]);

const WRITE_ROLES = new Set(["owner", "admin", "rrhh", "gerencia", "editor"]);

const ADMIN_ROLES = new Set(["owner", "admin"]);

type Scope = "read" | "write" | "admin";

export interface PsychGuardOk {
  ok: true;
  ctx: AuthContext;
}

export interface PsychGuardDeny {
  ok: false;
  response: NextResponse;
}

export type PsychGuardResult = PsychGuardOk | PsychGuardDeny;

function roleAllowed(role: string | undefined, scope: Scope): boolean {
  const r = (role ?? "").toLowerCase();
  if (scope === "admin") return ADMIN_ROLES.has(r);
  if (scope === "write") return WRITE_ROLES.has(r);
  return READ_ROLES.has(r);
}

export async function guardPsych(scope: Scope): Promise<PsychGuardResult> {
  const ctx = await requireAuth();
  if (!ctx) return { ok: false, response: unauthorized() };

  const enabled = await isTenantModuleEnabled(ctx.tenantId, "psych");
  if (!enabled) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          error:
            "Módulo psicolaboral no habilitado. Contacta a tu administrador.",
        },
        { status: 403 },
      ),
    };
  }

  if (!roleAllowed(ctx.userRole, scope)) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: `Sin permisos para ${scope} en psicolaboral` },
        { status: 403 },
      ),
    };
  }

  return { ok: true, ctx };
}
