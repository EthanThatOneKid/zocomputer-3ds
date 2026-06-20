# zocomputer-3ds

Simplified demake of the Zo interface for the Nintendo 3DS browser.

## Goal

Keep the experience readable, fast, and friendly to 3DS browser limits.

## What this pass adds

- A stronger dashboard-style landing page
- Large tap targets and stacked sections
- Minimal ES3-safe JavaScript for chat gating and QR rendering
- Basic chat, task, and tools panels for the core Zo flow
- A clickable status bar that opens a QR session dialog
- ES3-safe browser JS that reads `?key=...` and builds a local QR SVG
- A fallback prompt for entering an API key before QR generation

## Development

Run the development server locally in watch mode:

```bash
npm run dev
```

## References

- `https://github.com/EthanThatOneKid/zocomputer-ts`
- `https://github.com/EthanThatOneKid/3ds-web-skills`
