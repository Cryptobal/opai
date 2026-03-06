/**
 * Access Control — Safe Query Helper
 *
 * Wraps Prisma operations for access_control schema tables.
 * If the migration hasn't been applied yet (P2021 "table does not exist"),
 * returns a sensible default instead of throwing a 500 error.
 */

import { Prisma } from "@prisma/client";

/**
 * Returns true when the error indicates the access_control tables
 * haven't been created yet (Prisma error P2021).
 */
export function isTableMissingError(error: unknown): boolean {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2021"
  ) {
    return true;
  }
  return false;
}

/**
 * Runs a Prisma query and returns a fallback value if the
 * access_control tables are missing.
 */
export async function safeAccessControlQuery<T>(
  queryFn: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await queryFn();
  } catch (error) {
    if (isTableMissingError(error)) {
      console.warn(
        "[AccessControl] Tables not yet created. Run `prisma migrate deploy` to apply the access_control migration.",
      );
      return fallback;
    }
    throw error;
  }
}
