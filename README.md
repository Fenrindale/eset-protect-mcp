# ESET PROTECT MCP Server

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that enables AI assistants to interact with **ESET PROTECT On-Prem** via its REST API.

Manage devices, device groups, policies, and policy assignments through natural language conversations with AI assistants like GitHub Copilot, Claude Desktop, or any MCP-compatible client.

## Features

| Category | Tools |
|---|---|
| **Devices** | `get_device`, `batch_get_devices`, `move_device`, `rename_device` |
| **Device Groups** | `list_device_groups`, `list_devices_in_group` |
| **Policies** | `list_policies`, `get_policy`, `create_policy`, `delete_policy` |
| **Policy Assignments** | `list_policy_assignments`, `get_policy_assignment`, `assign_policy`, `unassign_policy`, `update_policy_assignment_ranking` |

## Prerequisites

- **Node.js** >= 18.0.0
- **ESET PROTECT On-Prem** 13.0+ with REST API enabled
- An API user account (not the Administrator account)

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

The server requires the following environment variables:

| Variable | Required | Description |
|---|---|---|
| `ESET_SERVER_URL` | Yes | ESET PROTECT server URL (e.g., `https://protect-server:9443`) |
| `ESET_USERNAME` | Yes | API username |
| `ESET_PASSWORD` | Yes | API password |
| `ESET_VERIFY_SSL` | No | Set to `false` to allow self-signed certificates (default: `true`) |

## Usage with MCP Clients

### VS Code / GitHub Copilot

Add to your VS Code `settings.json` or `.vscode/mcp.json`:

```json
{
  "mcp": {
    "servers": {
      "eset-protect": {
        "command": "npx",
        "args": ["-y", "eset-protect-mcp"],
        "env": {
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

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "eset-protect": {
      "command": "npx",
      "args": ["-y", "eset-protect-mcp"],
      "env": {
        "ESET_SERVER_URL": "https://your-protect-server:9443",
        "ESET_USERNAME": "your-api-user",
        "ESET_PASSWORD": "your-api-password",
        "ESET_VERIFY_SSL": "false"
      }
    }
  }
}
```

### Direct Execution

```bash
export ESET_SERVER_URL="https://your-protect-server:9443"
export ESET_USERNAME="your-api-user"
export ESET_PASSWORD="your-api-password"
export ESET_VERIFY_SSL="false"

npx eset-protect-mcp
```

## Tool Details

### Devices

- **`get_device`** — Get detailed information about a device by UUID
- **`batch_get_devices`** — Get info about multiple devices at once
- **`move_device`** — Move a device to a different static group
- **`rename_device`** — Rename a device

### Device Groups

- **`list_device_groups`** — List all device groups
- **`list_devices_in_group`** — List devices in a specific group (with pagination)

### Policies

- **`list_policies`** — List all policies
- **`get_policy`** — Get details of a specific policy
- **`create_policy`** — Create a new policy
- **`delete_policy`** — Delete a policy

### Policy Assignments

- **`list_policy_assignments`** — List all policy assignments
- **`get_policy_assignment`** — Get details of a specific assignment
- **`assign_policy`** — Assign a policy to a device or group
- **`unassign_policy`** — Remove a policy assignment
- **`update_policy_assignment_ranking`** — Change the priority of an assignment

## ESET PROTECT API Setup

1. Enable the REST API in **More > Settings** on your ESET PROTECT Web Console
2. Open API ports in your local firewall
3. Create an API user with appropriate [permission sets](https://help.eset.com/protect_admin/latest/en-US/admin_ar_permissions_list.html)

> **Note:** The Administrator account cannot use the API. You must create a separate API user.

For full details, see the [ESET PROTECT REST API documentation](https://help.eset.com/protect_admin/latest/en-US/rest_api.html).

## Development

```bash
git clone https://github.com/Fenrindale/eset-protect-mcp.git
cd eset-protect-mcp
npm install
npm run build
npm start
```

## License

MIT — see [LICENSE](LICENSE) for details.
