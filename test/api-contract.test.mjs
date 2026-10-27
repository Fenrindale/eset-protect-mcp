import assert from "node:assert/strict";
import test from "node:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { EsetClient } from "../dist/eset-client.js";
import {
  countDistinctSha1LikeValues,
  edrRuleExclusionCreateFailure,
} from "../dist/edr-exclusions.js";
import { SecurityManager } from "../dist/security.js";
import { registerCloudTools } from "../dist/tools-cloud.js";
import { registerManagementTools } from "../dist/tools-management.js";
import { registerOnPremTools } from "../dist/tools-onprem.js";
import { registerSharedTools } from "../dist/tools-shared.js";

const cloudConfig = {
  mode: "cloud",
  region: "eu",
  username: "api@example.test",
  password: "secret",
};

function cloudClient() {
  return new EsetClient({ ...cloudConfig });
}

test("identity requests use the IAM host and pagination", async () => {
  const client = cloudClient();
  client.accessToken = "token";
  client.tokenExpiry = Date.now() + 60_000;
  let request;
  client.rawRequest = async (method, baseUrl, path) => {
    request = { method, baseUrl, path };
    return { statusCode: 200, headers: {}, body: "{}" };
  };

  await client.listPermissions(25, "next page");

  assert.deepEqual(request, {
    method: "GET",
    baseUrl: "https://eu.iam.eset.systems",
    path: "/v2/permissions?pageSize=25&pageToken=next%20page",
  });
});

test("updated request bodies use official ESET field names", async () => {
  const client = cloudClient();
  const calls = [];
  client.apiPost = async (category, path, body) => {
    calls.push({ category, path, body });
    return {};
  };

  await client.renameDevice("device", "Renamed device");
  await client.renameGroup("group", "Renamed group");
  await client.updatePolicyAssignmentRanking("assignment", 7);
  await client.batchGetUsers(["user-1", "user-2"]);

  assert.deepEqual(calls.map(({ body }) => body), [
    { displayName: "Renamed device" },
    { displayName: "Renamed group" },
    { rank: 7 },
    { usersUuids: ["user-1", "user-2"] },
  ]);
});

test("new device management calls match the current ESET Connect contract", async () => {
  const client = cloudClient();
  const calls = [];
  client.apiGet = async (category, path) => {
    calls.push({ method: "GET", category, path });
    return {};
  };
  client.apiPost = async (category, path, body) => {
    calls.push({ method: "POST", category, path, body });
    return {};
  };

  await client.listInstalledApplications("device", 25, "next page");
  await client.setMasterDevice("device", {
    cloneNamingPatterns: ["Finance-Desktop-{n}"],
    securityGroupUuid: "group",
  });
  await client.unsetMasterDevice("device");
  await client.updateDeviceDescription("device", "VDI golden image");

  assert.deepEqual(calls, [
    {
      method: "GET",
      category: "device-management",
      path: "/v1/devices/device/applications?pageSize=25&pageToken=next%20page",
    },
    {
      method: "POST",
      category: "device-management",
      path: "/v1/devices/device:setMasterDevice",
      body: {
        cloningConfiguration: {
          cloneNamingPatterns: ["Finance-Desktop-{n}"],
          securityGroupUuid: "group",
        },
      },
    },
    {
      method: "POST",
      category: "device-management",
      path: "/v1/devices/device:unsetMasterDevice",
      body: {},
    },
    {
      method: "POST",
      category: "device-management",
      path: "/v1/devices/device:updateDescription",
      body: { description: "VDI golden image" },
    },
  ]);
});

test("Incident Management v3 calls match all newly published routes", async () => {
  const client = cloudClient();
  const calls = [];
  client.apiGet = async (category, path) => {
    calls.push({ method: "GET", category, path });
    return {};
  };
  client.apiPost = async (category, path, body) => {
    calls.push({ method: "POST", category, path, body });
    return {};
  };
  client.apiPatch = async (category, path, body) => {
    calls.push({ method: "PATCH", category, path, body });
    return {};
  };
  client.apiDelete = async (category, path) => {
    calls.push({ method: "DELETE", category, path });
    return {};
  };

  await client.listIncidentsV3("status==INCIDENT_STATUS_OPEN", "severity desc", 10, "incidents");
  await client.getIncidentV3("incident");
  await client.updateIncidentV3("incident", { description: "Investigating" });
  await client.closeIncidentV3("incident", "INCIDENT_RESOLVE_REASON_TRUE_POSITIVE", "Resolved");
  await client.reopenIncidentV3("incident", "Needs another review");
  await client.startIncidentProgressV3("incident", "assignee");
  await client.listIncidentCommentsV3("incident", 20, "comments");
  await client.createIncidentCommentV3("incident", { text: "New comment" });
  await client.getIncidentCommentV3("incident", "comment");
  await client.deleteIncidentCommentV3("incident", "comment");
  await client.updateIncidentCommentTextV3("incident", "comment", { text: "Updated" });
  await client.listIncidentIndicatorsV3("incident", "INDICATOR_VIEW_FULL", 30, "indicators");
  await client.getIncidentIndicatorV3("incident", "indicator", "INDICATOR_VIEW_FULL");
  await client.listIndicatorsV3({
    startTime: "2026-10-01T00:00:00Z",
    endTime: "2026-10-27T00:00:00Z",
    view: "INDICATOR_VIEW_BASIC",
    pageSize: 40,
    pageToken: "global",
  });
  await client.getIndicatorV3("global-indicator", "INDICATOR_VIEW_BASIC");

  assert.deepEqual(calls, [
    {
      method: "GET",
      category: "incident-management",
      path: "/v3/incidents?filter=status%3D%3DINCIDENT_STATUS_OPEN&orderBy=severity%20desc&pageSize=10&pageToken=incidents",
    },
    { method: "GET", category: "incident-management", path: "/v3/incidents/incident" },
    {
      method: "PATCH",
      category: "incident-management",
      path: "/v3/incidents/incident",
      body: { description: "Investigating" },
    },
    {
      method: "POST",
      category: "incident-management",
      path: "/v3/incidents/incident:close",
      body: {
        closureReason: "INCIDENT_RESOLVE_REASON_TRUE_POSITIVE",
        finalComment: { text: "Resolved" },
      },
    },
    {
      method: "POST",
      category: "incident-management",
      path: "/v3/incidents/incident:reopen",
      body: { comment: { text: "Needs another review" } },
    },
    {
      method: "POST",
      category: "incident-management",
      path: "/v3/incidents/incident:startProgress",
      body: { assigneeUuid: "assignee" },
    },
    {
      method: "GET",
      category: "incident-management",
      path: "/v3/incidents/incident/comments?pageSize=20&pageToken=comments",
    },
    {
      method: "POST",
      category: "incident-management",
      path: "/v3/incidents/incident/comments",
      body: { comment: { text: "New comment", incidentUuid: "incident" } },
    },
    {
      method: "GET",
      category: "incident-management",
      path: "/v3/incidents/incident/comments/comment",
    },
    {
      method: "DELETE",
      category: "incident-management",
      path: "/v3/incidents/incident/comments/comment",
    },
    {
      method: "POST",
      category: "incident-management",
      path: "/v3/incidents/incident/comments/comment:updateText",
      body: { text: "Updated" },
    },
    {
      method: "GET",
      category: "incident-management",
      path: "/v3/incidents/incident/indicators?view=INDICATOR_VIEW_FULL&pageSize=30&pageToken=indicators",
    },
    {
      method: "GET",
      category: "incident-management",
      path: "/v3/incidents/incident/indicators/indicator?view=INDICATOR_VIEW_FULL",
    },
    {
      method: "GET",
      category: "incident-management",
      path: "/v3/indicators?startTime=2026-10-01T00%3A00%3A00Z&endTime=2026-10-27T00%3A00%3A00Z&view=INDICATOR_VIEW_BASIC&pageSize=40&pageToken=global",
    },
    {
      method: "GET",
      category: "incident-management",
      path: "/v3/indicators/global-indicator?view=INDICATOR_VIEW_BASIC",
    },
  ]);
});

test("On-Prem authentication uses the 13.1 token schema", async () => {
  const client = new EsetClient({
    mode: "onprem",
    serverUrl: "https://protect.example.test:9443",
    username: "domain-user",
    password: "secret",
    isDomainUser: true,
  });
  let requestBody;
  client.rawRequest = async (_method, _baseUrl, _path, body) => {
    requestBody = JSON.parse(body);
    return { statusCode: 200, headers: {}, body: JSON.stringify({ accessToken: "token", expiresIn: 3600 }) };
  };

  await client.authenticate();

  assert.deepEqual(requestBody, {
    username: "domain-user",
    password: "secret",
    is_domain_user: true,
    grantType: "PASSWORD",
  });
  assert.equal("grant_type" in requestBody, false);
});

test("On-Prem rename retries the legacy 13.0 action after a 404", async () => {
  const client = new EsetClient({
    mode: "onprem",
    serverUrl: "https://protect.example.test:9443",
    username: "api",
    password: "secret",
  });
  const calls = [];
  client.apiPost = async (_category, path, body) => {
    calls.push({ path, body });
    if (path.endsWith(":rename")) throw new Error("ESET API error 404 | body=(empty)");
    return { ok: true };
  };

  await client.renameDevice("device", "Renamed");

  assert.deepEqual(calls, [
    { path: "/v1/devices/device:rename", body: { displayName: "Renamed" } },
    { path: "/v1/devices/device:renameDevice", body: { displayName: "Renamed" } },
  ]);
});

test("getDetection auto retries v2 when v1 returns 404", async () => {
  const client = cloudClient();
  const paths = [];
  client.apiGet = async (_category, path) => {
    paths.push(path);
    if (path.startsWith("/v1/")) throw new Error("ESET API error 404 | body=(empty)");
    return { detection: { uuid: "detection" } };
  };

  const result = await client.getDetection("detection", "auto");

  assert.deepEqual(paths, [
    "/v1/detections/detection",
    "/v2/detections/detection",
  ]);
  assert.equal(result._mcpDetectionApiVersion, "v2");
  assert.equal(result._mcpFallbackFrom, "v1");
});

test("batch detections fall back to individual version-aware lookups", async () => {
  const client = cloudClient();
  client.apiPost = async () => {
    throw new Error("ESET API error 404 | body=(empty)");
  };
  client.apiGet = async (_category, path) => {
    if (path.startsWith("/v1/")) throw new Error("ESET API error 404 | body=(empty)");
    const uuid = path.split("/").at(-1);
    return { detection: { uuid } };
  };

  const result = await client.batchGetDetections(["d1", "d2"]);

  assert.deepEqual(result.detections, [{ uuid: "d1" }, { uuid: "d2" }]);
  assert.equal(result.errors.length, 0);
  assert.equal(result._mcpBatchFallback.requested, 2);
});

test("Patch and Vulnerability Management calls match ESET Connect 3.10", async () => {
  const client = cloudClient();
  const calls = [];
  client.apiGet = async (category, path) => {
    calls.push({ category, path });
    return {};
  };

  await client.listRecentApplicationPatchingDetails();
  await client.listDevicePatches({ deviceUuid: "device", patchType: "APP" }, 10, "p1");
  await client.listPatchingProcessDetails({ deviceGroupUuid: "group", startTime: "2026-01-01T00:00:00Z" });
  await client.listDeviceOsVulnerabilities("device", undefined, 20);
  await client.listDeviceVulnerabilities({ deviceGroupUuid: "group", vulnerabilityScope: "APPLICATION" });
  await client.listRecentVulnerabilityScans("device", undefined, 30, "p2");
  await client.listVulnerableDevices("group", 40);

  assert.deepEqual(calls, [
    { category: "patch-management", path: "/v1/application-patching-processes/recent/details" },
    { category: "patch-management", path: "/v1/device-patches?deviceUuid=device&patchType=APP&pageSize=10&pageToken=p1" },
    { category: "patch-management", path: "/v1/patching-process-details?deviceGroupUuid=group&timePeriod.startTime=2026-01-01T00%3A00%3A00Z" },
    { category: "vulnerability-management", path: "/v1/device-os-vulnerabilities?deviceUuid=device&pageSize=20" },
    { category: "vulnerability-management", path: "/v1/device-vulnerabilities?deviceGroupUuid=group&vulnerabilityScope=APPLICATION" },
    { category: "vulnerability-management", path: "/v1/scans/recent?deviceUuid=device&pageSize=30&pageToken=p2" },
    { category: "vulnerability-management", path: "/v1/vulnerable-devices?deviceGroupUuid=group&pageSize=40" },
  ]);
});

test("current list filters and pagination map to official query names", async () => {
  const client = cloudClient();
  const getPaths = [];
  const deletePaths = [];
  client.apiGet = async (category, path) => {
    getPaths.push({ category, path });
    return {};
  };
  client.apiDelete = async (category, path) => {
    deletePaths.push({ category, path });
    return {};
  };

  await client.listDevices(50, "next", {
    displayNames: ["Desk One", "Desk Two"],
    functionalityStatus: "PROTECTED",
    isMuted: false,
  });
  await client.listDevicesInGroup("group", 25, undefined, true);
  await client.listPolicyAssignments({ policyUuids: ["p1", "p2"] }, 20);
  await client.listRoleAssignments({ includeNestedScopes: true, subjectReference: "subject", subjectType: "USER" }, "name desc", 10, "roles");
  await client.getQuarantineCount({ fileName: "sample.exe", quarantineReason: "MALWARE" });
  await client.listInstallers(false, 15, "installers");
  await client.listUsers({
    activeProductAutoActivated: false,
    activeProductAutoActivationBase: "BASE",
    activeProductId: 42,
  }, 5);
  await client.listWebAddressRules("policy", "example.com");
  await client.deleteGroup("group", true);

  assert.deepEqual(getPaths, [
    { category: "device-management", path: "/v1/devices?displayNames=Desk%20One&displayNames=Desk%20Two&functionalityStatus=PROTECTED&isMuted=false&pageSize=50&pageToken=next" },
    { category: "device-management", path: "/v1/device_groups/group/devices?recurseSubgroups=true&pageSize=25" },
    { category: "policy-management", path: "/v2/policy-assignments?policyUuids=p1&policyUuids=p2&pageSize=20" },
    { category: "identity", path: "/v2/role-assignments?includeNestedScopes=true&subjectReference=subject&subjectType=USER&orderBy=name%20desc&pageSize=10&pageToken=roles" },
    { category: "quarantine-management", path: "/v1/quarantined-objects/count?filter.fileName=sample.exe&filter.quarantineReason=MALWARE" },
    { category: "installer-management", path: "/v1/installers?usable=false&pageSize=15&pageToken=installers" },
    { category: "user-management", path: "/v1/users?activeProduct.autoActivated=false&activeProduct.autoActivationDetails.base=BASE&activeProduct.id=42&pageSize=5" },
    { category: "web-access-protection", path: "/v2/policies/policy/web-address-rules?includeDomain=example.com" },
  ]);
  assert.deepEqual(deletePaths, [
    { category: "asset-management", path: "/v1/groups/group?releaseConsumedUnits=true" },
  ]);
});

test("On-Prem 13.1 configuration paths use the documented routes", async () => {
  const client = new EsetClient({
    mode: "onprem",
    serverUrl: "https://protect.example.test:9443",
    username: "api",
    password: "secret",
  });
  const calls = [];
  client.apiGet = async (category, path) => {
    calls.push({ method: "GET", category, path });
    return {};
  };
  client.apiPost = async (category, path, body) => {
    calls.push({ method: "POST", category, path, body });
    return {};
  };

  await client.getServerConfigurationValue("server.updates.trigger");
  await client.batchGetServerConfigurationValues(["server", "server.updates.trigger"]);

  assert.deepEqual(calls, [
    { method: "GET", category: "configuration", path: "/v2:configuration:getValue?path=server.updates.trigger" },
    { method: "POST", category: "configuration", path: "/v2/configuration:batchGetValues", body: { paths: ["server", "server.updates.trigger"] } },
  ]);
});

test("Cloud and On-Prem tool sets register without duplicate names", () => {
  const cloudServer = new McpServer({ name: "cloud-test", version: "1.6.0" });
  const cloud = cloudClient();
  registerSharedTools(cloudServer, cloud);
  registerManagementTools(cloudServer, cloud);
  registerCloudTools(cloudServer, cloud);

  const onPremServer = new McpServer({ name: "onprem-test", version: "1.6.0" });
  const onPrem = new EsetClient({
    mode: "onprem",
    serverUrl: "https://protect.example.test:9443",
    username: "api",
    password: "secret",
  });
  registerSharedTools(onPremServer, onPrem);
  registerManagementTools(onPremServer, onPrem);
  registerOnPremTools(onPremServer, onPrem);
});

test("sandbox classification keeps new inventory tools read-only", async () => {
  const security = new SecurityManager({
    mode: "read-only",
    allowedTools: null,
    deniedTools: new Set(),
    approvalRules: new Set(),
    approvalDir: ".eset-mcp/test-approvals",
    approvalTtlMs: 60_000,
    allowGlobalScope: false,
    allowedDeviceUuids: null,
    allowedGroupUuids: null,
    allowedRuleUuids: null,
  });
  let readRan = false;
  let writeRan = false;

  const readResult = await security.guard("list_device_vulnerabilities", {}, async () => {
    readRan = true;
    return { content: [{ type: "text", text: "ok" }] };
  });
  const writeResult = await security.guard("create_group", {}, async () => {
    writeRan = true;
    return { content: [{ type: "text", text: "unexpected" }] };
  });

  assert.equal(readRan, true);
  assert.equal(readResult.isError, undefined);
  assert.equal(writeRan, false);
  assert.equal(writeResult.isError, true);
  assert.match(writeResult.content[0].text, /read-only/);
});

test("scoped mode enforces official automation target UUID keys", async () => {
  const security = new SecurityManager({
    mode: "scoped",
    allowedTools: null,
    deniedTools: new Set(),
    approvalRules: new Set(),
    approvalDir: ".eset-mcp/test-approvals",
    approvalTtlMs: 60_000,
    allowGlobalScope: false,
    allowedDeviceUuids: new Set(["allowed-device"]),
    allowedGroupUuids: new Set(["allowed-group"]),
    allowedRuleUuids: null,
  });
  let ran = false;

  const result = await security.guard(
    "update_device_task_targets",
    {
      targetData: JSON.stringify({
        targets: {
          devicesUuids: ["blocked-device"],
          deviceGroupsUuids: ["blocked-group"],
        },
      }),
    },
    async () => {
      ran = true;
      return { content: [{ type: "text", text: "unexpected" }] };
    },
  );

  assert.equal(ran, false);
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /blocked-device|blocked-group/);
});

test("scoped mode enforces master-device cloning security groups", async () => {
  const security = new SecurityManager({
    mode: "scoped",
    allowedTools: null,
    deniedTools: new Set(),
    approvalRules: new Set(),
    approvalDir: ".eset-mcp/test-approvals",
    approvalTtlMs: 60_000,
    allowGlobalScope: false,
    allowedDeviceUuids: new Set(["allowed-device"]),
    allowedGroupUuids: new Set(["allowed-group"]),
    allowedRuleUuids: null,
  });
  let ran = false;

  const result = await security.guard(
    "set_master_device",
    {
      deviceUuid: "allowed-device",
      cloningConfiguration: JSON.stringify({ securityGroupUuid: "blocked-group" }),
    },
    async () => {
      ran = true;
      return { content: [{ type: "text", text: "unexpected" }] };
    },
  );

  assert.equal(ran, false);
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /blocked-group/);
});

test("EDR exclusion failures identify multi-SHA1 WAF rejections without exposing hashes", () => {
  const firstSha1 = "a".repeat(40);
  const secondSha1 = "b".repeat(40);
  const xmlDefinition = `<rule><condition value="${firstSha1}"/><condition value="${secondSha1}"/></rule>`;
  const error =
    "ESET API error 403 | body=Request Rejected | Support ID: 534ed38a-ee82-49b0-a5b3-d84f5568c59d";

  assert.equal(countDistinctSha1LikeValues(xmlDefinition), 2);
  const failure = edrRuleExclusionCreateFailure(error, {
    enabled: true,
    xmlDefinition,
    ruleUuids: ["rule-1"],
  });

  assert.equal(failure.upstreamRejection.kind, "ESET_WAF_REQUEST_REJECTED");
  assert.equal(failure.upstreamRejection.automaticRetry, false);
  assert.equal(failure.upstreamRejection.recommendedTool, "create_edr_rule_exclusions_batch");
  assert.equal(failure.payloadSent.sha1LikeValuesCount, 2);
  assert.match(failure.hint, /one SHA1 per item/);
  assert.match(failure.error, /534ed38a-ee82-49b0-a5b3-d84f5568c59d/);
  assert.doesNotMatch(JSON.stringify(failure), new RegExp(firstSha1));
  assert.doesNotMatch(JSON.stringify(failure), new RegExp(secondSha1));
});

test("EDR exclusion batch uses sequential official single-create requests", async () => {
  const client = cloudClient();
  const calls = [];
  client.apiPost = async (category, path, body) => {
    calls.push({ category, path, body });
    if (body.exclusion.note === "fail") {
      throw new Error("ESET API error 403 | body=Request Rejected");
    }
    return { exclusion: { uuid: `created-${calls.length}` } };
  };
  const exclusions = [
    { enabled: true, xmlDefinition: "<rule>one</rule>", ruleUuids: ["rule-1"], note: "one" },
    { enabled: true, xmlDefinition: "<rule>two</rule>", ruleUuids: ["rule-1"], note: "fail" },
    { enabled: true, xmlDefinition: "<rule>three</rule>", ruleUuids: ["rule-1"], note: "three" },
  ];

  const stopped = await client.createEdrRuleExclusionsBatch(exclusions);
  assert.equal(stopped.requested, 3);
  assert.equal(stopped.attempted, 2);
  assert.equal(stopped.createdCount, 1);
  assert.equal(stopped.failedCount, 1);
  assert.equal(stopped.stoppedEarly, true);
  assert.match(stopped.retryWarning, /Do not retry the entire batch/);
  assert.deepEqual(calls.map(({ category, path }) => ({ category, path })), [
    { category: "incident-management", path: "/v2/edr-rule-exclusions" },
    { category: "incident-management", path: "/v2/edr-rule-exclusions" },
  ]);
  assert.deepEqual(calls[0].body, { exclusion: exclusions[0] });

  calls.length = 0;
  const continued = await client.createEdrRuleExclusionsBatch(exclusions, false);
  assert.equal(continued.attempted, 3);
  assert.equal(continued.createdCount, 2);
  assert.equal(continued.failedCount, 1);
  assert.equal(continued.stoppedEarly, false);
});

test("scoped mode rejects a batch containing any global EDR exclusion", async () => {
  const security = new SecurityManager({
    mode: "scoped",
    allowedTools: null,
    deniedTools: new Set(),
    approvalRules: new Set(),
    approvalDir: ".eset-mcp/test-approvals",
    approvalTtlMs: 60_000,
    allowGlobalScope: false,
    allowedDeviceUuids: null,
    allowedGroupUuids: new Set(["allowed-group"]),
    allowedRuleUuids: new Set(["allowed-rule"]),
  });
  const scopedItem = {
    enabled: true,
    xmlDefinition: "<rule/>",
    ruleUuids: ["allowed-rule"],
    scopes: [{ deviceGroupUuid: "allowed-group" }],
  };
  let ran = false;

  const denied = await security.guard(
    "create_edr_rule_exclusions_batch",
    { exclusions: [scopedItem, { ...scopedItem, scopes: undefined }] },
    async () => {
      ran = true;
      return { content: [{ type: "text", text: "unexpected" }] };
    },
  );
  assert.equal(ran, false);
  assert.equal(denied.isError, true);
  assert.match(denied.content[0].text, /global EDR rule exclusions/);

  const allowed = await security.guard(
    "create_edr_rule_exclusions_batch",
    { exclusions: [scopedItem, scopedItem] },
    async () => {
      ran = true;
      return { content: [{ type: "text", text: "ok" }] };
    },
  );
  assert.equal(ran, true);
  assert.equal(allowed.isError, undefined);
});
