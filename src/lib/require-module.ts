import { isTenantModuleEnabled, type TenantModuleKey } from './tenant-modules';
import { requireAuth, unauthorized, type AuthContext } from './api-auth';
import { NextResponse } from 'next/server';

/**
 * Verifica que el tenant del usuario tenga el módulo habilitado.
 * Para usar en API routes.
 *
 * @example
 * ```ts
 * const check = await requireTenantModule('crm');
 * if (!check.authorized) return check.response;
 * // check.ctx contiene el AuthContext
 * ```
 */
export async function requireTenantModule(module: TenantModuleKey): Promise<
  | { authorized: true; ctx: AuthContext }
  | { authorized: false; response: NextResponse }
> {
  const ctx = await requireAuth();
  if (!ctx) {
    return { authorized: false, response: unauthorized() };
  }

  const enabled = await isTenantModuleEnabled(ctx.tenantId, module);
  if (!enabled) {
    return {
      authorized: false,
      response: NextResponse.json(
        { success: false, error: `Módulo "${module}" no está habilitado en tu plan. Contacta a tu administrador.` },
        { status: 403 },
      ),
    };
  }

  return { authorized: true, ctx };
}
