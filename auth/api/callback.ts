import type { VercelRequest, VercelResponse } from "@vercel/node";
import { APP_DEEP_LINK, escapeHtml, guardMethod, queryParam } from "./_lib";

/**
 * GET /api/callback -- Ravelry's redirect target.
 * Hands `code` + `state` back to the app over the deep link and stops there.
 * The code is exchanged by the app via POST /api/token, so an access token
 * never travels on a custom-scheme URL.
 */
export default function handler(req: VercelRequest, res: VercelResponse): void {
  if (!guardMethod(req, res, "GET")) return;

  const error = queryParam(req, "error");
  const code = queryParam(req, "code");
  const state = queryParam(req, "state");

  // Percent-encoded rather than form-encoded: a "+" would survive a
  // decodeURIComponent on the app side and corrupt the state comparison.
  const params: string[] = [];
  const add = (key: string, value: string) => params.push(`${key}=${encodeURIComponent(value)}`);

  if (error) {
    add("error", error);
  } else if (code && state) {
    add("code", code);
    add("state", state);
  } else {
    // User denied, or Ravelry sent something we can't act on.
    add("error", "invalid_request");
  }

  const deepLink = `${APP_DEEP_LINK}?${params.join("&")}`;
  const safeLink = escapeHtml(deepLink);

  // Body fallback for browsers that refuse to auto-follow a custom scheme.
  const html = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Softly</title>
<body style="font-family: system-ui, sans-serif; margin: 3rem auto; max-width: 32rem; padding: 0 1rem; text-align: center;">
<p>Return to Softly&hellip;</p>
<p><a href="${safeLink}">Open Softly</a></p>
</body>
</html>`;

  res.setHeader("Location", deepLink);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(302).send(html);
}
