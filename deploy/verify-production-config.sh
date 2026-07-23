#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${PROJECT_DIR:-/opt/tsmeet}"
cd "${PROJECT_DIR}"

resolved="$(mktemp)"
trap 'rm -f "${resolved}"' EXIT

"${PROJECT_DIR}/deploy/dc" config >"${resolved}"

# This command must print nothing. Any match means the VPS override failed to
# remove the old large RTC range from the resolved production configuration.
if grep -E '50000|60000' "${resolved}"; then
  echo "Resolved VPS production Compose config still contains an RTC port range." >&2
  exit 1
fi

for port in 7881 7882 3478 5349; do
  if ! grep -Eq "published: [\"']?${port}[\"']?" "${resolved}"; then
    echo "Resolved VPS production Compose config is missing published port ${port}." >&2
    exit 1
  fi
done

echo "Resolved VPS production Compose configuration is valid."
