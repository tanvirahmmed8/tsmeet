#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${PROJECT_DIR:-/opt/tsmeet}"
API_DOMAIN="${API_DOMAIN:?Set API_DOMAIN, for example api.example.com}"
CONFIG="${PROJECT_DIR}/infrastructure/livekit/livekit.production.yaml"
CERT_DIR="/etc/letsencrypt/live/${API_DOMAIN}"

[[ "${EUID}" -eq 0 ]] || { echo "Run this script as root so certificates can be verified."; exit 1; }
[[ -f "${CONFIG}" ]] || { echo "Missing ${CONFIG}; run deploy/configure-app.sh first."; exit 1; }
[[ -f "${CERT_DIR}/fullchain.pem" && -f "${CERT_DIR}/privkey.pem" ]] || { echo "Missing certificate for ${API_DOMAIN}; run deploy/configure-nginx.sh first."; exit 1; }

python3 - "${CONFIG}" "${API_DOMAIN}" <<'PY'
import pathlib
import re
import sys

path = pathlib.Path(sys.argv[1])
domain = sys.argv[2]
content = path.read_text(encoding="utf-8")
replacement = f'''turn:
  enabled: true
  udp_port: 3478
  tls_port: 5349
  domain: {domain}
  cert_file: /etc/letsencrypt/live/{domain}/fullchain.pem
  key_file: /etc/letsencrypt/live/{domain}/privkey.pem

logging:'''
updated, count = re.subn(r"turn:\n.*?\nlogging:", replacement, content, count=1, flags=re.DOTALL)
if count != 1:
    raise SystemExit("Could not find the LiveKit turn block")
required_rtc_lines = ("  tcp_port: 7881", "  udp_port: 7882", "  use_external_ip: true")
missing_rtc = [line.strip() for line in required_rtc_lines if line not in updated]
if missing_rtc:
    raise SystemExit("TURN update did not preserve production RTC settings: " + ", ".join(missing_rtc))
if "port_range_start" in updated or "port_range_end" in updated:
    raise SystemExit("TURN update must not restore an RTC port range")
path.write_text(updated, encoding="utf-8")
PY

chmod 600 "${CONFIG}"
"${PROJECT_DIR}/deploy/verify-production-config.sh"
"${PROJECT_DIR}/deploy/dc" restart livekit
"${PROJECT_DIR}/deploy/dc" ps livekit
echo "Embedded LiveKit TURN enabled for ${API_DOMAIN}:3478/udp and :5349/tcp."
