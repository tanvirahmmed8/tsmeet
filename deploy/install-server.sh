#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
chmod +x "${SCRIPT_DIR}"/*.sh "${SCRIPT_DIR}/dc"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root."
  exit 1
fi

if [[ ! -r /etc/os-release ]]; then
  echo "This installer requires Ubuntu with /etc/os-release."
  exit 1
fi

. /etc/os-release
if [[ "${ID:-}" != "ubuntu" ]]; then
  echo "This installer supports Ubuntu only. Found: ${ID:-unknown}"
  exit 1
fi

echo "Installing host packages..."
apt-get update
apt-get install -y ca-certificates curl git nginx certbot python3-certbot-nginx dnsutils ufw python3

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

cat >/etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${VERSION_CODENAME}
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker nginx

cat >/etc/sysctl.d/99-tsmeet.conf <<'EOF'
vm.overcommit_memory = 1
EOF
sysctl --system

ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 9443/tcp
ufw allow 7881/tcp
ufw allow 7882/udp
ufw allow 5349/tcp
ufw allow 3478/udp
ufw --force enable

echo "Server dependencies installed."
docker --version
docker compose version
nginx -v
