// lib/accessGate.js
//
// Shared-password gate shown after Microsoft sign-in. The password itself is
// never sent to the browser or stored in a cookie — instead we derive a
// token from it (HMAC'd with NEXTAUTH_SECRET) and store that token in an
// HttpOnly cookie. Changing APP_ACCESS_PASSWORD automatically invalidates
// every existing cookie.
import crypto from "crypto";

export const ACCESS_COOKIE_NAME = "sc_access";
const ACCESS_COOKIE_MAX_AGE = 60 * 60 * 12; // 12 hours

export function getExpectedAccessToken() {
  const password = process.env.APP_ACCESS_PASSWORD;
  const secret = process.env.NEXTAUTH_SECRET;
  if (!password || !secret) return null;
  return crypto.createHmac("sha256", secret).update(password).digest("hex");
}

function serializeCookie(name, value, maxAge) {
  const parts = [`${name}=${value}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (typeof maxAge === "number") parts.push(`Max-Age=${maxAge}`);
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

export function setAccessCookie(res, token) {
  res.setHeader("Set-Cookie", serializeCookie(ACCESS_COOKIE_NAME, token, ACCESS_COOKIE_MAX_AGE));
}

export function clearAccessCookie(res) {
  res.setHeader("Set-Cookie", serializeCookie(ACCESS_COOKIE_NAME, "", 0));
}
