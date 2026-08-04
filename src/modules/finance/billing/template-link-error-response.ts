import { NextResponse } from "next/server";
import { TemplateLinkRequiredError } from "./inherit-template-link";

/** 400 accionable con opciones de programación para el selector v4.3. */
export function templateLinkRequiredResponse(error: TemplateLinkRequiredError) {
  return NextResponse.json(
    {
      success: false,
      error: error.message,
      code: error.code,
      options: error.options,
    },
    { status: 400 },
  );
}

export function isTemplateLinkRequiredError(
  error: unknown,
): error is TemplateLinkRequiredError {
  return error instanceof Error && error.name === "TemplateLinkRequiredError";
}
