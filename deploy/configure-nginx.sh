#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${PROJECT_DIR:-/opt/tsmeet}"
FRONTEND_DOMAIN="${FRONTEND_DOMAIN:?Set FRONTEND_DOMAIN, for example meet.example.com}"
API_DOMAIN="${API_DOMAIN:?Set API_DOMAIN, for example api.example.com}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:?Set CERTBOT_EMAIL}"
TEMPLATE="${PROJECT_DIR}/deploy/nginx/tsmeet.conf.template"
OUTPUT="/etc/nginx/sites-available/tsmeet"

[[ "${EUID}" -eq 0 ]] || { echo "Run this script as root."; exit 1; }
[[ -f "${TEMPLATE}" ]] || { echo "Missing Nginx template: ${TEMPLATE}"; exit 1; }

PUBLIC_IP="$(curl -4fsS https://api.ipify.org || true)"
FRONTEND_IP="$(getent ahostsv4 "${FRONTEND_DOMAIN}" | awk 'NR==1 {print $1}')"
API_IP="$(getent ahostsv4 "${API_DOMAIN}" | awk 'NR==1 {print $1}')"
echo "VPS IP: ${PUBLIC_IP:-unknown}"
echo "${FRONTEND_DOMAIN}: ${FRONTEND_IP:-not resolved}"
echo "${API_DOMAIN}: ${API_IP:-not resolved}"

[[ -n "${FRONTEND_IP}" && -n "${API_IP}" ]] || { echo "Both domains must resolve before requesting certificates."; exit 1; }
if [[ -n "${PUBLIC_IP}" && ( "${FRONTEND_IP}" != "${PUBLIC_IP}" || "${API_IP}" != "${PUBLIC_IP}" ) ]]; then
  echo "Both domains must resolve directly to this VPS (${PUBLIC_IP})."
  exit 1
fi

python3 - "${TEMPLATE}" "${OUTPUT}" "${FRONTEND_DOMAIN}" "${API_DOMAIN}" <<'PY'
import pathlib
import sys

content = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
content = content.replace("__FRONTEND_DOMAIN__", sys.argv[3]).replace("__API_DOMAIN__", sys.argv[4])
pathlib.Path(sys.argv[2]).write_text(content, encoding="utf-8")
PY

ln -sfn "${OUTPUT}" /etc/nginx/sites-enabled/tsmeet
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

certbot --nginx --non-interactive --agree-tos --redirect --email "${CERTBOT_EMAIL}" -d "${FRONTEND_DOMAIN}"
certbot --nginx --non-interactive --agree-tos --redirect --email "${CERTBOT_EMAIL}" -d "${API_DOMAIN}"

cat >>"${OUTPUT}" <<EOF

server {
    listen 9443 ssl;
    listen [::]:9443 ssl;
    server_name ${API_DOMAIN};
    ssl_certificate /etc/letsencrypt/live/${API_DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${API_DOMAIN}/privkey.pem;
    client_max_body_size 0;
    proxy_buffering off;
    proxy_request_buffering off;
    location / {
        proxy_pass http://127.0.0.1:9100;
        proxy_http_version 1.1;
        proxy_set_header Host \$http_host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
EOF

nginx -t
systemctl reload nginx
echo "Nginx, HTTPS certificates, and the private MinIO recording proxy are configured."
echo "Next: API_DOMAIN=${API_DOMAIN} ${PROJECT_DIR}/deploy/enable-livekit-turn.sh"
