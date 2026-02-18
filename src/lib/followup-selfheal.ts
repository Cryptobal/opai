/**
 * Self-healing: triggers follow-up email processing when overdue follow-ups
 * are detected during normal page loads (Hub, deals page).
 *
 * This is a BACKUP mechanism. The primary trigger is the Vercel Cron job
 * (/api/cron/followup-emails). If the cron fails or is delayed, this
 * ensures follow-ups still get sent the next time a user loads the Hub.
 *
 * - Fire-and-forget: does NOT block page rendering.
 * - Rate-limited: max once every 5 minutes per warm serverless instance.
 * - Server-side only: never exposed to the client.
 */

let lastTriggerMs = 0;
const COOLDOWN_MS = 5 * 60 * 1000; // 5 min

/**
 * If there are overdue follow-ups, fire a non-blocking request to the
 * cron endpoint so they get processed immediately.
 */
export function triggerFollowUpProcessing(): void {
  const now = Date.now();
  if (now - lastTriggerMs < COOLDOWN_MS) return;
  lastTriggerMs = now;

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.warn(
      "[followup-selfheal] CRON_SECRET not set — skipping self-heal trigger",
    );
    return;
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

  fetch(`${baseUrl}/api/cron/followup-emails`, {
    method: "GET",
    headers: { Authorization: `Bearer ${cronSecret}` },
  }).catch((err) => {
    console.warn(
      "[followup-selfheal] Failed to trigger processing:",
      err?.message,
    );
  });
}
