import type { VercelRequest, VercelResponse } from "@vercel/node";
import { bodyField, guardMethod, readConfig, requestToken, sendJson } from "./_lib";

/**
 * POST /api/refresh  { "refresh_token": "..." }
 * Ravelry access tokens last 24h; the app trades its refresh token here.
 * Returns Ravelry's JSON response and status verbatim. Nothing is logged.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!guardMethod(req, res, "POST")) return;

  const config = readConfig();
  if (!config) {
    sendJson(res, 500, { error: "server_error" });
    return;
  }

  const refreshToken = bodyField(req, "refresh_token");
  if (!refreshToken) {
    sendJson(res, 400, {
      error: "invalid_request",
      error_description: "Missing 'refresh_token'.",
    });
    return;
  }

  const { status, body } = await requestToken(config, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  sendJson(res, status, body);
}
