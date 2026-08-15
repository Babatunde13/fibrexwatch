#!/usr/bin/env bash
set -euo pipefail

blocked_pattern='(^|/)(\.env($|\.)|backups?/|.*\.sql$|.*\.pem$|.*\.key$|id_rsa($|\.))'
if [[ "${1:-}" == "--tracked" ]]; then
  candidates="$(git ls-files)"
else
  candidates="$(git diff --cached --name-only --diff-filter=ACMR)"
fi
blocked="$(printf '%s\n' "$candidates" | grep -E "$blocked_pattern" || true)"

# The documented environment template and versioned migrations are intentional.
blocked="$(printf '%s\n' "$blocked" | grep -Ev '^(\.env\.example|api/migrations/[0-9]+_[a-z0-9_]+\.sql)$' || true)"
if [[ -n "$blocked" ]]; then
  echo "Refusing to commit potentially sensitive files:"
  echo "$blocked"
  echo "Remove them from the index and commit a sanitized example instead."
  exit 1
fi
