/**
 * Indeed Job Sync API Service
 *
 * Implements (scaffold):
 * 1. OAuth 2.0 (3-legged) for tenant authorization
 * 2. Job Sync API (GraphQL) for createSourcedJobPostings / expire
 * 3. Indeed Apply webhook for receiving applications
 * 4. Disposition Sync for sending candidate status updates back to Indeed
 *
 * References:
 * - https://docs.indeed.com/job-sync-api/job-sync-api-guide
 * - https://docs.indeed.com/indeed-apply/ats
 * - https://developer.indeed.com/docs/become-a-partner
 *
 * Required env vars:
 * - INDEED_CLIENT_ID
 * - INDEED_CLIENT_SECRET
 * - INDEED_REDIRECT_URI
 * - INDEED_APPLY_API_KEY
 * - INDEED_APPLY_API_SECRET
 */

export const INDEED_AUTH_URL = "https://secure.indeed.com/oauth/v2/authorize";
export const INDEED_TOKEN_URL = "https://apis.indeed.com/oauth/v2/tokens";
export const INDEED_GRAPHQL_URL = "https://apis.indeed.com/graphql";

const SCOPES = [
  "employer_access",
  "job_posting_read",
  "job_posting_write",
].join(" ");

/** Generate OAuth authorization URL for a tenant to connect their Indeed account. */
export function getIndeedAuthUrl(tenantId: string): string {
  const params = new URLSearchParams({
    client_id: process.env.INDEED_CLIENT_ID || "",
    redirect_uri: process.env.INDEED_REDIRECT_URI || "",
    response_type: "code",
    scope: SCOPES,
    state: tenantId,
  });
  return `${INDEED_AUTH_URL}?${params.toString()}`;
}

/** Exchange authorization code for access/refresh tokens. */
export async function exchangeIndeedCode(
  code: string,
  tenantId: string,
): Promise<{ success: boolean; error?: string }> {
  // TODO: POST to INDEED_TOKEN_URL with code, client_id, client_secret, redirect_uri.
  // TODO: Persist encrypted tokens in IndeedIntegration model.
  console.log(
    `[Indeed] Token exchange for tenant ${tenantId} (code=${code.slice(0, 6)}...) - TODO`,
  );
  return { success: false, error: "not_implemented" };
}

/** Create/upsert a job posting via Job Sync API (GraphQL). */
export async function syncJobToIndeed(
  jobPostingId: string,
  tenantId: string,
): Promise<{ success: boolean; externalId?: string; error?: string }> {
  // TODO: GraphQL mutation createSourcedJobPostings using OAuth token.
  console.log(`[Indeed] Sync job ${jobPostingId} for tenant ${tenantId} - TODO`);
  return { success: false, error: "not_implemented" };
}

/** Expire a job posting on Indeed. */
export async function expireJobOnIndeed(
  jobPostingId: string,
  tenantId: string,
): Promise<{ success: boolean; error?: string }> {
  console.log(`[Indeed] Expire job ${jobPostingId} for tenant ${tenantId} - TODO`);
  return { success: false, error: "not_implemented" };
}

/** Handle Indeed Apply webhook payload. */
export interface IndeedApplyPayload {
  jobId: string;
  applicant: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    resume?: string;
  };
}

export async function handleIndeedApplication(
  payload: IndeedApplyPayload,
): Promise<{ success: boolean; error?: string }> {
  // TODO: Map Indeed applicant to AtsApplication; deduplicate (job + email within 120d).
  console.log(`[Indeed] Application received for job ${payload.jobId} - TODO`);
  return { success: false, error: "not_implemented" };
}

/** Send candidate status update back to Indeed (Disposition Sync). */
export async function syncDispositionToIndeed(
  applicationId: string,
  status: string,
): Promise<{ success: boolean; error?: string }> {
  console.log(
    `[Indeed] Disposition sync for application ${applicationId} (${status}) - TODO`,
  );
  return { success: false, error: "not_implemented" };
}
