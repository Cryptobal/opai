/**
 * Alcance de lectura multicuenta (correo v1).
 *
 * Único punto de verdad para validar `accountId` del cliente y la propiedad
 * de un hilo. Patrón de retorno discriminado igual a `sender-account.ts`.
 */
import { prisma } from "@/lib/prisma";
import {
  AVAILABLE_MAILBOX_COLORS,
  labelFromEmail,
  type MailboxColorKey,
} from "./mailbox-identity";

export type MailboxSummary = {
  id: string;
  email: string;
  color: string;
  displayLabel: string;
  isDefault: boolean;
  sortIndex: number;
  status: string;
  grantedScopes: string | null;
};

export type MailboxScope = {
  /** Todas las casillas activas del usuario, ordenadas. */
  accounts: MailboxSummary[];
  /** Alcance efectivo (1..N ids). */
  accountIds: string[];
  /** null = bandeja unificada. */
  activeAccountId: string | null;
  defaultAccountId: string | null;
};

const ACCOUNT_SELECT = {
  id: true,
  email: true,
  color: true,
  displayLabel: true,
  isDefault: true,
  sortIndex: true,
  status: true,
  grantedScopes: true,
  createdAt: true,
} as const;

function toSummary(row: {
  id: string;
  email: string;
  color: string | null;
  displayLabel: string | null;
  isDefault: boolean;
  sortIndex: number;
  status: string;
  grantedScopes: string | null;
}): MailboxSummary {
  const fallbackColor: MailboxColorKey = AVAILABLE_MAILBOX_COLORS[0];
  return {
    id: row.id,
    email: row.email,
    color: row.color ?? fallbackColor,
    displayLabel: row.displayLabel ?? labelFromEmail(row.email),
    isDefault: row.isDefault,
    sortIndex: row.sortIndex,
    status: row.status,
    grantedScopes: row.grantedScopes,
  };
}

/** Lista casillas Gmail activas del usuario, ordenadas. */
export async function listUserMailboxes(params: {
  tenantId: string;
  userId: string;
}): Promise<MailboxSummary[]> {
  const rows = await prisma.crmEmailAccount.findMany({
    where: {
      tenantId: params.tenantId,
      userId: params.userId,
      provider: "gmail",
      status: "active",
    },
    select: ACCOUNT_SELECT,
    orderBy: [{ sortIndex: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(toSummary);
}

/**
 * Resuelve el alcance de lectura.
 *
 * - `requestedAccountId` ausente / `"all"` → unificada (todas).
 * - UUID propio → esa casilla.
 * - UUID ajeno → `{ ok:false, status:403 }` (fail-closed).
 * - Sin casillas → `{ ok:true }` con arrays vacíos (el llamador decide).
 */
export async function resolveMailboxScope(params: {
  tenantId: string;
  userId: string;
  requestedAccountId?: string | null;
}): Promise<
  | { ok: true; scope: MailboxScope }
  | { ok: false; status: number; error: string }
> {
  const accounts = await listUserMailboxes({
    tenantId: params.tenantId,
    userId: params.userId,
  });

  const defaultAccountId =
    accounts.find((a) => a.isDefault)?.id ?? accounts[0]?.id ?? null;

  const raw = params.requestedAccountId?.trim() || null;
  const wantsAll = !raw || raw === "all";

  if (accounts.length === 0) {
    return {
      ok: true,
      scope: {
        accounts: [],
        accountIds: [],
        activeAccountId: null,
        defaultAccountId: null,
      },
    };
  }

  if (wantsAll) {
    return {
      ok: true,
      scope: {
        accounts,
        accountIds: accounts.map((a) => a.id),
        activeAccountId: null,
        defaultAccountId,
      },
    };
  }

  const match = accounts.find((a) => a.id === raw);
  if (!match) {
    return {
      ok: false,
      status: 403,
      error: "Casilla no pertenece al usuario",
    };
  }

  return {
    ok: true,
    scope: {
      accounts,
      accountIds: [match.id],
      activeAccountId: match.id,
      defaultAccountId,
    },
  };
}

/**
 * Valida propiedad de un hilo por casilla del usuario.
 * 404 (no 403) si el hilo no existe o pertenece a otra casilla — no revelar existencia.
 */
export async function requireThreadMailbox(params: {
  tenantId: string;
  userId: string;
  threadId: string;
}): Promise<
  | {
      ok: true;
      thread: { id: string; emailAccountId: string };
      account: MailboxSummary;
    }
  | { ok: false; status: number; error: string }
> {
  const thread = await prisma.crmEmailThread.findFirst({
    where: { id: params.threadId, tenantId: params.tenantId },
    select: { id: true, emailAccountId: true },
  });

  if (!thread || !thread.emailAccountId) {
    return { ok: false, status: 404, error: "Hilo no encontrado" };
  }

  const accounts = await listUserMailboxes({
    tenantId: params.tenantId,
    userId: params.userId,
  });
  const account = accounts.find((a) => a.id === thread.emailAccountId);
  if (!account) {
    return { ok: false, status: 404, error: "Hilo no encontrado" };
  }

  return {
    ok: true,
    thread: { id: thread.id, emailAccountId: thread.emailAccountId },
    account,
  };
}
