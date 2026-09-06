# TSMeet Architecture

## Runtime topology

TSMeet is a modular monolith with LiveKit as the media SFU and an optional recording worker:

1. Next.js serves the UI on port `3001` and proxies REST requests.
2. Express serves REST endpoints and Socket.IO signaling on port `3002`.
3. MySQL stores durable application and recording metadata.
4. Redis provides the Socket.IO adapter for cross-process event delivery.
5. Optional LiveKit Egress/recorder services create and store recordings without adding a peer to every browser.

Browsers connect directly to Socket.IO for signaling. Browser REST traffic uses the Next.js `/api` proxy routes.

## Meeting media

Production and Docker deployments use the self-hosted LiveKit SFU. Each browser publishes its tracks once and subscribes only to the tracks it needs. The legacy mesh provider is limited to controlled rollback rooms and `MAX_MESH_PARTICIPANTS` (8 by default); normal rooms use `MAX_PARTICIPANTS` (50 by default).

## State and scaling

The Redis adapter distributes Socket.IO packets between API processes. Room authority, waiting-room membership, host assignment, and co-host state currently remain in `RoomManager` memory. Run one backend replica until this state is moved to a shared presence store. Redis does not by itself make the in-memory room manager horizontally scalable.

Recording-session metadata is persisted in MySQL and hydrated during backend startup. Development can store recorder artifacts under `server/storage/recordings`; the production profile stores them in the private MinIO bucket.

## Persistence and concurrency

Database initialization is tracked in `schema_migrations`. Booking availability checks and inserts are serialized with a MySQL advisory lock scoped to each calendar, preventing concurrent overbooking across API processes.

## Security

- HttpOnly `tsmeet_session` cookies protect browser REST requests; the Next.js `/api` proxy forwards them to Express. JWTs remain server-side for integrations.
- bcrypt hashes account and room passwords.
- Helmet adds security headers; auth and public APIs are rate limited.
- CORS is restricted through `FRONTEND_URL`.
- Recorder requests require a separate service token.
- WebRTC encrypts media in transit with DTLS-SRTP.

## Deployment and validation

`docker-compose.yml` defines frontend, backend, recorder, MySQL, and Redis services. Production deployments must provide `JWT_SECRET` and `RECORDER_SERVICE_TOKEN`.

Run `pnpm check` before deployment.
