const fs = require('fs');
const path = require('path');

const key = process.env.ZO_API_KEY || 'zo_sk_zLrKTrNbp1NKjFHq6quSeNPIZInX1PP9Jj3IgpzhbFo';

async function callZoMCP(toolName, args) {
  const response = await fetch('https://api.zo.computer/mcp', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args
      }
    })
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP error ${response.status}: ${text}`);
  }
  
  const result = await response.json();
  if (result.error) {
    throw new Error(`MCP Error calling ${toolName}: ${JSON.stringify(result.error)}`);
  }
  
  return result.result;
}

function unescapePythonString(str) {
  let result = '';
  let i = 0;
  while (i < str.length) {
    if (str[i] === '\\') {
      const next = str[i + 1];
      if (next === 'n') {
        result += '\n';
        i += 2;
      } else if (next === 't') {
        result += '\t';
        i += 2;
      } else if (next === 'r') {
        result += '\r';
        i += 2;
      } else if (next === 'x') {
        const hex = str.substring(i + 2, i + 4);
        result += String.fromCharCode(parseInt(hex, 16));
        i += 4;
      } else if (next === '\\' || next === "'" || next === '"') {
        result += next;
        i += 2;
      } else {
        result += '\\';
        i += 1;
      }
    } else {
      result += str[i];
      i += 1;
    }
  }
  return result;
}

function parseCmdResult(text) {
  const stdoutMatch = text.match(/CmdResult\(stdout=(['"])([\s\S]*?)\1,\s*stderr=/);
  if (stdoutMatch) {
    return unescapePythonString(stdoutMatch[2]);
  }
  return text;
}

async function runBashOnZo(cmd) {
  const res = await callZoMCP('bash', { cmd });
  if (res.isError) {
    throw new Error(`Bash command failed: ${JSON.stringify(res)}`);
  }
  return parseCmdResult(res.content[0].text);
}

async function uploadFileToZo(localPath, remotePath) {
  console.log(`Reading local file: ${localPath}`);
  let content = fs.readFileSync(localPath);
  
  // Normalize CRLF to LF for text files so that remote skill regex parsers succeed
  if (localPath.endsWith('.md') || localPath.endsWith('.json') || localPath.endsWith('.ts')) {
    let text = content.toString('utf8');
    text = text.replace(/\r\n/g, '\n');
    content = Buffer.from(text, 'utf8');
  }
  
  const base64 = content.toString('base64');
  
  console.log(`Writing to remote: ${remotePath}`);
  // Make sure parent directory exists
  const parentDir = remotePath.substring(0, remotePath.lastIndexOf('/'));
  await runBashOnZo(`mkdir -p "${parentDir}"`);
  
  // Write content
  await runBashOnZo(`echo "${base64}" | base64 -d > "${remotePath}"`);
}

async function main() {
  const workspaceRoot = path.dirname(__dirname);
  
  // 1. Upload updated skill files
  const skillFiles = [
    { local: 'temp-skills/Community/zopack/DISPLAY.json', remote: '/home/workspace/Skills/Community/zopack/DISPLAY.json' },
    { local: 'temp-skills/Community/zopack/SKILL.md', remote: '/home/workspace/Skills/Community/zopack/SKILL.md' },
    { local: 'temp-skills/Community/zopack/scripts/export.ts', remote: '/home/workspace/Skills/Community/zopack/scripts/export.ts' },
    { local: 'temp-skills/Community/zopack/scripts/import.ts', remote: '/home/workspace/Skills/Community/zopack/scripts/import.ts' },
  ];
  
  console.log("=== STEP 1: Uploading updated zopack skill scripts to remote Zo ===");
  for (const file of skillFiles) {
    const fullLocalPath = path.join(workspaceRoot, file.local);
    if (!fs.existsSync(fullLocalPath)) {
      console.warn(`Warning: Local file ${fullLocalPath} not found! Skipping skill update.`);
      continue;
    }
    await uploadFileToZo(fullLocalPath, file.remote);
  }
  
  // 2. Upload formatted zo-proxy.zopack.md
  console.log("\n=== STEP 2: Uploading formatted zo-proxy.zopack.md to remote Zo ===");
  const proxyLocalPath = path.join(workspaceRoot, 'proxy/zo-proxy.zopack.md');
  const proxyRemotePath = '/home/workspace/Inbox/zo-proxy.zopack.md';
  await uploadFileToZo(proxyLocalPath, proxyRemotePath);
  console.log("Proxy pack uploaded.\n");
  
  // 3. Run import tool to get the deployment plan
  console.log("=== STEP 3: Executing zopack import parser on remote Zo ===");
  const importCmd = `bun /home/workspace/Skills/Community/zopack/scripts/import.ts --file "${proxyRemotePath}" --handle etok`;
  console.log(`Running: ${importCmd}`);
  const importOutput = await runBashOnZo(importCmd);
  
  console.log("Parsing import plan output...");
  let plan;
  try {
    const jsonStart = importOutput.indexOf('{');
    const jsonEnd = importOutput.lastIndexOf('}') + 1;
    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error(`Could not find JSON in output: ${importOutput}`);
    }
    const jsonText = importOutput.substring(jsonStart, jsonEnd);
    plan = JSON.parse(jsonText);
  } catch (err) {
    console.error("Failed to parse import plan JSON from output!");
    console.error("Raw stdout:", importOutput);
    throw err;
  }
  
  console.log("Plan loaded successfully:");
  console.log(`Pack name: ${plan.meta.name}`);
  console.log(`Routes: ${plan.routes.length}`);
  
  // 4. Execute the deployment plan
  console.log("\n=== STEP 4: Executing the deployment plan via MCP tools ===");
  
  // Directories
  if (plan.directories && plan.directories.length > 0) {
    console.log(`Creating directories: ${plan.directories.join(', ')}`);
    for (const dir of plan.directories) {
      await runBashOnZo(`mkdir -p "/home/workspace/${dir}"`);
    }
  }
  
  // Files
  if (plan.files && plan.files.length > 0) {
    console.log(`Initializing files: ${plan.files.map(f => f.path).join(', ')}`);
    for (const file of plan.files) {
      const remoteFilePath = `/home/workspace/${file.path}`;
      const base64Content = Buffer.from(file.content).toString('base64');
      await runBashOnZo(`mkdir -p "$(dirname "${remoteFilePath}")" && echo "${base64Content}" | base64 -d > "${remoteFilePath}"`);
    }
  }
  
  // Routes
  console.log("Deploying routes...");
  for (const route of plan.routes) {
    console.log(`Deploying route: ${route.path} (${route.route_type}, public=${route.public})`);
    
    const writeResult = await callZoMCP('write_space_route', {
      path: route.path,
      route_type: route.route_type,
      code: route.code,
      public: route.public ? 'true' : 'false'
    });
    
    console.log(`Write result for ${route.path}:`, JSON.stringify(writeResult));
  }
  
  // 5. Verification
  console.log("\n=== STEP 5: Verification ===");
  console.log("Checking remote space route list...");
  const routesList = await callZoMCP('list_space_routes', {});
  console.log("Routes in prod:", JSON.stringify(routesList.content, null, 2));
  
  console.log("Checking space build/runtime errors...");
  try {
    const spaceErrors = await callZoMCP('get_space_errors', {});
    console.log("Space errors result:", JSON.stringify(spaceErrors, null, 2));
  } catch (e) {
    console.log("Note: get_space_errors check skipped or failed:", e.message);
  }
  
  console.log("\nDeployment completed successfully!");
}

main().catch(err => {
  console.error("\nDeployment failed:", err);
  process.exit(1);
});
