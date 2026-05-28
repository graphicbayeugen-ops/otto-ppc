import { Env } from "./types";

// Fetch a fresh OAuth2 access token (password grant). Cron runs are infrequent,
// so we simply get a new token each run instead of caching across invocations
// (Workers are stateless between invocations anyway).
//
// IMPORTANT: confirm OTTO_TOKEN_URL, grant type and field names against the
// current "API Integration for Sellers" docs before going live. This is the
// one part reconstructed from OTTO's OAuth2 flow rather than the reporting page.
export async function getToken(env: Env): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "password",
    username: env.OTTO_USERNAME,
    password: env.OTTO_PASSWORD,
  });
  const resp = await fetch(env.OTTO_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!resp.ok) {
    throw new Error(`token request failed: ${resp.status} ${await resp.text()}`);
  }
  const data = (await resp.json()) as { access_token: string };
  return data.access_token;
}
