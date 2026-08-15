#!/usr/bin/env bash
set -euo pipefail

unformatted="$(gofmt -l api)"
if [[ -n "$unformatted" ]]; then
  echo "The following Go files need formatting:"
  echo "$unformatted"
  echo "Run: make fmt"
  exit 1
fi
