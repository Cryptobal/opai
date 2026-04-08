import { NextResponse } from "next/server";

/**
 * Unified Google OAuth entry point for the personal (Opai) app.
 *
 * Redirects to Google's consent screen. The callback at
 * /api/portal/auth/unified-google/callback resolves which role the Google
 * email corresponds to (guardia / supervisor / cliente) and creates the
 * appropriate session.
 *
 * Registered redirect URI (must match in Google Cloud Console):
 *   https://www.opai.cl/api/portal/auth/unified-google/callback
 */
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const baseUrl =
    process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "";
  const redirectUri = `${baseUrl}/api/portal/auth/unified-google/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    prompt: "select_account",
    state: "portal_personal",
  });

  return NextResponse.redirect(`${GOOGLE_AUTH_URL}?${params}`);
}
