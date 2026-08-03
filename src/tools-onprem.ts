/**
 * MCP tools available only in ESET PROTECT On-Prem 13.1+.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { EsetClient } from "./eset-client.js";

function json(result: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
}

export function registerOnPremTools(server: McpServer, client: EsetClient): void {
  server.tool(
    "get_server_configuration_value",
    "Get an ESET PROTECT On-Prem server configuration value by path",
    {
      path: z.string().min(1).describe("Configuration path, e.g. server or server.updates.trigger"),
    },
    async ({ path }) => json(await client.getServerConfigurationValue(path)),
  );

  server.tool(
    "batch_get_server_configuration_values",
    "Get multiple ESET PROTECT On-Prem server configuration values",
    {
      paths: z.array(z.string().min(1)).min(1).describe("Configuration paths to retrieve"),
    },
    async ({ paths }) => json(await client.batchGetServerConfigurationValues(paths)),
  );
}
