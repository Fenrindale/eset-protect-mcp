# ESET PROTECT MCP Server

[![npm version](https://img.shields.io/npm/v/eset-protect-mcp.svg)](https://www.npmjs.com/package/eset-protect-mcp)
[![npm downloads](https://img.shields.io/npm/dm/eset-protect-mcp.svg)](https://www.npmjs.com/package/eset-protect-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server for **ESET PROTECT** — supports both **On-Prem** and **Cloud (ESET Connect)**.

Manage devices, policies, detections, incidents, quarantine, executables, installers, EDR rules, automation tasks, and more through natural language with GitHub Copilot, Claude Desktop, or any MCP client.

```bash
npx -y eset-protect-mcp
```

## Features

### Shared Tools (On-Prem + Cloud) — 16 tools

| Category | Tools |
|---|---|
| **Devices** | `list_devices`, `get_device`, `batch_get_devices`, `move_device`, `rename_device` |
| **Device Groups** | `list_device_groups`, `list_devices_in_group` |
| **Policies** | `list_policies`, `get_policy`, `create_policy`, `delete_policy` |
| **Policy Assignments** | `list_policy_assignments`, `get_policy_assignment`, `assign_policy`, `unassign_policy`, `update_policy_assignment_ranking` |

### Cloud-Only Tools (ESET Connect) — 77 additional tools

| Category | Tools |
|---|---|
| **Devices (extra)** | `batch_import_devices` |
| **Asset Management** | `create_group`, `delete_group`, `move_group`, `rename_group` |
| **Automation** | `list_device_tasks`, `create_device_task`, `get_device_task`, `delete_device_task`, `list_device_task_runs`, `update_device_task_targets`, `update_device_task_triggers` |
| **Identity** | `list_permissions`, `list_role_assignments`, `assign_role`, `revoke_role`, `create_role`, `delete_role` |
| **Detections** | `list_detections`, `list_detections_v2`, `get_detection`, `resolve_detection`, `batch_get_detections` |
| **Detection Groups** | `list_detection_groups`, `get_detection_group`, `resolve_detection_group`, `search_detection_groups` |
| **EDR Rules** | `list_edr_rules`, `create_edr_rule`, `get_edr_rule`, `delete_edr_rule`, `enable_edr_rule`, `disable_edr_rule`, `update_edr_rule_definition` |
| **EDR Rule Exclusions** | `list_edr_rule_exclusions`, `create_edr_rule_exclusion`, `get_edr_rule_exclusion`, `delete_edr_rule_exclusion`, `update_edr_rule_exclusion_definition` |
| **Incidents** | `list_incidents`, `get_incident`, `close_incident`, `reopen_incident`, `update_incident_attributes` |
| **Incident Comments** | `list_incident_comments`, `create_incident_comment`, `get_incident_comment`, `delete_incident_comment`, `update_incident_comment_text` |
| **Executables** | `list_executables`, `get_executable`, `block_executable`, `unblock_executable` |
| **Quarantine** | `list_quarantined_objects`, `get_quarantined_object`, `get_quarantine_count`, `batch_delete_quarantined_objects`, `batch_download_quarantined_objects`, `batch_restore_quarantined_objects`, `download_quarantined_object`, `purge_quarantined_objects`, `restore_quarantined_object` |
| **Installers** | `list_installers`, `get_installer`, `create_installer`, `delete_installer`, `generate_gpo_sccm_file` |
| **Mobile Devices** | `batch_activate_mobile_product`, `batch_get_enrollment_links` |
| **Network Access** | `list_ip_sets`, `get_ip_set`, `update_ip_set` |
| **Users** | `list_users`, `get_user`, `batch_get_users` |
| **Web Access** | `list_web_address_rules`, `update_web_address_rule_domains` |

Incident filters use unquoted enum constants. For example, use `status==INCIDENT_STATUS_OPEN`, not `status=="INCIDENT_STATUS_OPEN"`.

## Prerequisites

- **Node.js** >= 18.0.0
- **On-Prem**: ESET PROTECT On-Prem 13.0+ with REST API enabled
- **Cloud**: ESET Business Account / ESET PROTECT Hub with API user (Integrations enabled)

## Installation

### From npm

```bash
npm install -g eset-protect-mcp
```

### From GitHub

```bash
git clone https://github.com/Fenrindale/eset-protect-mcp.git
cd eset-protect-mcp
npm install
npm run build
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ESET_MODE` | No | `onprem` (default) or `cloud` |
| `ESET_USERNAME` | Yes | API username / email |
| `ESET_PASSWORD` | Yes | API password |
| `ESET_SERVER_URL` | On-Prem only | Server URL (e.g., `https://protect-server:9443`) |
| `ESET_VERIFY_SSL` | On-Prem only | `false` to allow self-signed certs (default: `true`) |
| `ESET_REGION` | Cloud only | `eu`, `de`, `us`, `jpn`, or `ca` |
| `ESET_REQUEST_TIMEOUT_MS` | No | HTTP request timeout in milliseconds (default: `120000`) |
| `ESET_EXECUTION_MODE` | No | `live` (default), `read-only`, `dry-run`, or `scoped` |
| `ESET_ALLOWED_TOOLS` | No | Comma-separated tool allowlist |
| `ESET_DENIED_TOOLS` | No | Comma-separated tool blocklist |
| `ESET_REQUIRE_APPROVAL` | No | `none`, `all`, risk levels (`low_write`, `high_write`, `destructive`), or tool names |
| `ESET_APPROVALS_DIR` | No | Approval record directory (default: `.eset-mcp/approvals`) |
| `ESET_APPROVAL_TOKEN` | No | Token required by the local `approve_action` tool |
| `ESET_APPROVAL_TTL_SECONDS` | No | Approval validity window (default: `900`) |
| `ESET_AUDIT_LOG` | No | JSONL audit log path for tool decisions and executions |
| `ESET_ALLOWED_DEVICE_UUIDS` | No | Comma-separated device UUID allowlist for scoped mode |
| `ESET_ALLOWED_GROUP_UUIDS` | No | Comma-separated group UUID allowlist for scoped mode |
| `ESET_ALLOWED_RULE_UUIDS` | No | Comma-separated EDR rule UUID allowlist for scoped mode |
| `ESET_ALLOW_GLOBAL_SCOPE` | No | `true` to allow global EDR exclusions in scoped mode |

### Approval and Sandbox Controls

The server includes a local policy gate before any ESET API call. The default `live` mode preserves existing behavior.

| Mode | Behavior |
|---|---|
| `live` | Execute tools normally, unless allow/deny/approval variables are configured |
| `read-only` | Allow only `list_*`, `get_*`, `batch_get_*`, and `search_*` tools |
| `dry-run` | Return a sanitized action summary for write tools without calling ESET |
| `scoped` | Enforce configured UUID allowlists and require approval for `high_write` and `destructive` tools by default |

Write tools are classified as `low_write`, `high_write`, or `destructive`. When approval is required, the first tool call returns `approvalRequired`, writes a pending approval record, and does not call ESET. A human can then approve it with the local `approve_action` tool or by writing a matching JSON approval file under `ESET_APPROVALS_DIR`. Approved actions are one-shot and are consumed after execution.

Two local security tools are always registered:

| Tool | Purpose |
|---|---|
| `list_pending_approvals` | Show pending approval records from the local approval store |
| `approve_action` | Approve or deny one pending action when `ESET_APPROVAL_TOKEN` is configured |

Example guarded configuration:

```bash
ESET_EXECUTION_MODE=scoped
ESET_REQUIRE_APPROVAL=high_write,destructive
ESET_ALLOWED_RULE_UUIDS=rule-uuid-1,rule-uuid-2
ESET_ALLOWED_GROUP_UUIDS=group-uuid-1
ESET_AUDIT_LOG=/var/log/eset-mcp-audit.jsonl
```

## Usage with MCP Clients

### VS Code / GitHub Copilot — On-Prem

```json
{
  "mcp": {
    "servers": {
      "eset-protect": {
        "command": "npx",
        "args": ["-y", "eset-protect-mcp"],
        "env": {
          "ESET_MODE": "onprem",
          "ESET_SERVER_URL": "https://your-protect-server:9443",
          "ESET_USERNAME": "your-api-user",
          "ESET_PASSWORD": "your-api-password",
          "ESET_VERIFY_SSL": "false"
        }
      }
    }
  }
}
```

### VS Code / GitHub Copilot — Cloud

```json
{
  "mcp": {
    "servers": {
      "eset-protect": {
        "command": "npx",
        "args": ["-y", "eset-protect-mcp"],
        "env": {
          "ESET_MODE": "cloud",
          "ESET_REGION": "eu",
          "ESET_USERNAME": "your-api-user@company.com",
          "ESET_PASSWORD": "your-api-password"
        }
      }
    }
  }
}
```

### Claude Desktop — On-Prem

```json
{
  "mcpServers": {
    "eset-protect": {
      "command": "npx",
      "args": ["-y", "eset-protect-mcp"],
      "env": {
        "ESET_MODE": "onprem",
        "ESET_SERVER_URL": "https://your-protect-server:9443",
        "ESET_USERNAME": "your-api-user",
        "ESET_PASSWORD": "your-api-password",
        "ESET_VERIFY_SSL": "false"
      }
    }
  }
}
```

### Claude Desktop — Cloud

```json
{
  "mcpServers": {
    "eset-protect": {
      "command": "npx",
      "args": ["-y", "eset-protect-mcp"],
      "env": {
        "ESET_MODE": "cloud",
        "ESET_REGION": "us",
        "ESET_USERNAME": "your-api-user@company.com",
        "ESET_PASSWORD": "your-api-password"
      }
    }
  }
}
```

## ESET PROTECT API Setup

### On-Prem

1. Enable the REST API in **More > Settings** on your ESET PROTECT Web Console
2. Open API ports in your firewall (default: 9443)
3. Create an API user with appropriate [permission sets](https://help.eset.com/protect_admin/latest/en-US/admin_ar_permissions_list.html)

> **Note:** The Administrator account cannot use the API.

Docs: [ESET PROTECT On-Prem REST API](https://help.eset.com/protect_admin/latest/en-US/rest_api.html)

### Cloud (ESET Connect)

1. Log in to ESET Business Account / ESET PROTECT Hub as Superuser
2. Create an API user with **Integrations** enabled under Access Rights
3. The user must complete account setup via invitation email
4. Use the correct region (`eu`, `de`, `us`, `jpn`, `ca`) matching your ESET PROTECT server location

Docs: [ESET Connect](https://help.eset.com/eset_connect/en-US/)

### Cloud Regions & Domains

| Region | Auth Domain |
|---|---|
| EU | `eu.business-account.iam.eset.systems` |
| Germany | `de.business-account.iam.eset.systems` |
| USA | `us.business-account.iam.eset.systems` |
| Japan | `jpn.business-account.iam.eset.systems` |
| Canada | `ca.business-account.iam.eset.systems` |

## Development

```bash
git clone https://github.com/Fenrindale/eset-protect-mcp.git
cd eset-protect-mcp
npm install
npm run build
npm start
```

## Release

CI runs on pushes and pull requests to `master`.

To publish from GitHub Actions, configure npm Trusted Publishing for this package:

| Field | Value |
|---|---|
| Publisher | GitHub Actions |
| Organization or user | `Fenrindale` |
| Repository | `eset-protect-mcp` |
| Workflow filename | `publish.yml` |
| Allowed actions | `npm publish` |

Then release by bumping the package version and pushing the matching tag:

```bash
npm version patch
git push origin master --follow-tags
```

## License

MIT — see [LICENSE](LICENSE) for details.
