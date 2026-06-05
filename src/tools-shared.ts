/**
 * MCP Tool definitions — shared (On-Prem + Cloud) tools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { EsetClient } from "./eset-client.js";

function json(result: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
}

export function registerSharedTools(server: McpServer, client: EsetClient): void {
  // ── Devices ───────────────────────────────────────────────────────

  server.tool(
    "list_devices",
    "List managed devices with optional pagination",
    {
      pageSize: z.number().optional().describe("Results per page (max 10000, default 100)"),
      pageToken: z.string().optional().describe("Token for next page"),
    },
    async ({ pageSize, pageToken }) => json(await client.listDevices(pageSize, pageToken)),
  );

  server.tool(
    "get_device",
    "Get detailed information about a specific device by UUID",
    { deviceUuid: z.string().describe("The UUID of the device") },
    async ({ deviceUuid }) => json(await client.getDevice(deviceUuid)),
  );

  server.tool(
    "batch_get_devices",
    "Get information about multiple devices by their UUIDs",
    { deviceUuids: z.array(z.string()).describe("Array of device UUIDs") },
    async ({ deviceUuids }) => json(await client.batchGetDevices(deviceUuids)),
  );

  server.tool(
    "move_device",
    "Move a device to a different static group",
    {
      deviceUuid: z.string().describe("UUID of the device to move"),
      newParentUuid: z.string().describe("UUID of the target parent group"),
    },
    async ({ deviceUuid, newParentUuid }) => json(await client.moveDevice(deviceUuid, newParentUuid)),
  );

  server.tool(
    "rename_device",
    "Rename a device",
    {
      deviceUuid: z.string().describe("UUID of the device"),
      newName: z.string().describe("New name for the device"),
    },
    async ({ deviceUuid, newName }) => json(await client.renameDevice(deviceUuid, newName)),
  );

  // ── Device Groups ─────────────────────────────────────────────────

  server.tool(
    "list_device_groups",
    "List all device groups",
    {
      pageSize: z.number().optional().describe("Results per page"),
      pageToken: z.string().optional().describe("Token for next page"),
    },
    async ({ pageSize, pageToken }) => json(await client.listDeviceGroups(pageSize, pageToken)),
  );

  server.tool(
    "list_devices_in_group",
    "List devices in a specific device group",
    {
      groupUuid: z.string().describe("UUID of the device group"),
      pageSize: z.number().optional().describe("Results per page"),
      pageToken: z.string().optional().describe("Token for next page"),
    },
    async ({ groupUuid, pageSize, pageToken }) =>
      json(await client.listDevicesInGroup(groupUuid, pageSize, pageToken)),
  );

  // ── Policies ──────────────────────────────────────────────────────

  server.tool(
    "list_policies",
    "List all policies",
    {
      pageSize: z.number().optional().describe("Results per page"),
      pageToken: z.string().optional().describe("Token for next page"),
    },
    async ({ pageSize, pageToken }) => json(await client.listPolicies(pageSize, pageToken)),
  );

  server.tool(
    "get_policy",
    "Get detailed information about a specific policy",
    {
      policyUuid: z.string().describe("UUID of the policy"),
      decodePolicyData: z.boolean().optional().describe("Decode base64 PolicyData blobs into _mcpDecodedPolicyData"),
    },
    async ({ policyUuid, decodePolicyData }) => json(await client.getPolicy(policyUuid, decodePolicyData)),
  );

  server.tool(
    "create_policy",
    "Create a new policy",
    { policyData: z.string().describe("JSON string of the policy configuration") },
    async ({ policyData }) => json(await client.createPolicy(JSON.parse(policyData))),
  );

  server.tool(
    "delete_policy",
    "Delete a policy",
    { policyUuid: z.string().describe("UUID of the policy to delete") },
    async ({ policyUuid }) => json(await client.deletePolicy(policyUuid)),
  );

  // ── Policy Assignments ────────────────────────────────────────────

  server.tool(
    "list_policy_assignments",
    "List all policy assignments",
    {
      policyUuid: z.string().optional().describe("Filter: only assignments of this policy UUID"),
      deviceUuid: z.string().optional().describe("Filter: assignments directly targeting this device UUID"),
      deviceGroupUuid: z.string().optional().describe("Filter: assignments directly targeting this device group UUID"),
      subscriptionUuid: z.string().optional().describe("Filter: assignments targeting this subscription UUID"),
      pageSize: z.number().optional().describe("Results per page"),
      pageToken: z.string().optional().describe("Token for next page"),
    },
    async ({ policyUuid, deviceUuid, deviceGroupUuid, subscriptionUuid, pageSize, pageToken }) =>
      json(await client.listPolicyAssignments({ policyUuid, deviceUuid, deviceGroupUuid, subscriptionUuid }, pageSize, pageToken)),
  );

  server.tool(
    "get_policy_assignment",
    "Get details of a specific policy assignment",
    { assignmentUuid: z.string().describe("UUID of the policy assignment") },
    async ({ assignmentUuid }) => json(await client.getPolicyAssignment(assignmentUuid)),
  );

  server.tool(
    "assign_policy",
    "Assign a policy to a device or group",
    { assignmentData: z.string().describe("JSON string of assignment config (policyUuid, targetUuid, etc.)") },
    async ({ assignmentData }) => json(await client.assignPolicy(JSON.parse(assignmentData))),
  );

  server.tool(
    "unassign_policy",
    "Remove a policy assignment",
    { assignmentUuid: z.string().describe("UUID of the assignment to remove") },
    async ({ assignmentUuid }) => json(await client.unassignPolicy(assignmentUuid)),
  );

  server.tool(
    "update_policy_assignment_ranking",
    "Update the ranking/priority of a policy assignment",
    {
      assignmentUuid: z.string().describe("UUID of the policy assignment"),
      ranking: z.number().describe("New ranking value"),
    },
    async ({ assignmentUuid, ranking }) =>
      json(await client.updatePolicyAssignmentRanking(assignmentUuid, ranking)),
  );
}
