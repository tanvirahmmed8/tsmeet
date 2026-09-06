# TSMeet setup guide

This is the canonical setup guide for local development and the lightweight
Docker stack. Use [VPS_DEPLOYMENT_GUIDE.md](./VPS_DEPLOYMENT_GUIDE.md) for a
public production deployment; do not duplicate its TLS, DNS, or firewall steps
here.

## Prerequisites

- Node.js 20 or newer
- pnpm 9 or newer
- Docker Desktop/Engine with the Compose plugin (recommended for MySQL, Redis,
  and LiveKit)
- A browser with camera/microphone permissions

## Fastest local run (Docker)

From the repository root:

```bash
cp .env.example .env                 # PowerShell: Copy-Item .env.example .env
# Set local secrets in .env; never commit this file.
docker compose up -d --build
docker compose ps
```

Open `http://localhost:3001`. The default services are:

| Service | Purpose | Local endpoint |
|---|---|---|
| frontend | Next.js UI and same-origin API proxy | `http://localhost:3001` |
| backend | Express REST API and Socket.IO | `http://localhost:3002` |
| mysql | Application database | `127.0.0.1:13306` |
| redis | Socket.IO/LiveKit coordination | internal Compose network |
| livekit | SFU media server | `ws://localhost:7880` |

Recording (MinIO and Egress) and observability are disabled by default. Enable
them only on a larger machine with the profiles documented in
[docs/OPTIONAL_DOCKER_PROFILES.md](./docs/OPTIONAL_DOCKER_PROFILES.md).

Useful commands:

```bash
docker compose logs -f frontend backend livekit
docker compose restart backend
docker compose down                    # preserves named volumes
```

Never use `docker compose down -v` unless you intentionally want to delete the
database and other named volumes.

## Local development without Docker for the app

Run MySQL, Redis, and LiveKit with Docker (or local services), then run the
frontend and backend separately:

```bash
pnpm install
pnpm dev                               # frontend on 3001

cd server
pnpm install
pnpm run dev                           # backend on 3002
```

Copy `.env.example` to `.env` for Compose. For a manually started backend,
create `server/.env` with at least:

```env
NODE_ENV=development
PORT=3002
FRONTEND_URL=http://localhost:3001
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your-local-password
DB_NAME=videoconference
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
JWT_SECRET=replace-with-a-long-random-development-secret
MEDIA_PROVIDER=livekit
LIVEKIT_URL=ws://127.0.0.1:7880
LIVEKIT_API_KEY=replace-me
LIVEKIT_API_SECRET=replace-me
```

The backend creates/updates the schema on startup. The browser never needs
`JWT_SECRET`, `LIVEKIT_API_SECRET`, or any other server secret.

## Authentication and media flow

Login is performed through the same-origin Next.js routes. The browser receives
an HttpOnly `tsmeet_session` cookie; authenticated REST calls use `/api/*` proxy
routes so the cookie reaches Express. The media-token request is
`POST /api/media/token` and is not cached. LiveKit WebSocket/media connections
use the public LiveKit URL, while Socket.IO may use the configured signaling URL.

LiveKit is the default SFU: each browser publishes its camera, microphone, and
screen tracks once and subscribes to selected tracks/layers. The legacy mesh
provider is only for controlled small-room rollback tests and is limited by
`MAX_MESH_PARTICIPANTS` (8 by default). Normal rooms use `MAX_PARTICIPANTS`
(50 by default).

## Testing checklist

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Manual smoke test:

1. Register or sign in at `http://localhost:3001`.
2. Create a room and open the link in a second browser/profile.
3. Admit the guest from Participants, then test camera, microphone, screen
   share, chat, hand raise, pinning, and device selection.
4. End the meeting as host and verify every participant is redirected/blocked.
5. Inspect `docker compose logs backend livekit` if a participant cannot connect.

## Production hand-off

For a two-domain VPS deployment, follow the complete checklist in
[VPS_DEPLOYMENT_GUIDE.md](./VPS_DEPLOYMENT_GUIDE.md). Production uses:

- frontend domain -> Next.js on port 3001;
- API/LiveKit domain -> backend and LiveKit;
- LiveKit `7881/tcp` and single UDP mux `7882/udp`;
- embedded TURN on `3478/udp` and `5349/tcp` when enabled;
- same-origin frontend API proxy for the `tsmeet_session` cookie.

Rebuild the frontend after changing hooks or `NEXT_PUBLIC_*` values. Recreate
LiveKit after changing its YAML or published ports. Do not delete database
volumes during deployment.

## Related documentation

- [README.md](./README.md) — project overview and quick start
- [ARCHITECTURE.md](./ARCHITECTURE.md) — component and media architecture
- [API.md](./API.md) — REST, proxy, and realtime contracts
- [VPS_DEPLOYMENT_GUIDE.md](./VPS_DEPLOYMENT_GUIDE.md) — production deployment
- [docs/OPTIONAL_DOCKER_PROFILES.md](./docs/OPTIONAL_DOCKER_PROFILES.md) — recording/observability
- [docs/OPERATIONS_HANDBOOK.md](./docs/OPERATIONS_HANDBOOK.md) — operations and rollback
- [docs/STORAGE_BACKUP_AND_RESTORE.md](./docs/STORAGE_BACKUP_AND_RESTORE.md) — recording backups
- [docs/CAPACITY_AND_SCALING.md](./docs/CAPACITY_AND_SCALING.md) — capacity testing
