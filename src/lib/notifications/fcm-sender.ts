/**
 * FCM HTTP v1 sender for native Capacitor push tokens (android / ios).
 *
 * Lazy-inits firebase-admin from FIREBASE_SERVICE_ACCOUNT_JSON. When the
 * env var is missing (local/dev), every call is a no-op with a single warn —
 * same pattern as VAPID init in push-sender.ts.
 *
 * Invalid tokens (`registration-token-not-registered` / `invalid-registration-token`)
 * are marked `isActive: false` on PushToken (unique by token).
 */
import { prisma } from "@/lib/prisma";

let appInitialized = false;
let initWarned = false;
let messaging: import("firebase-admin/messaging").Messaging | null = null;

function truncateToken(token: string): string {
  return token.length <= 12 ? token : `${token.slice(0, 12)}…`;
}

async function getMessagingClient(): Promise<
  import("firebase-admin/messaging").Messaging | null
> {
  if (messaging) return messaging;
  if (appInitialized) return null;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    if (!initWarned) {
      console.warn(
        "[fcm-sender] FIREBASE_SERVICE_ACCOUNT_JSON not set — native push disabled",
      );
      initWarned = true;
    }
    appInitialized = true;
    return null;
  }

  try {
    const { initializeApp, getApps, cert } = await import("firebase-admin/app");
    const { getMessaging } = await import("firebase-admin/messaging");
    const sa = JSON.parse(raw) as {
      project_id?: string;
      client_email?: string;
      private_key?: string;
    };

    if (getApps().length === 0) {
      initializeApp({
        credential: cert({
          projectId: sa.project_id,
          clientEmail: sa.client_email,
          privateKey: sa.private_key,
        }),
      });
    }

    messaging = getMessaging();
    appInitialized = true;
    return messaging;
  } catch (err) {
    console.error("[fcm-sender] failed to init firebase-admin:", err);
    appInitialized = true;
    return null;
  }
}

const INVALID_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

export interface SendFcmParams {
  tokens: string[];
  title: string;
  body: string;
  url?: string;
  data?: Record<string, unknown>;
  notifKey: string;
}

/**
 * Sends a notification to the given FCM registration tokens via
 * `sendEachForMulticast`. Deactivates tokens that FCM reports as invalid.
 * Returns the number of successful deliveries.
 */
export async function sendFcmToTokens(p: SendFcmParams): Promise<number> {
  if (p.tokens.length === 0) return 0;

  const msg = await getMessagingClient();
  if (!msg) return 0;

  const dataPayload: Record<string, string> = {
    type: "system_notification",
    notifKey: p.notifKey,
  };
  if (p.url) dataPayload.url = p.url;
  if (p.data) {
    for (const [k, v] of Object.entries(p.data)) {
      if (v == null) continue;
      dataPayload[k] = typeof v === "string" ? v : JSON.stringify(v);
    }
  }

  let successCount = 0;
  // FCM multicast accepts at most 500 tokens per call.
  const CHUNK = 500;
  for (let i = 0; i < p.tokens.length; i += CHUNK) {
    const chunk = p.tokens.slice(i, i + CHUNK);
    try {
      const result = await msg.sendEachForMulticast({
        tokens: chunk,
        notification: {
          title: p.title,
          body: p.body,
        },
        data: dataPayload,
        android: {
          priority: "high",
        },
        apns: {
          payload: {
            aps: {
              sound: "default",
            },
          },
        },
      });

      successCount += result.successCount;

      const toDeactivate: string[] = [];
      result.responses.forEach((res, idx) => {
        if (res.success) return;
        const code = res.error?.code ?? "";
        if (INVALID_TOKEN_CODES.has(code)) {
          toDeactivate.push(chunk[idx]!);
        } else {
          console.error(
            `[fcm-sender] send failed token=${truncateToken(chunk[idx]!)} code=${code}`,
          );
        }
      });

      if (toDeactivate.length > 0) {
        await prisma.pushToken
          .updateMany({
            where: { token: { in: toDeactivate } },
            data: { isActive: false },
          })
          .catch((err) => {
            console.error("[fcm-sender] failed to deactivate tokens:", err);
          });
        console.warn(
          `[fcm-sender] deactivated ${toDeactivate.length} invalid token(s)`,
        );
      }
    } catch (err) {
      console.error("[fcm-sender] multicast error:", err);
    }
  }

  return successCount;
}
