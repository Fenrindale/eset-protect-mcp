/**
 * ESET PROTECT REST API Client — supports both On-Prem and Cloud (ESET Connect)
 *
 * On-Prem:  https://help.eset.com/protect_admin/latest/en-US/api.html
 * Cloud:    https://help.eset.com/eset_connect/en-US/swagger_api.html
 */

import https from "node:https";
import http from "node:http";
import type { IncomingHttpHeaders } from "node:http";

// ─── Configuration types ────────────────────────────────────────────

export type EsetRegion = "eu" | "de" | "us" | "jpn" | "ca";

export interface OnPremConfig {
  mode: "onprem";
  serverUrl: string;
  username: string;
  password: string;
  verifySsl?: boolean;
}

export interface CloudConfig {
  mode: "cloud";
  region: EsetRegion;
  username: string;
  password: string;
}

export type EsetConfig = OnPremConfig | CloudConfig;

interface RawResponse {
  statusCode: number;
  headers: IncomingHttpHeaders;
  body: string;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;
const PENDING_RETRY_DELAY_MS = 2_000;

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function requestTimeoutMs(): number {
  const configured = Number(process.env.ESET_REQUEST_TIMEOUT_MS);
  if (Number.isFinite(configured) && configured > 0) return configured;
  return DEFAULT_REQUEST_TIMEOUT_MS;
}

// ─── Cloud domain map ───────────────────────────────────────────────

const CLOUD_DOMAINS: Record<string, string> = {
  authentication: "business-account.iam",
  "application-management": "application-management",
  "asset-management": "asset-management",
  automation: "automation",
  "device-management": "device-management",
  identity: "identity",
  "incident-management": "incident-management",
  "installer-management": "installer-management",
  "mobile-device-management": "mobile-device-management",
  "network-access-protection": "network-access-protection",
  "policy-management": "policy-management",
  "quarantine-management": "quarantine-management",
  "user-management": "user-management",
  "web-access-protection": "web-access-protection",
};

function cloudBaseUrl(region: EsetRegion, category: string): string {
  const domain = CLOUD_DOMAINS[category];
  if (!domain) throw new Error(`Unknown cloud API category: ${category}`);
  return `https://${region}.${domain}.eset.systems`;
}

// ─── Client ─────────────────────────────────────────────────────────

export class EsetClient {
  private config: EsetConfig;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(config: EsetConfig) {
    if (config.mode === "onprem") {
      config.serverUrl = config.serverUrl.replace(/\/+$/, "");
    }
    this.config = config;
  }

  get isCloud(): boolean {
    return this.config.mode === "cloud";
  }

  // ── Authentication ────────────────────────────────────────────────

  async authenticate(): Promise<void> {
    if (this.config.mode === "onprem") {
      await this.authOnPrem();
    } else {
      await this.authCloud();
    }
  }

  private async authOnPrem(): Promise<void> {
    const cfg = this.config as OnPremConfig;
    const body = JSON.stringify({
      username: cfg.username,
      password: cfg.password,
      grant_type: "password",
    });
    const res = await this.rawRequest("POST", cfg.serverUrl, "/GetTokens", body, "application/json", false);
    const data = JSON.parse(res.body);
    if (!data.accessToken) throw new Error(`Authentication failed: ${res.body}`);
    this.accessToken = data.accessToken;
    this.tokenExpiry = Date.now() + (data.expiresIn ?? 3600) * 1000 - 60_000;
  }

  private async authCloud(): Promise<void> {
    const cfg = this.config as CloudConfig;
    const authUrl = cloudBaseUrl(cfg.region, "authentication");
    const body = new URLSearchParams({
      grant_type: "password",
      username: cfg.username,
      password: cfg.password,
    }).toString();
    const res = await this.rawRequest("POST", authUrl, "/oauth/token", body, "application/x-www-form-urlencoded", false);
    const data = JSON.parse(res.body);
    const token = data.access_token ?? data.accessToken;
    if (!token) throw new Error(`Cloud authentication failed: ${res.body}`);
    this.accessToken = token;
    this.tokenExpiry = Date.now() + (data.expires_in ?? data.expiresIn ?? 3600) * 1000 - 60_000;
  }

  private async ensureAuth(): Promise<void> {
    if (!this.accessToken || Date.now() >= this.tokenExpiry) {
      await this.authenticate();
    }
  }

  private baseUrl(cloudCategory: string): string {
    if (this.config.mode === "onprem") return (this.config as OnPremConfig).serverUrl;
    return cloudBaseUrl((this.config as CloudConfig).region, cloudCategory);
  }

  // ── Devices (On-Prem + Cloud) ─────────────────────────────────────

  async listDevices(pageSize?: number, pageToken?: string): Promise<unknown> {
    const params: string[] = [];
    if (pageSize) params.push(`pageSize=${pageSize}`);
    if (pageToken) params.push(`pageToken=${encodeURIComponent(pageToken)}`);
    const qs = params.length ? `?${params.join("&")}` : "";
    return this.apiGet("device-management", `/v1/devices${qs}`);
  }

  async getDevice(deviceUuid: string): Promise<unknown> {
    return this.apiGet("device-management", `/v1/devices/${encodeURIComponent(deviceUuid)}`);
  }

  async batchGetDevices(deviceUuids: string[]): Promise<unknown> {
    const params = deviceUuids.map((id) => `devicesUuids=${encodeURIComponent(id)}`).join("&");
    return this.apiGet("device-management", `/v1/devices:batchGet?${params}`);
  }

  async moveDevice(deviceUuid: string, newParentUuid: string): Promise<unknown> {
    return this.apiPost("device-management", `/v1/devices/${encodeURIComponent(deviceUuid)}:move`, { newParentUuid });
  }

  async renameDevice(deviceUuid: string, newName: string): Promise<unknown> {
    const action = this.config.mode === "onprem" ? ":renameDevice" : ":rename";
    return this.apiPost("device-management", `/v1/devices/${encodeURIComponent(deviceUuid)}${action}`, { newName });
  }

  async batchImportDevices(importData: Record<string, unknown>): Promise<unknown> {
    this.requireCloud("batchImportDevices");
    return this.apiPost("device-management", "/v1/devices:batchImport", importData);
  }

  // ── Device Groups (On-Prem + Cloud) ───────────────────────────────

  async listDeviceGroups(): Promise<unknown> {
    return this.apiGet("device-management", "/v1/device_groups");
  }

  async listDevicesInGroup(groupUuid: string, pageSize?: number, pageToken?: string): Promise<unknown> {
    let url = `/v1/device_groups/${encodeURIComponent(groupUuid)}/devices`;
    const params: string[] = [];
    if (pageSize) params.push(`pageSize=${pageSize}`);
    if (pageToken) params.push(`pageToken=${encodeURIComponent(pageToken)}`);
    if (params.length) url += `?${params.join("&")}`;
    return this.apiGet("device-management", url);
  }

  // ── Policies (On-Prem + Cloud) ────────────────────────────────────

  async listPolicies(): Promise<unknown> {
    return this.apiGet("policy-management", "/v2/policies");
  }

  async getPolicy(policyUuid: string): Promise<unknown> {
    return this.apiGet("policy-management", `/v2/policies/${encodeURIComponent(policyUuid)}`);
  }

  async createPolicy(policyData: Record<string, unknown>): Promise<unknown> {
    return this.apiPost("policy-management", "/v2/policies", policyData);
  }

  async deletePolicy(policyUuid: string): Promise<unknown> {
    return this.apiDelete("policy-management", `/v2/policies/${encodeURIComponent(policyUuid)}`);
  }

  // ── Policy Assignments (On-Prem + Cloud) ──────────────────────────

  async listPolicyAssignments(): Promise<unknown> {
    return this.apiGet("policy-management", "/v2/policy-assignments");
  }

  async getPolicyAssignment(assignmentUuid: string): Promise<unknown> {
    return this.apiGet("policy-management", `/v2/policy-assignments/${encodeURIComponent(assignmentUuid)}`);
  }

  async assignPolicy(assignmentData: Record<string, unknown>): Promise<unknown> {
    return this.apiPost("policy-management", "/v2/policy-assignments", assignmentData);
  }

  async unassignPolicy(assignmentUuid: string): Promise<unknown> {
    return this.apiDelete("policy-management", `/v2/policy-assignments/${encodeURIComponent(assignmentUuid)}`);
  }

  async updatePolicyAssignmentRanking(assignmentUuid: string, ranking: number): Promise<unknown> {
    return this.apiPost("policy-management", `/v2/policy-assignments/${encodeURIComponent(assignmentUuid)}:updateRanking`, { ranking });
  }

  // ── Asset Management (Cloud only) ─────────────────────────────────

  async createGroup(groupData: Record<string, unknown>): Promise<unknown> {
    this.requireCloud("createGroup");
    return this.apiPost("asset-management", "/v1/groups", groupData);
  }

  async deleteGroup(groupUuid: string): Promise<unknown> {
    this.requireCloud("deleteGroup");
    return this.apiDelete("asset-management", `/v1/groups/${encodeURIComponent(groupUuid)}`);
  }

  async moveGroup(groupUuid: string, moveData: Record<string, unknown>): Promise<unknown> {
    this.requireCloud("moveGroup");
    return this.apiPost("asset-management", `/v1/groups/${encodeURIComponent(groupUuid)}:move`, moveData);
  }

  async renameGroup(groupUuid: string, newName: string): Promise<unknown> {
    this.requireCloud("renameGroup");
    return this.apiPost("asset-management", `/v1/groups/${encodeURIComponent(groupUuid)}:rename`, { newName });
  }

  // ── Automation / Device Tasks (Cloud only) ────────────────────────

  async listDeviceTasks(pageSize?: number, pageToken?: string): Promise<unknown> {
    this.requireCloud("listDeviceTasks");
    const params: string[] = [];
    if (pageSize) params.push(`pageSize=${pageSize}`);
    if (pageToken) params.push(`pageToken=${encodeURIComponent(pageToken)}`);
    const qs = params.length ? `?${params.join("&")}` : "";
    return this.apiGet("automation", `/v1/device_tasks${qs}`);
  }

  async createDeviceTask(taskData: Record<string, unknown>): Promise<unknown> {
    this.requireCloud("createDeviceTask");
    return this.apiPost("automation", "/v1/device_tasks", taskData);
  }

  async getDeviceTask(taskUuid: string): Promise<unknown> {
    this.requireCloud("getDeviceTask");
    return this.apiGet("automation", `/v1/device_tasks/${encodeURIComponent(taskUuid)}`);
  }

  async deleteDeviceTask(taskUuid: string): Promise<unknown> {
    this.requireCloud("deleteDeviceTask");
    return this.apiDelete("automation", `/v1/device_tasks/${encodeURIComponent(taskUuid)}`);
  }

  async listDeviceTaskRuns(taskUuid: string, deviceUuid?: string, listOnlyLastRuns?: boolean, pageSize?: number, pageToken?: string): Promise<unknown> {
    this.requireCloud("listDeviceTaskRuns");
    const params: string[] = [];
    if (deviceUuid) params.push(`deviceUuid=${encodeURIComponent(deviceUuid)}`);
    if (listOnlyLastRuns !== undefined) params.push(`listOnlyLastRuns=${listOnlyLastRuns}`);
    if (pageSize) params.push(`pageSize=${pageSize}`);
    if (pageToken) params.push(`pageToken=${encodeURIComponent(pageToken)}`);
    const qs = params.length ? `?${params.join("&")}` : "";
    return this.apiGet("automation", `/v1/device_tasks/${encodeURIComponent(taskUuid)}/runs${qs}`);
  }

  async updateDeviceTaskTargets(taskUuid: string, targetData: Record<string, unknown>): Promise<unknown> {
    this.requireCloud("updateDeviceTaskTargets");
    return this.apiPost("automation", `/v1/device_tasks/${encodeURIComponent(taskUuid)}:updateTaskTargets`, targetData);
  }

  async updateDeviceTaskTriggers(taskUuid: string, triggerData: Record<string, unknown>): Promise<unknown> {
    this.requireCloud("updateDeviceTaskTriggers");
    return this.apiPost("automation", `/v1/device_tasks/${encodeURIComponent(taskUuid)}:updateTaskTriggers`, triggerData);
  }

  // ── Identity (Cloud only) ─────────────────────────────────────────

  async listPermissions(): Promise<unknown> {
    this.requireCloud("listPermissions");
    return this.apiGet("identity", "/v2/permissions");
  }

  async listRoleAssignments(): Promise<unknown> {
    this.requireCloud("listRoleAssignments");
    return this.apiGet("identity", "/v2/role-assignments");
  }

  async assignRole(roleData: Record<string, unknown>): Promise<unknown> {
    this.requireCloud("assignRole");
    return this.apiPost("identity", "/v2/role-assignments:assignRole", roleData);
  }

  async revokeRole(roleData: Record<string, unknown>): Promise<unknown> {
    this.requireCloud("revokeRole");
    return this.apiPost("identity", "/v2/role-assignments:revokeRole", roleData);
  }

  async createRole(roleData: Record<string, unknown>): Promise<unknown> {
    this.requireCloud("createRole");
    return this.apiPost("identity", "/v2/roles", roleData);
  }

  async deleteRole(roleName: string): Promise<unknown> {
    this.requireCloud("deleteRole");
    return this.apiDelete("identity", `/v2/roles/${encodeURIComponent(roleName)}`);
  }

  // ── Detections (Cloud only) ───────────────────────────────────────

  async listDetections(deviceUuid?: string, startTime?: string, endTime?: string, pageSize?: number, pageToken?: string): Promise<unknown> {
    this.requireCloud("listDetections");
    const params: string[] = [];
    if (deviceUuid) params.push(`deviceUuid=${encodeURIComponent(deviceUuid)}`);
    if (startTime) params.push(`startTime=${encodeURIComponent(startTime)}`);
    if (endTime) params.push(`endTime=${encodeURIComponent(endTime)}`);
    if (pageSize) params.push(`pageSize=${pageSize}`);
    if (pageToken) params.push(`pageToken=${encodeURIComponent(pageToken)}`);
    const qs = params.length ? `?${params.join("&")}` : "";
    return this.apiGet("incident-management", `/v1/detections${qs}`);
  }

  async getDetection(detectionUuid: string): Promise<unknown> {
    this.requireCloud("getDetection");
    return this.apiGet("incident-management", `/v1/detections/${encodeURIComponent(detectionUuid)}`);
  }

  async resolveDetection(detectionUuid: string): Promise<unknown> {
    this.requireCloud("resolveDetection");
    return this.apiPost("incident-management", `/v2/detections/${encodeURIComponent(detectionUuid)}:resolve`, {});
  }

  async listDetectionsV2(cloudOfficeTenantUuid?: string, startTime?: string, endTime?: string, pageSize?: number, pageToken?: string): Promise<unknown> {
    this.requireCloud("listDetectionsV2");
    const params: string[] = [];
    if (cloudOfficeTenantUuid) params.push(`cloudOfficeTenantUuid=${encodeURIComponent(cloudOfficeTenantUuid)}`);
    if (startTime) params.push(`startTime=${encodeURIComponent(startTime)}`);
    if (endTime) params.push(`endTime=${encodeURIComponent(endTime)}`);
    if (pageSize) params.push(`pageSize=${pageSize}`);
    if (pageToken) params.push(`pageToken=${encodeURIComponent(pageToken)}`);
    const qs = params.length ? `?${params.join("&")}` : "";
    return this.apiGet("incident-management", `/v2/detections${qs}`);
  }

  async batchGetDetections(detectionUuids: string[]): Promise<unknown> {
    this.requireCloud("batchGetDetections");
    return this.apiPost("incident-management", "/v2/detections:batchGet", { detectionUuids });
  }

  // ── Detection Groups (Cloud only) ─────────────────────────────────

  async listDetectionGroups(cloudOfficeTenantUuid?: string, deviceUuid?: string, startTime?: string, endTime?: string, pageSize?: number, pageToken?: string): Promise<unknown> {
    this.requireCloud("listDetectionGroups");
    const params: string[] = [];
    if (cloudOfficeTenantUuid) params.push(`cloudOfficeTenantUuid=${encodeURIComponent(cloudOfficeTenantUuid)}`);
    if (deviceUuid) params.push(`deviceUuid=${encodeURIComponent(deviceUuid)}`);
    if (startTime) params.push(`startTime=${encodeURIComponent(startTime)}`);
    if (endTime) params.push(`endTime=${encodeURIComponent(endTime)}`);
    if (pageSize) params.push(`pageSize=${pageSize}`);
    if (pageToken) params.push(`pageToken=${encodeURIComponent(pageToken)}`);
    const qs = params.length ? `?${params.join("&")}` : "";
    return this.apiGet("incident-management", `/v2/detection-groups${qs}`);
  }

  async getDetectionGroup(detectionGroupUuid: string): Promise<unknown> {
    this.requireCloud("getDetectionGroup");
    return this.apiGet("incident-management", `/v2/detection-groups/${encodeURIComponent(detectionGroupUuid)}`);
  }

  async resolveDetectionGroup(detectionGroupUuid: string): Promise<unknown> {
    this.requireCloud("resolveDetectionGroup");
    return this.apiPost("incident-management", `/v2/detection-groups/${encodeURIComponent(detectionGroupUuid)}:resolve`, {});
  }

  async searchDetectionGroups(searchData: Record<string, unknown>): Promise<unknown> {
    this.requireCloud("searchDetectionGroups");
    return this.apiPost("incident-management", "/v2/detection-groups:search", searchData);
  }

  // ── EDR Rules (Cloud only) ────────────────────────────────────────

  async listEdrRules(severityLevel?: string, includeTotalSize?: boolean, pageSize?: number, pageToken?: string): Promise<unknown> {
    this.requireCloud("listEdrRules");
    const params: string[] = [];
    if (severityLevel) params.push(`severityLevel=${encodeURIComponent(severityLevel)}`);
    if (includeTotalSize !== undefined) params.push(`includeTotalSize=${includeTotalSize}`);
    if (pageSize) params.push(`pageSize=${pageSize}`);
    if (pageToken) params.push(`pageToken=${encodeURIComponent(pageToken)}`);
    const qs = params.length ? `?${params.join("&")}` : "";
    return this.apiGet("incident-management", `/v2/edr-rules${qs}`);
  }

  async createEdrRule(ruleData: Record<string, unknown>): Promise<unknown> {
    this.requireCloud("createEdrRule");
    return this.apiPost("incident-management", "/v2/edr-rules", ruleData);
  }

  async getEdrRule(ruleUuid: string): Promise<unknown> {
    this.requireCloud("getEdrRule");
    return this.apiGet("incident-management", `/v2/edr-rules/${encodeURIComponent(ruleUuid)}`);
  }

  async deleteEdrRule(ruleUuid: string): Promise<unknown> {
    this.requireCloud("deleteEdrRule");
    return this.apiDelete("incident-management", `/v2/edr-rules/${encodeURIComponent(ruleUuid)}`);
  }

  async enableEdrRule(ruleUuid: string): Promise<unknown> {
    this.requireCloud("enableEdrRule");
    return this.apiPost("incident-management", `/v2/edr-rules/${encodeURIComponent(ruleUuid)}:enable`, {});
  }

  async disableEdrRule(ruleUuid: string): Promise<unknown> {
    this.requireCloud("disableEdrRule");
    return this.apiPost("incident-management", `/v2/edr-rules/${encodeURIComponent(ruleUuid)}:disable`, {});
  }

  async updateEdrRuleDefinition(ruleUuid: string, definitionData: Record<string, unknown>): Promise<unknown> {
    this.requireCloud("updateEdrRuleDefinition");
    return this.apiPost("incident-management", `/v2/edr-rules/${encodeURIComponent(ruleUuid)}:updateDefinition`, definitionData);
  }

  // ── EDR Rule Exclusions (Cloud only) ──────────────────────────────

  async listEdrRuleExclusions(includeTotalSize?: boolean, pageSize?: number, pageToken?: string): Promise<unknown> {
    this.requireCloud("listEdrRuleExclusions");
    const params: string[] = [];
    if (includeTotalSize !== undefined) params.push(`includeTotalSize=${includeTotalSize}`);
    if (pageSize) params.push(`pageSize=${pageSize}`);
    if (pageToken) params.push(`pageToken=${encodeURIComponent(pageToken)}`);
    const qs = params.length ? `?${params.join("&")}` : "";
    return this.apiGet("incident-management", `/v2/edr-rule-exclusions${qs}`);
  }

  async createEdrRuleExclusion(exclusionData: Record<string, unknown>): Promise<unknown> {
    this.requireCloud("createEdrRuleExclusion");
    return this.apiPost("incident-management", "/v2/edr-rule-exclusions", exclusionData);
  }

  async getEdrRuleExclusion(exclusionUuid: string): Promise<unknown> {
    this.requireCloud("getEdrRuleExclusion");
    return this.apiGet("incident-management", `/v2/edr-rule-exclusions/${encodeURIComponent(exclusionUuid)}`);
  }

  async deleteEdrRuleExclusion(exclusionUuid: string): Promise<unknown> {
    this.requireCloud("deleteEdrRuleExclusion");
    return this.apiDelete("incident-management", `/v2/edr-rule-exclusions/${encodeURIComponent(exclusionUuid)}`);
  }

  async updateEdrRuleExclusionDefinition(exclusionUuid: string, definitionData: Record<string, unknown>): Promise<unknown> {
    this.requireCloud("updateEdrRuleExclusionDefinition");
    return this.apiPost("incident-management", `/v2/edr-rule-exclusions/${encodeURIComponent(exclusionUuid)}:updateDefinition`, definitionData);
  }

  // ── Incidents (Cloud only) ────────────────────────────────────────

  async listIncidents(filter?: string, orderBy?: string, pageSize?: number, pageToken?: string): Promise<unknown> {
    this.requireCloud("listIncidents");
    const params: string[] = [];
    if (filter) params.push(`filter=${encodeURIComponent(filter)}`);
    if (orderBy) params.push(`orderBy=${encodeURIComponent(orderBy)}`);
    if (pageSize) params.push(`pageSize=${pageSize}`);
    if (pageToken) params.push(`pageToken=${encodeURIComponent(pageToken)}`);
    const qs = params.length ? `?${params.join("&")}` : "";
    return this.apiGet("incident-management", `/v2/incidents${qs}`);
  }

  async getIncident(incidentUuid: string): Promise<unknown> {
    this.requireCloud("getIncident");
    return this.apiGet("incident-management", `/v2/incidents/${encodeURIComponent(incidentUuid)}`);
  }

  async closeIncident(incidentUuid: string, closureReason?: string, finalCommentText?: string): Promise<unknown> {
    this.requireCloud("closeIncident");
    const body: Record<string, unknown> = {};
    if (closureReason) body.closureReason = closureReason;
    if (finalCommentText) body.finalComment = { text: finalCommentText };
    return this.apiPost("incident-management", `/v2/incidents/${encodeURIComponent(incidentUuid)}:close`, body);
  }

  async reopenIncident(incidentUuid: string, commentText?: string): Promise<unknown> {
    this.requireCloud("reopenIncident");
    const body: Record<string, unknown> = {};
    if (commentText) body.comment = { text: commentText };
    return this.apiPost("incident-management", `/v2/incidents/${encodeURIComponent(incidentUuid)}:reopen`, body);
  }

  async updateIncidentAttributes(incidentUuid: string, attributeData: Record<string, unknown>): Promise<unknown> {
    this.requireCloud("updateIncidentAttributes");
    return this.apiPost("incident-management", `/v2/incidents/${encodeURIComponent(incidentUuid)}/basic-attributes:update`, attributeData);
  }

  // ── Incident Comments (Cloud only) ────────────────────────────────

  async listIncidentComments(incidentUuid: string): Promise<unknown> {
    this.requireCloud("listIncidentComments");
    return this.apiGet("incident-management", `/v2/incidents/${encodeURIComponent(incidentUuid)}/comments`);
  }

  async createIncidentComment(incidentUuid: string, commentData: Record<string, unknown>): Promise<unknown> {
    this.requireCloud("createIncidentComment");
    return this.apiPost("incident-management", `/v2/incidents/${encodeURIComponent(incidentUuid)}/comments`, commentData);
  }

  async getIncidentComment(incidentUuid: string, commentUuid: string): Promise<unknown> {
    this.requireCloud("getIncidentComment");
    return this.apiGet("incident-management", `/v2/incidents/${encodeURIComponent(incidentUuid)}/comments/${encodeURIComponent(commentUuid)}`);
  }

  async deleteIncidentComment(incidentUuid: string, commentUuid: string): Promise<unknown> {
    this.requireCloud("deleteIncidentComment");
    return this.apiDelete("incident-management", `/v2/incidents/${encodeURIComponent(incidentUuid)}/comments/${encodeURIComponent(commentUuid)}`);
  }

  async updateIncidentCommentText(incidentUuid: string, commentUuid: string, textData: Record<string, unknown>): Promise<unknown> {
    this.requireCloud("updateIncidentCommentText");
    return this.apiPost("incident-management", `/v2/incidents/${encodeURIComponent(incidentUuid)}/comments/${encodeURIComponent(commentUuid)}/text:update`, textData);
  }

  // ── Executables / Application Management (Cloud only) ─────────────

  async listExecutables(pageSize?: number, pageToken?: string): Promise<unknown> {
    this.requireCloud("listExecutables");
    const params: string[] = [];
    if (pageSize) params.push(`pageSize=${pageSize}`);
    if (pageToken) params.push(`pageToken=${encodeURIComponent(pageToken)}`);
    const qs = params.length ? `?${params.join("&")}` : "";
    return this.apiGet("application-management", `/v1/executables${qs}`);
  }

  async getExecutable(executableUuid: string): Promise<unknown> {
    this.requireCloud("getExecutable");
    return this.apiGet("application-management", `/v1/executables/${encodeURIComponent(executableUuid)}`);
  }

  async blockExecutable(executableUuid: string): Promise<unknown> {
    this.requireCloud("blockExecutable");
    return this.apiPost("application-management", `/v1/executables/${encodeURIComponent(executableUuid)}:block`, {});
  }

  async unblockExecutable(executableUuid: string): Promise<unknown> {
    this.requireCloud("unblockExecutable");
    return this.apiPost("application-management", `/v1/executables/${encodeURIComponent(executableUuid)}:unblock`, {});
  }

  // ── Quarantine Management (Cloud only) ────────────────────────────

  async listQuarantinedObjects(filters?: {
    cloudOfficeTenantUuid?: string;
    emailInternetMessageId?: string;
    emailRecipient?: string;
    emailSender?: string;
    emailSubject?: string;
    fileName?: string;
    msSharepointRootSiteUuid?: string;
    msTeamsTeamUuid?: string;
    objectOrigin?: string;
    objectType?: string;
    quarantineReason?: string;
    quarantineTimeStartTime?: string;
    quarantineTimeEndTime?: string;
    userUuid?: string;
  }, orderBy?: string, pageSize?: number, pageToken?: string): Promise<unknown> {
    this.requireCloud("listQuarantinedObjects");
    const params: string[] = [];
    if (filters) {
      if (filters.cloudOfficeTenantUuid) params.push(`filter.cloudOfficeTenantUuid=${encodeURIComponent(filters.cloudOfficeTenantUuid)}`);
      if (filters.emailInternetMessageId) params.push(`filter.emailInternetMessageId=${encodeURIComponent(filters.emailInternetMessageId)}`);
      if (filters.emailRecipient) params.push(`filter.emailRecipient=${encodeURIComponent(filters.emailRecipient)}`);
      if (filters.emailSender) params.push(`filter.emailSender=${encodeURIComponent(filters.emailSender)}`);
      if (filters.emailSubject) params.push(`filter.emailSubject=${encodeURIComponent(filters.emailSubject)}`);
      if (filters.fileName) params.push(`filter.fileName=${encodeURIComponent(filters.fileName)}`);
      if (filters.msSharepointRootSiteUuid) params.push(`filter.msSharepointRootSiteUuid=${encodeURIComponent(filters.msSharepointRootSiteUuid)}`);
      if (filters.msTeamsTeamUuid) params.push(`filter.msTeamsTeamUuid=${encodeURIComponent(filters.msTeamsTeamUuid)}`);
      if (filters.objectOrigin) params.push(`filter.objectOrigin=${encodeURIComponent(filters.objectOrigin)}`);
      if (filters.objectType) params.push(`filter.objectType=${encodeURIComponent(filters.objectType)}`);
      if (filters.quarantineReason) params.push(`filter.quarantineReason=${encodeURIComponent(filters.quarantineReason)}`);
      if (filters.quarantineTimeStartTime) params.push(`filter.quarantineTime.startTime=${encodeURIComponent(filters.quarantineTimeStartTime)}`);
      if (filters.quarantineTimeEndTime) params.push(`filter.quarantineTime.endTime=${encodeURIComponent(filters.quarantineTimeEndTime)}`);
      if (filters.userUuid) params.push(`filter.userUuid=${encodeURIComponent(filters.userUuid)}`);
    }
    if (orderBy) params.push(`orderBy=${encodeURIComponent(orderBy)}`);
    if (pageSize) params.push(`pageSize=${pageSize}`);
    if (pageToken) params.push(`pageToken=${encodeURIComponent(pageToken)}`);
    const qs = params.length ? `?${params.join("&")}` : "";
    return this.apiGet("quarantine-management", `/v1/quarantined-objects${qs}`);
  }

  async getQuarantinedObject(objectUuid: string): Promise<unknown> {
    this.requireCloud("getQuarantinedObject");
    return this.apiGet("quarantine-management", `/v1/quarantined-objects/${encodeURIComponent(objectUuid)}`);
  }

  async getQuarantineCount(): Promise<unknown> {
    this.requireCloud("getQuarantineCount");
    return this.apiGet("quarantine-management", "/v1/quarantined-objects/count");
  }

  async batchDeleteQuarantinedObjects(objectUuids: string[]): Promise<unknown> {
    this.requireCloud("batchDeleteQuarantinedObjects");
    return this.apiPost("quarantine-management", "/v1/quarantined-objects:batchDelete", { objectUuids });
  }

  async batchDownloadQuarantinedObjects(objectUuids: string[]): Promise<unknown> {
    this.requireCloud("batchDownloadQuarantinedObjects");
    return this.apiPost("quarantine-management", "/v1/quarantined-objects:batchDownload", { objectUuids });
  }

  async batchRestoreQuarantinedObjects(objectUuids: string[]): Promise<unknown> {
    this.requireCloud("batchRestoreQuarantinedObjects");
    return this.apiPost("quarantine-management", "/v1/quarantined-objects:batchRestore", { objectUuids });
  }

  async downloadQuarantinedObject(downloadData: Record<string, unknown>): Promise<unknown> {
    this.requireCloud("downloadQuarantinedObject");
    return this.apiPost("quarantine-management", "/v1/quarantined-objects:download", downloadData);
  }

  async purgeQuarantinedObjects(purgeData: Record<string, unknown>): Promise<unknown> {
    this.requireCloud("purgeQuarantinedObjects");
    return this.apiPost("quarantine-management", "/v1/quarantined-objects:purge", purgeData);
  }

  async restoreQuarantinedObject(restoreData: Record<string, unknown>): Promise<unknown> {
    this.requireCloud("restoreQuarantinedObject");
    return this.apiPost("quarantine-management", "/v1/quarantined-objects:restore", restoreData);
  }

  // ── Installer Management (Cloud only) ─────────────────────────────

  async listInstallers(): Promise<unknown> {
    this.requireCloud("listInstallers");
    return this.apiGet("installer-management", "/v1/installers");
  }

  async getInstaller(installerUuid: string): Promise<unknown> {
    this.requireCloud("getInstaller");
    return this.apiGet("installer-management", `/v1/installers/${encodeURIComponent(installerUuid)}`);
  }

  async createInstaller(installerData: Record<string, unknown>): Promise<unknown> {
    this.requireCloud("createInstaller");
    return this.apiPost("installer-management", "/v1/installers", installerData);
  }

  async deleteInstaller(installerUuid: string): Promise<unknown> {
    this.requireCloud("deleteInstaller");
    return this.apiDelete("installer-management", `/v1/installers/${encodeURIComponent(installerUuid)}`);
  }

  async generateGpoSccmFile(generateData: Record<string, unknown>): Promise<unknown> {
    this.requireCloud("generateGpoSccmFile");
    return this.apiPost("installer-management", "/v1/gpo-sccm-files:generate", generateData);
  }

  // ── Mobile Device Management (Cloud only) ─────────────────────────

  async batchActivateMobileProduct(activationData: Record<string, unknown>): Promise<unknown> {
    this.requireCloud("batchActivateMobileProduct");
    return this.apiPost("mobile-device-management", "/v1/mobile-devices:batchActivateProduct", activationData);
  }

  async batchGetEnrollmentLinks(enrollmentData: Record<string, unknown>): Promise<unknown> {
    this.requireCloud("batchGetEnrollmentLinks");
    return this.apiPost("mobile-device-management", "/v1/mobile-devices:batchGetEnrollmentLinks", enrollmentData);
  }

  // ── Network Access Protection (Cloud only) ────────────────────────

  async listIpSets(policyUuid: string): Promise<unknown> {
    this.requireCloud("listIpSets");
    return this.apiGet("network-access-protection", `/v1/policies/${encodeURIComponent(policyUuid)}/ip-sets`);
  }

  async getIpSet(policyUuid: string, ipSetUuid: string): Promise<unknown> {
    this.requireCloud("getIpSet");
    return this.apiGet("network-access-protection", `/v1/policies/${encodeURIComponent(policyUuid)}/ip-sets/${encodeURIComponent(ipSetUuid)}`);
  }

  async updateIpSet(policyUuid: string, ipSetUuid: string, ipSetData: Record<string, unknown>): Promise<unknown> {
    this.requireCloud("updateIpSet");
    return this.apiPost("network-access-protection", `/v1/policies/${encodeURIComponent(policyUuid)}/ip-sets/${encodeURIComponent(ipSetUuid)}:update`, ipSetData);
  }

  // ── User Management (Cloud only) ──────────────────────────────────

  async listUsers(filters?: {
    displayName?: string;
    email?: string;
    protectionStatus?: string;
    userGroupUuid?: string;
    cloudOfficeTenantReference?: string;
    hasCloudOfficeMsLicense?: boolean;
  }, pageSize?: number, pageToken?: string): Promise<unknown> {
    this.requireCloud("listUsers");
    const params: string[] = [];
    if (filters) {
      if (filters.displayName) params.push(`displayName=${encodeURIComponent(filters.displayName)}`);
      if (filters.email) params.push(`email=${encodeURIComponent(filters.email)}`);
      if (filters.protectionStatus) params.push(`protectionStatus=${encodeURIComponent(filters.protectionStatus)}`);
      if (filters.userGroupUuid) params.push(`userGroupUuid=${encodeURIComponent(filters.userGroupUuid)}`);
      if (filters.cloudOfficeTenantReference) params.push(`cloudOfficeTenantReference=${encodeURIComponent(filters.cloudOfficeTenantReference)}`);
      if (filters.hasCloudOfficeMsLicense !== undefined) params.push(`hasCloudOfficeMsLicense=${filters.hasCloudOfficeMsLicense}`);
    }
    if (pageSize) params.push(`pageSize=${pageSize}`);
    if (pageToken) params.push(`pageToken=${encodeURIComponent(pageToken)}`);
    const qs = params.length ? `?${params.join("&")}` : "";
    return this.apiGet("user-management", `/v1/users${qs}`);
  }

  async getUser(userUuid: string): Promise<unknown> {
    this.requireCloud("getUser");
    return this.apiGet("user-management", `/v1/users/${encodeURIComponent(userUuid)}`);
  }

  async batchGetUsers(userUuids: string[]): Promise<unknown> {
    this.requireCloud("batchGetUsers");
    return this.apiPost("user-management", "/v1/users:batchGetUsers", { userUuids });
  }

  // ── Web Access Protection (Cloud only) ────────────────────────────

  async listWebAddressRules(policyUuid: string): Promise<unknown> {
    this.requireCloud("listWebAddressRules");
    return this.apiGet("web-access-protection", `/v2/policies/${encodeURIComponent(policyUuid)}/web-address-rules`);
  }

  async updateWebAddressRuleDomains(policyUuid: string, addressRuleUuid: string, domainData: Record<string, unknown>): Promise<unknown> {
    this.requireCloud("updateWebAddressRuleDomains");
    return this.apiPut("web-access-protection", `/v2/policies/${encodeURIComponent(policyUuid)}/web-address-rules/${encodeURIComponent(addressRuleUuid)}/domains`, domainData);
  }

  // ── Internal helpers ──────────────────────────────────────────────

  private requireCloud(method: string): void {
    if (this.config.mode !== "cloud") {
      throw new Error(`${method} is only available in cloud mode (ESET Connect). Current mode: onprem`);
    }
  }

  private async apiGet(cat: string, path: string): Promise<unknown> {
    await this.ensureAuth();
    const res = await this.rawRequest("GET", this.baseUrl(cat), path, undefined, "application/json", true);
    return this.parseApiResponse(res, {});
  }

  private async apiPost(cat: string, path: string, body: Record<string, unknown>): Promise<unknown> {
    await this.ensureAuth();
    const res = await this.rawRequest("POST", this.baseUrl(cat), path, JSON.stringify(body), "application/json", true);
    return this.parseApiResponse(res, { success: true });
  }

  private async apiPut(cat: string, path: string, body: Record<string, unknown>): Promise<unknown> {
    await this.ensureAuth();
    const res = await this.rawRequest("PUT", this.baseUrl(cat), path, JSON.stringify(body), "application/json", true);
    return this.parseApiResponse(res, { success: true });
  }

  private async apiDelete(cat: string, path: string): Promise<unknown> {
    await this.ensureAuth();
    const res = await this.rawRequest("DELETE", this.baseUrl(cat), path, undefined, "application/json", true);
    return this.parseApiResponse(res, { success: true });
  }

  private parseApiResponse(res: RawResponse, emptyFallback: unknown): unknown {
    if (res.statusCode === 202) {
      return {
        pending: true,
        statusCode: 202,
        responseId: headerValue(res.headers["response-id"]),
        requestId: headerValue(res.headers["request-id"]) ?? headerValue(res.headers["x-request-id"]),
        message: "ESET API accepted the request but the result is still pending. Retry the same tool call later.",
      };
    }

    return res.body ? JSON.parse(res.body) : emptyFallback;
  }

  private rawRequest(
    method: string, baseUrl: string, path: string,
    body?: string, contentType = "application/json", useAuth = false,
  ): Promise<RawResponse> {
    const deadline = Date.now() + requestTimeoutMs();

    const send = (responseId?: string): Promise<RawResponse> => new Promise((resolve, reject) => {
      const url = new URL(path, baseUrl);
      const isHttps = url.protocol === "https:";
      const transport = isHttps ? https : http;

      const headers: Record<string, string> = {
        "Content-Type": contentType,
        Accept: "application/json",
      };
      if (useAuth && this.accessToken) {
        headers["Authorization"] = `Bearer ${this.accessToken}`;
      }
      if (responseId) {
        headers["response-id"] = responseId;
      }
      if (body) {
        headers["Content-Length"] = Buffer.byteLength(body).toString();
      }

      let rejectUnauthorized = true;
      if (this.config.mode === "onprem" && (this.config as OnPremConfig).verifySsl === false) {
        rejectUnauthorized = false;
      }

      const options: https.RequestOptions = {
        method,
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        headers,
        rejectUnauthorized,
      };

      const req = transport.request(options, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const data = Buffer.concat(chunks).toString("utf-8");
          if (res.statusCode === 202) {
            const nextResponseId = headerValue(res.headers["response-id"]) ?? responseId;
            if (nextResponseId && Date.now() + PENDING_RETRY_DELAY_MS < deadline) {
              setTimeout(() => {
                send(nextResponseId).then(resolve, reject);
              }, PENDING_RETRY_DELAY_MS);
              return;
            }
          }

          if (res.statusCode && res.statusCode >= 400) {
            const detail = [
              `ESET API error ${res.statusCode}`,
              data ? `body=${data.substring(0, 500)}` : "body=(empty)",
              `method=${method}`,
              `path=${path}`,
              body ? `reqBodyLen=${body.length}` : "",
              responseId ? `response-id=${responseId}` : "",
              res.headers["request-id"] ? `request-id=${res.headers["request-id"]}` : "",
              res.headers["x-request-id"] ? `x-request-id=${res.headers["x-request-id"]}` : "",
            ].filter(Boolean).join(" | ");
            reject(new Error(detail));
          } else {
            resolve({ statusCode: res.statusCode ?? 0, headers: res.headers, body: data });
          }
        });
      });

      req.on("error", reject);
      req.setTimeout(requestTimeoutMs(), () => {
        req.destroy(new Error(`ESET API request timed out after ${requestTimeoutMs()}ms | method=${method} | path=${path}`));
      });
      if (body) req.write(body);
      req.end();
    });

    return send();
  }
}
