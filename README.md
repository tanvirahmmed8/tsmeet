# TSMeet

Self-hosted video meetings with a Zoom/Google Meet-style interface, waiting-room admission, LiveKit SFU media, scheduling, chat, moderation, and optional server-side recording.

TSMeet runs under your control: you provide the VPS, domains, TLS certificates, and optional infrastructure.

## Features

- Next.js frontend (`3001`) and Express/Socket.IO backend (`3002`)
- LiveKit SFU audio, video, screen sharing, simulcast, and adaptive subscriptions
- MySQL users, rooms, roles, waiting rooms, calendars, and bookings
- Redis coordination for Socket.IO and LiveKit/Egress
- Host moderation: admit/deny, mute, stop video, remove, co-host, lock, transfer host, and end meeting
- Hand raise, chat, device selection, low-data mode, and network-aware video quality
- Room-scoped guest sessions using short-lived HttpOnly cookies
- Optional LiveKit Egress + private MinIO recording
- Optional Prometheus/Grafana/Loki observability profiles

## Architecture

LiveKit is the default media provider. Browsers publish tracks to the LiveKit SFU and subscribe only to tracks/layers needed by the layout and network conditions. Socket.IO carries application signaling and moderation events; it is not the video transport.

Production browser REST requests use same-origin Next.js proxy routes so the `tsmeet_session` cookie reaches the backend. Production VPS media uses LiveKit UDP mux on `7882/udp` with TCP fallback on `7881`, avoiding a large WebRTC UDP range and thousands of Docker NAT rules.

See [ARCHITECTURE.md](./ARCHITECTURE.md), [docs/adr/0001-self-hosted-livekit-sfu.md](./docs/adr/0001-self-hosted-livekit-sfu.md), and [docs/PRODUCTION_NETWORKING.md](./docs/PRODUCTION_NETWORKING.md).

## Quick start with Docker

Prerequisite: Docker Desktop or Docker Engine with the Compose plugin.

```bash
git clone https://github.com/tanvirahmmed8/tsmeet.git
cd tsmeet
copy .env.example .env        # PowerShell; use cp on Linux/macOS
# Edit .env and replace every change-me value.
docker compose up -d --build
```

Open <http://localhost:3001>.

| Service | Purpose | Endpoint |
|---|---|---|
| frontend | Next.js application | `http://localhost:3001` |
| backend | REST API and Socket.IO | `http://localhost:3002` |
| mysql | Application database | `127.0.0.1:13306` by default |
| redis | Coordination/cache | internal by default |
| livekit | SFU/local media | `ws://localhost:7880` |

```bash
docker compose ps
docker compose logs -f frontend backend livekit
```

## Local development without Docker

Run MySQL, Redis, and LiveKit with Docker, then run the two application processes separately:

```bash
pnpm install
pnpm dev                         # frontend: http://localhost:3001

cd server
pnpm install
npm run dev                      # backend: http://localhost:3002
```

The backend initializes the MySQL schema on startup.

## Production deployment

Follow [VPS_DEPLOYMENT_GUIDE.md](./VPS_DEPLOYMENT_GUIDE.md) for the two-domain VPS setup:

```text
meet.example.com      -> Nginx -> frontend:3001
api.example.com       -> Nginx -> backend:3002 and LiveKit:7880
public VPS UDP 7882   -> LiveKit UDP mux
public VPS TCP 7881   -> LiveKit ICE/TCP fallback
api.example.com:3478 -> embedded TURN/UDP (optional)
api.example.com:5349 -> embedded TURN/TLS (optional)
```

```env
FRONTEND_URL=https://meet.example.com
MEETING_BASE_URL=https://meet.example.com
BACKEND_URL=http://backend:3002
NEXT_PUBLIC_SIGNALING_SERVER=https://meet.example.com
NEXT_PUBLIC_LIVEKIT_URL=wss://api.example.com/livekit
LIVEKIT_PUBLIC_URL=wss://api.example.com/livekit
```

`NEXT_PUBLIC_SIGNALING_SERVER` must be the frontend origin so the host-scoped cookie authenticates Socket.IO through Nginx. Never expose `JWT_SECRET` to the browser or store JWTs in localStorage.

After frontend code or `NEXT_PUBLIC_*` changes, rebuild `frontend`. After LiveKit YAML or port changes, recreate `livekit`. Never use `down -v` or delete database volumes.

```bash
./deploy/configure-app.sh
./deploy/verify-production-config.sh
./deploy/dc up -d --build frontend
./deploy/dc up -d --force-recreate livekit
```

Recording and observability are optional profiles; see [docs/OPTIONAL_DOCKER_PROFILES.md](./docs/OPTIONAL_DOCKER_PROFILES.md).

## Environment and limits

Copy [.env.example](./.env.example) to `.env`. Never commit `.env`, production LiveKit YAML, credentials, or TLS private keys.

- `MAX_PARTICIPANTS=50` — application and LiveKit room limit
- `MAX_MESH_PARTICIPANTS=8` — legacy mesh fallback only
- `MEDIA_PROVIDER=livekit` — scalable default
- `REDIS_PASSWORD` — required and non-empty in production
- `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, and matching `LIVEKIT_KEYS`

## Developer commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
docker compose down                 # preserves named volumes
```

## Documentation

- [SETUP_GUIDE.md](./SETUP_GUIDE.md) — setup and operations
- [VPS_DEPLOYMENT_GUIDE.md](./VPS_DEPLOYMENT_GUIDE.md) — production VPS, Nginx, TLS, firewall, and deployment
- [ARCHITECTURE.md](./ARCHITECTURE.md) — components and data flow
- [API.md](./API.md) — REST and realtime API contracts
- [FEATURES.md](./FEATURES.md) — implemented feature inventory
- [docs/PRODUCTION_NETWORKING.md](./docs/PRODUCTION_NETWORKING.md) — public/private ports
- [docs/OPTIONAL_DOCKER_PROFILES.md](./docs/OPTIONAL_DOCKER_PROFILES.md) — recording and observability
- [docs/OPERATIONS_HANDBOOK.md](./docs/OPERATIONS_HANDBOOK.md) — operations and backups
- [docs/CAPACITY_AND_SCALING.md](./docs/CAPACITY_AND_SCALING.md) — capacity guidance

Additional references:

- [docs/STORAGE_BACKUP_AND_RESTORE.md](./docs/STORAGE_BACKUP_AND_RESTORE.md) - recording backup and restore drills
- [post as project details for my portfolio website.md](./post%20as%20project%20details%20for%20my%20portfolio%20website.md) - portfolio-ready project summary

## License

See [LICENSE.md](./LICENSE.md).
