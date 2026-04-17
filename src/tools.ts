/**
 * MCP Tool definitions for ESET PROTECT On-Prem REST API
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { EsetClient } from "./eset-client.js";

export function registerTools(server: McpServer, client: EsetClient): void {
  // ──────────────────────────────────────────────
  // Devices
  // ──────────────────────────────────────────────

  server.tool(
    "get_device",
    "Get detailed information about a specific device by its UUID",
    { deviceUuid: z.string().describe("The UUID of the device") },
    async ({ deviceUuid }) => {
      const result = await client.getDevice(deviceUuid);
      return {
        content: [
          { type: "text", text: JSON.stringify(result, null, 2) },
        ],
      };
    }
  );

  server.tool(
    "batch_get_devices",
    "Get information about multiple devices by their UUIDs",
    {
      deviceUuids: z
        .array(z.string())
        .describe("Array of device UUIDs to retrieve"),
    },
    async ({ deviceUuids }) => {
      const result = await client.batchGetDevices(deviceUuids);
      return {
        content: [
          { type: "text", text: JSON.stringify(result, null, 2) },
        ],
      };
    }
  );

  server.tool(
    "move_device",
    "Move a device to a different static group",
    {
      deviceUuid: z.string().describe("The UUID of the device to move"),
      newParentUuid: z
        .string()
        .describe("The UUID of the target parent group"),
    },
    async ({ deviceUuid, newParentUuid }) => {
      const result = await client.moveDevice(deviceUuid, newParentUuid);
      return {
        content: [
          { type: "text", text: JSON.stringify(result, null, 2) },
        ],
      };
    }
  );

  server.tool(
    "rename_device",
    "Rename a device",
    {
      deviceUuid: z.string().describe("The UUID of the device to rename"),
      newName: z.string().describe("The new name for the device"),
    },
    async ({ deviceUuid, newName }) => {
      const result = await client.renameDevice(deviceUuid, newName);
      return {
        content: [
          { type: "text", text: JSON.stringify(result, null, 2) },
        ],
      };
    }
  );

  // ──────────────────────────────────────────────
  // Device Groups
  // ──────────────────────────────────────────────

  server.tool(
    "list_device_groups",
    "List all device groups in ESET PROTECT",
    {},
    async () => {
      const result = await client.listDeviceGroups();
      return {
        content: [
          { type: "text", text: JSON.stringify(result, null, 2) },
        ],
      };
    }
  );

  server.tool(
    "list_devices_in_group",
    "List all devices in a specific device group",
    {
      groupUuid: z.string().describe("The UUID of the device group"),
      pageSize: z
        .number()
        .optional()
        .describe("Number of results per page (max 10000, default 100)"),
      pageToken: z
        .string()
        .optional()
        .describe("Token for fetching the next page of results"),
    },
    async ({ groupUuid, pageSize, pageToken }) => {
      const result = await client.listDevicesInGroup(
        groupUuid,
        pageSize,
        pageToken
      );
      return {
        content: [
          { type: "text", text: JSON.stringify(result, null, 2) },
        ],
      };
    }
  );

  // ──────────────────────────────────────────────
  // Policies
  // ──────────────────────────────────────────────

  server.tool(
    "list_policies",
    "List all policies in ESET PROTECT",
    {},
    async () => {
      const result = await client.listPolicies();
      return {
        content: [
          { type: "text", text: JSON.stringify(result, null, 2) },
        ],
      };
    }
  );

  server.tool(
    "get_policy",
    "Get detailed information about a specific policy",
    {
      policyUuid: z.string().describe("The UUID of the policy"),
    },
    async ({ policyUuid }) => {
      const result = await client.getPolicy(policyUuid);
      return {
        content: [
          { type: "text", text: JSON.stringify(result, null, 2) },
        ],
      };
    }
  );

  server.tool(
    "create_policy",
    "Create a new policy in ESET PROTECT",
    {
      policyData: z
        .string()
        .describe(
          "JSON string containing the policy configuration to create"
        ),
    },
    async ({ policyData }) => {
      const parsed = JSON.parse(policyData) as Record<string, unknown>;
      const result = await client.createPolicy(parsed);
      return {
        content: [
          { type: "text", text: JSON.stringify(result, null, 2) },
        ],
      };
    }
  );

  server.tool(
    "delete_policy",
    "Delete a policy from ESET PROTECT",
    {
      policyUuid: z.string().describe("The UUID of the policy to delete"),
    },
    async ({ policyUuid }) => {
      const result = await client.deletePolicy(policyUuid);
      return {
        content: [
          { type: "text", text: JSON.stringify(result, null, 2) },
        ],
      };
    }
  );

  // ──────────────────────────────────────────────
  // Policy Assignments
  // ──────────────────────────────────────────────

  server.tool(
    "list_policy_assignments",
    "List all policy assignments in ESET PROTECT",
    {},
    async () => {
      const result = await client.listPolicyAssignments();
      return {
        content: [
          { type: "text", text: JSON.stringify(result, null, 2) },
        ],
      };
    }
  );

  server.tool(
    "get_policy_assignment",
    "Get details of a specific policy assignment",
    {
      assignmentUuid: z
        .string()
        .describe("The UUID of the policy assignment"),
    },
    async ({ assignmentUuid }) => {
      const result = await client.getPolicyAssignment(assignmentUuid);
      return {
        content: [
          { type: "text", text: JSON.stringify(result, null, 2) },
        ],
      };
    }
  );

  server.tool(
    "assign_policy",
    "Assign a policy to a device or group",
    {
      assignmentData: z
        .string()
        .describe(
          "JSON string containing the policy assignment configuration (policyUuid, targetUuid, etc.)"
        ),
    },
    async ({ assignmentData }) => {
      const parsed = JSON.parse(assignmentData) as Record<string, unknown>;
      const result = await client.assignPolicy(parsed);
      return {
        content: [
          { type: "text", text: JSON.stringify(result, null, 2) },
        ],
      };
    }
  );

  server.tool(
    "unassign_policy",
    "Remove a policy assignment",
    {
      assignmentUuid: z
        .string()
        .describe("The UUID of the policy assignment to remove"),
    },
    async ({ assignmentUuid }) => {
      const result = await client.unassignPolicy(assignmentUuid);
      return {
        content: [
          { type: "text", text: JSON.stringify(result, null, 2) },
        ],
      };
    }
  );

  server.tool(
    "update_policy_assignment_ranking",
    "Update the ranking/priority of a policy assignment",
    {
      assignmentUuid: z
        .string()
        .describe("The UUID of the policy assignment"),
      ranking: z
        .number()
        .describe("The new ranking value for the policy assignment"),
    },
    async ({ assignmentUuid, ranking }) => {
      const result = await client.updatePolicyAssignmentRanking(
        assignmentUuid,
        ranking
      );
      return {
        content: [
          { type: "text", text: JSON.stringify(result, null, 2) },
        ],
      };
    }
  );
}
