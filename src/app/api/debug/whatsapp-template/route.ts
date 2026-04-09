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

  // Modo: listar admins del tenant con su phone
  if (request.nextUrl.searchParams.get("currentAdmin") === "1") {
    try {
      const { prisma } = await import("@/lib/prisma");
      const admins = await prisma.admin.findMany({
        take: 20,
        select: { id: true, name: true, email: true, phone: true, role: true, tenantId: true },
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json({ count: admins.length, admins });
    } catch (err: any) {
      return NextResponse.json({ error: err?.message }, { status: 500 });
    }
  }

  // Modo: dispara el template cobertura_resuelta al phone del admin indicado
  if (request.nextUrl.searchParams.get("adminAccepted")) {
    const adminId = request.nextUrl.searchParams.get("adminAccepted")!;
    const tmplAceptSid = process.env.TWILIO_WHATSAPP_CONTENT_SID_ACEPTACION?.trim();
    if (!tmplAceptSid) {
      return NextResponse.json({ error: "TWILIO_WHATSAPP_CONTENT_SID_ACEPTACION not set" });
    }
    try {
      const { prisma } = await import("@/lib/prisma");
      const admin = await prisma.admin.findUnique({
        where: { id: adminId },
        select: { id: true, name: true, phone: true, email: true },
      });
      if (!admin) return NextResponse.json({ error: "Admin not found" });

      // Misma lógica que notificarSupervisorAceptacion: Admin.phone → OpsPersona.phoneMobile
      let tel = admin.phone?.trim() || null;
      if (!tel && admin.email) {
        const persona = await prisma.opsPersona.findFirst({
          where: {
            OR: [
              { email: admin.email },
              { personalEmail: admin.email },
            ],
          },
          select: { phoneMobile: true, phone: true, firstName: true, lastName: true },
        });
        tel = persona?.phoneMobile?.trim() || persona?.phone?.trim() || null;
      }
      if (!tel) {
        return NextResponse.json({
          error: "Admin no tiene phone y no se encontró OpsPersona con ese email",
          admin,
        });
      }

      // Normalizar
      let normalized = tel;
      if (!normalized.startsWith("+") && !normalized.startsWith("whatsapp:")) {
        if (/^9\d{8}$/.test(normalized)) normalized = `+56${normalized}`;
        else if (/^56\d{9}$/.test(normalized)) normalized = `+${normalized}`;
        else normalized = `+${normalized}`;
      }

      const from = fromNumber?.startsWith("whatsapp:") ? fromNumber : `whatsapp:${fromNumber}`;
      const msSid = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim();
      const to = `whatsapp:${normalized}`;
      const createParams: Record<string, string> = {
        to,
        contentSid: tmplAceptSid,
        contentVariables: JSON.stringify({
          "1": "Carlos Cristobal Irigoyen Garces",
          "2": "Cobertura — Las Condes (TEST)",
          "3": "jue 9 abr | 09:00 - 18:00",
          "4": "+56982307771",
        }),
      };
      if (msSid) createParams.messagingServiceSid = msSid;
      else createParams.from = from!;

      try {
        const msg = await client.messages.create(createParams as any);
        return NextResponse.json({
          ok: true,
          admin,
          to,
          messageSid: msg.sid,
          status: msg.status,
          templateSid: tmplAceptSid.substring(0, 10) + "...",
          strategy: msSid ? "messagingService" : "from",
        });
      } catch (twErr: any) {
        return NextResponse.json({
          ok: false,
          admin,
          to,
          error: twErr?.message,
          code: twErr?.code,
          moreInfo: twErr?.moreInfo,
          details: twErr?.details,
          templateSid: tmplAceptSid.substring(0, 10) + "...",
          createParams,
        });
      }
    } catch (err: any) {
      return NextResponse.json({ error: err?.message }, { status: 500 });
    }
  }

  // Modo: enviar via REST directo (no SDK) para ver el error CRUDO de Twilio
  // ?rawSend=1&phone=56982307771[&msgService=MG...][&useTemplate=1]
  if (request.nextUrl.searchParams.get("rawSend") === "1") {
    const phone = (request.nextUrl.searchParams.get("phone") || "").trim();
    const msgServiceSid = request.nextUrl.searchParams.get("msgService");
    const useTemplate = request.nextUrl.searchParams.get("useTemplate") === "1";

    let normalized = phone.replace(/\s+/g, "");
    if (!normalized.startsWith("+")) normalized = `+${normalized}`;
    const to = `whatsapp:${normalized}`;

    const params = new URLSearchParams();
    params.append("To", to);
    if (msgServiceSid) {
      params.append("MessagingServiceSid", msgServiceSid);
    } else {
      const from = fromNumber!.startsWith("whatsapp:") ? fromNumber! : `whatsapp:${fromNumber!}`;
      params.append("From", from);
    }
    if (useTemplate) {
      params.append("ContentSid", contentSid);
      params.append(
        "ContentVariables",
        JSON.stringify({
          "1": "test-token-debug",
          "2": "Cobertura Debug",
          "3": "Lo Fontecilla 201, Las Condes",
          "4": "jue 9 abr | 09:00 - 18:00",
          "5": "$30.000",
          "6": "Guardia de Seguridad (GGSS)",
          "7": "Test debug",
        }),
      );
    } else {
      params.append("Body", "OPAI debug — test simple sin template");
    }

    try {
      const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params.toString(),
        },
      );
      const text = await res.text();
      let json: unknown;
      try { json = JSON.parse(text); } catch { json = text; }
      return NextResponse.json({
        httpStatus: res.status,
        sentParams: Object.fromEntries(params.entries()),
        body: json,
      });
    } catch (err: any) {
      return NextResponse.json({ error: err?.message }, { status: 500 });
    }
  }

  // Modo especial: listar Messaging Services del account
  if (request.nextUrl.searchParams.get("services") === "1") {
    try {
      const services = await client.messaging.v1.services.list({ limit: 20 });
      // Para cada servicio, también listar los phone numbers asociados
      const detailed = await Promise.all(
        services.map(async (s) => {
          let phones: unknown = [];
          try {
            const pns = await client.messaging.v1.services(s.sid).phoneNumbers.list({ limit: 10 });
            phones = pns.map((p) => ({ sid: p.sid, phoneNumber: p.phoneNumber, capabilities: p.capabilities }));
          } catch {}
          return {
            sid: s.sid,
            friendlyName: s.friendlyName,
            useCase: s.usecase,
            dateCreated: s.dateCreated,
            phones,
          };
        }),
      );
      return NextResponse.json({ services: detailed });
    } catch (err: any) {
      return NextResponse.json({ error: err?.message, code: err?.code }, { status: 500 });
    }
  }

  // Modo especial: listar WhatsApp channel senders del account (vía REST directo,
  // el SDK de Twilio no expone bien este recurso).
  if (request.nextUrl.searchParams.get("waSenders") === "1") {
    try {
      const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
      const res = await fetch(
        `https://messaging.twilio.com/v2/Channels/Senders?Channel=whatsapp`,
        { headers: { Authorization: `Basic ${auth}` } },
      );
      const json = await res.json();
      return NextResponse.json({ status: res.status, body: json });
    } catch (err: any) {
      return NextResponse.json({ error: err?.message }, { status: 500 });
    }
  }

  // Modo especial: asociar un WhatsApp sender (SID XE...) a un Messaging Service existente
  //   ?attachSender=1&serviceSid=MG...&senderSid=XE...
  if (request.nextUrl.searchParams.get("attachSender") === "1") {
    const serviceSid = request.nextUrl.searchParams.get("serviceSid");
    const senderSid = request.nextUrl.searchParams.get("senderSid");
    if (!serviceSid || !senderSid) {
      return NextResponse.json(
        { error: "Missing serviceSid or senderSid" },
        { status: 400 },
      );
    }
    try {
      const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
      const res = await fetch(
        `https://messaging.twilio.com/v1/Services/${serviceSid}/ChannelSenders`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ Sid: senderSid }).toString(),
        },
      );
      const json = await res.json();
      return NextResponse.json({ status: res.status, body: json });
    } catch (err: any) {
      return NextResponse.json({ error: err?.message }, { status: 500 });
    }
  }

  // Modo especial: crear un Messaging Service nuevo y asociar el número WhatsApp
  if (request.nextUrl.searchParams.get("createService") === "1") {
    try {
      // 1) Crear el servicio
      const service = await client.messaging.v1.services.create({
        friendlyName: "OPAI Alertas Cobertura",
      });

      // 2) Encontrar el IncomingPhoneNumber que corresponde al WhatsApp sender
      const wa = fromNumber?.replace("whatsapp:", "") || "";
      const incomings = await client.incomingPhoneNumbers.list({ limit: 50 });
      const match = incomings.find((p) => p.phoneNumber === wa);

      let addedSid: string | null = null;
      let addError: string | null = null;
      if (match) {
        try {
          const added = await client.messaging.v1
            .services(service.sid)
            .phoneNumbers.create({ phoneNumberSid: match.sid });
          addedSid = added.sid;
        } catch (e: any) {
          addError = e?.message || String(e);
        }
      }

      return NextResponse.json({
        created: true,
        messagingServiceSid: service.sid,
        friendlyName: service.friendlyName,
        whatsappNumber: wa,
        whatsappMatched: !!match,
        addedSid,
        addError,
        nextStep: `Agregar en Vercel env: TWILIO_MESSAGING_SERVICE_SID=${service.sid}`,
      });
    } catch (err: any) {
      return NextResponse.json(
        { error: err?.message, code: err?.code, moreInfo: err?.moreInfo },
        { status: 500 },
      );
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

    // Si se pasa ?msgService=MG..., usa ese Messaging Service en vez de `from`
    const msgServiceSid = request.nextUrl.searchParams.get("msgService");

    try {
      const createParams: Record<string, unknown> = {
        to,
        contentSid,
        contentVariables: JSON.stringify(variables),
      };
      if (msgServiceSid) {
        createParams.messagingServiceSid = msgServiceSid;
      } else {
        createParams.from = from;
      }

      const msg = await client.messages.create(createParams as any);
      return NextResponse.json({
        ok: true,
        messageSid: msg.sid,
        status: msg.status,
        strategy: msgServiceSid ? "messagingService" : "from",
        from: msgServiceSid ? undefined : from,
        messagingServiceSid: msgServiceSid || undefined,
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
          strategy: msgServiceSid ? "messagingService" : "from",
          from: msgServiceSid ? undefined : from,
          messagingServiceSid: msgServiceSid || undefined,
          to,
          contentSidPrefix: contentSid.substring(0, 10),
          variables,
        },
        { status: 200 },
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
