import { Env } from "./types";

// Fetch a fresh OAuth2 access token via the client_credentials grant.
// As of OTTO's API migration, sellers must create a "self-app" in OTTO Partner
// Connect to obtain client_id and client_secret; OTTO_USERNAME / OTTO_PASSWORD
// hold those values (variable names kept to avoid re-creating Cloudflare secrets).
export async function getToken(env: Env): Promise<string> {
  const credentials = btoa(`${env.OTTO_USERNAME}:${env.OTTO_PASSWORD}`);
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: "advertising-services",
  });
  const resp = await fetch(env.OTTO_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${credentials}`,
    },
    body,
  });
  if (!resp.ok) {
    throw new Error(`token request failed: ${resp.status} ${await resp.text()}`);
  }
  const data = (await resp.json()) as { access_token: string };
  return data.access_token;
}
