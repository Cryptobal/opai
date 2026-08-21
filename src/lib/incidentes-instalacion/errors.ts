import type { PublicErrorCode } from "./constants";

export class IncidenteError extends Error {
  readonly code: PublicErrorCode;
  readonly httpStatus: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: PublicErrorCode,
    message: string,
    httpStatus = 400,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "IncidenteError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

export function publicErrorResponse(err: IncidenteError) {
  return {
    success: false as const,
    error: err.message,
    code: err.code,
    ...(err.details ? { details: err.details } : {}),
  };
}
