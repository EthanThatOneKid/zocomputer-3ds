---
route: /zo-proxy
type: api
public: true
---

CORS proxy for the Zo 3DS app. Forwards requests to `https://api.zo.computer` and
adds CORS headers so the app (hosted on GitHub Pages) can call the Zo API.

```ts
const TARGET = 'https://api.zo.computer';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/zo-proxy/, '') || '/';
    const target = new URL(path + url.search, TARGET).toString();

    const response = await fetch(target, {
      method: request.method,
      headers: request.headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
    });

    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(CORS)) {
      headers.set(key, value);
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
```
