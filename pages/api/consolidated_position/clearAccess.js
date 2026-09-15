// pages/api/clearAccess.js
import { clearAccessCookie } from "../../../consolidated_position/lib/accessGate";

export default function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ message: "Method not allowed" });
  }
  clearAccessCookie(res);
  return res.status(200).json({ success: true });
}
