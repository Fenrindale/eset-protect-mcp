/**
 * ESET PROTECT On-Prem REST API Client
 *
 * Handles authentication and API calls to the ESET PROTECT server.
 * Reference: https://help.eset.com/protect_admin/latest/en-US/api.html
 */

import https from "node:https";
import http from "node:http";

export interface EsetConfig {
  serverUrl: string; // e.g. https://protect_server:9443
  username: string;
  password: string;
  /** Set to false to allow self-signed certificates (default: true) */
  verifySsl?: boolean;
}

interface TokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
}

export class EsetClient {
  private config: EsetConfig;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(config: EsetConfig) {
    this.config = {
      ...config,
      serverUrl: config.serverUrl.replace(/\/+$/, ""),
    };
  }

  // ──────────────────────────────────────────────
  // Authentication
  // ──────────────────────────────────────────────

  async authenticate(): Promise<void> {
    const body = JSON.stringify({
      username: this.config.username,
      password: this.config.password,
      grant_type: "password",
    });

    const res = await this.rawRequest("POST", "/GetTokens", body, false);
    const data = JSON.parse(res) as TokenResponse;

    if (!data.accessToken) {
      throw new Error(
        `Authentication failed: no accessToken in response. Response: ${res}`
      );
    }

    this.accessToken = data.accessToken;
    this.tokenExpiry = Date.now() + (data.expiresIn ?? 3600) * 1000 - 60_000;
  }

  private async ensureAuth(): Promise<void> {
    if (!this.accessToken || Date.now() >= this.tokenExpiry) {
      await this.authenticate();
    }
  }

  // ──────────────────────────────────────────────
  // Devices
  // ──────────────────────────────────────────────

  async getDevice(deviceUuid: string): Promise<unknown> {
    return this.apiGet(`/v1/devices/${encodeURIComponent(deviceUuid)}`);
  }

  async batchGetDevices(deviceUuids: string[]): Promise<unknown> {
    const params = deviceUuids
      .map((id) => `deviceUuids=${encodeURIComponent(id)}`)
      .join("&");
    return this.apiGet(`/v1/devices:batchGet?${params}`);
  }

  async moveDevice(
    deviceUuid: string,
    newParentUuid: string
  ): Promise<unknown> {
    return this.apiPost(
      `/v1/devices/${encodeURIComponent(deviceUuid)}:move`,
      { newParentUuid }
    );
  }

  async renameDevice(
    deviceUuid: string,
    newName: string
  ): Promise<unknown> {
    return this.apiPost(
      `/v1/devices/${encodeURIComponent(deviceUuid)}:renameDevice`,
      { newName }
    );
  }

  // ──────────────────────────────────────────────
  // Device Groups
  // ──────────────────────────────────────────────

  async listDeviceGroups(): Promise<unknown> {
    return this.apiGet("/v1/device_groups");
  }

  async listDevicesInGroup(
    groupUuid: string,
    pageSize?: number,
    pageToken?: string
  ): Promise<unknown> {
    let url = `/v1/device_groups/${encodeURIComponent(groupUuid)}/devices`;
    const params: string[] = [];
    if (pageSize) params.push(`page_size=${pageSize}`);
    if (pageToken) params.push(`page_token=${encodeURIComponent(pageToken)}`);
    if (params.length) url += `?${params.join("&")}`;
    return this.apiGet(url);
  }

  // ──────────────────────────────────────────────
  // Policies
  // ──────────────────────────────────────────────

  async listPolicies(): Promise<unknown> {
    return this.apiGet("/v2/policies");
  }

  async getPolicy(policyUuid: string): Promise<unknown> {
    return this.apiGet(`/v2/policies/${encodeURIComponent(policyUuid)}`);
  }

  async createPolicy(policyData: Record<string, unknown>): Promise<unknown> {
    return this.apiPost("/v2/policies", policyData);
  }

  async deletePolicy(policyUuid: string): Promise<unknown> {
    return this.apiDelete(`/v2/policies/${encodeURIComponent(policyUuid)}`);
  }

  // ──────────────────────────────────────────────
  // Policy Assignments
  // ──────────────────────────────────────────────

  async listPolicyAssignments(): Promise<unknown> {
    return this.apiGet("/v2/policy-assignments");
  }

  async getPolicyAssignment(assignmentUuid: string): Promise<unknown> {
    return this.apiGet(
      `/v2/policy-assignments/${encodeURIComponent(assignmentUuid)}`
    );
  }

  async assignPolicy(assignmentData: Record<string, unknown>): Promise<unknown> {
    return this.apiPost("/v2/policy-assignments", assignmentData);
  }

  async unassignPolicy(assignmentUuid: string): Promise<unknown> {
    return this.apiDelete(
      `/v2/policy-assignments/${encodeURIComponent(assignmentUuid)}`
    );
  }

  async updatePolicyAssignmentRanking(
    assignmentUuid: string,
    ranking: number
  ): Promise<unknown> {
    return this.apiPost(
      `/v2/policy-assignments/${encodeURIComponent(assignmentUuid)}:updateRanking`,
      { ranking }
    );
  }

  // ──────────────────────────────────────────────
  // HTTP helpers
  // ──────────────────────────────────────────────

  private async apiGet(path: string): Promise<unknown> {
    await this.ensureAuth();
    const res = await this.rawRequest("GET", path, undefined, true);
    return JSON.parse(res);
  }

  private async apiPost(
    path: string,
    body: Record<string, unknown>
  ): Promise<unknown> {
    await this.ensureAuth();
    const res = await this.rawRequest("POST", path, JSON.stringify(body), true);
    return res ? JSON.parse(res) : { success: true };
  }

  private async apiDelete(path: string): Promise<unknown> {
    await this.ensureAuth();
    const res = await this.rawRequest("DELETE", path, undefined, true);
    return res ? JSON.parse(res) : { success: true };
  }

  private rawRequest(
    method: string,
    path: string,
    body?: string,
    useAuth = false
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.config.serverUrl);
      const isHttps = url.protocol === "https:";
      const transport = isHttps ? https : http;

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
      };
      if (useAuth && this.accessToken) {
        headers["Authorization"] = `Bearer ${this.accessToken}`;
      }
      if (body) {
        headers["Content-Length"] = Buffer.byteLength(body).toString();
      }

      const options: https.RequestOptions = {
        method,
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        headers,
        rejectUnauthorized: this.config.verifySsl !== false,
      };

      const req = transport.request(options, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const data = Buffer.concat(chunks).toString("utf-8");
          if (res.statusCode && res.statusCode >= 400) {
            reject(
              new Error(
                `ESET API error ${res.statusCode}: ${data}`
              )
            );
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
