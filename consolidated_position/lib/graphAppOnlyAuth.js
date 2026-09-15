// lib/graphAppOnlyAuth.js
//
// Fully-automated (no user interaction) access to Microsoft Graph, using the
// app registration's own identity via the OAuth2 client-credentials grant.
// This requires an Entra ID admin to have granted the app registration
// Application permissions on Microsoft Graph (e.g. Sites.Read.All /
// Files.Read.All) with admin consent. Until that's done, token requests will
// either fail outright or succeed but be rejected by Graph with 403 — callers
// should treat both as "not ready yet" and fall back to the interactive,
// delegated (signed-in user) flow.
import "isomorphic-fetch";

let cachedToken = null; // { accessToken, expiresAt (unix seconds) }

async function requestAppOnlyToken() {
  const { AZURE_AD_TENANT_ID, AZURE_AD_CLIENT_ID, AZURE_AD_CLIENT_SECRET } = process.env;
  if (!AZURE_AD_TENANT_ID || !AZURE_AD_CLIENT_ID || !AZURE_AD_CLIENT_SECRET) {
    return null;
  }

  const url = `https://login.microsoftonline.com/${AZURE_AD_TENANT_ID}/oauth2/v2.0/token`;

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: AZURE_AD_CLIENT_ID,
        client_secret: AZURE_AD_CLIENT_SECRET,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    });
  } catch (err) {
    console.warn("[app-only auth] Token request errored:", err.message);
    return null;
  }

  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.access_token) {
    console.warn(
      "[app-only auth] Token request rejected:",
      data?.error,
      data?.error_description || response.statusText
    );
    return null;
  }

  return data;
}

// Returns a cached/fresh app-only access token, or null if the client
// credentials aren't configured / Entra ID rejected the request.
export async function getAppOnlyAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > now + 30) {
    return cachedToken.accessToken;
  }

  const data = await requestAppOnlyToken();
  if (!data) {
    cachedToken = null;
    return null;
  }

  cachedToken = {
    accessToken: data.access_token,
    expiresAt: now + (data.expires_in || 3600) - 30,
  };
  return cachedToken.accessToken;
}

// Call this after Graph rejects an app-only token (401/403) so the next
// request fetches a fresh one instead of reusing a bad/stale cached value.
export function invalidateAppOnlyToken() {
  cachedToken = null;
}
