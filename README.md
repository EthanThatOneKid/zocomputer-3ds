# zocomputer-3ds

Simplified demake of the Zo interface for the Nintendo 3DS browser.

## Goal

Keep the experience readable, fast, and friendly to 3DS browser limits.

## What this pass adds

- A stronger dashboard-style landing page
- Large tap targets and stacked sections
- No JavaScript, so the page stays lightweight
- Basic chat, task, and tools panels for the core Zo flow
- A clickable status bar that opens a QR session dialog
- ES3-safe browser JS that reads `?key=...` and builds a QR link
- A fallback prompt for entering an API key before QR generation

## References

- `https://github.com/EthanThatOneKid/zocomputer-ts`
- `https://github.com/EthanThatOneKid/3ds-web-skills`
