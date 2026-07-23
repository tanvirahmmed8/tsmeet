#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${PROJECT_DIR:-/opt/tsmeet}"
LIVEKIT_TEMPLATE="${PROJECT_DIR}/infrastructure/livekit/livekit.production.example.yaml"
LIVEKIT_CONFIG="${PROJECT_DIR}/infrastructure/livekit/livekit.production.yaml"

cd "${PROJECT_DIR}"

[[ -f .env ]] || { echo "Missing ${PROJECT_DIR}/.env. Copy .env.example to .env and set production values."; exit 1; }
[[ -f "${LIVEKIT_TEMPLATE}" ]] || { echo "Missing LiveKit template: ${LIVEKIT_TEMPLATE}"; exit 1; }

python3 - .env "${LIVEKIT_TEMPLATE}" "${LIVEKIT_CONFIG}" <<'PY'
import pathlib
import sys

env_path = pathlib.Path(sys.argv[1])
template_path = pathlib.Path(sys.argv[2])
config_path = pathlib.Path(sys.argv[3])

values = {}
for number, raw_line in enumerate(env_path.read_text(encoding="utf-8").splitlines(), 1):
    line = raw_line.strip()
    if not line or line.startswith("#"):
        continue
    if "=" not in line:
        raise SystemExit(f"Invalid .env line {number}: expected NAME=value")
    name, value = line.split("=", 1)
    name = name.strip()
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        value = value[1:-1]
    values[name] = value

required = (
    "FRONTEND_URL", "MEETING_BASE_URL", "NEXT_PUBLIC_SIGNALING_SERVER",
    "NEXT_PUBLIC_LIVEKIT_URL", "LIVEKIT_PUBLIC_URL", "MINIO_PUBLIC_ENDPOINT",
    "DB_ROOT_PASSWORD", "JWT_SECRET", "REDIS_PASSWORD", "LIVEKIT_API_KEY",
    "LIVEKIT_API_SECRET", "LIVEKIT_KEYS", "MINIO_ROOT_USER",
    "MINIO_ROOT_PASSWORD", "RECORDER_SERVICE_TOKEN", "GRAFANA_ADMIN_PASSWORD",
)
missing = [name for name in required if not values.get(name)]
if missing:
    raise SystemExit("Missing required variable(s): " + ", ".join(missing))
if any(marker in env_path.read_text(encoding="utf-8") for marker in
       ("change-me", "replace-from-your-deployment-secret-store", "GENERATE_")):
    raise SystemExit("The .env file still contains placeholder values")
expected_keys = f"{values['LIVEKIT_API_KEY']}: {values['LIVEKIT_API_SECRET']}"
if values["LIVEKIT_KEYS"] != expected_keys:
    raise SystemExit("LIVEKIT_KEYS must exactly equal 'LIVEKIT_API_KEY: LIVEKIT_API_SECRET'")
if values["NEXT_PUBLIC_SIGNALING_SERVER"].rstrip("/") != values["FRONTEND_URL"].rstrip("/"):
    raise SystemExit(
        "NEXT_PUBLIC_SIGNALING_SERVER must equal FRONTEND_URL in production "
        "so the HttpOnly session cookie authenticates Socket.IO"
    )

content = template_path.read_text(encoding="utf-8")
if content.count("__REDIS_PASSWORD__") != 1:
    raise SystemExit("LiveKit template must contain exactly one __REDIS_PASSWORD__ placeholder")
rendered = content.replace("__REDIS_PASSWORD__", values["REDIS_PASSWORD"])
required_rtc_lines = ("  tcp_port: 7881", "  udp_port: 7882", "  use_external_ip: true")
missing_rtc = [line.strip() for line in required_rtc_lines if line not in rendered]
if missing_rtc:
    raise SystemExit("LiveKit production RTC template is missing: " + ", ".join(missing_rtc))
if "port_range_start" in rendered or "port_range_end" in rendered:
    raise SystemExit("LiveKit production RTC must use udp_port: 7882, not an RTC port range")
config_path.write_text(rendered, encoding="utf-8")
PY

chmod 600 .env "${LIVEKIT_CONFIG}"
"${PROJECT_DIR}/deploy/verify-production-config.sh"
echo "Application configuration generated successfully (TURN remains disabled until certificates exist)."
