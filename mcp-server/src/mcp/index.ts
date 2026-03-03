#!/usr/bin/env node
/**
 * base-board-mcp — MCP server entry point.
 *
 * Communicates over stdio (JSON-RPC). Designed to be launched by an MCP
 * client (Claude Code, Cursor, Gemini CLI, etc.) via:
 *
 *   npx -y base-board-mcp
 *
 * Configuration via environment variables:
 *   BB_VAULT  — vault name (optional; defaults to active Obsidian vault)
 *   BB_BOARD  — default board name (optional; defaults to first board found)
 *
 * Requires Obsidian 1.12+ running with CLI enabled:
 *   Settings → General → Command line interface
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.js";
import { registerPrompts } from "./prompts.js";

const server = new McpServer({
  name: "base-board-mcp",
  version: "1.0.0",
});

registerTools(server);
registerPrompts(server);

async function checkCli(): Promise<void> {
  const { exec } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execAsync = promisify(exec);

  try {
    // We pass --no-sandbox for the same reason we do in obsidian.ts:
    // to bypass the AppArmor crash on Linux when spawned as a subprocess.
    await execAsync("obsidian --no-sandbox version");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isNotFound =
      msg.includes("command not found") ||
      msg.includes("ENOENT") ||
      msg.includes("not found");
    const isSandbox =
      msg.includes("sandbox") ||
      msg.includes("core dumped") ||
      msg.includes("FATAL");

    if (isNotFound) {
      console.error(
        "Error: Obsidian CLI not found.\n" +
          "  1. Install Obsidian 1.12+ (early access installer)\n" +
          "  2. Go to Settings → General → Enable 'Command line interface'\n" +
          "  3. Restart your terminal\n" +
          "  See: https://help.obsidian.md/cli",
      );
    } else if (isSandbox) {
      console.error(
        "Error: Obsidian CLI crashed (sandbox restriction).\n" +
          "  This is a known issue on Linux (Ubuntu 23.10+ with AppArmor).\n" +
          "  The Obsidian CLI cannot be spawned as a subprocess in this environment.\n" +
          "  See: https://chromium.googlesource.com/chromium/src/+/main/docs/security/apparmor-userns-restrictions.md",
      );
    } else {
      console.error(`Error: Obsidian CLI check failed: ${msg}`);
    }
    process.exit(1);
  }
}

async function main(): Promise<void> {
  await checkCli();

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log to stderr only — stdout is reserved for MCP JSON-RPC messages.
  console.error("base-board-mcp running");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
