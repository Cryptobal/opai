/**
 * Verifica un token de Cloudflare Turnstile contra el endpoint oficial.
 *
 * Si TURNSTILE_SECRET_KEY no está seteada (ej. dev local), bypass con true
 * y log de warning. En producción la validación es estricta.
 *
 * Docs: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */
export interface TurnstileVerifyResult {
  success: boolean;
  errorCodes?: string[];
  hostname?: string;
}

export async function verifyTurnstileToken(
  token: string,
  remoteIp?: string,
): Promise<TurnstileVerifyResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  if (!secret) {
    console.warn("[turnstile] TURNSTILE_SECRET_KEY no configurada — bypass en dev");
    return { success: true };
  }

  if (!token || token.length < 10) {
    return { success: false, errorCodes: ["missing-input-response"] };
  }

  const formData = new FormData();
  formData.append("secret", secret);
  formData.append("response", token);
  if (remoteIp) formData.append("remoteip", remoteIp);

  try {
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body: formData },
    );
    const data = (await res.json()) as {
      success: boolean;
      "error-codes"?: string[];
      hostname?: string;
    };
    return {
      success: data.success === true,
      errorCodes: data["error-codes"],
      hostname: data.hostname,
    };
  } catch (error) {
    console.error("[turnstile] verify failed:", error);
    return { success: false, errorCodes: ["network-error"] };
  }
}
