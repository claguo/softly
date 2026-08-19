import type { VercelRequest, VercelResponse } from "@vercel/node";
import { bodyField, guardMethod, readConfig, requestToken, sendJson } from "./_lib";

/**
 * POST /api/token  { "code": "..." }
 * Exchanges an authorization code for tokens and returns Ravelry's JSON
 * response and status verbatim. Nothing is stored; nothing is logged.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!guardMethod(req, res, "POST")) return;

  const config = readConfig();
  if (!config) {
    sendJson(res, 500, { error: "server_error" });
    return;
  }

  const code = bodyField(req, "code");
  if (!code) {
    sendJson(res, 400, { error: "invalid_request", error_description: "Missing 'code'." });
    return;
  }

  // redirect_uri must be byte-identical to the one used on the authorize call.
  const { status, body } = await requestToken(config, {
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
  });

  sendJson(res, status, body);
}
