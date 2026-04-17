/**
 * MCP Tool definitions — Cloud-only tools (ESET Connect)
 * These are registered only when running in cloud mode.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { EsetClient } from "./eset-client.js";

function json(result: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
}

export function registerCloudTools(server: McpServer, client: EsetClient): void {
  // ── Detections ────────────────────────────────────────────────────

  server.tool(
    "list_detections",
    "List security detections (threats found on endpoints)",
    {
      pageSize: z.number().optional().describe("Results per page"),
      pageToken: z.string().optional().describe("Token for next page"),
    },
    async ({ pageSize, pageToken }) => json(await client.listDetections(pageSize, pageToken)),
  );

  server.tool(
    "get_detection",
    "Get detailed information about a specific detection",
    { detectionUuid: z.string().describe("UUID of the detection") },
    async ({ detectionUuid }) => json(await client.getDetection(detectionUuid)),
  );

  server.tool(
    "resolve_detection",
    "Mark a detection as resolved",
    { detectionUuid: z.string().describe("UUID of the detection to resolve") },
    async ({ detectionUuid }) => json(await client.resolveDetection(detectionUuid)),
  );

  // ── Incidents ─────────────────────────────────────────────────────

  server.tool(
    "list_incidents",
    "List security incidents",
    {
      pageSize: z.number().optional().describe("Results per page"),
      pageToken: z.string().optional().describe("Token for next page"),
    },
    async ({ pageSize, pageToken }) => json(await client.listIncidents(pageSize, pageToken)),
  );

  server.tool(
    "get_incident",
    "Get detailed information about a specific incident",
    { incidentUuid: z.string().describe("UUID of the incident") },
    async ({ incidentUuid }) => json(await client.getIncident(incidentUuid)),
  );

  server.tool(
    "close_incident",
    "Close a security incident",
    { incidentUuid: z.string().describe("UUID of the incident to close") },
    async ({ incidentUuid }) => json(await client.closeIncident(incidentUuid)),
  );

  server.tool(
    "reopen_incident",
    "Reopen a previously closed incident",
    { incidentUuid: z.string().describe("UUID of the incident to reopen") },
    async ({ incidentUuid }) => json(await client.reopenIncident(incidentUuid)),
  );

  // ── Executables / Application Management ──────────────────────────

  server.tool(
    "list_executables",
    "List executables seen across managed endpoints",
    {
      pageSize: z.number().optional().describe("Results per page"),
      pageToken: z.string().optional().describe("Token for next page"),
    },
    async ({ pageSize, pageToken }) => json(await client.listExecutables(pageSize, pageToken)),
  );

  server.tool(
    "get_executable",
    "Get details about a specific executable",
    { executableUuid: z.string().describe("UUID of the executable") },
    async ({ executableUuid }) => json(await client.getExecutable(executableUuid)),
  );

  server.tool(
    "block_executable",
    "Block an executable across managed endpoints",
    { executableUuid: z.string().describe("UUID of the executable to block") },
    async ({ executableUuid }) => json(await client.blockExecutable(executableUuid)),
  );

  server.tool(
    "unblock_executable",
    "Unblock a previously blocked executable",
    { executableUuid: z.string().describe("UUID of the executable to unblock") },
    async ({ executableUuid }) => json(await client.unblockExecutable(executableUuid)),
  );

  // ── Quarantine Management ─────────────────────────────────────────

  server.tool(
    "list_quarantined_objects",
    "List quarantined objects",
    {
      pageSize: z.number().optional().describe("Results per page"),
      pageToken: z.string().optional().describe("Token for next page"),
    },
    async ({ pageSize, pageToken }) => json(await client.listQuarantinedObjects(pageSize, pageToken)),
  );

  server.tool(
    "get_quarantined_object",
    "Get details about a specific quarantined object",
    { objectUuid: z.string().describe("UUID of the quarantined object") },
    async ({ objectUuid }) => json(await client.getQuarantinedObject(objectUuid)),
  );

  server.tool(
    "get_quarantine_count",
    "Get the total count of quarantined objects",
    {},
    async () => json(await client.getQuarantineCount()),
  );

  // ── Installer Management ──────────────────────────────────────────

  server.tool(
    "list_installers",
    "List created installers",
    {},
    async () => json(await client.listInstallers()),
  );

  server.tool(
    "get_installer",
    "Get details about a specific installer",
    { installerUuid: z.string().describe("UUID of the installer") },
    async ({ installerUuid }) => json(await client.getInstaller(installerUuid)),
  );

  server.tool(
    "create_installer",
    "Create a new ESET installer package",
    { installerData: z.string().describe("JSON string of installer configuration") },
    async ({ installerData }) => json(await client.createInstaller(JSON.parse(installerData))),
  );

  server.tool(
    "delete_installer",
    "Delete an installer",
    { installerUuid: z.string().describe("UUID of the installer to delete") },
    async ({ installerUuid }) => json(await client.deleteInstaller(installerUuid)),
  );
}
