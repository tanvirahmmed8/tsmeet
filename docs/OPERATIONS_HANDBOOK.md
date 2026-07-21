# TSMeet operations handbook

## Production topology

Browsers obtain a five-minute participant token from Express and publish camera,
microphone, and screen tracks once to the self-hosted LiveKit SFU. Socket.IO carries
waiting-room, chat, and moderation events only. LiveKit Egress records composite
rooms into a private MinIO bucket. MySQL stores durable application metadata and
Redis coordinates Socket.IO, LiveKit, and Egress.

No meeting media or recording is sent to a managed communications service.

## Start and verify

1. Populate ignored `.env` values with unique JWT, LiveKit, Redis, MinIO, Grafana,
   and recorder-transition secrets.
2. Render `infrastructure/livekit/livekit.production.yaml` from the example and
   deployment secret store.
3. Run `docker compose -f docker-compose.yml -f docker-compose.production.yml up -d`.
4. Check `docker compose ps`, `GET /api/health`, LiveKit metrics on 6789, Egress
   metrics on 9090, Prometheus targets, and the TSMeet Grafana dashboard.
5. Join a private test room from two external networks before opening traffic.

## Routine checks

- Review room/participant counts, SFU traffic, host CPU/memory/disk, network quality,
  recording failures, Redis, MySQL, MinIO, and certificate expiry daily.
- Confirm the MinIO bucket remains private and retention rules remain enabled.
- Review `security_audit_logs` for moderation and recording actions.
- Run encrypted MySQL/MinIO backups and a quarterly isolated restore drill.

## Incident response

- **LiveKit unavailable:** preserve MySQL/MinIO, inspect Redis and LiveKit logs,
  restart LiveKit, then run a new test room. Existing participants reconnect through
  the client SDK. If the outage is prolonged, the incident commander may assign
  selected small rooms to the temporary mesh provider using the controlled rollback
  procedure below; do not switch all production rooms implicitly.
- **Redis unavailable:** restore Redis first because Socket.IO coordination, LiveKit,
  and Egress discovery depend on it. Verify room roles against MySQL after recovery.
- **Recording failure:** inspect Egress metrics/logs and `recording_segments`; failed
  jobs are retained in MySQL. Resolve storage/CPU issues and start a new segment.
- **MinIO full/unavailable:** stop new recordings, add capacity or restore service,
  then verify object checksums and signed downloads.
- **Compromised secret:** use the rotation sequence in `PRODUCTION_NETWORKING.md`,
  revoke sessions, and inspect audit logs.

## Upgrades

Back up first, pin new container versions, validate Compose, deploy to staging, run
the Milestone 12 test matrix, and only then update production one service at a time.
Never upgrade LiveKit and Egress without checking their version compatibility.

## Rollback

Keep `MEDIA_PROVIDER=livekit` as the default. For a controlled small-room rollback,
set `MEDIA_PROVIDER_MESH_ROOMS` to a comma-separated room ID allowlist and restart
only the backend. The authenticated room endpoint supplies the configured STUN/TURN
servers, and the page selects the mesh hook without opening a LiveKit connection.
Mesh is limited to small emergency rooms: browser upload grows with every peer and
LiveKit Egress recording is unavailable for those rooms.

Before enabling an allowlisted room, run the three-browser acceptance test and
verify two peer connections per browser, non-zero audio/video RTP bytes, waiting
room approval, moderation, and camera/microphone toggles. Remove the room ID and
restart the backend to return it to LiveKit; verify one SFU peer connection per
browser and non-zero media again. Never use `MEDIA_PROVIDER=mesh` globally outside
a controlled drill or incident.

## Shutdown

Stop new rooms and recordings, wait for active Egress jobs, take a final backup,
then run `docker compose down` without `--volumes`. Never delete named volumes during
a routine deploy or restart.
