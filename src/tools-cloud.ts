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

function jsonError(result: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }], isError: true };
}

function withEdrExclusionCreateWarnings(result: unknown, requestedNote?: string): unknown {
  if (!requestedNote) return result;

  const response = result && typeof result === "object" && !Array.isArray(result)
    ? result as Record<string, unknown>
    : undefined;
  const exclusion = response?.exclusion && typeof response.exclusion === "object" && !Array.isArray(response.exclusion)
    ? response.exclusion as Record<string, unknown>
    : undefined;
  const returnedNote = typeof exclusion?.note === "string" ? exclusion.note : undefined;

  if (returnedNote === requestedNote) return result;

  const warning =
    "MCP sent note as exclusion.note per ESET Connect schema, but the create response did not echo the same note. " +
    "Verify with get_edr_rule_exclusion/search_edr_rule_exclusions; if it remains empty, treat it as upstream ESET API behavior.";

  if (!response) return { result, _mcpWarnings: [warning] };

  const existing = Array.isArray(response._mcpWarnings) ? response._mcpWarnings : [];
  return { ...response, _mcpWarnings: [...existing, warning] };
}

export function registerCloudTools(server: McpServer, client: EsetClient): void {
  // ── Device Management (Cloud extras) ──────────────────────────────

  server.tool(
    "batch_import_devices",
    "Import a batch of devices (Cloud only)",
    { importData: z.string().describe("JSON string of device import data") },
    async ({ importData }) => json(await client.batchImportDevices(JSON.parse(importData))),
  );

  // ── Asset Management ──────────────────────────────────────────────

  server.tool(
    "delete_group",
    "Delete a static group",
    {
      groupUuid: z.string().describe("UUID of the group to delete"),
      releaseConsumedUnits: z.boolean().optional().describe("Release license units consumed by devices in the deleted group"),
    },
    async ({ groupUuid, releaseConsumedUnits }) => json(await client.deleteGroup(groupUuid, releaseConsumedUnits)),
  );

  // ── Automation / Device Tasks ─────────────────────────────────────

  // ── Identity ──────────────────────────────────────────────────────

  server.tool(
    "list_permissions",
    "List all available permissions",
    {
      pageSize: z.number().optional().describe("Results per page"),
      pageToken: z.string().optional().describe("Token for next page"),
    },
    async ({ pageSize, pageToken }) => json(await client.listPermissions(pageSize, pageToken)),
  );

  server.tool(
    "list_role_assignments",
    "List all role assignments",
    {
      includeNestedScopes: z.boolean().optional().describe("Include assignments inherited through nested scopes"),
      subjectReference: z.string().optional().describe("Filter by subject reference"),
      subjectType: z.string().optional().describe("Filter by subject type"),
      orderBy: z.string().optional().describe("Sort expression"),
      pageSize: z.number().optional().describe("Results per page"),
      pageToken: z.string().optional().describe("Token for next page"),
    },
    async ({ includeNestedScopes, subjectReference, subjectType, orderBy, pageSize, pageToken }) =>
      json(await client.listRoleAssignments({ includeNestedScopes, subjectReference, subjectType }, orderBy, pageSize, pageToken)),
  );

  server.tool(
    "assign_role",
    "Assign a role to a user",
    { roleData: z.string().describe("JSON string of role assignment data") },
    async ({ roleData }) => json(await client.assignRole(JSON.parse(roleData))),
  );

  server.tool(
    "revoke_role",
    "Remove an assigned role from a user",
    { roleData: z.string().describe("JSON string of role revocation data") },
    async ({ roleData }) => json(await client.revokeRole(JSON.parse(roleData))),
  );

  server.tool(
    "create_role",
    "Create a new role",
    { roleData: z.string().describe("JSON string of role config") },
    async ({ roleData }) => json(await client.createRole(JSON.parse(roleData))),
  );

  server.tool(
    "delete_role",
    "Delete a role",
    { roleName: z.string().describe("Name of the role to delete") },
    async ({ roleName }) => json(await client.deleteRole(roleName)),
  );

  // ── Detections ────────────────────────────────────────────────────

  server.tool(
    "list_detections",
    "List security detections v1 (ESET PROTECT). Supports filtering by device and time range.",
    {
      deviceUuid: z.string().optional().describe("Filter: only detections on this device UUID"),
      startTime: z.string().optional().describe("Include detections after this time (inclusive). ISO 8601 format, e.g. 2024-10-30T12:00Z"),
      endTime: z.string().optional().describe("Include detections before this time (exclusive). ISO 8601 format, e.g. 2024-10-31T12:00Z"),
      pageSize: z.number().optional().describe("Results per page"),
      pageToken: z.string().optional().describe("Token for next page"),
    },
    async ({ deviceUuid, startTime, endTime, pageSize, pageToken }) =>
      json(await client.listDetections(deviceUuid, startTime, endTime, pageSize, pageToken)),
  );

  server.tool(
    "list_detections_v2",
    "List security detections v2 (ESET Inspect / Cloud Office Security). Supports filtering by cloud office tenant and time range.",
    {
      cloudOfficeTenantUuid: z.string().optional().describe("Filter: only detections from this cloud office tenant UUID. Leave empty for device detections."),
      startTime: z.string().optional().describe("Include detections after this time (inclusive). ISO 8601 format, e.g. 2024-10-30T12:00Z"),
      endTime: z.string().optional().describe("Include detections before this time (exclusive). ISO 8601 format, e.g. 2024-10-31T12:00Z"),
      pageSize: z.number().optional().describe("Results per page"),
      pageToken: z.string().optional().describe("Token for next page"),
    },
    async ({ cloudOfficeTenantUuid, startTime, endTime, pageSize, pageToken }) =>
      json(await client.listDetectionsV2(cloudOfficeTenantUuid, startTime, endTime, pageSize, pageToken)),
  );

  server.tool(
    "get_detection",
    "Get a detection using v1, v2, or automatic v1-to-v2 fallback",
    {
      detectionUuid: z.string().describe("UUID of the detection"),
      apiVersion: z.enum(["auto", "v1", "v2"]).optional().describe("API version; auto tries v1 and retries v2 on 404"),
    },
    async ({ detectionUuid, apiVersion }) => json(await client.getDetection(detectionUuid, apiVersion)),
  );

  server.tool(
    "resolve_detection",
    "Mark a detection as resolved",
    { detectionUuid: z.string().describe("UUID of the detection to resolve") },
    async ({ detectionUuid }) => json(await client.resolveDetection(detectionUuid)),
  );

  server.tool(
    "batch_get_detections",
    "Get multiple detections by UUIDs with optional individual v1/v2 fallback when the atomic v2 batch endpoint returns 404",
    {
      detectionUuids: z.array(z.string()).min(1).describe("Array of detection UUIDs"),
      fallbackToIndividual: z.boolean().optional().describe("Retry each UUID with get_detection apiVersion=auto after a batch 404 (default true)"),
    },
    async ({ detectionUuids, fallbackToIndividual }) =>
      json(await client.batchGetDetections(detectionUuids, fallbackToIndividual ?? true)),
  );

  // ── Detection Groups ──────────────────────────────────────────────

  server.tool(
    "list_detection_groups",
    "List detection groups. Supports filtering by cloud office tenant, device, and time range.",
    {
      cloudOfficeTenantUuid: z.string().optional().describe("Filter: only detection groups from this cloud office tenant. Leave empty for device detections."),
      deviceUuid: z.string().optional().describe("Filter: only detection groups for this device UUID. Leave empty for cloud office detections."),
      startTime: z.string().optional().describe("Include detections after this time (inclusive). ISO 8601 format, e.g. 2024-10-30T12:00Z"),
      endTime: z.string().optional().describe("Include detections before this time (exclusive). ISO 8601 format, e.g. 2024-10-31T12:00Z"),
      pageSize: z.number().optional().describe("Results per page"),
      pageToken: z.string().optional().describe("Token for next page"),
    },
    async ({ cloudOfficeTenantUuid, deviceUuid, startTime, endTime, pageSize, pageToken }) =>
      json(await client.listDetectionGroups(cloudOfficeTenantUuid, deviceUuid, startTime, endTime, pageSize, pageToken)),
  );

  server.tool(
    "get_detection_group",
    "Get details of a specific detection group",
    { detectionGroupUuid: z.string().describe("UUID of the detection group") },
    async ({ detectionGroupUuid }) => json(await client.getDetectionGroup(detectionGroupUuid)),
  );

  server.tool(
    "resolve_detection_group",
    "Resolve all detections in a detection group",
    { detectionGroupUuid: z.string().describe("UUID of the detection group to resolve") },
    async ({ detectionGroupUuid }) => json(await client.resolveDetectionGroup(detectionGroupUuid)),
  );

  server.tool(
    "search_detection_groups",
    "Search detection groups matching given criteria",
    { searchData: z.string().describe("JSON string of search criteria") },
    async ({ searchData }) => json(await client.searchDetectionGroups(JSON.parse(searchData))),
  );

  // ── EDR Rules ─────────────────────────────────────────────────────

  server.tool(
    "list_edr_rules",
    "List EDR (Endpoint Detection and Response) rules. Supports filtering by severity level.",
    {
      severityLevel: z.string().optional().describe(
        'Filter by severity. Values: SEVERITY_LEVEL_UNSPECIFIED, SEVERITY_LEVEL_DIAGNOSTIC, SEVERITY_LEVEL_INFORMATIONAL, SEVERITY_LEVEL_LOW, SEVERITY_LEVEL_MEDIUM, SEVERITY_LEVEL_HIGH'
      ),
      includeTotalSize: z.boolean().optional().describe("If true, includes total_size count in response"),
      pageSize: z.number().optional().describe("Results per page"),
      pageToken: z.string().optional().describe("Token for next page"),
    },
    async ({ severityLevel, includeTotalSize, pageSize, pageToken }) =>
      json(await client.listEdrRules(severityLevel, includeTotalSize, pageSize, pageToken)),
  );

  server.tool(
    "create_edr_rule",
    "Create a new EDR rule",
    { ruleData: z.string().describe("JSON string of EDR rule definition") },
    async ({ ruleData }) => json(await client.createEdrRule(JSON.parse(ruleData))),
  );

  server.tool(
    "get_edr_rule",
    "Get details of a specific EDR rule",
    { ruleUuid: z.string().describe("UUID of the EDR rule") },
    async ({ ruleUuid }) => json(await client.getEdrRule(ruleUuid)),
  );

  server.tool(
    "delete_edr_rule",
    "Delete an EDR rule",
    { ruleUuid: z.string().describe("UUID of the EDR rule to delete") },
    async ({ ruleUuid }) => json(await client.deleteEdrRule(ruleUuid)),
  );

  server.tool(
    "enable_edr_rule",
    "Enable an EDR rule",
    { ruleUuid: z.string().describe("UUID of the EDR rule to enable") },
    async ({ ruleUuid }) => json(await client.enableEdrRule(ruleUuid)),
  );

  server.tool(
    "disable_edr_rule",
    "Disable an EDR rule",
    { ruleUuid: z.string().describe("UUID of the EDR rule to disable") },
    async ({ ruleUuid }) => json(await client.disableEdrRule(ruleUuid)),
  );

  server.tool(
    "update_edr_rule_definition",
    "Update the definition of an EDR rule",
    {
      ruleUuid: z.string().describe("UUID of the EDR rule"),
      definitionData: z.string().describe("JSON string of updated rule definition"),
    },
    async ({ ruleUuid, definitionData }) => json(await client.updateEdrRuleDefinition(ruleUuid, JSON.parse(definitionData))),
  );

  // ── EDR Rule Exclusions ───────────────────────────────────────────

  server.tool(
    "list_edr_rule_exclusions",
    "List EDR rule exclusions (ESET Inspect exclusions). " +
    "Returns exclusions with uuid, displayName, enabled, xmlDefinition, ruleUuids, scopes, note, authorUuid, editorUuid. " +
    "Use search_edr_rule_exclusions when the tenant has many exclusions and you need duplicate checks by name, rule UUID, scope, note, or XML content.",
    {
      includeTotalSize: z.boolean().optional().describe("If true, includes total_size count in response"),
      pageSize: z.number().optional().describe("Results per page (default 50, max 1000)"),
      pageToken: z.string().optional().describe("Token for next page from previous response's nextPageToken"),
    },
    async ({ includeTotalSize, pageSize, pageToken }) => json(await client.listEdrRuleExclusions(includeTotalSize, pageSize, pageToken)),
  );

  server.tool(
    "search_edr_rule_exclusions",
    "Search EDR rule exclusions by scanning paginated list_edr_rule_exclusions results client-side. " +
    "ESET Connect exposes pagination for this API but no server-side filter parameter, so this tool is intended for duplicate checks in large tenants. " +
    "All provided filters are ANDed together.",
    {
      displayName: z.string().optional().describe("Case-insensitive displayName substring to match"),
      ruleUuid: z.string().optional().describe("Exact EDR rule UUID that must appear in ruleUuids"),
      deviceUuid: z.string().optional().describe("Exact scoped device UUID that must appear in scopes"),
      deviceGroupUuid: z.string().optional().describe("Exact scoped device group UUID that must appear in scopes"),
      xmlContains: z.string().optional().describe("Case-insensitive substring to find inside xmlDefinition"),
      noteContains: z.string().optional().describe("Case-insensitive substring to find inside note"),
      enabled: z.boolean().optional().describe("If set, match only enabled or disabled exclusions"),
      limit: z.number().optional().describe("Maximum matches to return (default 20, max 100)"),
      pageSize: z.number().optional().describe("Page size while scanning (default 1000, max 1000)"),
    },
    async ({ displayName, ruleUuid, deviceUuid, deviceGroupUuid, xmlContains, noteContains, enabled, limit, pageSize }) => {
      const hasFilter = Boolean(
        displayName || ruleUuid || deviceUuid || deviceGroupUuid || xmlContains || noteContains || enabled !== undefined,
      );
      if (!hasFilter) {
        return jsonError({
          error: "Provide at least one search filter.",
          supportedFilters: ["displayName", "ruleUuid", "deviceUuid", "deviceGroupUuid", "xmlContains", "noteContains", "enabled"],
        });
      }

      return json(await client.searchEdrRuleExclusions({
        displayName,
        ruleUuid,
        deviceUuid,
        deviceGroupUuid,
        xmlContains,
        noteContains,
        enabled,
        limit,
        pageSize,
      }));
    },
  );

  server.tool(
    "create_edr_rule_exclusion",
    "Create an EDR rule exclusion (ESET Inspect exclusion). " +
    "An EDR rule exclusion patches one or more EDR rules so they do NOT trigger their action on matching activity. " +
    "Exclusions use the same XML definition format as EDR rules (https://help.eset.com/ei_rules/latest/en-US/) but actions in the XML are ignored. " +
    "IMPORTANT: ruleUuids is REQUIRED by the API — the call will fail without at least one rule UUID. " +
    "Use list_edr_rules to find rule UUIDs first.",
    {
      enabled: z.boolean().describe(
        "Whether the exclusion should be active immediately. true = exclusion is enforced, false = created but inactive."
      ),
      xmlDefinition: z.string().describe(
        "XML definition of the EDR rule exclusion. Uses the ESET Inspect rules XML format " +
        "(spec: https://help.eset.com/ei_rules/latest/en-US/). Actions in the XML are ignored for exclusions. " +
        "The displayName is derived from <description><name>...</name></description> inside the XML. " +
        "Example minimal structure: " +
        "'<rule><description><name>Exclude MyApp</name><category>Exclusion</category></description>" +
        "<definition><process><operator type=\"OR\">" +
        "<condition component=\"FileItem\" property=\"FileName\" condition=\"is\" value=\"myapp.exe\" />" +
        "</operator></process></definition></rule>'"
      ),
      ruleUuids: z.array(z.string()).min(1).describe(
        "REQUIRED. Array of EDR rule UUIDs that this exclusion applies to. " +
        "At least one rule UUID must be provided — the API rejects requests without it. " +
        "Use list_edr_rules to find rule UUIDs."
      ),
      note: z.string().optional().describe(
        "Optional user note explaining the exclusion purpose. Maximum 2048 characters."
      ),
      scopes: z.string().optional().describe(
        "Optional JSON string of scopes array to limit where this exclusion applies. " +
        "Each scope object can have 'deviceUuid' and/or 'deviceGroupUuid'. " +
        "Example: '[{\"deviceUuid\":\"abc-123\"},{\"deviceGroupUuid\":\"def-456\"}]'. " +
        "If omitted, the exclusion applies globally. Use list_devices or list_device_groups to find UUIDs."
      ),
    },
    async ({ enabled, xmlDefinition, ruleUuids, note, scopes }) => {
      const parsedScopes = scopes ? JSON.parse(scopes) : undefined;
      const exclusion: Record<string, unknown> = {
        enabled,
        xmlDefinition,
        ruleUuids,
      };
      if (note) exclusion.note = note;
      if (parsedScopes) exclusion.scopes = parsedScopes;

      const payload = { exclusion };
      process.stderr.write(
        `[eset-mcp] create_edr_rule_exclusion payload metadata: ruleUuids=${ruleUuids.length}, ` +
        `xmlDefinitionLength=${xmlDefinition.length}, hasNote=${Boolean(note)}, hasScopes=${Boolean(parsedScopes)}\n`,
      );

      try {
        const result = await client.createEdrRuleExclusion(payload);
        return json(withEdrExclusionCreateWarnings(result, note));
      } catch (err) {
        const errMsg = String(err);
        process.stderr.write(`[eset-mcp] create_edr_rule_exclusion error: ${errMsg}\n`);
        // Return structured error instead of throwing — helps AI see what went wrong
        return {
          content: [{ type: "text" as const, text: JSON.stringify({
            error: errMsg,
            hint: "Ensure ruleUuids contains valid EDR rule UUIDs (use list_edr_rules) and xmlDefinition is valid ESET Inspect XML.",
            payloadSent: {
              exclusionKeys: Object.keys(exclusion),
              ruleUuidsCount: ruleUuids.length,
              xmlDefinitionLength: xmlDefinition.length,
              scopesCount: Array.isArray(parsedScopes) ? parsedScopes.length : 0,
            },
          }, null, 2) }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "get_edr_rule_exclusion",
    "Get full details of a specific EDR rule exclusion including its XML definition, enabled state, scopes, and linked rule UUIDs.",
    { exclusionUuid: z.string().describe("UUID of the EDR rule exclusion. Use search_edr_rule_exclusions or list_edr_rule_exclusions to find it.") },
    async ({ exclusionUuid }) => json(await client.getEdrRuleExclusion(exclusionUuid)),
  );

  server.tool(
    "delete_edr_rule_exclusion",
    "Delete an EDR rule exclusion. This permanently removes the exclusion — the associated EDR rules will resume triggering on previously excluded activity.",
    { exclusionUuid: z.string().describe("UUID of the EDR rule exclusion to delete. Use search_edr_rule_exclusions or list_edr_rule_exclusions to find it.") },
    async ({ exclusionUuid }) => json(await client.deleteEdrRuleExclusion(exclusionUuid)),
  );

  server.tool(
    "update_edr_rule_exclusion_definition",
    "Update the XML definition of an existing EDR rule exclusion. " +
    "The XML follows the ESET Inspect rules format (https://help.eset.com/ei_rules/latest/en-US/) — actions are ignored for exclusions. " +
    "The exclusion's displayName will be updated from the <description><name> element in the new XML.",
    {
      exclusionUuid: z.string().describe("UUID of the EDR rule exclusion to update. Use search_edr_rule_exclusions or list_edr_rule_exclusions to find it."),
      xmlDefinition: z.string().describe(
        "New XML definition of the EDR rule exclusion. Uses the ESET Inspect rules XML format " +
        "(spec: https://help.eset.com/ei_rules/latest/en-US/). Actions in the XML are ignored. " +
        "Must be valid XML according to the specification. " +
        "The displayName is derived from <description><name>...</name></description> inside the XML."
      ),
    },
    async ({ exclusionUuid, xmlDefinition }) => json(await client.updateEdrRuleExclusionDefinition(exclusionUuid, { xmlDefinition })),
  );

  // ── Incidents ─────────────────────────────────────────────────────

  server.tool(
    "list_incidents",
    "List security incidents. Supports CEL filter syntax, e.g. status==INCIDENT_STATUS_OPEN, severity==INCIDENT_SEVERITY_LEVEL_HIGH, displayName.contains(\"abc\"). Enum values must not be quoted. Status values: INCIDENT_STATUS_OPEN, INCIDENT_STATUS_IN_PROGRESS, INCIDENT_STATUS_CLOSED, INCIDENT_STATUS_WAITING_FOR_INPUT. Severity values: INCIDENT_SEVERITY_LEVEL_LOW, INCIDENT_SEVERITY_LEVEL_MEDIUM, INCIDENT_SEVERITY_LEVEL_HIGH.",
    {
      filter: z.string().optional().describe("CEL filter expression, e.g. status==INCIDENT_STATUS_OPEN. Do not quote enum values."),
      orderBy: z.string().optional().describe('Comma-separated fields with optional " desc" suffix, e.g. "severity desc"'),
      pageSize: z.number().optional().describe("Results per page"),
      pageToken: z.string().optional().describe("Token for next page"),
    },
    async ({ filter, orderBy, pageSize, pageToken }) => json(await client.listIncidents(filter, orderBy, pageSize, pageToken)),
  );

  server.tool(
    "get_incident",
    "Get detailed information about a specific incident",
    { incidentUuid: z.string().describe("UUID of the incident") },
    async ({ incidentUuid }) => json(await client.getIncident(incidentUuid)),
  );

  server.tool(
    "close_incident",
    "Close a security incident. closureReason is REQUIRED. " +
    "closureReason values: INCIDENT_RESOLVE_REASON_TRUE_POSITIVE, INCIDENT_RESOLVE_REASON_FALSE_POSITIVE, INCIDENT_RESOLVE_REASON_SUSPICIOUS.",
    {
      incidentUuid: z.string().describe("UUID of the incident to close"),
      closureReason: z.string().describe(
        'REQUIRED. Reason for closing. Values: INCIDENT_RESOLVE_REASON_TRUE_POSITIVE, INCIDENT_RESOLVE_REASON_FALSE_POSITIVE, INCIDENT_RESOLVE_REASON_SUSPICIOUS'
      ),
      finalComment: z.string().optional().describe("Optional closing comment text explaining why/how the incident was resolved"),
    },
    async ({ incidentUuid, closureReason, finalComment }) => json(await client.closeIncident(incidentUuid, closureReason, finalComment)),
  );

  server.tool(
    "reopen_incident",
    "Reopen a previously closed incident. Optionally include a comment explaining why.",
    {
      incidentUuid: z.string().describe("UUID of the incident to reopen"),
      comment: z.string().optional().describe("Optional comment text explaining why the incident is being reopened"),
    },
    async ({ incidentUuid, comment }) => json(await client.reopenIncident(incidentUuid, comment)),
  );

  server.tool(
    "update_incident_attributes",
    "Update basic attributes of an incident (e.g. assignee, priority)",
    {
      incidentUuid: z.string().describe("UUID of the incident"),
      attributeData: z.string().describe("JSON string of attributes to update"),
    },
    async ({ incidentUuid, attributeData }) => json(await client.updateIncidentAttributes(incidentUuid, JSON.parse(attributeData))),
  );

  // ── Incident Comments ─────────────────────────────────────────────

  server.tool(
    "list_incident_comments",
    "List comments on an incident",
    { incidentUuid: z.string().describe("UUID of the incident") },
    async ({ incidentUuid }) => json(await client.listIncidentComments(incidentUuid)),
  );

  server.tool(
    "create_incident_comment",
    "Add a comment to an incident",
    {
      incidentUuid: z.string().describe("UUID of the incident"),
      commentData: z.string().describe("JSON string of comment data. Use {\"text\":\"...\"}; the MCP server wraps it as {comment:{incidentUuid,text}} for ESET."),
    },
    async ({ incidentUuid, commentData }) => json(await client.createIncidentComment(incidentUuid, JSON.parse(commentData))),
  );

  server.tool(
    "get_incident_comment",
    "Get a specific comment on an incident",
    {
      incidentUuid: z.string().describe("UUID of the incident"),
      commentUuid: z.string().describe("UUID of the comment"),
    },
    async ({ incidentUuid, commentUuid }) => json(await client.getIncidentComment(incidentUuid, commentUuid)),
  );

  server.tool(
    "delete_incident_comment",
    "Delete a comment from an incident",
    {
      incidentUuid: z.string().describe("UUID of the incident"),
      commentUuid: z.string().describe("UUID of the comment to delete"),
    },
    async ({ incidentUuid, commentUuid }) => json(await client.deleteIncidentComment(incidentUuid, commentUuid)),
  );

  server.tool(
    "update_incident_comment_text",
    "Update the text of an incident comment",
    {
      incidentUuid: z.string().describe("UUID of the incident"),
      commentUuid: z.string().describe("UUID of the comment"),
      textData: z.string().describe("JSON string of text update data (e.g. {text})"),
    },
    async ({ incidentUuid, commentUuid, textData }) =>
      json(await client.updateIncidentCommentText(incidentUuid, commentUuid, JSON.parse(textData))),
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
    "search_executables",
    "Search executables by exact SHA1 hash or case-insensitive display name substring. This scans list_executables pages client-side because ESET only exposes pageSize/pageToken on the list endpoint.",
    {
      hashSha1: z.string().optional().describe("Exact SHA1 hash to match"),
      displayName: z.string().optional().describe("Case-insensitive display name substring to match"),
      limit: z.number().optional().describe("Maximum matches to return (default 20, max 100)"),
      pageSize: z.number().optional().describe("Page size while scanning (default 1000, max 1000)"),
    },
    async ({ hashSha1, displayName, limit, pageSize }) => {
      if (!hashSha1 && !displayName) {
        return jsonError({ error: "Provide hashSha1 or displayName." });
      }
      return json(await client.searchExecutables({ hashSha1, displayName, limit, pageSize }));
    },
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
    "List quarantined objects. Supports extensive filtering by file name, origin, type, quarantine reason, time range, email fields, and sorting. " +
    "objectOrigin values: OBJECT_ORIGIN_MS_OFFICE365, OBJECT_ORIGIN_GOOGLE_WORKSPACE, OBJECT_ORIGIN_DEVICE. " +
    "objectType values: EMAIL_MESSAGE, EMAIL_ATTACHMENT, FILE_ON_DRIVE. " +
    "quarantineReason values: MALWARE, GRAYWARE, PHISHING, SPAM, SENDER_SPOOFING, RULE.",
    {
      fileName: z.string().optional().describe("Filter by quarantined file name (suffix match)"),
      objectOrigin: z.string().optional().describe("Filter by origin: OBJECT_ORIGIN_MS_OFFICE365, OBJECT_ORIGIN_GOOGLE_WORKSPACE, OBJECT_ORIGIN_DEVICE"),
      objectType: z.string().optional().describe("Filter by type: EMAIL_MESSAGE, EMAIL_ATTACHMENT, FILE_ON_DRIVE"),
      quarantineReason: z.string().optional().describe("Filter by reason: MALWARE, GRAYWARE, PHISHING, SPAM, SENDER_SPOOFING, RULE"),
      quarantineTimeStartTime: z.string().optional().describe("Filter: quarantine time start (inclusive). ISO 8601, e.g. 2024-10-30T12:00Z"),
      quarantineTimeEndTime: z.string().optional().describe("Filter: quarantine time end (exclusive). ISO 8601, e.g. 2024-10-31T12:00Z"),
      userUuid: z.string().optional().describe("Filter by user UUID who owns the storage"),
      cloudOfficeTenantUuid: z.string().optional().describe("Filter by cloud office tenant UUID"),
      emailSender: z.string().optional().describe("Filter by email sender address"),
      emailRecipient: z.string().optional().describe("Filter by email recipient address"),
      emailSubject: z.string().optional().describe("Filter by email subject (contains match)"),
      emailInternetMessageId: z.string().optional().describe("Filter by email Message-ID"),
      msSharepointRootSiteUuid: z.string().optional().describe("Filter by SharePoint root site UUID"),
      msTeamsTeamUuid: z.string().optional().describe("Filter by MS Teams team UUID"),
      orderBy: z.string().optional().describe('Comma-separated sort fields with optional " desc" suffix'),
      pageSize: z.number().optional().describe("Results per page"),
      pageToken: z.string().optional().describe("Token for next page"),
    },
    async ({ fileName, objectOrigin, objectType, quarantineReason, quarantineTimeStartTime, quarantineTimeEndTime, userUuid, cloudOfficeTenantUuid, emailSender, emailRecipient, emailSubject, emailInternetMessageId, msSharepointRootSiteUuid, msTeamsTeamUuid, orderBy, pageSize, pageToken }) =>
      json(await client.listQuarantinedObjects({
        fileName, objectOrigin, objectType, quarantineReason,
        quarantineTimeStartTime, quarantineTimeEndTime, userUuid,
        cloudOfficeTenantUuid, emailSender, emailRecipient, emailSubject,
        emailInternetMessageId, msSharepointRootSiteUuid, msTeamsTeamUuid,
      }, orderBy, pageSize, pageToken)),
  );

  server.tool(
    "get_quarantined_object",
    "Get details about a specific quarantined object",
    { objectUuid: z.string().describe("UUID of the quarantined object") },
    async ({ objectUuid }) => json(await client.getQuarantinedObject(objectUuid)),
  );

  server.tool(
    "get_quarantine_count",
    "Get the count of quarantined objects matching optional filters",
    {
      fileName: z.string().optional().describe("Filter by quarantined file name"),
      objectOrigin: z.string().optional().describe("Filter by object origin"),
      objectType: z.string().optional().describe("Filter by object type"),
      quarantineReason: z.string().optional().describe("Filter by quarantine reason"),
      quarantineTimeStartTime: z.string().optional().describe("Quarantine time start in ISO 8601 format"),
      quarantineTimeEndTime: z.string().optional().describe("Quarantine time end in ISO 8601 format"),
      userUuid: z.string().optional().describe("Filter by user UUID"),
      cloudOfficeTenantUuid: z.string().optional().describe("Filter by cloud office tenant UUID"),
      emailSender: z.string().optional().describe("Filter by email sender"),
      emailRecipient: z.string().optional().describe("Filter by email recipient"),
      emailSubject: z.string().optional().describe("Filter by email subject"),
      emailInternetMessageId: z.string().optional().describe("Filter by email Message-ID"),
      msSharepointRootSiteUuid: z.string().optional().describe("Filter by SharePoint root site UUID"),
      msTeamsTeamUuid: z.string().optional().describe("Filter by Teams team UUID"),
    },
    async ({ fileName, objectOrigin, objectType, quarantineReason, quarantineTimeStartTime, quarantineTimeEndTime, userUuid, cloudOfficeTenantUuid, emailSender, emailRecipient, emailSubject, emailInternetMessageId, msSharepointRootSiteUuid, msTeamsTeamUuid }) =>
      json(await client.getQuarantineCount({
        fileName, objectOrigin, objectType, quarantineReason,
        quarantineTimeStartTime, quarantineTimeEndTime, userUuid,
        cloudOfficeTenantUuid, emailSender, emailRecipient, emailSubject,
        emailInternetMessageId, msSharepointRootSiteUuid, msTeamsTeamUuid,
      })),
  );

  server.tool(
    "batch_delete_quarantined_objects",
    "Delete multiple quarantined objects",
    { objectUuids: z.array(z.string()).describe("Array of quarantined object UUIDs") },
    async ({ objectUuids }) => json(await client.batchDeleteQuarantinedObjects(objectUuids)),
  );

  server.tool(
    "batch_download_quarantined_objects",
    "Download multiple quarantined objects",
    { objectUuids: z.array(z.string()).describe("Array of quarantined object UUIDs") },
    async ({ objectUuids }) => json(await client.batchDownloadQuarantinedObjects(objectUuids)),
  );

  server.tool(
    "batch_restore_quarantined_objects",
    "Restore multiple quarantined objects",
    { objectUuids: z.array(z.string()).describe("Array of quarantined object UUIDs") },
    async ({ objectUuids }) => json(await client.batchRestoreQuarantinedObjects(objectUuids)),
  );

  server.tool(
    "download_quarantined_object",
    "Download a quarantined object",
    { downloadData: z.string().describe("JSON string of download config") },
    async ({ downloadData }) => json(await client.downloadQuarantinedObject(JSON.parse(downloadData))),
  );

  server.tool(
    "purge_quarantined_objects",
    "Permanently delete quarantined objects",
    { purgeData: z.string().describe("JSON string of purge criteria") },
    async ({ purgeData }) => json(await client.purgeQuarantinedObjects(JSON.parse(purgeData))),
  );

  server.tool(
    "restore_quarantined_object",
    "Restore a quarantined object to its original location",
    { restoreData: z.string().describe("JSON string of restore config") },
    async ({ restoreData }) => json(await client.restoreQuarantinedObject(JSON.parse(restoreData))),
  );

  // ── Installer Management ──────────────────────────────────────────

  server.tool(
    "list_installers",
    "List created installers",
    {
      usable: z.boolean().optional().describe("Filter by whether the installer can still be used"),
      pageSize: z.number().optional().describe("Results per page"),
      pageToken: z.string().optional().describe("Token for next page"),
    },
    async ({ usable, pageSize, pageToken }) => json(await client.listInstallers(usable, pageSize, pageToken)),
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

  server.tool(
    "generate_gpo_sccm_file",
    "Generate a GPO/SCCM deployment file",
    { generateData: z.string().describe("JSON string of generation config") },
    async ({ generateData }) => json(await client.generateGpoSccmFile(JSON.parse(generateData))),
  );

  // ── Mobile Device Management ──────────────────────────────────────

  server.tool(
    "batch_activate_mobile_product",
    "Batch activate product on mobile devices",
    { activationData: z.string().describe("JSON string of activation data") },
    async ({ activationData }) => json(await client.batchActivateMobileProduct(JSON.parse(activationData))),
  );

  server.tool(
    "batch_get_enrollment_links",
    "Get enrollment links for mobile devices in batch",
    { enrollmentData: z.string().describe("JSON string of enrollment request data") },
    async ({ enrollmentData }) => json(await client.batchGetEnrollmentLinks(JSON.parse(enrollmentData))),
  );

  // Patch Management

  server.tool(
    "list_recent_application_patching_details",
    "List recent application patching process details",
    {},
    async () => json(await client.listRecentApplicationPatchingDetails()),
  );

  server.tool(
    "list_device_patches",
    "List application patches for devices or device groups",
    {
      deviceUuid: z.string().optional().describe("Filter by device UUID"),
      deviceGroupUuid: z.string().optional().describe("Filter by device group UUID"),
      patchType: z.string().optional().describe("Filter by patch type"),
      pageSize: z.number().optional().describe("Results per page"),
      pageToken: z.string().optional().describe("Token for next page"),
    },
    async ({ deviceUuid, deviceGroupUuid, patchType, pageSize, pageToken }) =>
      json(await client.listDevicePatches({ deviceUuid, deviceGroupUuid, patchType }, pageSize, pageToken)),
  );

  server.tool(
    "list_patching_process_details",
    "List patching process details for devices or device groups",
    {
      deviceUuid: z.string().optional().describe("Filter by device UUID"),
      deviceGroupUuid: z.string().optional().describe("Filter by device group UUID"),
      startTime: z.string().optional().describe("Time period start in ISO 8601 format"),
      endTime: z.string().optional().describe("Time period end in ISO 8601 format"),
      pageSize: z.number().optional().describe("Results per page"),
      pageToken: z.string().optional().describe("Token for next page"),
    },
    async ({ deviceUuid, deviceGroupUuid, startTime, endTime, pageSize, pageToken }) =>
      json(await client.listPatchingProcessDetails({ deviceUuid, deviceGroupUuid, startTime, endTime }, pageSize, pageToken)),
  );

  // Vulnerability Management

  server.tool(
    "list_device_os_vulnerabilities",
    "List operating system vulnerabilities for devices or device groups",
    {
      deviceUuid: z.string().optional().describe("Filter by device UUID"),
      deviceGroupUuid: z.string().optional().describe("Filter by device group UUID"),
      pageSize: z.number().optional().describe("Results per page"),
      pageToken: z.string().optional().describe("Token for next page"),
    },
    async ({ deviceUuid, deviceGroupUuid, pageSize, pageToken }) =>
      json(await client.listDeviceOsVulnerabilities(deviceUuid, deviceGroupUuid, pageSize, pageToken)),
  );

  server.tool(
    "list_device_vulnerabilities",
    "List application vulnerabilities for devices or device groups",
    {
      deviceUuid: z.string().optional().describe("Filter by device UUID"),
      deviceGroupUuid: z.string().optional().describe("Filter by device group UUID"),
      vulnerabilityScope: z.string().optional().describe("Filter by vulnerability scope"),
      pageSize: z.number().optional().describe("Results per page"),
      pageToken: z.string().optional().describe("Token for next page"),
    },
    async ({ deviceUuid, deviceGroupUuid, vulnerabilityScope, pageSize, pageToken }) =>
      json(await client.listDeviceVulnerabilities({ deviceUuid, deviceGroupUuid, vulnerabilityScope }, pageSize, pageToken)),
  );

  server.tool(
    "list_recent_vulnerability_scans",
    "List recent vulnerability scan details",
    {
      deviceUuid: z.string().optional().describe("Filter by device UUID"),
      deviceGroupUuid: z.string().optional().describe("Filter by device group UUID"),
      pageSize: z.number().optional().describe("Results per page"),
      pageToken: z.string().optional().describe("Token for next page"),
    },
    async ({ deviceUuid, deviceGroupUuid, pageSize, pageToken }) =>
      json(await client.listRecentVulnerabilityScans(deviceUuid, deviceGroupUuid, pageSize, pageToken)),
  );

  server.tool(
    "list_vulnerable_devices",
    "List devices with known vulnerabilities",
    {
      deviceGroupUuid: z.string().optional().describe("Filter by device group UUID"),
      pageSize: z.number().optional().describe("Results per page"),
      pageToken: z.string().optional().describe("Token for next page"),
    },
    async ({ deviceGroupUuid, pageSize, pageToken }) =>
      json(await client.listVulnerableDevices(deviceGroupUuid, pageSize, pageToken)),
  );

  // ── Network Access Protection ─────────────────────────────────────

  server.tool(
    "list_ip_sets",
    "List IP sets for a policy (Network Access Protection). ESET supports this only for Common features policies.",
    {
      policyUuid: z.string().describe("UUID of the policy"),
      pageSize: z.number().optional().describe("Results per page"),
      pageToken: z.string().optional().describe("Token for next page"),
    },
    async ({ policyUuid, pageSize, pageToken }) => {
      try {
        return json(await client.listIpSets(policyUuid, pageSize, pageToken));
      } catch (error) {
        return jsonError({
          error: error instanceof Error ? error.message : String(error),
          hint: "Network Access Protection IP sets are supported only for Common features policies. Unsupported policies can return HTTP 400; HTTP 500 with an empty body can indicate an upstream ESET failure for that policy or tenant.",
        });
      }
    },
  );

  server.tool(
    "get_ip_set",
    "Get details of a specific IP set",
    {
      policyUuid: z.string().describe("UUID of the policy"),
      ipSetUuid: z.string().describe("UUID of the IP set"),
    },
    async ({ policyUuid, ipSetUuid }) => json(await client.getIpSet(policyUuid, ipSetUuid)),
  );

  server.tool(
    "update_ip_set",
    "Update an IP set in a policy",
    {
      policyUuid: z.string().describe("UUID of the policy"),
      ipSetUuid: z.string().describe("UUID of the IP set"),
      ipSetData: z.string().describe("JSON string of updated IP set data"),
    },
    async ({ policyUuid, ipSetUuid, ipSetData }) =>
      json(await client.updateIpSet(policyUuid, ipSetUuid, JSON.parse(ipSetData))),
  );

  // ── User Management ───────────────────────────────────────────────

  server.tool(
    "list_users",
    "List users (ESET Cloud Office Security). Supports filtering by display name, email, protection status, user group, tenant, and license. " +
    "protectionStatus values: UNPROTECTED, PENDING, PARTIALLY_PROTECTED, FULLY_PROTECTED.",
    {
      activeProductAutoActivated: z.boolean().optional().describe("Filter by active product auto-activation state"),
      activeProductAutoActivationBase: z.string().optional().describe("Filter by active product auto-activation base"),
      activeProductAutoActivationUserGroupUuid: z.string().optional().describe("Filter by auto-activation user group UUID"),
      activeProductSubscriptionUuid: z.string().optional().describe("Filter by active product subscription UUID"),
      activeProductUnitPoolUuid: z.string().optional().describe("Filter by active product unit pool UUID"),
      activeProductId: z.number().optional().describe("Filter by active product ID"),
      activeProductName: z.string().optional().describe("Filter by active product name"),
      displayName: z.string().optional().describe("Filter by display name (partial match)"),
      email: z.string().optional().describe("Filter by email (partial match across primary + proxy addresses)"),
      protectionStatus: z.string().optional().describe("Filter by status: UNPROTECTED, PENDING, PARTIALLY_PROTECTED, FULLY_PROTECTED"),
      userGroupUuid: z.string().optional().describe("Filter by user group UUID"),
      cloudOfficeTenantReference: z.string().optional().describe("Filter by cloud office tenant reference (exact match)"),
      hasCloudOfficeMsLicense: z.boolean().optional().describe("Filter by MS cloud office license presence"),
      pageSize: z.number().optional().describe("Results per page"),
      pageToken: z.string().optional().describe("Token for next page"),
    },
    async ({ activeProductAutoActivated, activeProductAutoActivationBase, activeProductAutoActivationUserGroupUuid, activeProductSubscriptionUuid, activeProductUnitPoolUuid, activeProductId, activeProductName, displayName, email, protectionStatus, userGroupUuid, cloudOfficeTenantReference, hasCloudOfficeMsLicense, pageSize, pageToken }) =>
      json(await client.listUsers({
        activeProductAutoActivated, activeProductAutoActivationBase, activeProductAutoActivationUserGroupUuid,
        activeProductSubscriptionUuid, activeProductUnitPoolUuid, activeProductId, activeProductName,
        displayName, email, protectionStatus, userGroupUuid, cloudOfficeTenantReference, hasCloudOfficeMsLicense,
      }, pageSize, pageToken)),
  );

  server.tool(
    "get_user",
    "Get details about a specific user",
    { userUuid: z.string().describe("UUID of the user") },
    async ({ userUuid }) => json(await client.getUser(userUuid)),
  );

  server.tool(
    "batch_get_users",
    "Get multiple users by UUIDs",
    { userUuids: z.array(z.string()).describe("Array of user UUIDs") },
    async ({ userUuids }) => json(await client.batchGetUsers(userUuids)),
  );

  // ── Web Access Protection ─────────────────────────────────────────

  server.tool(
    "list_web_address_rules",
    "List web address rules for a policy",
    {
      policyUuid: z.string().describe("UUID of the policy"),
      includeDomain: z.string().optional().describe("Return only rules that include this domain"),
    },
    async ({ policyUuid, includeDomain }) => json(await client.listWebAddressRules(policyUuid, includeDomain)),
  );

  server.tool(
    "update_web_address_rule_domains",
    "Update domains in a web address rule",
    {
      policyUuid: z.string().describe("UUID of the policy"),
      addressRuleUuid: z.string().describe("UUID of the web address rule"),
      domainData: z.string().describe("JSON string of domain update data"),
    },
    async ({ policyUuid, addressRuleUuid, domainData }) =>
      json(await client.updateWebAddressRuleDomains(policyUuid, addressRuleUuid, JSON.parse(domainData))),
  );
}
