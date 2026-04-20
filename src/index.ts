#!/usr/bin/env node

/**
 * ESET PROTECT MCP Server
 *
 * Supports both ESET PROTECT On-Prem and Cloud (ESET Connect).
 *
 * Environment variables:
 *
 *   ESET_MODE        - "onprem" or "cloud" (default: "onprem")
 *
 *   On-Prem mode:
 *     ESET_SERVER_URL  - Server URL (e.g. https://protect:9443)
 *     ESET_USERNAME    - API username
 *     ESET_PASSWORD    - API password
 *     ESET_VERIFY_SSL  - "false" to allow self-signed certs (default: "true")
 *
 *   Cloud mode:
 *     ESET_REGION      - Region: eu, de, us, jpn, ca
 *     ESET_USERNAME    - API user email
 *     ESET_PASSWORD    - API user password
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { EsetClient, type EsetConfig, type EsetRegion } from "./eset-client.js";
import { registerSharedTools } from "./tools-shared.js";
import { registerCloudTools } from "./tools-cloud.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Error: Environment variable ${name} is required but not set.`);
    process.exit(1);
  }
  return value;
}

function buildConfig(): EsetConfig {
  const mode = (process.env.ESET_MODE ?? "onprem").toLowerCase();
  const username = requireEnv("ESET_USERNAME");
  const password = requireEnv("ESET_PASSWORD");

  if (mode === "cloud") {
    const region = requireEnv("ESET_REGION").toLowerCase() as EsetRegion;
    const validRegions: EsetRegion[] = ["eu", "de", "us", "jpn", "ca"];
    if (!validRegions.includes(region)) {
      console.error(`Error: ESET_REGION must be one of: ${validRegions.join(", ")}`);
      process.exit(1);
    }
    return { mode: "cloud", region, username, password };
  }

  const serverUrl = requireEnv("ESET_SERVER_URL");
  const verifySsl = process.env.ESET_VERIFY_SSL !== "false";
  return { mode: "onprem", serverUrl, username, password, verifySsl };
}

async function main(): Promise<void> {
  const config = buildConfig();
  const client = new EsetClient(config);

  const server = new McpServer({
    name: "eset-protect-mcp",
    version: "1.3.2",
  });

  process.stderr.write(`[eset-protect-mcp] v1.3.2 started, mode=${config.mode}\n`);

  // Register tools available in both modes
  registerSharedTools(server, client);

  // Register cloud-only tools when in cloud mode
  if (config.mode === "cloud") {
    registerCloudTools(server, client);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
