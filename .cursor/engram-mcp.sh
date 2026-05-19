#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export ENGRAM_DATA_DIR="${ROOT}/.engram"
mkdir -p "${ENGRAM_DATA_DIR}"
exec engram mcp --tools=agent
