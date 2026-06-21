# Zopack Deployment & Development Flow

This document details the development and deployment workflow for synchronizing `.zopack.md` route definitions from this local repository with your remote Zo Computer space.

## Architecture & Concepts

1. **Local Repository (`zocomputer-3ds`)**: Holds the local source code and configurations. The CORS proxy configuration is specified in the `.zopack.md` format inside `proxy/zo-proxy.zopack.md`.
2. **Remote Zo Computer**: The personal cloud server hosting the live zo.space.
3. **Zopack Skill**: A Zo skill (`Community/zopack`) that handles packaging, parsing, and exporting/importing space routes as Markdown files.
4. **MCP (Model Context Protocol) API**: The JSON-RPC endpoint at `https://api.zo.computer/mcp` used to execute bash commands and space route operations remotely using your API key.

---

## Deployment Script

To automate the synchronization, the script [deploy.js](file:///c:/Users/ethan/Documents/GitHub/zocomputer-3ds/proxy/deploy.js) is provided. It automatically:
1. Uploads the latest zopack skill scripts (if local copies exist) to `/home/workspace/Skills/Community/zopack/` on the remote Zo.
2. Uploads the local CORS proxy configuration file (`proxy/zo-proxy.zopack.md`) to the remote Zo at `/home/workspace/Inbox/zo-proxy.zopack.md`.
3. Runs the remote `import.ts` parser script using `bun` to validate the file and generate a JSON deployment plan.
4. Resolves the deployment plan items (directories, dependencies, and routes) and calls the remote Zo MCP `write_space_route` tool to deploy the route.
5. Queries the deployed space routes and checks for any compilation/runtime errors.

### Prerequisites

Make sure you have Node.js installed locally. The script reads the API key from the `ZO_API_KEY` environment variable. If not set, it defaults to your active API key.

### Execution

Run the script from the root of this project:

```bash
# Set your API key if needed
$env:ZO_API_KEY="your-api-key"

# Run the deployment script
node proxy/deploy.js
```

---

## Development Guide for `.zopack.md`

### 1. File Format

A `.zopack.md` file combines frontmatter and markdown sections with fenced code blocks to define routes and dependencies:

```markdown
---
format: zopack
version: "1.0"
name: pack-name
description: "Description of the pack"
author: handle.zo.computer
routes: 1
exported: 2026-06-21
---

# Pack Title

Pack description text.

## Routes

### `/your-route-path` (api|page, public|private)

```typescript
// Your Hono/React route code here
```
```

### 2. Gotchas & Tips

* **Line Endings (CRLF vs LF)**: The regex parser inside the remote zopack skill (`import.ts`) expects Unix-style line endings (`\n`) immediately after the fenced code block tags (e.g. ` ```typescript\n `). Windows-style `\r\n` endings will cause the regex matching to fail.
  * *Note:* The `deploy.js` script automatically converts CRLF to LF for all uploaded `.md`, `.ts`, and `.json` files to guarantee parser compatibility.
* **Public Flag Serialization**: The remote Zo `write_space_route` tool expects the `public` parameter to be passed as a string `"true"` or `"false"` (due to remote python backend validations calling `.lower()`), rather than a JavaScript boolean `true`/`false`.
