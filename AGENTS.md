# AGENTS.md

Orientation for AI coding agents working in this repository. Humans should start
at [README.md](README.md) and [docs/README.md](docs/README.md) instead.

## Run it

```bash
pnpm install && pnpm dev          # frontend, port 3001
cd server && pnpm install && pnpm run dev   # backend, port 3002
docker compose up -d mysql redis livekit    # infrastructure
```

The backend creates and migrates the schema at startup. Restart the backend
after changing Socket.IO handlers — they are registered at connection setup.

## Checks before you claim you are done

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
# or all four in order:
pnpm check
```

## Entry points

| Concern | File |
|---|---|
| Route mounting and every Socket.IO handler | [server/index.ts](server/index.ts) |
| REST handlers | [server/routes/](server/routes/) |
| LiveKit tokens, grants, room admin | [server/services/livekit.ts](server/services/livekit.ts) |
| Egress recording | [server/services/egress.ts](server/services/egress.ts) |
| Live room, host, and co-host state | [server/services/roomManager.ts](server/services/roomManager.ts) |
| Schema and the Postgres-to-MySQL query shim | [server/db.ts](server/db.ts) |
| Meeting UI | [app/room/\[roomId\]/page.tsx](app/room/[roomId]/page.tsx) |
| Primary media hook | [hooks/useLiveKitRoom.ts](hooks/useLiveKitRoom.ts) |
| Mesh rollback hook | [hooks/useWebRTC.ts](hooks/useWebRTC.ts) |
| Browser-to-backend proxy | [app/api/\_proxy.ts](app/api/_proxy.ts) |

## Rules that reviews enforce

- **Media goes over LiveKit. Application events go over Socket.IO.** Do not add
  browser-to-browser mesh connections to normal rooms.
- **Never trust the client for privileges.** Roles come from `rooms.creator_id`
  and `meeting_roles`. `POST /api/media/token` re-checks waiting-room approval.
- **Browser auth is the HttpOnly `tsmeet_session` cookie** through the
  same-origin `/api` proxy. Do not put JWTs in `localStorage` on the LiveKit path.
- **Never expose** `JWT_SECRET`, `LIVEKIT_API_SECRET`, Redis passwords, recorder
  tokens, or MinIO credentials to browser code or logs. Never commit `.env`.
- **Recording changes must preserve** consent enforcement, ownership checks,
  retention, and private storage.
- **LiveKit networking uses `7881/tcp` and `7882/udp` mux.** Do not reintroduce
  the `50000-60000` range.
- **Run one backend replica.** `RoomManager` holds live room authority in
  process memory; the Redis adapter distributes packets, not that state.

## Documentation duties

`API.md` is a contract derived from the code. **If you add, remove, or change a
REST route or a socket event, update [API.md](API.md) in the same change.** The
same applies to `.env.example` when configuration changes, and to
[FEATURES.md](FEATURES.md) when user-visible behaviour changes.

Writing conventions — including the rule to document what the code does rather
than what it should do — are in
[docs/README.md](docs/README.md#documentation-conventions).

## Gotchas

- Queries in `server/routes/` use Postgres syntax (`$1`, `INSERT ... RETURNING`).
  [server/db.ts](server/db.ts) translates them to MySQL at runtime. Match the
  surrounding style; do not mix `?` placeholders into the same file.
- The backend dev server runs `ts-node --transpile-only`, so type errors do not
  block it. Run `pnpm typecheck` explicitly.
- Two lockfiles exist (`package-lock.json` and `pnpm-lock.yaml`). Ask before
  regenerating either.
- `MAX_PARTICIPANTS=50` is a configured ceiling. The tested figure is 20 — see
  [docs/CAPACITY_AND_SCALING.md](docs/CAPACITY_AND_SCALING.md).
- `@mediapipe/selfie_segmentation` is in `package.json` but no code imports it.
  Virtual backgrounds are **not** implemented.

## Behaviour

- Link to existing docs rather than copying sections into new files.
- State the command before running it; do not start servers unnecessarily.
- Report honestly what you ran and what failed.
