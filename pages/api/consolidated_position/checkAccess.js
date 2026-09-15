// pages/api/checkAccess.js
import { ACCESS_COOKIE_NAME, getExpectedAccessToken } from "../../../consolidated_position/lib/accessGate";

export default function handler(req, res) {
  const expectedToken = getExpectedAccessToken();
  const cookieValue = req.cookies?.[ACCESS_COOKIE_NAME];
  const hasAccess = Boolean(expectedToken) && cookieValue === expectedToken;
  return res.status(200).json({ hasAccess });
}
