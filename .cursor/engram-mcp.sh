#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export ENGRAM_DATA_DIR="${ROOT}/.engram"
mkdir -p "${ENGRAM_DATA_DIR}"

# Forward explicit flags, e.g. from mcp.json:
#   "args": [".cursor/engram-mcp.sh", "--tools=agent"]
if [[ $# -gt 0 ]]; then
  exec engram mcp "$@"
fi

# Default: agent + admin (mem_delete, etc.). Override without editing this file:
#   ENGRAM_MCP_TOOLS=agent engram mcp   # or export before starting Cursor
exec engram mcp --tools="${ENGRAM_MCP_TOOLS:-agent,admin}"
