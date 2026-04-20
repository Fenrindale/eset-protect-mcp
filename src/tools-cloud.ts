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
  // ── Device Management (Cloud extras) ──────────────────────────────

  server.tool(
    "batch_import_devices",
    "Import a batch of devices (Cloud only)",
    { importData: z.string().describe("JSON string of device import data") },
    async ({ importData }) => json(await client.batchImportDevices(JSON.parse(importData))),
  );

  // ── Asset Management ──────────────────────────────────────────────

  server.tool(
    "create_group",
    "Create a new static group",
    { groupData: z.string().describe("JSON string of group config (e.g. {name, parentUuid})") },
    async ({ groupData }) => json(await client.createGroup(JSON.parse(groupData))),
  );

  server.tool(
    "delete_group",
    "Delete a static group",
    { groupUuid: z.string().describe("UUID of the group to delete") },
    async ({ groupUuid }) => json(await client.deleteGroup(groupUuid)),
  );

  server.tool(
    "move_group",
    "Move a static group to a new parent",
    {
      groupUuid: z.string().describe("UUID of the group to move"),
      moveData: z.string().describe("JSON string with move target (e.g. {newParentUuid})"),
    },
    async ({ groupUuid, moveData }) => json(await client.moveGroup(groupUuid, JSON.parse(moveData))),
  );

  server.tool(
    "rename_group",
    "Rename a static group",
    {
      groupUuid: z.string().describe("UUID of the group"),
      newName: z.string().describe("New name for the group"),
    },
    async ({ groupUuid, newName }) => json(await client.renameGroup(groupUuid, newName)),
  );

  // ── Automation / Device Tasks ─────────────────────────────────────

  server.tool(
    "list_device_tasks",
    "List all device tasks (client tasks)",
    {
      pageSize: z.number().optional().describe("Results per page"),
      pageToken: z.string().optional().describe("Token for next page"),
    },
    async ({ pageSize, pageToken }) => json(await client.listDeviceTasks(pageSize, pageToken)),
  );

  server.tool(
    "create_device_task",
    "Create a new device task (e.g. scan, isolate, run command, shutdown)",
    { taskData: z.string().describe("JSON string of task config (action.name, targets, triggers, etc.)") },
    async ({ taskData }) => json(await client.createDeviceTask(JSON.parse(taskData))),
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
    { taskUuid: z.string().describe("UUID of the task") },
    async ({ taskUuid }) => json(await client.listDeviceTaskRuns(taskUuid)),
  );

  server.tool(
    "update_device_task_targets",
    "Update the target devices/groups of a task",
    {
      taskUuid: z.string().describe("UUID of the task"),
      targetData: z.string().describe("JSON string of target config (deviceUuids, groupUuids)"),
    },
    async ({ taskUuid, targetData }) => json(await client.updateDeviceTaskTargets(taskUuid, JSON.parse(targetData))),
  );

  server.tool(
    "update_device_task_triggers",
    "Update the triggers of a task",
    {
      taskUuid: z.string().describe("UUID of the task"),
      triggerData: z.string().describe("JSON string of trigger config"),
    },
    async ({ taskUuid, triggerData }) => json(await client.updateDeviceTaskTriggers(taskUuid, JSON.parse(triggerData))),
  );

  // ── Identity ──────────────────────────────────────────────────────

  server.tool(
    "list_permissions",
    "List all available permissions",
    {},
    async () => json(await client.listPermissions()),
  );

  server.tool(
    "list_role_assignments",
    "List all role assignments",
    {},
    async () => json(await client.listRoleAssignments()),
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
    "List security detections v1 (ESET PROTECT)",
    {
      pageSize: z.number().optional().describe("Results per page"),
      pageToken: z.string().optional().describe("Token for next page"),
    },
    async ({ pageSize, pageToken }) => json(await client.listDetections(pageSize, pageToken)),
  );

  server.tool(
    "list_detections_v2",
    "List security detections v2 (ESET Inspect / Cloud Office Security)",
    {
      pageSize: z.number().optional().describe("Results per page"),
      pageToken: z.string().optional().describe("Token for next page"),
    },
    async ({ pageSize, pageToken }) => json(await client.listDetectionsV2(pageSize, pageToken)),
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

  server.tool(
    "batch_get_detections",
    "Get multiple detections by UUIDs",
    { detectionUuids: z.array(z.string()).describe("Array of detection UUIDs") },
    async ({ detectionUuids }) => json(await client.batchGetDetections(detectionUuids)),
  );

  // ── Detection Groups ──────────────────────────────────────────────

  server.tool(
    "list_detection_groups",
    "List detection groups",
    {
      pageSize: z.number().optional().describe("Results per page"),
      pageToken: z.string().optional().describe("Token for next page"),
    },
    async ({ pageSize, pageToken }) => json(await client.listDetectionGroups(pageSize, pageToken)),
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
    "List EDR (Endpoint Detection and Response) rules",
    {
      pageSize: z.number().optional().describe("Results per page"),
      pageToken: z.string().optional().describe("Token for next page"),
    },
    async ({ pageSize, pageToken }) => json(await client.listEdrRules(pageSize, pageToken)),
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
    "Use this to find exclusion UUIDs for get/update/delete operations.",
    {
      pageSize: z.number().optional().describe("Results per page (default 50, max 1000)"),
      pageToken: z.string().optional().describe("Token for next page from previous response's nextPageToken"),
    },
    async ({ pageSize, pageToken }) => json(await client.listEdrRuleExclusions(pageSize, pageToken)),
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
      // Debug: log exact payload to stderr so users can see what's sent
      const payloadJson = JSON.stringify(payload);
      process.stderr.write(`[eset-mcp] create_edr_rule_exclusion payload (${payloadJson.length} bytes): ${payloadJson.substring(0, 500)}\n`);

      try {
        const result = await client.createEdrRuleExclusion(payload);
        return json(result);
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
              xmlDefinitionPreview: xmlDefinition.substring(0, 100),
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
    { exclusionUuid: z.string().describe("UUID of the EDR rule exclusion. Use list_edr_rule_exclusions to find it.") },
    async ({ exclusionUuid }) => json(await client.getEdrRuleExclusion(exclusionUuid)),
  );

  server.tool(
    "delete_edr_rule_exclusion",
    "Delete an EDR rule exclusion. This permanently removes the exclusion — the associated EDR rules will resume triggering on previously excluded activity.",
    { exclusionUuid: z.string().describe("UUID of the EDR rule exclusion to delete. Use list_edr_rule_exclusions to find it.") },
    async ({ exclusionUuid }) => json(await client.deleteEdrRuleExclusion(exclusionUuid)),
  );

  server.tool(
    "update_edr_rule_exclusion_definition",
    "Update the XML definition of an existing EDR rule exclusion. " +
    "The XML follows the ESET Inspect rules format (https://help.eset.com/ei_rules/latest/en-US/) — actions are ignored for exclusions. " +
    "The exclusion's displayName will be updated from the <description><name> element in the new XML.",
    {
      exclusionUuid: z.string().describe("UUID of the EDR rule exclusion to update. Use list_edr_rule_exclusions to find it."),
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
    "List security incidents. Supports CEL filter syntax, e.g. status==\"INCIDENT_STATUS_OPEN\", severity==\"INCIDENT_SEVERITY_LEVEL_HIGH\", displayName.contains(\"abc\"). Status values: INCIDENT_STATUS_OPEN, INCIDENT_STATUS_IN_PROGRESS, INCIDENT_STATUS_CLOSED, INCIDENT_STATUS_WAITING_FOR_INPUT. Severity values: INCIDENT_SEVERITY_LEVEL_LOW, INCIDENT_SEVERITY_LEVEL_MEDIUM, INCIDENT_SEVERITY_LEVEL_HIGH.",
    {
      filter: z.string().optional().describe('CEL filter expression, e.g. status=="INCIDENT_STATUS_OPEN"'),
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
      commentData: z.string().describe("JSON string of comment data (e.g. {text})"),
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

  // ── Network Access Protection ─────────────────────────────────────

  server.tool(
    "list_ip_sets",
    "List IP sets for a policy (Network Access Protection)",
    { policyUuid: z.string().describe("UUID of the policy") },
    async ({ policyUuid }) => json(await client.listIpSets(policyUuid)),
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
    "List users (ESET Cloud Office Security)",
    {
      pageSize: z.number().optional().describe("Results per page"),
      pageToken: z.string().optional().describe("Token for next page"),
    },
    async ({ pageSize, pageToken }) => json(await client.listUsers(pageSize, pageToken)),
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
    { policyUuid: z.string().describe("UUID of the policy") },
    async ({ policyUuid }) => json(await client.listWebAddressRules(policyUuid)),
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
