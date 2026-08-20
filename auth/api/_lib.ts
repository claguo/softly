import type { VercelRequest, VercelResponse } from "@vercel/node";

export const RAVELRY_AUTHORIZE_URL = "https://www.ravelry.com/oauth2/auth";
export const RAVELRY_TOKEN_URL = "https://www.ravelry.com/oauth2/token";

/** Scopes Softly needs: "offline" is what makes Ravelry issue refresh tokens. */
export const DEFAULT_SCOPE = "offline library-pdf";

/** Deep link back into the Expo app (app.json -> expo.scheme = "softly"). */
export const APP_DEEP_LINK = "softly://auth";

export interface Config {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  /** Must match the redirect URI registered in the Ravelry app settings. */
  redirectUri: string;
}

/**
 * Reads and validates configuration. Returns null when anything is missing so
 * callers can fail fast with a generic 500 (details go to the server log only).
 */
export function readConfig(): Config | null {
  const clientId = process.env.RAVELRY_CLIENT_ID;
  const clientSecret = process.env.RAVELRY_CLIENT_SECRET;
  // Trailing slashes would produce "//api/callback", which no longer matches
  // the redirect URI registered with Ravelry.
  const baseUrl = process.env.BASE_URL?.trim().replace(/\/+$/, "");

  if (!clientId || !clientSecret || !baseUrl) {
    const missing = [
      !clientId && "RAVELRY_CLIENT_ID",
      !clientSecret && "RAVELRY_CLIENT_SECRET",
      !baseUrl && "BASE_URL",
    ].filter(Boolean);
    console.error(`auth broker misconfigured; missing env: ${missing.join(", ")}`);
    return null;
  }

  return {
    clientId,
    clientSecret,
    baseUrl,
    redirectUri: `${baseUrl}/api/callback`,
  };
}

/**
 * Ravelry's token endpoint accepts client credentials ONLY via HTTP Basic auth.
 * Passing client_id/client_secret in the form body ("body auth") is rejected.
 */
export function basicAuthHeader(clientId: string, clientSecret: string): string {
  const encoded = Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64");
  return `Basic ${encoded}`;
}

export function sendText(res: VercelResponse, status: number, body: string): void {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.status(status).send(body);
}

export function sendHtml(res: VercelResponse, status: number, body: string): void {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(status).send(body);
}

/** JSON responses here always carry credentials, so they are never cacheable. */
export function sendJson(res: VercelResponse, status: number, body: unknown): void {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.status(status).send(JSON.stringify(body));
}

/**
 * Returns true when the request may proceed. Answers OPTIONS with a bare 204 --
 * the mobile app is native and needs no CORS grant, so no Access-Control-*
 * headers are ever emitted.
 */
export function guardMethod(
  req: VercelRequest,
  res: VercelResponse,
  allowed: "GET" | "POST"
): boolean {
  if (req.method === allowed) return true;

  res.setHeader("Allow", `${allowed}, OPTIONS`);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return false;
  }

  sendText(res, 405, "Method Not Allowed");
  return false;
}

/** First non-empty value of a query parameter, or undefined. */
export function queryParam(req: VercelRequest, name: string): string | undefined {
  const raw = req.query[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Non-empty string field from a JSON request body, or undefined. */
export function bodyField(req: VercelRequest, name: string): string | undefined {
  const body = parseBody(req.body);
  if (!body) return undefined;
  const value = body[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function parseBody(raw: unknown): Record<string, unknown> | undefined {
  // Vercel pre-parses application/json; anything else arrives as string/Buffer.
  let candidate = raw;
  if (Buffer.isBuffer(candidate)) candidate = candidate.toString("utf8");
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return undefined;
    }
  }
  return typeof candidate === "object" && candidate !== null
    ? (candidate as Record<string, unknown>)
    : undefined;
}

export interface UpstreamResult {
  status: number;
  body: unknown;
}

/**
 * Posts a grant to Ravelry's token endpoint and hands back the parsed JSON and
 * upstream status untouched. Nothing here is logged: params and responses
 * contain codes and tokens.
 */
export async function requestToken(
  config: Config,
  params: Record<string, string>
): Promise<UpstreamResult> {
  let response: Response;
  try {
    response = await fetch(RAVELRY_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(config.clientId, config.clientSecret),
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams(params).toString(),
    });
  } catch {
    return { status: 502, body: { error: "upstream_unreachable" } };
  }

  const raw = await response.text();
  try {
    return { status: response.status, body: JSON.parse(raw) as unknown };
  } catch {
    // Non-JSON upstream reply (HTML error page, gateway failure). Don't forward
    // it verbatim -- clients of this broker only ever expect JSON.
    return {
      status: response.ok ? 502 : response.status,
      body: { error: "upstream_error" },
    };
  }
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Query values are attacker-controllable; escape before HTML interpolation. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}
