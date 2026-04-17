/**
 * ESET PROTECT REST API Client — supports both On-Prem and Cloud (ESET Connect)
 *
 * On-Prem:  https://help.eset.com/protect_admin/latest/en-US/api.html
 * Cloud:    https://help.eset.com/eset_connect/en-US/swagger_api.html
 */

import https from "node:https";
import http from "node:http";

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

// ─── Cloud domain map ───────────────────────────────────────────────

const CLOUD_DOMAINS: Record<string, string> = {
  authentication: "business-account.iam",
  "device-management": "device-management",
  "policy-management": "policy-management",
  "incident-management": "incident-management",
  "installer-management": "installer-management",
  "application-management": "application-management",
  "quarantine-management": "quarantine-management",
  automation: "automation",
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
    const data = JSON.parse(res);
    if (!data.accessToken) throw new Error(`Authentication failed: ${res}`);
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
    const data = JSON.parse(res);
    const token = data.access_token ?? data.accessToken;
    if (!token) throw new Error(`Cloud authentication failed: ${res}`);
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
    const params = deviceUuids.map((id) => `deviceUuids=${encodeURIComponent(id)}`).join("&");
    return this.apiGet("device-management", `/v1/devices:batchGet?${params}`);
  }

  async moveDevice(deviceUuid: string, newParentUuid: string): Promise<unknown> {
    return this.apiPost("device-management", `/v1/devices/${encodeURIComponent(deviceUuid)}:move`, { newParentUuid });
  }

  async renameDevice(deviceUuid: string, newName: string): Promise<unknown> {
    const action = this.config.mode === "onprem" ? ":renameDevice" : ":rename";
    return this.apiPost("device-management", `/v1/devices/${encodeURIComponent(deviceUuid)}${action}`, { newName });
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

  // ── Detections (Cloud only) ───────────────────────────────────────

  async listDetections(pageSize?: number, pageToken?: string): Promise<unknown> {
    this.requireCloud("listDetections");
    const params: string[] = [];
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

  // ── Incidents (Cloud only) ────────────────────────────────────────

  async listIncidents(pageSize?: number, pageToken?: string): Promise<unknown> {
    this.requireCloud("listIncidents");
    const params: string[] = [];
    if (pageSize) params.push(`pageSize=${pageSize}`);
    if (pageToken) params.push(`pageToken=${encodeURIComponent(pageToken)}`);
    const qs = params.length ? `?${params.join("&")}` : "";
    return this.apiGet("incident-management", `/v2/incidents${qs}`);
  }

  async getIncident(incidentUuid: string): Promise<unknown> {
    this.requireCloud("getIncident");
    return this.apiGet("incident-management", `/v2/incidents/${encodeURIComponent(incidentUuid)}`);
  }

  async closeIncident(incidentUuid: string): Promise<unknown> {
    this.requireCloud("closeIncident");
    return this.apiPost("incident-management", `/v2/incidents/${encodeURIComponent(incidentUuid)}:close`, {});
  }

  async reopenIncident(incidentUuid: string): Promise<unknown> {
    this.requireCloud("reopenIncident");
    return this.apiPost("incident-management", `/v2/incidents/${encodeURIComponent(incidentUuid)}:reopen`, {});
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

  async listQuarantinedObjects(pageSize?: number, pageToken?: string): Promise<unknown> {
    this.requireCloud("listQuarantinedObjects");
    const params: string[] = [];
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

  // ── Internal helpers ──────────────────────────────────────────────

  private requireCloud(method: string): void {
    if (this.config.mode !== "cloud") {
      throw new Error(`${method} is only available in cloud mode (ESET Connect). Current mode: onprem`);
    }
  }

  private async apiGet(cat: string, path: string): Promise<unknown> {
    await this.ensureAuth();
    const res = await this.rawRequest("GET", this.baseUrl(cat), path, undefined, "application/json", true);
    return res ? JSON.parse(res) : {};
  }

  private async apiPost(cat: string, path: string, body: Record<string, unknown>): Promise<unknown> {
    await this.ensureAuth();
    const res = await this.rawRequest("POST", this.baseUrl(cat), path, JSON.stringify(body), "application/json", true);
    return res ? JSON.parse(res) : { success: true };
  }

  private async apiDelete(cat: string, path: string): Promise<unknown> {
    await this.ensureAuth();
    const res = await this.rawRequest("DELETE", this.baseUrl(cat), path, undefined, "application/json", true);
    return res ? JSON.parse(res) : { success: true };
  }

  private rawRequest(
    method: string, baseUrl: string, path: string,
    body?: string, contentType = "application/json", useAuth = false,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
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
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`ESET API error ${res.statusCode}: ${data}`));
          } else {
            resolve(data);
          }
        });
      });

      req.on("error", reject);
      if (body) req.write(body);
      req.end();
    });
  }
}
