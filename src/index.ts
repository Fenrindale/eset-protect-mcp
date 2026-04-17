#!/usr/bin/env node

/**
 * ESET PROTECT MCP Server
 *
 * A Model Context Protocol server that provides tools for managing
 * ESET PROTECT On-Prem via its REST API.
 *
 * Configuration via environment variables:
 *   ESET_SERVER_URL  - ESET PROTECT server URL (e.g. https://protect:9443)
 *   ESET_USERNAME    - API username
 *   ESET_PASSWORD    - API password
 *   ESET_VERIFY_SSL  - Set to "false" to allow self-signed certs (default: true)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { EsetClient } from "./eset-client.js";
import { registerTools } from "./tools.js";

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Error: Environment variable ${name} is required but not set.`);
    process.exit(1);
  }
  return value;
}

async function main(): Promise<void> {
  const serverUrl = getRequiredEnv("ESET_SERVER_URL");
  const username = getRequiredEnv("ESET_USERNAME");
  const password = getRequiredEnv("ESET_PASSWORD");
  const verifySsl = process.env.ESET_VERIFY_SSL !== "false";

  const esetClient = new EsetClient({
    serverUrl,
    username,
    password,
    verifySsl,
  });

  const server = new McpServer({
    name: "eset-protect-mcp",
    version: "1.0.0",
  });

  registerTools(server, esetClient);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
