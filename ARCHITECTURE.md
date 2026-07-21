# TSMeet Architecture

## Runtime topology

TSMeet is a modular monolith with a separate recording worker:

1. Next.js serves the UI on port `3001` and proxies REST requests.
2. Express serves REST endpoints and Socket.IO signaling on port `3002`.
3. MySQL stores durable application and recording metadata.
4. Redis provides the Socket.IO adapter for cross-process event delivery.
5. A headless-Chromium worker joins meetings as a hidden recorder and uploads WebM artifacts.

Browsers connect directly to Socket.IO for signaling. Browser REST traffic uses the Next.js `/api` proxy routes.

## Meeting media

Media uses peer-to-peer WebRTC mesh connections. `MAX_MESH_PARTICIPANTS` defaults to `8`. Raising this increases every participant's upload bandwidth and CPU usage. Larger meetings require an SFU such as LiveKit, mediasoup, Janus, or Jitsi.

## State and scaling

The Redis adapter distributes Socket.IO packets between API processes. Room authority, waiting-room membership, host assignment, and co-host state currently remain in `RoomManager` memory. Run one backend replica until this state is moved to a shared presence store. Redis does not by itself make the in-memory room manager horizontally scalable.

Recording-session metadata is persisted in MySQL and hydrated during backend startup. Recorder artifacts are stored under `server/storage/recordings` unless external object storage is introduced.

## Persistence and concurrency

Database initialization is tracked in `schema_migrations`. Booking availability checks and inserts are serialized with a MySQL advisory lock scoped to each calendar, preventing concurrent overbooking across API processes.

## Security

- JWT protects private REST endpoints and authenticated host connections.
- bcrypt hashes account and room passwords.
- Helmet adds security headers; auth and public APIs are rate limited.
- CORS is restricted through `FRONTEND_URL`.
- Recorder requests require a separate service token.
- WebRTC encrypts media in transit with DTLS-SRTP.

## Deployment and validation

`docker-compose.yml` defines frontend, backend, recorder, MySQL, and Redis services. Production deployments must provide `JWT_SECRET` and `RECORDER_SERVICE_TOKEN`.

Run `pnpm check` before deployment.
