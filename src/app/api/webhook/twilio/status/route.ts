import { NextRequest, NextResponse } from "next/server";
import { findTenantIdByTwilioWhatsAppFrom } from "@/lib/twilio-config";

/**
 * Twilio WhatsApp status callback webhook.
 *
 * Twilio sends POST with form data when message status changes:
 * sent → delivered → read (or failed/undelivered).
 *
 * Configure in Twilio Console:
 *   Messaging → WhatsApp Sender → Status callback URL:
 *   {NEXT_PUBLIC_SITE_URL}/api/webhook/twilio/status (POST)
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const messageSid = formData.get("MessageSid") as string;
    const status = formData.get("MessageStatus") as string;
    const errorCode = formData.get("ErrorCode") as string | null;
    const to = formData.get("To") as string | null;
    const from = formData.get("From") as string | null;

    const tenantId = await findTenantIdByTwilioWhatsAppFrom(from);

    console.log(
      `[WhatsApp:Webhook] tenantId=${tenantId ?? "unknown"} SID=${messageSid}, Status=${status}, From=${from || "?"}, To=${to || "?"}, Error=${errorCode || "none"}`,
    );

    // Future: update OpsAlertaNotificacion with delivery status
    // Would need messageSid stored in the notification record

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[WhatsApp:Webhook] Error processing status callback:", error);
    return NextResponse.json({ received: true }, { status: 200 });
  }
}
