/**
 * MCP tools supported by ESET Connect and ESET PROTECT On-Prem 13.1+.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { EsetClient } from "./eset-client.js";

function json(result: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
}

function jsonError(result: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }], isError: true };
}

function normalizedAction(value: string): string {
  return value.toLowerCase().replace(/[\s_-]+/g, "");
}

function containsActionName(value: unknown, candidates: string[]): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => containsActionName(item, candidates));

  const obj = value as Record<string, unknown>;
  for (const [key, item] of Object.entries(obj)) {
    if ((key === "name" || key === "action" || key === "type") && typeof item === "string") {
      const normalized = normalizedAction(item);
      if (candidates.some((candidate) => normalized.includes(normalizedAction(candidate)))) return true;
    }
    if (containsActionName(item, candidates)) return true;
  }
  return false;
}

function numericField(value: unknown, fieldName: string): number | undefined {
  if (!value || typeof value !== "object") return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = numericField(item, fieldName);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  const obj = value as Record<string, unknown>;
  const direct = obj[fieldName];
  if (typeof direct === "number") return direct;
  for (const item of Object.values(obj)) {
    const found = numericField(item, fieldName);
    if (found !== undefined) return found;
  }
  return undefined;
}

function withDeviceTaskWarnings(result: unknown, taskData: unknown): unknown {
  const warnings: string[] = [];
  if (containsActionName(taskData, ["KillProcessByPid", "Kill Process By Pid"])) {
    const pid = numericField(taskData, "pid");
    if (!pid) {
      warnings.push(
        "KillProcessByPid was submitted without a non-zero pid. ESET may normalize hash-only requests to pid=0; check list_device_task_runs with includeFailureSummary=true for execution failure details.",
      );
    }
  }
  if (warnings.length === 0 || !result || typeof result !== "object" || Array.isArray(result)) return result;
  return { ...(result as Record<string, unknown>), _mcpWarnings: warnings };
}

function collectFailureFields(value: unknown, output: Array<Record<string, unknown>>, path = "$"): void {
  if (output.length >= 50 || !value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectFailureFields(item, output, `${path}[${index}]`));
    return;
  }

  const obj = value as Record<string, unknown>;
  for (const [key, item] of Object.entries(obj)) {
    const keyLower = key.toLowerCase();
    const currentPath = `${path}.${key}`;
    const keyLooksRelevant = /error|reason|message|status|result|failure|failed|exitcode/.test(keyLower);
    if (typeof item === "string") {
      const valueLooksRelevant = /fail|error|denied|timeout|not[_ ]?supported|pid|2fa/i.test(item);
      if (keyLooksRelevant || valueLooksRelevant) output.push({ path: currentPath, value: item });
    } else if (typeof item === "number") {
      if ((keyLower === "exitcode" || keyLower.endsWith("exitcode")) && item !== 0) output.push({ path: currentPath, value: item });
    } else {
      collectFailureFields(item, output, currentPath);
    }
  }
}

function withFailureSummary(result: unknown): unknown {
  const failureSummary: Array<Record<string, unknown>> = [];
  collectFailureFields(result, failureSummary);
  if (failureSummary.length === 0 || !result || typeof result !== "object" || Array.isArray(result)) return result;
  return { ...(result as Record<string, unknown>), _mcpFailureSummary: failureSummary };
}

export function registerManagementTools(server: McpServer, client: EsetClient): void {
  server.tool(
    "create_group",
    "Create a new static group",
    { groupData: z.string().describe("JSON request body using the official wrapper, e.g. {group:{displayName,parentUuid}}") },
    async ({ groupData }) => json(await client.createGroup(JSON.parse(groupData))),
  );

  server.tool(
    "move_group",
    "Move a static group to a new parent",
    {
      groupUuid: z.string().describe("UUID of the group to move"),
      moveData: z.string().describe("JSON request body, e.g. {newParentUuid}"),
    },
    async ({ groupUuid, moveData }) => json(await client.moveGroup(groupUuid, JSON.parse(moveData))),
  );

  server.tool(
    "rename_group",
    "Rename a static group",
    {
      groupUuid: z.string().describe("UUID of the group"),
      newName: z.string().describe("New display name for the group"),
    },
    async ({ groupUuid, newName }) => json(await client.renameGroup(groupUuid, newName)),
  );

  server.tool(
    "list_device_tasks",
    "List all device tasks",
    {
      pageSize: z.number().optional().describe("Results per page"),
      pageToken: z.string().optional().describe("Token for next page"),
    },
    async ({ pageSize, pageToken }) => json(await client.listDeviceTasks(pageSize, pageToken)),
  );

  server.tool(
    "create_device_task",
    "Create a device task such as scan, isolate, run command, or shutdown",
    { taskData: z.string().describe("JSON request body using the official {task:{action,targets,triggers}} wrapper") },
    async ({ taskData }) => {
      const parsedTaskData = JSON.parse(taskData);
      try {
        return json(withDeviceTaskWarnings(await client.createDeviceTask(parsedTaskData), parsedTaskData));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return jsonError({
          error: message,
          hint: message.includes("Run Command task creation returned HTTP 500")
            ? "Run Command can be rejected upstream by ESET security requirements such as 2FA/interactive authorization. Verify the API user's requirements and the task wrapper payload."
            : undefined,
        });
      }
    },
  );

  server.tool(
    "get_device_task",
    "Get details of a specific device task",
    { taskUuid: z.string().describe("UUID of the task") },
    async ({ taskUuid }) => json(await client.getDeviceTask(taskUuid)),
  );

  server.tool(
    "delete_device_task",
    "Delete a device task",
    { taskUuid: z.string().describe("UUID of the task to delete") },
    async ({ taskUuid }) => json(await client.deleteDeviceTask(taskUuid)),
  );

  server.tool(
    "list_device_task_runs",
    "List execution runs of a device task",
    {
      taskUuid: z.string().describe("UUID of the task"),
      deviceUuid: z.string().optional().describe("Filter by device UUID"),
      listOnlyLastRuns: z.boolean().optional().describe("Return only the latest run per device"),
      includeFailureSummary: z.boolean().optional().describe("Append relevant status, error, reason, and exit-code fields"),
      pageSize: z.number().optional().describe("Results per page"),
      pageToken: z.string().optional().describe("Token for next page"),
    },
    async ({ taskUuid, deviceUuid, listOnlyLastRuns, includeFailureSummary, pageSize, pageToken }) => {
      const result = await client.listDeviceTaskRuns(taskUuid, deviceUuid, listOnlyLastRuns, pageSize, pageToken);
      return json(includeFailureSummary ? withFailureSummary(result) : result);
    },
  );

  server.tool(
    "update_device_task_targets",
    "Update the target devices or groups of a task",
    {
      taskUuid: z.string().describe("UUID of the task"),
      targetData: z.string().describe("JSON request body, e.g. {targets:{devicesUuids,deviceGroupsUuids}}"),
    },
    async ({ taskUuid, targetData }) => json(await client.updateDeviceTaskTargets(taskUuid, JSON.parse(targetData))),
  );

  server.tool(
    "update_device_task_triggers",
    "Update the triggers of a task",
    {
      taskUuid: z.string().describe("UUID of the task"),
      triggerData: z.string().describe("JSON request body, e.g. {triggers:[...]}"),
    },
    async ({ taskUuid, triggerData }) => json(await client.updateDeviceTaskTriggers(taskUuid, JSON.parse(triggerData))),
  );
}
