// pages/api/verifyPassword.js
import { getExpectedAccessToken, setAccessCookie } from "../../../consolidated_position/lib/accessGate";

export default function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ message: "Method not allowed" });
  }

  const expectedToken = getExpectedAccessToken();
  if (!expectedToken) {
    console.error("APP_ACCESS_PASSWORD or NEXTAUTH_SECRET is not set in the environment.");
    return res.status(500).json({ message: "Access control is not configured on the server." });
  }

  const { password } = req.body || {};
  if (typeof password !== "string" || password !== process.env.APP_ACCESS_PASSWORD) {
    return res.status(401).json({ message: "Incorrect password. Please try again." });
  }

  setAccessCookie(res, expectedToken);
  return res.status(200).json({ success: true });
}
