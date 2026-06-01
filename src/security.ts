import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export type ExecutionMode = "live" | "read-only" | "dry-run" | "scoped";
export type ToolRisk = "read" | "low_write" | "high_write" | "destructive" | "admin";

interface SecurityConfig {
  mode: ExecutionMode;
  allowedTools: Set<string> | null;
  deniedTools: Set<string>;
  approvalRules: Set<string>;
  approvalDir: string;
  approvalToken?: string;
  approvalTtlMs: number;
  auditLogPath?: string;
  allowGlobalScope: boolean;
  allowedDeviceUuids: Set<string> | null;
  allowedGroupUuids: Set<string> | null;
  allowedRuleUuids: Set<string> | null;
}

interface ActionRecord {
  actionId: string;
  argsHash: string;
  toolName: string;
  risk: ToolRisk;
  mode: ExecutionMode;
  createdAt: string;
  expiresAt: string;
  sanitizedArgs: unknown;
}

interface ApprovalDecision {
  actionId: string;
  argsHash: string;
  approved: boolean;
  decidedAt: string;
  decidedBy?: string;
  reason?: string;
  expiresAt?: string;
}

const SECURITY_TOOL_NAMES = new Set(["list_pending_approvals", "approve_action"]);
const DEFAULT_APPROVAL_TTL_MS = 15 * 60 * 1000;

const TOOL_RISK_OVERRIDES: Record<string, ToolRisk> = {
  list_pending_approvals: "admin",
  approve_action: "admin",

  delete_policy: "destructive",
  delete_group: "destructive",
  delete_device_task: "destructive",
  delete_role: "destructive",
  delete_edr_rule: "destructive",
  delete_edr_rule_exclusion: "destructive",
  delete_incident_comment: "destructive",
  delete_installer: "destructive",
  batch_delete_quarantined_objects: "destructive",
  purge_quarantined_objects: "destructive",

  disable_edr_rule: "destructive",
  block_executable: "high_write",
  unblock_executable: "high_write",
  close_incident: "high_write",
  reopen_incident: "high_write",
  resolve_detection: "high_write",
  resolve_detection_group: "high_write",
  restore_quarantined_object: "high_write",
  batch_restore_quarantined_objects: "high_write",
  download_quarantined_object: "high_write",
  batch_download_quarantined_objects: "high_write",
};

function parseCsvSet(value: string | undefined): Set<string> | null {
  if (!value) return null;
  const items = value.split(",").map((item) => item.trim()).filter(Boolean);
  return items.length ? new Set(items) : null;
}

function parseRequiredApproval(mode: ExecutionMode): Set<string> {
  const raw = process.env.ESET_REQUIRE_APPROVAL;
  if (!raw) {
    return mode === "scoped" ? new Set(["high_write", "destructive"]) : new Set();
  }
  const normalized = raw.toLowerCase().trim();
  if (!normalized || normalized === "none" || normalized === "false") return new Set();
  if (normalized === "all" || normalized === "true") return new Set(["all"]);
  return new Set(normalized.split(",").map((item) => item.trim()).filter(Boolean));
}

function parseExecutionMode(): ExecutionMode {
  const mode = (process.env.ESET_EXECUTION_MODE ?? "live").toLowerCase();
  if (mode === "read-only" || mode === "dry-run" || mode === "scoped" || mode === "live") return mode;
  throw new Error("ESET_EXECUTION_MODE must be one of: live, read-only, dry-run, scoped");
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function defaultApprovalDir(): string {
  return path.resolve(process.cwd(), ".eset-mcp", "approvals");
}

function loadSecurityConfig(): SecurityConfig {
  const mode = parseExecutionMode();
  const approvalTtlSeconds = parsePositiveInt(process.env.ESET_APPROVAL_TTL_SECONDS, DEFAULT_APPROVAL_TTL_MS / 1000);
  return {
    mode,
    allowedTools: parseCsvSet(process.env.ESET_ALLOWED_TOOLS),
    deniedTools: parseCsvSet(process.env.ESET_DENIED_TOOLS) ?? new Set(),
    approvalRules: parseRequiredApproval(mode),
    approvalDir: path.resolve(process.env.ESET_APPROVALS_DIR ?? defaultApprovalDir()),
    approvalToken: process.env.ESET_APPROVAL_TOKEN,
    approvalTtlMs: approvalTtlSeconds * 1000,
    auditLogPath: process.env.ESET_AUDIT_LOG ? path.resolve(process.env.ESET_AUDIT_LOG) : undefined,
    allowGlobalScope: process.env.ESET_ALLOW_GLOBAL_SCOPE === "true",
    allowedDeviceUuids: parseCsvSet(process.env.ESET_ALLOWED_DEVICE_UUIDS),
    allowedGroupUuids: parseCsvSet(process.env.ESET_ALLOWED_GROUP_UUIDS),
    allowedRuleUuids: parseCsvSet(process.env.ESET_ALLOWED_RULE_UUIDS),
  };
}

function jsonResult(payload: unknown, isError = false): CallToolResult {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    ...(isError ? { isError: true } : {}),
  };
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(obj[key])}`).join(",")}}`;
}

function hash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hashArgs(args: unknown): string {
  return hash(canonicalize(args));
}

function actionIdFor(toolName: string, argsHash: string): string {
  return hash(`${toolName}\0${argsHash}`).slice(0, 24);
}

function maybeParseJsonString(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function sanitizeArgs(value: unknown): unknown {
  if (typeof value === "string") {
    if (value.trim().startsWith("<")) {
      return {
        redacted: "xml",
        length: value.length,
        sha256: hash(value),
      };
    }
    if (value.length > 500) {
      return {
        redacted: "long-string",
        length: value.length,
        sha256: hash(value),
        preview: value.slice(0, 120),
      };
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeArgs(item));
  if (value && typeof value === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (/token|password|secret|credential/i.test(key)) {
        sanitized[key] = { redacted: true };
      } else {
        sanitized[key] = sanitizeArgs(typeof item === "string" ? maybeParseJsonString(item) : item);
      }
    }
    return sanitized;
  }
  return value;
}

function toolRisk(toolName: string): ToolRisk {
  const override = TOOL_RISK_OVERRIDES[toolName];
  if (override) return override;
  if (
    toolName.startsWith("list_") ||
    toolName.startsWith("get_") ||
    toolName.startsWith("batch_get_") ||
    toolName.startsWith("search_")
  ) {
    return "read";
  }
  if (toolName.startsWith("delete_") || toolName.startsWith("purge_") || toolName.startsWith("batch_delete_")) {
    return "destructive";
  }
  if (toolName.startsWith("move_") || toolName.startsWith("rename_")) return "low_write";
  return "high_write";
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath: string, value: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8" });
}

function readJson<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function extractToolArgs(callbackArgs: unknown[]): Record<string, unknown> {
  const first = callbackArgs[0];
  if (!first || typeof first !== "object" || Array.isArray(first)) return {};
  return first as Record<string, unknown>;
}

function collectScopedValues(value: unknown, values: { devices: Set<string>; groups: Set<string>; rules: Set<string> }): void {
  if (typeof value === "string") {
    const parsed = maybeParseJsonString(value);
    if (parsed !== value) collectScopedValues(parsed, values);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectScopedValues(item, values);
    return;
  }
  if (!value || typeof value !== "object") return;

  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const pushOne = (target: Set<string>, candidate: unknown) => {
      if (typeof candidate === "string" && candidate) target.add(candidate);
      if (Array.isArray(candidate)) {
        for (const entry of candidate) if (typeof entry === "string" && entry) target.add(entry);
      }
    };

    if (key === "deviceUuid" || key === "deviceUuids") pushOne(values.devices, item);
    if (key === "groupUuid" || key === "groupUuids" || key === "deviceGroupUuid" || key === "newParentUuid" || key === "parentUuid") {
      pushOne(values.groups, item);
    }
    if (key === "ruleUuid" || key === "ruleUuids") pushOne(values.rules, item);
    collectScopedValues(item, values);
  }
}

function firstDisallowed(values: Set<string>, allowed: Set<string> | null): string | null {
  if (!allowed) return null;
  for (const value of values) {
    if (!allowed.has(value)) return value;
  }
  return null;
}

function hasNonEmptyScopes(args: Record<string, unknown>): boolean {
  const scopes = args.scopes;
  const parsed = typeof scopes === "string" ? maybeParseJsonString(scopes) : scopes;
  return Array.isArray(parsed) && parsed.length > 0;
}

export class SecurityManager {
  private readonly config: SecurityConfig;

  constructor(config = loadSecurityConfig()) {
    this.config = config;
  }

  startupSummary(): string {
    const approvalRules = [...this.config.approvalRules].join(",") || "none";
    return `security=${this.config.mode}, approval=${approvalRules}`;
  }

  apply(server: McpServer): void {
    const target = server as unknown as { tool: (...args: unknown[]) => unknown };
    const originalTool = target.tool.bind(server);

    target.tool = (...args: unknown[]) => {
      const toolName = String(args[0]);
      let callbackIndex = -1;
      for (let index = args.length - 1; index >= 0; index -= 1) {
        if (typeof args[index] === "function") {
          callbackIndex = index;
          break;
        }
      }
      if (callbackIndex >= 0 && !SECURITY_TOOL_NAMES.has(toolName)) {
        const callback = args[callbackIndex] as (...callbackArgs: unknown[]) => Promise<CallToolResult> | CallToolResult;
        args[callbackIndex] = async (...callbackArgs: unknown[]) =>
          this.guard(toolName, extractToolArgs(callbackArgs), () => callback(...callbackArgs));
      }
      return originalTool(...args);
    };
  }

  registerTools(server: McpServer): void {
    server.tool(
      "list_pending_approvals",
      "List pending ESET MCP approval requests from the local approval store",
      {},
      async () => jsonResult(this.listPendingApprovals()),
    );

    server.tool(
      "approve_action",
      "Approve or deny a pending ESET MCP action. Requires ESET_APPROVAL_TOKEN.",
      {
        actionId: z.string().describe("Action ID returned by an approvalRequired response"),
        decision: z.enum(["approve", "deny"]).describe("Approval decision"),
        approvalToken: z.string().describe("Value of ESET_APPROVAL_TOKEN. Do not reveal this token to an AI assistant."),
        decidedBy: z.string().optional().describe("Human approver identifier"),
        reason: z.string().optional().describe("Optional reason for the decision"),
      },
      async ({ actionId, decision, approvalToken, decidedBy, reason }) =>
        jsonResult(this.decideAction(actionId, decision, approvalToken, decidedBy, reason), decision === "deny"),
    );
  }

  async guard(toolName: string, args: Record<string, unknown>, run: () => Promise<CallToolResult> | CallToolResult): Promise<CallToolResult> {
    const risk = toolRisk(toolName);
    const argsHash = hashArgs(args);
    const actionId = actionIdFor(toolName, argsHash);
    const base = { toolName, risk, mode: this.config.mode, actionId, argsHash };

    const denial = this.basicDenial(toolName, risk, args);
    if (denial) {
      this.audit({ ...base, outcome: "denied", reason: denial.reason });
      return jsonResult({ ...base, sandboxDenied: true, ...denial }, true);
    }

    if (this.config.mode === "dry-run" && risk !== "read" && risk !== "admin") {
      this.audit({ ...base, outcome: "dry-run" });
      return jsonResult({
        ...base,
        dryRun: true,
        message: "ESET_EXECUTION_MODE=dry-run prevented this tool from calling the ESET API.",
        sanitizedArgs: sanitizeArgs(args),
      });
    }

    let consumeApprovalAfterRun = false;
    if (this.requiresApproval(toolName, risk)) {
      const approval = this.checkApproval(actionId, argsHash);
      if (approval === "denied") {
        this.audit({ ...base, outcome: "approval-denied" });
        return jsonResult({ ...base, approvalDenied: true }, true);
      }
      if (approval !== "approved") {
        const record = this.writePendingAction(toolName, risk, args, actionId, argsHash);
        this.audit({ ...base, outcome: "approval-required" });
        return jsonResult({
          ...base,
          approvalRequired: true,
          pendingApprovalFile: this.pendingPath(actionId),
          approvedFile: this.approvedPath(actionId),
          expiresAt: record.expiresAt,
          message: "Review the pending approval record, then approve it with approve_action or by creating the matching approved file.",
          sanitizedArgs: record.sanitizedArgs,
        }, true);
      }
      consumeApprovalAfterRun = true;
    }

    try {
      const result = await run();
      this.audit({ ...base, outcome: "executed" });
      if (consumeApprovalAfterRun) this.consumeApproval(actionId);
      return result;
    } catch (error) {
      this.audit({ ...base, outcome: "error", error: error instanceof Error ? error.message : String(error) });
      if (consumeApprovalAfterRun) this.consumeApproval(actionId);
      throw error;
    }
  }

  private basicDenial(toolName: string, risk: ToolRisk, args: Record<string, unknown>): { reason: string; detail?: unknown } | null {
    if (this.config.deniedTools.has(toolName)) return { reason: "Tool is listed in ESET_DENIED_TOOLS." };
    if (this.config.allowedTools && !this.config.allowedTools.has(toolName)) {
      return { reason: "Tool is not listed in ESET_ALLOWED_TOOLS." };
    }
    if (this.config.mode === "read-only" && risk !== "read" && risk !== "admin") {
      return { reason: "ESET_EXECUTION_MODE=read-only allows only read tools." };
    }

    const scopeDenial = this.scopeDenial(toolName, args);
    if (scopeDenial) return scopeDenial;

    return null;
  }

  private scopeDenial(toolName: string, args: Record<string, unknown>): { reason: string; detail?: unknown } | null {
    if (
      this.config.mode !== "scoped" &&
      !this.config.allowedDeviceUuids &&
      !this.config.allowedGroupUuids &&
      !this.config.allowedRuleUuids
    ) {
      return null;
    }

    if (this.config.mode === "scoped" && toolName === "create_edr_rule_exclusion" && !this.config.allowGlobalScope && !hasNonEmptyScopes(args)) {
      return { reason: "Scoped mode blocks global EDR rule exclusions unless ESET_ALLOW_GLOBAL_SCOPE=true." };
    }

    const values = { devices: new Set<string>(), groups: new Set<string>(), rules: new Set<string>() };
    collectScopedValues(args, values);

    const blockedDevice = firstDisallowed(values.devices, this.config.allowedDeviceUuids);
    if (blockedDevice) return { reason: "Device UUID is outside ESET_ALLOWED_DEVICE_UUIDS.", detail: { deviceUuid: blockedDevice } };

    const blockedGroup = firstDisallowed(values.groups, this.config.allowedGroupUuids);
    if (blockedGroup) return { reason: "Group UUID is outside ESET_ALLOWED_GROUP_UUIDS.", detail: { groupUuid: blockedGroup } };

    const blockedRule = firstDisallowed(values.rules, this.config.allowedRuleUuids);
    if (blockedRule) return { reason: "Rule UUID is outside ESET_ALLOWED_RULE_UUIDS.", detail: { ruleUuid: blockedRule } };

    return null;
  }

  private requiresApproval(toolName: string, risk: ToolRisk): boolean {
    if (risk === "read" || risk === "admin") return false;
    const rules = this.config.approvalRules;
    return rules.has("all") || rules.has(risk) || rules.has(toolName);
  }

  private checkApproval(actionId: string, argsHash: string): "approved" | "denied" | "missing" {
    const denied = readJson<ApprovalDecision>(this.deniedPath(actionId));
    if (denied?.argsHash === argsHash && denied.approved === false) return "denied";

    const approved = readJson<ApprovalDecision>(this.approvedPath(actionId));
    if (!approved || approved.argsHash !== argsHash || approved.approved !== true) return "missing";
    if (approved.expiresAt && Date.parse(approved.expiresAt) < Date.now()) return "missing";
    return "approved";
  }

  private writePendingAction(toolName: string, risk: ToolRisk, args: Record<string, unknown>, actionId: string, argsHash: string): ActionRecord {
    const now = new Date();
    const record: ActionRecord = {
      actionId,
      argsHash,
      toolName,
      risk,
      mode: this.config.mode,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.config.approvalTtlMs).toISOString(),
      sanitizedArgs: sanitizeArgs(args),
    };
    writeJson(this.pendingPath(actionId), record);
    return record;
  }

  private listPendingApprovals(): unknown {
    const pendingDir = path.join(this.config.approvalDir, "pending");
    if (!fs.existsSync(pendingDir)) return { pending: [] };
    const pending = fs.readdirSync(pendingDir)
      .filter((name) => name.endsWith(".json"))
      .map((name) => readJson<ActionRecord>(path.join(pendingDir, name)))
      .filter((record): record is ActionRecord => Boolean(record));
    return { pending };
  }

  private decideAction(actionId: string, decision: "approve" | "deny", approvalToken: string, decidedBy?: string, reason?: string): unknown {
    if (!this.config.approvalToken) {
      return {
        approved: false,
        actionId,
        message: "ESET_APPROVAL_TOKEN is not configured. Use file-based approval or set a token before enabling approve_action.",
      };
    }
    if (approvalToken !== this.config.approvalToken) {
      return { approved: false, actionId, message: "Invalid approval token." };
    }

    const pending = readJson<ActionRecord>(this.pendingPath(actionId));
    if (!pending) return { approved: false, actionId, message: "Pending approval was not found." };

    const approved = decision === "approve";
    const record: ApprovalDecision = {
      actionId,
      argsHash: pending.argsHash,
      approved,
      decidedAt: new Date().toISOString(),
      decidedBy,
      reason,
      expiresAt: pending.expiresAt,
    };

    writeJson(approved ? this.approvedPath(actionId) : this.deniedPath(actionId), record);
    this.audit({ toolName: "approve_action", actionId, outcome: approved ? "approved" : "denied", decidedBy, reason });
    return { actionId, approved, expiresAt: record.expiresAt };
  }

  private pendingPath(actionId: string): string {
    return path.join(this.config.approvalDir, "pending", `${actionId}.json`);
  }

  private approvedPath(actionId: string): string {
    return path.join(this.config.approvalDir, "approved", `${actionId}.json`);
  }

  private deniedPath(actionId: string): string {
    return path.join(this.config.approvalDir, "denied", `${actionId}.json`);
  }

  private consumeApproval(actionId: string): void {
    try {
      fs.rmSync(this.approvedPath(actionId), { force: true });
    } catch {
      // Best-effort cleanup only. Execution results should not depend on local file removal.
    }
  }

  private audit(event: Record<string, unknown>): void {
    if (!this.config.auditLogPath) return;
    ensureDir(path.dirname(this.config.auditLogPath));
    fs.appendFileSync(this.config.auditLogPath, `${JSON.stringify({ time: new Date().toISOString(), ...event })}\n`, "utf8");
  }
}
