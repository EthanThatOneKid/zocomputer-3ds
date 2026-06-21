---
route: /zo-proxy
type: api
public: true
---

CORS proxy for the Zo 3DS app. Forwards requests to `https://api.zo.computer` and
adds CORS headers so the app (hosted on GitHub Pages) can call the Zo API.

> **Auth note:** Zo's edge strips the inbound `Authorization` header before this
> handler runs, so the client mirrors the API key into `X-Zo-Api-Key` (a custom
> header that survives the edge). This handler translates it back into
> `Authorization: Bearer ...` for the upstream Zo API.

```ts
import type { Context } from "hono";

const TARGET = "https://api.zo.computer";
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PUT, PATCH, DELETE, HEAD",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Zo-Api-Key",
  "Access-Control-Max-Age": "86400",
};

const BLOCKED_REQUEST_HEADERS = new Set([
  "host",
  "content-length",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
]);

function buildUpstreamHeaders(request: Request): Headers {
  const headers = new Headers(request.headers);
  for (const headerName of BLOCKED_REQUEST_HEADERS) {
    headers.delete(headerName);
  }
  // Zo's edge strips the inbound "Authorization" header before this handler runs,
  // so authenticated requests arrive with no auth. The client mirrors the key into
  // "X-Zo-Api-Key" (a custom header that survives the edge). Translate it back into
  // "Authorization: Bearer ..." for the upstream Zo API, and drop the custom header
  // so it does not leak to the origin.
  const apiKey = headers.get("x-zo-api-key");
  if (apiKey) {
    headers.set("Authorization", `Bearer ${apiKey.replace(/^Bearer\s+/i, "").trim()}`);
    headers.delete("x-zo-api-key");
  }
  return headers;
}

export default async function handle(c: Context): Promise<Response> {
  if (c.req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const request = c.req.raw;
  const url = new URL(request.url);
  const upstreamPath = url.searchParams.get("path") ?? "/";
  const path = upstreamPath.startsWith("/") ? upstreamPath : `/${upstreamPath}`;
  const target = new URL(path + url.search, TARGET);
  target.searchParams.delete("path");

  const upstream = await fetch(target, {
    method: request.method,
    headers: buildUpstreamHeaders(request),
    body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
  });

  const headers = new Headers(upstream.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}
```
