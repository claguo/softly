import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  DEFAULT_SCOPE,
  RAVELRY_AUTHORIZE_URL,
  guardMethod,
  queryParam,
  readConfig,
  sendText,
} from "./_lib";

/**
 * GET /api/login?state=<opaque>&scope=<optional>
 * Redirects to Ravelry's authorize page. The app generates `state`; the broker
 * only passes it through, so it never has to remember anything per user.
 */
export default function handler(req: VercelRequest, res: VercelResponse): void {
  if (!guardMethod(req, res, "GET")) return;

  const config = readConfig();
  if (!config) {
    sendText(res, 500, "Server configuration error");
    return;
  }

  // Ravelry requires state on the authorize request.
  const state = queryParam(req, "state");
  if (!state) {
    sendText(res, 400, "Missing required query parameter: state");
    return;
  }

  const authorizeUrl = new URL(RAVELRY_AUTHORIZE_URL);
  authorizeUrl.searchParams.set("client_id", config.clientId);
  authorizeUrl.searchParams.set("redirect_uri", config.redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", queryParam(req, "scope") ?? DEFAULT_SCOPE);
  authorizeUrl.searchParams.set("state", state);

  res.setHeader("Cache-Control", "no-store");
  res.redirect(302, authorizeUrl.toString());
}
