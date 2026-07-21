# TSMeet Production VPS Deployment Guide

This is the complete single-VPS production plan for TSMeet. It uses only two public DNS names:

- `meet.example.com` — Next.js frontend
- `api.example.com` — backend API, Socket.IO, LiveKit signaling, and recording downloads

Replace both example names and `VPS_PUBLIC_IP` everywhere before deployment. MySQL, Redis, MinIO, Egress, and monitoring remain private. LiveKit media and TURN use the VPS public IP and the backend domain because WebRTC traffic cannot be carried through a normal HTTP reverse proxy.

> This design is for one VPS. It is simple, fully self-hosted, and has no SaaS dependency. It is not high availability: if the VPS fails, the meeting service stops.

## Automated deployment path

The repository includes repeatable deployment scripts. On a fresh Ubuntu VPS, replace the example domains and repository URL, then run:

```bash
git clone YOUR_GIT_REPOSITORY_URL /opt/tsmeet
cd /opt/tsmeet
sudo bash deploy/install-server.sh
cp .env.example .env
nano .env
./deploy/configure-app.sh
./deploy/deploy-production.sh
sudo FRONTEND_DOMAIN=meet.example.com \
  API_DOMAIN=api.example.com \
  CERTBOT_EMAIL=admin@example.com \
  PROJECT_DIR=/opt/tsmeet \
  ./deploy/configure-nginx.sh
sudo API_DOMAIN=api.example.com PROJECT_DIR=/opt/tsmeet ./deploy/enable-livekit-turn.sh
```

After installation, use `./deploy/dc` for every Compose operation, for example `./deploy/dc ps` and `./deploy/dc logs --tail=100 livekit`. The remaining sections explain and verify every automated step.

## 1. Production architecture

```text
Internet
  |
  +-- https://meet.example.com:443
  |      Nginx -> 127.0.0.1:3001 -> frontend container (Next.js)
  |
  +-- https://api.example.com:443
  |      Nginx /          -> 127.0.0.1:3002 -> backend container
  |      Nginx /livekit/  -> 127.0.0.1:7880 -> LiveKit WebSocket/API
  |
  +-- https://api.example.com:9443
  |      Nginx -> 127.0.0.1:9100 -> MinIO recording downloads
  |
  +-- VPS_PUBLIC_IP:7881/tcp             LiveKit WebRTC/TCP fallback
  +-- VPS_PUBLIC_IP:50000-60000/udp      LiveKit WebRTC media
  +-- api.example.com:3478/udp           embedded TURN/UDP
  +-- api.example.com:5349/tcp           embedded TURN/TLS

Docker private networks
  edge: frontend, backend, livekit
  data: backend, mysql, redis, minio, livekit, egress

Private containers
  mysql               application database
  redis               room state, LiveKit, and Egress coordination
  minio + minio-init  recording object storage and bucket initialization
  egress              LiveKit recording worker
  prometheus          metrics collection
  grafana             dashboards
  loki + promtail     logs
  exporters           host, container, MySQL, and Redis metrics
```

LiveKit is an SFU. Each participant normally uploads one simulcast publication to LiveKit; the SFU forwards suitable layers to receivers. Upload does not grow once per new participant, while download still depends on how many remote videos/layers the participant receives. Adaptive stream, simulcast, dynacast, and the application's network adaptation reduce unnecessary bandwidth; they cannot make multi-person download remain permanently fixed.

## 2. Server and DNS requirements

Recommended starting point for light production use and one concurrent recording:

- Ubuntu 22.04 or 24.04 LTS
- 8 vCPU, 16 GB RAM, and at least 200 GB SSD
- a dedicated public IPv4 address
- high and unmetered/adequate network transfer
- root or sudo access

Recording is CPU-intensive. Measure real rooms and increase CPU/RAM before increasing concurrent Egress jobs.

Create these DNS `A` records:

| Name | Value |
|---|---|
| `meet.example.com` | `VPS_PUBLIC_IP` |
| `api.example.com` | `VPS_PUBLIC_IP` |

If using Cloudflare, set both records to **DNS only** while validating LiveKit. A normal CDN proxy does not proxy LiveKit's UDP media range.

Confirm DNS before continuing:

```bash
dig +short meet.example.com
dig +short api.example.com
```

Both commands must return the VPS public IP.

## 3. Install the host software

Connect to the VPS and install Git, Nginx, Certbot, and Docker Engine with the Compose plugin:

```bash
sudo apt update
sudo apt install -y ca-certificates curl git nginx certbot python3-certbot-nginx
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker nginx
```

Verify versions:

```bash
docker --version
docker compose version
nginx -v
```

The VPS override below uses Compose's `!override` tag. Use a current Docker Compose v2 release.

## 4. Clone the product

```bash
sudo mkdir -p /opt/tsmeet
sudo chown "$USER":"$USER" /opt/tsmeet
git clone YOUR_GIT_REPOSITORY_URL /opt/tsmeet
cd /opt/tsmeet
cp .env.example .env
```

Never commit `.env` or `infrastructure/livekit/livekit.production.yaml`.

## 5. Configure production environment

Generate independent secrets. Do not reuse one secret for multiple settings:

```bash
openssl rand -hex 32
openssl rand -hex 32
openssl rand -hex 32
openssl rand -hex 32
openssl rand -hex 32
openssl rand -hex 32
```

Edit `/opt/tsmeet/.env` and set every `change-me` value. These are the production URL values:

```dotenv
FRONTEND_URL=https://meet.example.com
MEETING_BASE_URL=https://meet.example.com
BACKEND_URL=http://backend:3002
NEXT_PUBLIC_SIGNALING_SERVER=https://api.example.com
NEXT_PUBLIC_LIVEKIT_URL=wss://api.example.com/livekit
LIVEKIT_PUBLIC_URL=wss://api.example.com/livekit
MINIO_PUBLIC_ENDPOINT=https://api.example.com:9443

DB_ROOT_PASSWORD=GENERATE_A_LONG_RANDOM_DATABASE_PASSWORD
DB_HOST_PORT=13306
DB_POOL_SIZE=20

JWT_SECRET=GENERATE_AT_LEAST_32_RANDOM_BYTES
MAX_PARTICIPANTS=50
MAX_MESH_PARTICIPANTS=8

REDIS_PASSWORD=GENERATE_A_LONG_RANDOM_REDIS_PASSWORD

MEDIA_PROVIDER=livekit
MEDIA_PROVIDER_LIVEKIT_ROOMS=
MEDIA_PROVIDER_MESH_ROOMS=

STUN_SERVER=stun:stun.l.google.com:19302
TURN_SERVER=
TURN_USERNAME=
TURN_PASSWORD=

LIVEKIT_API_KEY=GENERATE_A_RANDOM_LIVEKIT_API_KEY
LIVEKIT_API_SECRET=GENERATE_A_LONG_RANDOM_LIVEKIT_SECRET
LIVEKIT_KEYS=GENERATE_A_RANDOM_LIVEKIT_API_KEY: GENERATE_A_LONG_RANDOM_LIVEKIT_SECRET

MINIO_ROOT_USER=GENERATE_A_RANDOM_MINIO_ACCESS_KEY
MINIO_ROOT_PASSWORD=GENERATE_A_LONG_RANDOM_MINIO_SECRET
MINIO_BUCKET=tsmeet-recordings
MINIO_REGION=us-east-1
RECORDING_STORAGE_QUOTA_BYTES=107374182400
RECORDING_RETENTION_DAYS=30
RECORDER_SERVICE_TOKEN=GENERATE_A_LONG_RANDOM_RECORDER_TOKEN

GRAFANA_ADMIN_PASSWORD=GENERATE_A_LONG_RANDOM_GRAFANA_PASSWORD
```

Rules:

- `LIVEKIT_KEYS` must contain exactly the same key and secret as `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`.
- Keep `BACKEND_URL=http://backend:3002`; it is the server-side Docker address.
- Keep the mesh TURN variables empty unless deliberately rolling a room back to legacy mesh.
- `NEXT_PUBLIC_*` values are embedded during the frontend image build. After changing either value, run a frontend rebuild.
- Do not surround values with quotes unless the quotes are part of the intended value.

Protect the file:

```bash
chmod 600 /opt/tsmeet/.env
```

## 6. Obtain TLS certificates

Allow HTTP temporarily and request one certificate for each domain:

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo certbot certonly --nginx -d meet.example.com
sudo certbot certonly --nginx -d api.example.com
```

Confirm the files exist:

```bash
sudo test -f /etc/letsencrypt/live/meet.example.com/fullchain.pem
sudo test -f /etc/letsencrypt/live/api.example.com/fullchain.pem
```

LiveKit requires a certificate signed by a trusted CA; a self-signed certificate is not suitable for production clients.

## 7. Configure LiveKit and embedded TURN

Create the ignored production file from the repository template:

```bash
cd /opt/tsmeet
cp infrastructure/livekit/livekit.production.example.yaml infrastructure/livekit/livekit.production.yaml
chmod 600 infrastructure/livekit/livekit.production.yaml
```

Edit the new file. Replace only the Redis password and domain in this example; API keys come from `LIVEKIT_KEYS` in `.env`:

```yaml
port: 7880
bind_addresses:
  - "0.0.0.0"

rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: true
  congestion_control:
    enabled: true
    allow_pause: true

redis:
  address: redis:6379
  password: THE_EXACT_REDIS_PASSWORD_FROM_DOT_ENV

room:
  auto_create: false
  empty_timeout: 300
  departure_timeout: 30
  max_participants: 50

turn:
  enabled: true
  udp_port: 3478
  tls_port: 5349
  domain: api.example.com
  cert_file: /etc/letsencrypt/live/api.example.com/fullchain.pem
  key_file: /etc/letsencrypt/live/api.example.com/privkey.pem

logging:
  level: info
  json: true

prometheus_port: 6789
```

Why TURN/TLS uses `5349`, not `443`: Nginx already owns TCP `443` for the two HTTPS domains on this single IP. Port `5349` is the standard direct TURN/TLS port and uses the same `api.example.com` certificate. Some highly restrictive networks permit only TCP/TLS on port 443; supporting those networks requires a separate public IP, an L4 multiplexer/load balancer, or a third TURN endpoint. Do not map container `5349` to host `443` while Nginx is using it.

## 8. Verify the committed VPS-only Docker override

The repository base Compose file intentionally publishes development ports. Compose normally appends port mappings from layered files, so `ports: []` does not remove the base ports. The committed `/opt/tsmeet/docker-compose.vps.yml` must contain:

```yaml
services:
  frontend:
    ports: !override
      - "127.0.0.1:3001:3001"

  backend:
    ports: !override
      - "127.0.0.1:3002:3002"

  livekit:
    ports: !override
      - "127.0.0.1:7880:7880"
      - "127.0.0.1:6789:6789"
      - "7881:7881/tcp"
      - "3478:3478/udp"
      - "5349:5349/tcp"
      - "50000-60000:50000-60000/udp"

  minio:
    ports: !override
      - "127.0.0.1:9100:9000"

  mysql:
    ports: !override []

  redis:
    ports: !override []

  egress:
    ports: !override []

  prometheus:
    ports: !override
      - "127.0.0.1:9091:9090"

  grafana:
    ports: !override
      - "127.0.0.1:3003:3000"
```

Always use all three files, in this order, for VPS commands:

```bash
docker compose --env-file .env \
  -f docker-compose.yml \
  -f docker-compose.production.yml \
  -f docker-compose.vps.yml COMMAND
```

Do not run plain `docker compose up` on the VPS.

## 9. Configure Nginx for both domains

Create `/etc/nginx/sites-available/tsmeet`:

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80;
    listen [::]:80;
    server_name meet.example.com api.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name meet.example.com;

    ssl_certificate /etc/letsencrypt/live/meet.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/meet.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_read_timeout 3600s;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name api.example.com;

    ssl_certificate /etc/letsencrypt/live/api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;

    # Trailing slash strips /livekit before sending the request to LiveKit.
    location /livekit/ {
        proxy_pass http://127.0.0.1:7880/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
        proxy_buffering off;
    }

    # Express REST API and Socket.IO share this upstream.
    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_read_timeout 3600s;
        proxy_buffering off;
    }
}

# Same backend domain, separate HTTPS port, for presigned MinIO recording URLs.
server {
    listen 9443 ssl;
    listen [::]:9443 ssl;
    server_name api.example.com;

    ssl_certificate /etc/letsencrypt/live/api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;

    client_max_body_size 0;
    proxy_buffering off;
    proxy_request_buffering off;

    location / {
        proxy_pass http://127.0.0.1:9100;
        proxy_http_version 1.1;
        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

Enable and validate it:

```bash
sudo ln -sfn /etc/nginx/sites-available/tsmeet /etc/nginx/sites-enabled/tsmeet
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

## 10. Configure the firewall

Open only the required public ports:

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 9443/tcp
sudo ufw allow 7881/tcp
sudo ufw allow 5349/tcp
sudo ufw allow 3478/udp
sudo ufw allow 50000:60000/udp
sudo ufw --force enable
sudo ufw status numbered
```

Also configure the VPS provider's cloud firewall/security group with the same rules. Do not publicly open `3001`, `3002`, `3306`, `6379`, `6789`, `7880`, `9000`, `9001`, `9090`, or `3003`.

## 11. Validate and start all Docker services

Define a shell helper so commands are harder to mistype:

```bash
cd /opt/tsmeet
dc='docker compose --env-file .env -f docker-compose.yml -f docker-compose.production.yml -f docker-compose.vps.yml'
```

Validate the merged configuration before starting anything:

```bash
$dc config --quiet
$dc config > /tmp/tsmeet-resolved-compose.yml
grep -n "published:" /tmp/tsmeet-resolved-compose.yml
```

The resolved bindings must show `127.0.0.1` for frontend, backend, LiveKit `7880/6789`, MinIO, Prometheus, and Grafana. MySQL and Redis must have no published host ports.

Build and start the full product:

```bash
$dc pull
$dc up -d --build
$dc ps
```

Expected long-running services include frontend, backend, MySQL, Redis, LiveKit, MinIO, Egress, Prometheus, Grafana, Loki, Promtail, cAdvisor, and exporters. `minio-init` is a one-shot job and may show `Exited (0)` after creating the bucket; that is normal.

Check startup logs:

```bash
$dc logs --tail=100 backend frontend livekit egress mysql redis minio
```

## 12. Production verification

Run these from the VPS:

```bash
curl -fsS https://meet.example.com >/dev/null && echo "frontend OK"
curl -fsS https://api.example.com/api/health
curl -fsS http://127.0.0.1:7880 >/dev/null && echo "LiveKit HTTP reachable"
curl -kfsS https://api.example.com:9443/minio/health/live && echo "MinIO proxy OK"
$dc exec redis sh -c 'redis-cli -a "$REDIS_PASSWORD" ping'
$dc exec mysql mysqladmin ping -uroot -p"$MYSQL_ROOT_PASSWORD"
```

Then test the real media path:

1. Open `https://meet.example.com` in two different browsers or devices.
2. Join the same room with camera and microphone enabled.
3. Verify video, audio, mute, screen share, chat, hand raise, participant controls, host leave/end behavior, and reconnect.
4. Repeat with one device on mobile data so traffic is not entirely inside one LAN.
5. Start and stop a recording; verify it appears in MinIO and that its returned URL downloads through `https://api.example.com:9443`.
6. Inspect browser WebRTC internals and confirm the selected candidate is the VPS/LiveKit path, not peer-to-peer mesh.

Useful diagnostics:

```bash
$dc logs -f --tail=200 livekit backend egress
sudo ss -lntup
sudo nginx -t
curl -I https://meet.example.com
curl -I https://api.example.com/api/health
```

## 13. Private monitoring access

Grafana and Prometheus are deliberately bound to localhost. Access Grafana through an SSH tunnel from your workstation:

```bash
ssh -L 3003:127.0.0.1:3003 YOUR_USER@VPS_PUBLIC_IP
```

Then open `http://localhost:3003` locally and sign in with `admin` plus `GRAFANA_ADMIN_PASSWORD`. For Prometheus, tunnel `9091` similarly. Do not publish these dashboards directly without authentication and TLS.

## 14. Certificate renewal

Test Certbot renewal:

```bash
sudo certbot renew --dry-run
```

Create `/etc/letsencrypt/renewal-hooks/deploy/tsmeet-reload.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
systemctl reload nginx
cd /opt/tsmeet
docker compose --env-file .env \
  -f docker-compose.yml \
  -f docker-compose.production.yml \
  -f docker-compose.vps.yml restart livekit
```

Enable it:

```bash
sudo chmod 750 /etc/letsencrypt/renewal-hooks/deploy/tsmeet-reload.sh
```

Restarting LiveKit can interrupt active rooms. Schedule renewal during a low-traffic window, or later move TURN certificate termination to infrastructure that can reload without interrupting SFU sessions.

## 15. Backups

Back up at least:

- MySQL database
- MinIO recording volume
- `.env` in encrypted secret storage
- rendered LiveKit production config
- Nginx configuration
- Grafana data/dashboards if customized

Example MySQL backup:

```bash
cd /opt/tsmeet
mkdir -p backups
dc='docker compose --env-file .env -f docker-compose.yml -f docker-compose.production.yml -f docker-compose.vps.yml'
$dc exec -T mysql sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --events videoconference' | gzip > "backups/tsmeet-$(date +%F-%H%M).sql.gz"
```

Copy backups to another machine or object store. A backup stored only on the same VPS is not disaster recovery. Regularly test restoration on a separate environment.

## 16. Safe application updates

```bash
cd /opt/tsmeet
dc='docker compose --env-file .env -f docker-compose.yml -f docker-compose.production.yml -f docker-compose.vps.yml'
$dc ps
git status
git pull --ff-only
$dc config --quiet
$dc build --pull frontend backend
$dc up -d
$dc ps
$dc logs --tail=100 frontend backend livekit egress
```

Because `NEXT_PUBLIC_*` variables are build-time values, rebuilding the frontend is required after a public endpoint changes.

Never run `docker compose down -v` in production; `-v` deletes named data volumes. Keep the previous Git revision and image IDs until post-deployment checks pass so you can restore the previous code and recreate containers without deleting volumes.

## 17. Common failures

### Frontend opens but API or Socket.IO fails

- Confirm `NEXT_PUBLIC_SIGNALING_SERVER=https://api.example.com` was present during the frontend build.
- Check `curl https://api.example.com/api/health`.
- Check Nginx Upgrade/Connection headers and backend logs.
- Rebuild with `$dc up -d --build frontend` after changing a `NEXT_PUBLIC_*` variable.

### `requested room does not exist`

- Confirm the room was created through the backend before joining.
- Confirm the backend and LiveKit use the same API key/secret.
- Keep `room.auto_create: false`; this preserves application authorization and host rules.

### Signaling connects but video/audio does not

- Open UDP `50000-60000` and `3478`, plus TCP `7881` and `5349`, in both UFW and the provider firewall.
- Confirm `rtc.use_external_ip: true` and the VPS has a directly reachable public IP.
- Confirm `api.example.com` resolves directly to that IP.
- Inspect LiveKit logs and browser WebRTC internals.

### Recording fails

- Confirm Egress and LiveKit use the same Redis address/password.
- Check `$dc logs egress minio livekit backend`.
- Confirm the MinIO bucket exists and `MINIO_PUBLIC_ENDPOINT=https://api.example.com:9443`.
- Confirm TCP `9443` is open and Nginx preserves the original Host header.

### Redis authentication errors

The same `REDIS_PASSWORD` must be used by Redis, backend, LiveKit YAML, Egress, and the Redis exporter. Restart affected containers after correcting it.

### Docker reports port 443 is already allocated

An old production mapping is publishing LiveKit TURN as host `443:5349`. Ensure `docker-compose.vps.yml` is the last Compose file and contains `5349:5349/tcp` under `ports: !override`. Nginx must own host TCP 443.

## 18. Go-live checklist

- [ ] Both DNS records resolve to the VPS public IP.
- [ ] Trusted TLS certificates exist and renew successfully.
- [ ] Every `change-me` placeholder has been replaced.
- [ ] `.env` and LiveKit production YAML are mode `600` and not committed.
- [ ] LiveKit key/secret values match in all three environment variables.
- [ ] Redis password matches the rendered LiveKit YAML.
- [ ] Production Compose validates with the VPS override last.
- [ ] MySQL, Redis, MinIO, metrics, and admin dashboards are not publicly bound.
- [ ] UFW and provider firewall contain the WebRTC/TURN ports.
- [ ] Two-device and mobile-network media tests pass.
- [ ] Screen sharing and adaptive video quality pass.
- [ ] Host moderation, leave, and end-meeting behavior pass.
- [ ] Recording, download, retention, and quota behavior pass.
- [ ] Monitoring works through an SSH tunnel.
- [ ] Off-server backup and restore have been tested.

## 19. Authoritative references

- [LiveKit VM deployment](https://docs.livekit.io/transport/self-hosting/vm/)
- [LiveKit deployment and TLS/TURN guidance](https://docs.livekit.io/transport/self-hosting/deployment/)
- [LiveKit ports and firewall table](https://docs.livekit.io/transport/self-hosting/ports-firewall/)
- [LiveKit self-hosted Egress](https://docs.livekit.io/transport/self-hosting/egress/)
- [Docker Engine installation on Ubuntu](https://docs.docker.com/engine/install/ubuntu/)
- [Docker Compose merge and `!override`](https://docs.docker.com/reference/compose-file/merge/)
