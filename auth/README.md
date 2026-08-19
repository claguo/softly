# soft-goods-auth

Vercel serverless broker for Soft Goods' Ravelry OAuth 2.0 login.

Its only job is to hold the Ravelry **client secret** (which cannot ship inside a
mobile app) and to broker the code/token exchange. It has no database, no
session, and no state: it never stores user data, codes, or tokens, and never
logs them.

Zero runtime dependencies — Node built-ins and the global `fetch` only.
`@vercel/node`, `@types/node`, and `typescript` are devDependencies for types.

## Flow

1. App generates an opaque `state`, opens `GET /api/login?state=...` in a browser.
2. Broker 302s to Ravelry's authorize page.
3. User approves; Ravelry 302s to `GET /api/callback?code=...&state=...`.
4. Broker 302s to `softgoods://auth?code=...&state=...` (deep link back into the app).
5. App verifies `state` matches, then `POST /api/token {code}` to get tokens.
6. Later, `POST /api/refresh {refresh_token}` when the 24h access token expires.

The code — not the token — rides the deep link, so no credential is ever exposed
to the custom-scheme URL.

## Endpoints

| Method | Path            | In                             | Out |
| ------ | --------------- | ------------------------------ | --- |
| GET    | `/api/login`    | `state` (required), `scope` (optional, default `offline library-pdf`) | 302 to Ravelry authorize; 400 if `state` missing |
| GET    | `/api/callback` | `code` + `state`, or `error`   | 302 to `softgoods://auth?...` plus an HTML "Return to Soft Goods…" link fallback |
| POST   | `/api/token`    | JSON `{ "code": "..." }`       | Ravelry's token JSON + upstream status; 400 if `code` missing |
| POST   | `/api/refresh`  | JSON `{ "refresh_token": "..." }` | Ravelry's token JSON + upstream status; 400 if missing |

Other methods get `405`. `OPTIONS` gets a bare `204` — the caller is a native
app, so no CORS headers are granted to anyone. Token/refresh responses are
`Cache-Control: no-store`.

## Ravelry specifics

- Authorize: `https://www.ravelry.com/oauth2/auth`, `state` is **required**.
- Token: `https://www.ravelry.com/oauth2/token`. Client credentials **must** be
  sent as HTTP Basic auth (`client_id:client_secret`) in the `Authorization`
  header. Body/form auth is not supported and will fail.
- Access tokens expire in 24h. The `offline` scope is what yields refresh tokens.

## Environment variables

Set all three in the Vercel project (Production + Preview) — see `.env.example`.

- `RAVELRY_CLIENT_ID`
- `RAVELRY_CLIENT_SECRET`
- `BASE_URL` — public origin of this deployment, no trailing slash
  (e.g. `https://softgoods-auth.vercel.app`)

If any is unset, every endpoint returns a generic `500` and logs the missing
names server-side.

## Deploy

From the repo root, treating `auth/` as its own Vercel project (zero-config: no
`vercel.json` needed, `api/*.ts` is detected as Node functions):

```sh
vercel --cwd auth               # preview
vercel --cwd auth --prod        # production

vercel env add RAVELRY_CLIENT_ID production --cwd auth
vercel env add RAVELRY_CLIENT_SECRET production --cwd auth
vercel env add BASE_URL production --cwd auth
```

**Register this redirect URI in the Ravelry app settings** (Ravelry > Pro > Apps),
exactly, with no trailing slash:

```
${BASE_URL}/api/callback
```

e.g. `https://softgoods-auth.vercel.app/api/callback`. It must match byte-for-byte
between the Ravelry app settings, `/api/login`, and `/api/token`, or the exchange
fails. A preview deployment with a different `BASE_URL` needs its own registered
redirect URI.

## Local checks

```sh
cd auth
npm install
npm run typecheck
```
