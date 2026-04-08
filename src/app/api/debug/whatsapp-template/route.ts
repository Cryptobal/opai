import { NextRequest, NextResponse } from "next/server";
import Twilio from "twilio";

/**
 * Debug endpoint — consulta el Content Template de Twilio configurado en
 * TWILIO_WHATSAPP_CONTENT_SID y devuelve su estructura (variables esperadas,
 * tipos de contenido, etc). Útil para alinear los contentVariables que envía
 * `enviarAlertaWhatsApp` con lo que el template realmente espera.
 *
 * Uso: GET /api/debug/whatsapp-template
 * Protegido con un token simple ?t=opai-debug para no exponerlo.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("t");
  if (token !== "opai-debug") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const contentSid = process.env.TWILIO_WHATSAPP_CONTENT_SID;

  if (!accountSid || !authToken || !contentSid) {
    return NextResponse.json(
      {
        error: "Missing env",
        hasAccountSid: !!accountSid,
        hasAuthToken: !!authToken,
        hasContentSid: !!contentSid,
      },
      { status: 500 },
    );
  }

  try {
    const client = Twilio(accountSid, authToken);
    // @ts-ignore — twilio SDK no expone tipos de Content API todavía
    const content = await client.content.v1.contents(contentSid).fetch();
    // @ts-ignore
    const approvals = await client.content.v1
      .contents(contentSid)
      .approvalFetch()
      .catch((e: any) => ({ error: e?.message || String(e) }));

    return NextResponse.json({
      contentSid: contentSid.substring(0, 10) + "...",
      friendlyName: content.friendlyName,
      language: content.language,
      variables: content.variables,
      types: content.types,
      dateCreated: content.dateCreated,
      dateUpdated: content.dateUpdated,
      approvals,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: err?.message || String(err),
        code: err?.code,
        status: err?.status,
        moreInfo: err?.moreInfo,
      },
      { status: 500 },
    );
  }
}
