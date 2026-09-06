# TSMeet

Self-hosted video meetings, scheduling, API access, and server-managed recording.

TSMeet is a Zoom/Google Meet-style web application that you can run on your own
VPS or local machine. Meeting media uses a self-hosted LiveKit SFU; application
presence, moderation, waiting-room, and chat events use Socket.IO.

## Key features

### Meeting experience

- Camera and microphone preview before joining
- Gallery, active-speaker, pinned participant, and hide-your-tile views
- Screen sharing for a browser tab, window, or entire screen
- Optional tab/system audio while sharing
- Adaptive video quality and low-data mode
- Device selection for microphones, cameras, and speakers
- In-meeting chat, hand raising, participant status, and responsive controls

### Host and participant controls

- Waiting room with admit, deny, and request-again flow
- Mute all, stop video, remove participants, and lock meeting
- Co-host assignment, host transfer, and end meeting for everyone
- Searchable participant panel with host/mute/hand-raised indicators
- Recording consent prompt and start/pause/resume/stop controls

### Scheduling and accounts

- Registration, sign-in/sign-out, and protected dashboard
- Create rooms with titles and optional passwords
- Calendar availability, holidays, public booking pages, confirmations, and cancellations
- Guest access through a shareable room link without requiring an account
- Meeting history and private recording archive with download/deletion controls

## Architecture at a glance

```text
Browser
  |-- HTTPS / same-origin /api proxy --> Next.js frontend :3001
  |-- Socket.IO application events ----> Express backend :3002
  `-- WebRTC media (WSS + ICE) --------> LiveKit SFU

Express <--> MySQL (durable data)
Express/Socket.IO/LiveKit/Egress <--> Redis (coordination)
LiveKit Egress --> private MinIO bucket (optional recording)
```

Each browser publishes its tracks once to LiveKit and subscribes only to the
tracks/layers needed by the current layout and network. The server does not
merge every camera into one stream. Production VPS media uses LiveKit UDP mux
on `7882/udp` with TCP fallback on `7881/tcp`, avoiding a large UDP range and
thousands of Docker NAT rules.

## Quick start with Docker

Prerequisite: Docker Desktop or Docker Engine with the Compose plugin.

```bash
git clone https://github.com/tanvirahmmed8/tsmeet.git
cd tsmeet
cp .env.example .env                 # PowerShell: Copy-Item .env.example .env
# Replace every change-me value in .env.
docker compose up -d --build
docker compose ps
```

Open `http://localhost:3001`.

| Service | Purpose | Local endpoint |
|---|---|---|
| frontend | Next.js UI and same-origin API proxy | `http://localhost:3001` |
| backend | Express REST API and Socket.IO | `http://localhost:3002` |
| mysql | Application database | `127.0.0.1:13306` |
| redis | Socket.IO/LiveKit coordination | internal Compose network |
| livekit | SFU/local media | `ws://localhost:7880` |

The default stack keeps recording and observability disabled. Enable those
profiles only on a larger server; see
[docs/OPTIONAL_DOCKER_PROFILES.md](./docs/OPTIONAL_DOCKER_PROFILES.md).

## Local development without Docker for the app

Run MySQL, Redis, and LiveKit with Docker or local services, then run the two
application processes:

```bash
pnpm install
pnpm dev                               # frontend on 3001

cd server
pnpm install
pnpm run dev                           # backend on 3002
```

The backend initializes the database schema at startup. See
[SETUP_GUIDE.md](./SETUP_GUIDE.md) for environment variables and smoke tests.

## Authentication and security

- Browser login uses an HttpOnly `tsmeet_session` cookie.
- Authenticated browser REST requests use same-origin Next.js `/api` proxy routes.
- JWT and LiveKit API secrets remain server-side; JWTs are not stored in localStorage.
- Media is encrypted in transit with WebRTC DTLS-SRTP.
- Passwords are hashed with bcrypt and database queries are parameterized.
- Production cookies are Secure, scoped to `/`, and use an explicit SameSite policy.

## Deployment

For a two-domain VPS deployment, follow
[VPS_DEPLOYMENT_GUIDE.md](./VPS_DEPLOYMENT_GUIDE.md). The production layout is:

```text
meet.example.com  -> Nginx -> frontend:3001
api.example.com   -> Nginx -> backend:3002 and LiveKit WebSocket
public VPS UDP 7882 -> LiveKit UDP mux
public VPS TCP 7881 -> LiveKit ICE/TCP fallback
```

After changing hooks or `NEXT_PUBLIC_*` values, rebuild the frontend. After
changing LiveKit YAML or published ports, recreate LiveKit. Never use `down -v`
or delete database volumes during a routine deployment.

## Limits and operating cost

- `MAX_PARTICIPANTS=50` is the application room limit by default.
- `MAX_MESH_PARTICIPANTS=8` applies only to the legacy mesh rollback provider.
- `MEDIA_PROVIDER=livekit` is the scalable default.
- The software and media stack are self-hosted and do not require LiveKit Cloud,
  Twilio, Agora, Daily, or another managed communications API.
- You still pay for the VPS, bandwidth, domains, TLS, and storage you choose.

## Developer commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Documentation

- [SETUP_GUIDE.md](./SETUP_GUIDE.md) - local and Docker setup
- [VPS_DEPLOYMENT_GUIDE.md](./VPS_DEPLOYMENT_GUIDE.md) - production VPS, TLS, DNS, firewall, and updates
- [ARCHITECTURE.md](./ARCHITECTURE.md) - components, state, media, and security model
- [API.md](./API.md) - REST, same-origin proxy, and realtime contracts
- [FEATURES.md](./FEATURES.md) - application feature inventory
- [docs/PRODUCTION_NETWORKING.md](./docs/PRODUCTION_NETWORKING.md) - LiveKit ports and TURN networking
- [docs/OPTIONAL_DOCKER_PROFILES.md](./docs/OPTIONAL_DOCKER_PROFILES.md) - recording and observability profiles
- [docs/OPERATIONS_HANDBOOK.md](./docs/OPERATIONS_HANDBOOK.md) - operations, rollback, and shutdown
- [docs/STORAGE_BACKUP_AND_RESTORE.md](./docs/STORAGE_BACKUP_AND_RESTORE.md) - recording backup and restore drills
- [docs/CAPACITY_AND_SCALING.md](./docs/CAPACITY_AND_SCALING.md) - capacity testing and scaling guidance

## Contributing

Pull requests are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the
development setup, testing checklist, review expectations, and security rules.

## License

TSMeet is released under the [MIT License](./LICENSE.md).
