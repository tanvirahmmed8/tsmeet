#!/bin/sh
set -eu

TSMEET_ROOT="${TSMEET_ROOT:-/opt/tsmeet}"
cd "$TSMEET_ROOT"

exec /usr/bin/docker compose \
  -f docker-compose.yml \
  -f docker-compose.production.yml \
  kill -s HUP livekit
