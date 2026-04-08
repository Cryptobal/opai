import { NextRequest, NextResponse } from "next/server";
import Twilio from "twilio";

/**
 * Debug endpoint — consulta el Content Template de Twilio configurado en
 * TWILIO_WHATSAPP_CONTENT_SID y devuelve su estructura.
 *
 * Uso:
 *   GET /api/debug/whatsapp-template?t=opai-debug
 *     → fetch del template, devuelve estructura.
 *
 *   GET /api/debug/whatsapp-template?t=opai-debug&send=+56982307771
 *     → intenta ENVIAR el template al número dado con valores de prueba,
 *       devuelve el resultado o el error EXACTO de Twilio.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("t");
  if (token !== "opai-debug") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const contentSid = process.env.TWILIO_WHATSAPP_CONTENT_SID;
  const fromNumber = process.env.TWILIO_WHATSAPP_FROM;

  if (!accountSid || !authToken || !contentSid) {
    return NextResponse.json(
      {
        error: "Missing env",
        hasAccountSid: !!accountSid,
        hasAuthToken: !!authToken,
        hasContentSid: !!contentSid,
        hasFromNumber: !!fromNumber,
      },
      { status: 500 },
    );
  }

  const client = Twilio(accountSid, authToken);

  // Modo especial: listar Messaging Services del account
  if (request.nextUrl.searchParams.get("services") === "1") {
    try {
      const services = await client.messaging.v1.services.list({ limit: 20 });
      return NextResponse.json({
        services: services.map((s) => ({
          sid: s.sid,
          friendlyName: s.friendlyName,
          useCase: s.usecase,
          dateCreated: s.dateCreated,
        })),
      });
    } catch (err: any) {
      return NextResponse.json({ error: err?.message, code: err?.code }, { status: 500 });
    }
  }

  const send = request.nextUrl.searchParams.get("send");
  if (send) {
    if (!fromNumber) {
      return NextResponse.json(
        { error: "TWILIO_WHATSAPP_FROM not set" },
        { status: 500 },
      );
    }
    // Normalizar número: URL params encodean + como espacio, así que lo reponemos.
    // También aceptamos formato sin + (ej. "56982307771") y lo forzamos.
    const rawPhone = send.trim().replace(/^\s+/, "").replace(/\s+/g, "");
    let normalized = rawPhone;
    if (!normalized.startsWith("+") && !normalized.startsWith("whatsapp:")) {
      normalized = `+${normalized}`;
    }
    const to = normalized.startsWith("whatsapp:") ? normalized : `whatsapp:${normalized}`;
    const from = fromNumber.startsWith("whatsapp:")
      ? fromNumber
      : `whatsapp:${fromNumber}`;

    const variables = {
      "1": "test-token-debug",
      "2": "Cobertura Debug",
      "3": "Lo Fontecilla 201, Las Condes",
      "4": "jue 9 abr | 09:00 - 18:00",
      "5": "$30.000",
      "6": "Guardia de Seguridad (GGSS)",
      "7": "Test debug",
    };

    try {
      const msg = await client.messages.create({
        from,
        to,
        contentSid,
        contentVariables: JSON.stringify(variables),
      });
      return NextResponse.json({
        ok: true,
        messageSid: msg.sid,
        status: msg.status,
        from,
        to,
        variables,
      });
    } catch (err: any) {
      return NextResponse.json(
        {
          ok: false,
          error: err?.message,
          code: err?.code,
          status: err?.status,
          moreInfo: err?.moreInfo,
          details: err?.details,
          from,
          to,
          contentSidPrefix: contentSid.substring(0, 10),
          variables,
        },
        { status: 200 }, // 200 so user can read the JSON easily
      );
    }
  }

  // GET sin send → fetch del template
  try {
    // @ts-ignore
    const content = await client.content.v1.contents(contentSid).fetch();

    let approvals: unknown = null;
    try {
      // @ts-ignore
      const fetched = await client.content.v1.contents(contentSid).approvalFetch().fetch();
      approvals = fetched;
    } catch (e: any) {
      approvals = { error: e?.message || String(e), code: e?.code };
    }

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
