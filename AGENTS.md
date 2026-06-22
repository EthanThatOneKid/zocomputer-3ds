# Agent Instructions — zocomputer-3ds

## Project Goal
Simplified demake of the Zo Computer interface (https://zo.computer) that runs on the Nintendo 3DS browser and desktop browsers, then connects to the Zo MCP server via opencode.

## Target Audience
Old 3DS (original model) and New 3DS (New Nintendo 3DS / New 3DS XL). These two models have **different browsers** with very different capabilities — code must work on the intersection or detect which model is running.

## Deployment
- **URL:** `http://zocomputer-3ds.etok.me` (HTTP only — GitHub Pages)
- **API:** Zo Computer at `https://api.zo.computer` (no CORS headers)
- **Build target:** ES5 (tsconfig.json + vite.config.ts), only stdlib deps

## Hardware Overview

| Spec | Old 3DS | New 3DS |
|------|---------|---------|
| CPU | 268 MHz ARM11 | 804 MHz ARM11 dual-core |
| RAM | 128 MB (shared system+GPU) | 256 MB (shared system+GPU) |
| Top screen | 400×240 | 400×240 |
| Bottom screen | 320×240 (touch) | 320×240 (touch) |

Memory is tight — large images, multiple `<canvas>` buffers, or heavy DOM trees trigger **"Page too large"** errors. Keep assets small and DOM lean.

## Browser Engines

| | Old 3DS | New 3DS |
|--|---------|---------|
| **Browser name** | Netfront Browser | Netfront Browser NX v3.0 |
| **UA string** | `Mozilla/5.0 (Nintendo 3DS; U: en) Version/1.7498 US` | `Mozilla/5.0 (New Nintendo 3DS like iPhone) AppleWebKit/536.30 (KHTML, like Gecko) NX` |
| **WebKit version** | Pre-Chromium, proprietary | ≈ Safari 6.0 (WebKit 536.30) |

## Web Standards Support

| Feature | Old 3DS | New 3DS |
|---------|---------|---------|
| HTML | HTML 4.01, XHTML 1.1 | HTML 4.01, **HTML5**, XHTML 1.1 |
| JavaScript | ES3 (no ES6+, no classes, no arrow functions) | **ES5+** (supports ES6 features like arrow functions, `const`/`let`, classes) |
| CSS | CSS 1, CSS 2.1, CSS 3 (partial) | CSS 1, CSS 2.1, **CSS 3** (flex, grid, border-radius, transitions, transforms, `box-sizing`) |
| **SVG** | **No** | **Yes** |
| **`<canvas>`** | 2D context | 2D context |
| **WebSocket** | No | **Yes** |
| **SSE** | No | **Yes** |
| **Web Workers** | No | No |
| **WebGL** | No | No |
| **Gamepad API** | No | Listed (unreliable on real hardware) |
| **Geolocation** | No | No |
| **Video** | No | H.264 MP4 / HLS |
| **Audio** | No official browser audio | AAC, MP3 via `<audio>` or `Audio()` |
| **localStorage** | Volatile (cleared on power-off) | Volatile (cleared on power-off) |
| **Cookies** | Yes | Yes |
| **WOFF** | No | Yes |

## JavaScript — What Works

### Both models
- `var`, function declarations
- Basic DOM: `getElementById`, `createElement`, `textContent`, `style.display`, `classList`, `innerHTML`
- `XMLHttpRequest` (full async support on New 3DS; basic on Old 3DS)
- `JSON.parse` / `JSON.stringify`
- String: `.indexOf()`, `.substring()`, `.replace()`, `.trim()`, `.split()`
- `confirm()` dialog
- `addEventListener('DOMContentLoaded', …)` for boot
- `document.onkeydown` / `element.onclick` — **property assignment** works reliably
- `setTimeout` / `setInterval`
- `Math` object

### New 3DS only
- Arrow functions, `const`, `let`, classes
- `addEventListener('click', fn)` — should work (WebKit 536)
- `fetch()` — NOT supported on either model (use `XMLHttpRequest`)
- SSE via `readyState === 3` streaming on `XMLHttpRequest`
- `canvas.getContext('2d')` with `getImageData`, `putImageData`
- `requestAnimationFrame`

## JavaScript — What Does NOT Work

### Both models
- **No `fetch()` API** — use `xhrRequest()` helper at `src/main.ts:156` exclusively
- **No `type="module"`** — Vite plugin `no-module-script` strips it at build (vite.config.ts)
- **`HTMLElement` type annotations** — valid TypeScript but erased at compile. Runtime null checks (`if (el)`) required after every `getElementById()` call.
- **No Web Workers** — all work must happen on the main thread
- **No devtools** — `console.log`/`console.error` may not output anywhere visible. Testing is blind.
- **No WebGL** — not available on either model

### Old 3DS specific
- **No arrow functions** — use `function` expressions
- **No `const` / `let`** — use `var`
- **No classes** — use constructor functions
- **No SVG** — QR code rendering won't work on Old 3DS
- **No SSE / streaming XHR** — `readyState === 3` may never fire; response arrives only at `readyState === 4`

## Event Handling

### Critical pattern learned from confirmed-working 3DS apps
All examples in the [3ds-web-skills](https://github.com/EthanThatOneKid/3ds-web-skills) repo (snake, calculator, todo, flappy-bird, etc.) — which are tested on actual hardware — use these patterns:

- **`element.onclick = fn`** — property assignment, NOT `addEventListener('click', fn)`
- **`document.onkeydown = fn`** — property assignment, NOT `addEventListener('keydown', fn)`
- **Touch support via `element.onclick`** — the 3DS touchscreen fires `mousedown`/`mouseup` events (and thus `click`) from stylus taps, so `onclick` catches touch input

### What this means for our app
Our current `onTap()` helper at `src/main.ts:1030` uses `addEventListener('click', fn)`. If this doesn't work on the 3DS, the fix is to use **`el.onclick = fn`** instead. The property assignment pattern is more reliable for `<button>` elements on Netfront Browser.

### Touch screen behavior (from SKILL.md)
- Bottom screen fires standard `touchstart`, `touchmove`, `touchend` events
- Also fires `mousedown`/`mousemove`/`mouseup` when tapping
- Use `e.touches[0].clientX` / `e.touches[0].clientY` for coordinates
- **Both event types fire on a single tap** — `touchstart`/`touchend` AND `mousedown`/`mouseup`/`click`. Use `e.preventDefault()` on the touch handler to suppress the synthetic mouse events and prevent double-fire.

### Interceptable physical inputs

| Input | KeyCode | Event | Default Browser Action |
|-------|---------|-------|----------------------|
| D-Pad Up | 38 | keydown/keyup | Scroll up |
| D-Pad Down | 40 | keydown/keyup | Scroll down |
| D-Pad Left | 37 | keydown/keyup | Scroll left |
| D-Pad Right | 39 | keydown/keyup | Scroll right |
| A Button | 13 | keydown/keyup | Click / submit |
| Touch | N/A | touch events + mouse events | Mouse click |

**Buttons that CANNOT be intercepted** (hijacked by browser): X/Y (zoom), L/R (back/forward), Start/Select (UI toggle), B (unmapped).

### Keyboard input example (ES3-safe)
```javascript
document.onkeydown = function (e) {
  if (e.keyCode === 13) { // A button / Enter
    e.preventDefault();
    // handle action
  }
};
```

## CSS Support

### Old 3DS
CSS 2.1 primarily. Limited CSS3. No SVG. No `@font-face` (no WOFF). `box-sizing` may not be supported. Use `display: table` and `display: table-cell` for layouts. Avoid `border-radius`, `transition`, `transform`, `flex`, `grid`.

### New 3DS
Supports CSS3 extensively: `display: flex`, `display: grid`, `border-radius`, `transition`, `transform`, `box-sizing`, `@font-face` (WOFF), media queries, and CSS animations. Vendor prefixes (`-webkit-`) are needed for some properties.

### Critical: `inset` property
- **`inset` shorthand is NOT supported** on either model
- Always use explicit longhands: `top: 0; right: 0; bottom: 0; left: 0`
- **Vite's lightningcss minifier re-combines** these back to `inset: 0` during minification
- Workarounds to prevent re-combination:
  - Disable CSS minification: `cssMinify: false` in vite.config.ts `build` block
  - Use a sentinel longhand: `top: 0; right: 0; bottom: 0; left: var(--x, 0)`
  - Use `0px` instead of `0` (may skip combining)

### CSS tip from 3ds-web-skills
Prefix experimental CSS properties with `-webkit-`, `-moz-`, `-o-`, `-ms-`. Keep selectors simple and avoid complex combinators to prevent reflow performance issues.

## Storage

### localStorage is volatile
The 3DS browser often **clears localStorage on power-off** or when the browser cache is cleared. Code that depends on localStorage for persistence will lose data when the device is turned off.

### Dual-write strategy (used by 3ds-web-skills todo example)
```javascript
// Save to both localStorage and cookies
try { localStorage.setItem(key, data); } catch (e) {}
try { document.cookie = key + "=" + encodeURIComponent(data) + "; path=/; max-age=31536000"; } catch (e) {}
```

Our storage layer at `src/storage.ts` already does this dual-write, but the cookie path is a fallback only. The cookie should be the primary persistence mechanism with localStorage as a fast cache.

## SVG Support

- **New 3DS:** ✅ SVG supported (inline and `.svg` files). QR code rendering will work.
- **Old 3DS:** ❌ SVG **not supported**. QR code rendering via SVG will silently fail.

If Old 3DS support is desired, QR code would need to be rendered via `<canvas>` or via a server-generated image.

## Canvas & Graphics

- **Context:** 2D only (no WebGL on either model)
- **Max canvas size:** 400×240 (top screen), 320×240 (bottom screen) — larger canvases may trigger "Page too large"
- **Heavy pixel ops (`getImageData`, `putImageData`)** run at ~1–2 FPS on Old 3DS, acceptable on New 3DS
- **OffscreenCanvas** not supported
- **`requestAnimationFrame`** available on New 3DS, use sparingly; prefer event-driven rendering

## Audio

- **Both models:** Web Audio API (oscillators, AudioContext) NOT available
- **New 3DS only:** Use `<audio>` element or `new Audio(url)` with AAC or MP3 files
- **Old 3DS:** No official browser audio support

## Network

### Mixed-content restriction
- **Site is HTTP** (GitHub Pages), **API is HTTPS** (`https://api.zo.computer`)
- The 3DS may **block HTTPS XHR from HTTP pages** due to mixed-content restrictions
- New 3DS is more permissive; Old 3DS is stricter — it may block the request silently even before CORS checks

### Proxy architecture
- `getApiBaseUrl()` at `src/main.ts:87` returns `https://etok.zo.space/zo-proxy?path=` for all non-localhost
- The proxy adds `Access-Control-Allow-Origin: *` headers
- If the 3DS blocks at the network level (not CORS), the proxy doesn't help
- The only real fix would be a same-origin HTTP proxy, impossible on GitHub Pages

### Local development
- Vite proxy at `/zo-api` → `https://api.zo.computer` (bypasses CORS entirely)
- Set API key via `?key=YOUR_KEY` URL param
- For testing on a real 3DS locally, use a tunnel (ngrok/cloudflared) serving the Vite dev server over HTTP, then scan a QR code of the tunnel URL

### Zo API header quirk
The Zo edge strips the `Authorization` header when routing through the `/zo-proxy` proxy path. Keep the `X-Zo-Api-Key` header as a backchannel — the proxy translates it back to `Authorization` for the upstream API.

## Development & Testing Workflow

### How to test on a real 3DS
1. Start the dev server: `npm run dev`
2. Expose via HTTP tunnel: `npx localtunnel --port 5173` (use HTTP, not HTTPS — 3DS SSL error `032-1035`)
3. Generate a QR code of the HTTP tunnel URL
4. Scan with 3DS camera (press L or R on home screen)

### Testing checklist
- Test on actual Old 3DS hardware (baseline)
- Test on New 3DS (performance comparison)
- Check page load times
- Test D-Pad navigation
- Test touch screen interactions
- Verify form submissions
- Test with WiFi off to see graceful error handling

## Build & Test

```bash
npm run dev       # local dev with Zo proxy at /zo-api
npm run build     # production build to dist/
npm run preview   # preview production build locally
npx playwright test  # run Playwright e2e tests in e2e/
```

## Key Files

- `src/main.ts` — all application logic (event handlers, XHR, QR rendering, state, `onTap()` helper at line 1030)
- `src/storage.ts` — localStorage + cookie persistence layer (dual-write)
- `src/qrcodegen.ts` — QR code encoder (vendored, compiled to separate chunk)
- `index.html` — single-page layout, tab navigation via `<a href="#panel">`
- `styles.css` — all styles, currently uses `display: table` for layout (safe for Old 3DS)
- `vite.config.ts` — ES5 build target, `no-module-script` plugin, lightningcss minifier
- `tsconfig.json` — ES5 target, strict mode, DOM lib

## Current Blockers (unsolved)

1. **Status bar button not responding on 3DS** — our `onTap()` helper uses `addEventListener('click', fn)`, but confirmed-working 3DS apps all use `element.onclick = fn` (property assignment). This is the most likely fix — change `onTap()` to use `onclick` property instead of `addEventListener`. The `touchend` fallback with `preventDefault()` may also be causing double-fire issues if both touch and click events fire.

2. **Models/Personas tab loading on device** — HTTPS XHR from HTTP page may be blocked by 3DS mixed-content policy. New 3DS is more permissive; Old 3DS is stricter. The proxy at `etok.zo.space` helps with CORS but doesn't bypass network-level mixed-content blocking.

3. **CSS `inset` reappearing in minified output** — lightningcss re-mints `top/right/bottom/left: 0` → `inset: 0`. `inset` is unsupported on both models. Workaround: set `cssMinify: false` in vite.config.ts or use a sentinel custom property.

4. **No on-device debugging** — all diagnostics from user reports on real 3DS hardware. No devtools, no console output visibility.

5. **Old 3DS SVG support** — QR code rendering via SVG won't work on Old 3DS. Need a canvas-based fallback route or server-side QR image.

## Design Decisions

- **No runtime dependencies** — removed `zocomputer@0.1.3` (ES5-incompatible `fetch`-based SDK)
- **Dialog/modal visibility** via `style.display` (not `.hidden` property — `.hidden` may not be respected)
- **Event registration** currently uses `addEventListener('click', fn)` via `onTap()` helper, with `touchend` fallback for stylus taps and try-catch around `preventDefault()`. This pattern may need to change to `element.onclick = fn` based on evidence from 3ds-web-skills.
- **All DOM queries** guarded with null checks — elements may not exist on all pages or may fail silently on 3DS
- **Chat streaming** via `XMLHttpRequest` with `readyState 3` + `4` SSE line parsing — may receive only `readyState 4` on Old 3DS
- **Storage** dual-writes to both `localStorage` and cookies (see `src/storage.ts`) — cookies are the more reliable persistence mechanism on 3DS
- **Auth:** `Authorization: Bearer` + `X-Zo-Api-Key` dual header (proxy survival workaround for Zo's edge)

## References
- [3ds-web-skills](https://github.com/EthanThatOneKid/3ds-web-skills) — confirmed-working 3DS web examples with patterns we should follow
- [Official browser specs (archive)](https://archive.today/8qs51)
- [Zo Computer API](https://api.zo.computer)
