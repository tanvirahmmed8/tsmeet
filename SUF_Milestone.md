Yes. We can build TSMeet so the complete platform remains under your control, with no paid communication API. You only pay for servers, domains, storage, and bandwidth.

## Target self-hosted architecture

```text
                    ┌─────────────────────┐
                    │   Nginx / Caddy     │
                    │ TLS + Load Balancer │
                    └──────────┬──────────┘
                               │
              ┌────────────────┴────────────────┐
              ▼                                 ▼
       Next.js frontend                  Express backend
                                               │
                            ┌──────────────────┼─────────────────┐
                            ▼                  ▼                 ▼
                          MySQL              Redis          LiveKit API
                                                                  │
                                              ┌───────────────────┼──────────────┐
                                              ▼                   ▼              ▼
                                         LiveKit SFU       Embedded TURN    Egress workers
                                                                                   │
                                                                                   ▼
                                                                           MinIO storage
```

Open-source components:

| Requirement | Component |
|---|---|
| Web application | Next.js |
| Business API | Express/Node.js |
| Database | MySQL |
| Shared state | Redis |
| Media server/SFU | LiveKit Server |
| NAT traversal | LiveKit embedded TURN or Coturn |
| Recording | LiveKit Egress |
| Object storage | MinIO |
| Reverse proxy/TLS | Caddy or Nginx |
| Metrics | Prometheus |
| Dashboards | Grafana |
| Logs | Loki |
| Error monitoring | GlitchTip, optional |
| Container deployment | Docker Compose initially |
| Large-scale deployment | Kubernetes later |

No Twilio, Agora, Daily, Zoom SDK, AWS-managed media API, or LiveKit Cloud will be required.

# Milestone plan

## Milestone 0 — Requirements and architecture freeze

**Goal:** Define the exact scope before replacing the current media layer.

Tasks:

- [x] Confirm maximum participants per room
- [x] Define expected concurrent rooms
- [x] Define expected concurrent users
- [x] Decide supported resolutions: 180p, 360p, 720p, and 1080p screen share
- [x] Define gallery and speaker-view behavior
- [x] Define recording formats and retention
- [x] Define browser support
- [x] Select LiveKit embedded TURN versus standalone Coturn
- [x] Write an architecture decision record
- [x] Define performance targets

Recommended initial targets:

```text
Participants per room: 50
Visible video tiles: 9 desktop, 4 mobile
Published video: simulcast 180p/360p/720p
Screen share: up to 1080p
Target latency: below 500 ms
Recording: 720p MP4
Initial deployment: single region
```

Acceptance criteria:

- [x] Architecture document approved
- [x] Capacity targets documented
- [x] No paid managed dependency included

Estimated duration: 1–2 days

---

## Milestone 1 — Local self-hosted LiveKit infrastructure

**Goal:** Run the SFU entirely on the local development environment.

Tasks:

- [x] Add LiveKit Server to Docker Compose
- [x] Connect LiveKit to Redis
- [x] Generate local API key and secret
- [x] Configure WebSocket and RTC ports
- [x] Enable embedded TURN for development
- [x] Add health checks
- [x] Add persistent configuration
- [x] Keep credentials outside Git
- [x] Create separate development and production configuration templates

Services:

```text
livekit-server
redis
mysql
backend
frontend
```

Acceptance criteria:

- [x] LiveKit starts through Docker Compose
- [x] Browser can establish an authenticated room connection
- [x] Redis-backed LiveKit room coordination works
- [x] No request goes to LiveKit Cloud
- [x] Restarting application services does not remove durable application data

Estimated duration: 2–3 days

---

## Milestone 2 — Backend token and room integration

**Goal:** Make Express the authority for LiveKit access.

Tasks:

- [x] Install the open-source LiveKit Node server SDK
- [x] Add a protected token endpoint
- [x] Map TSMeet room IDs to LiveKit room names
- [x] Issue short-lived participant tokens
- [x] Add host, co-host, guest, and recorder permissions
- [x] Prevent clients from choosing their own privileges
- [x] Add token expiration and identity validation
- [x] Connect room creation/end operations to LiveKit Room Service
- [x] Add webhook authentication
- [x] Process participant join/leave webhooks
- [x] Persist meeting lifecycle in MySQL

Example endpoint:

```text
POST /api/media/token
Authorization: Bearer <TSMeet JWT>

{
  "roomId": "...",
  "displayName": "..."
}
```

Acceptance criteria:

- [x] Only valid TSMeet users or approved guests receive tokens
- [x] Guests cannot grant themselves host privileges
- [x] Ended meetings reject new tokens
- [x] Room creator receives host permissions
- [x] LiveKit API secret never reaches the browser

Estimated duration: 3–4 days

---

## Milestone 3 — Replace mesh WebRTC with LiveKit

**Goal:** Remove participant-to-participant media connections.

Tasks:

- [x] Add LiveKit React/client SDK
- [x] Create `useLiveKitRoom` hook
- [x] Connect using backend-generated token
- [x] Publish microphone and camera tracks
- [x] Render remote participant tracks
- [x] Handle reconnecting and disconnected states
- [x] Replace the current peer map with LiveKit participants
- [x] Remove custom SDP offer/answer/ICE exchange
- [x] Remove `simple-peer` after migration
- [x] Keep existing Socket.IO features temporarily

Remove from the media pipeline:

```text
send-offer
send-answer
send-ice-candidate
createPeerConnection per participant
SimplePeer mesh
```

New media path:

```text
Browser → LiveKit SFU → subscribed browsers
```

Acceptance criteria:

- [x] User uploads media once to the SFU
- [x] Three or more users can communicate
- [x] Adding participants does not create browser-to-browser connections
- [x] Direct media no longer flows through the Express server
- [x] Camera and microphone controls work

Estimated duration: 5–7 days

---

## Milestone 4 — Adaptive video and bandwidth control

**Goal:** Prevent users from downloading every video at maximum quality.

Tasks:

- [x] Enable simulcast
- [x] Enable dynacast
- [x] Enable adaptive streaming
- [x] Define desktop and mobile subscription policies
- [x] Subscribe only to visible participant videos
- [x] Use low resolution for small tiles
- [x] Use high resolution for pinned participants
- [x] Pause video subscription for off-screen participants
- [x] Prioritize screen sharing and active speakers
- [x] Add low-data mode
- [x] Display network quality indicators
- [x] Add per-participant video quality controls

Recommended policies:

```text
Pinned tile:        720p
Large speaker tile: 720p
Normal grid tile:   360p
Small/mobile tile:  180p
Off-screen tile:    unsubscribed
Audio-only mode:    no video subscription
```

Acceptance criteria:

- [x] Hidden tiles stop consuming video bandwidth
- [x] Pinned video receives higher resolution
- [x] Mobile clients receive fewer/lower-quality tracks
- [x] User upload remains mostly stable as participants increase
- [x] Network degradation automatically lowers quality

Estimated duration: 3–5 days

---

## Milestone 5 — Screen sharing and media features

**Goal:** Restore all existing meeting-media features on the SFU architecture.

Tasks:

- [x] Screen sharing
- [x] System audio sharing where supported
- [x] Camera switching
- [x] Microphone switching
- [x] Speaker/output selection
- [x] Background blur
- [x] Virtual background
- [x] Camera and microphone recovery
- [x] Screen-share priority
- [x] Presentation layout
- [x] Mobile browser behavior
- [x] Permission-denied recovery

Acceptance criteria:

- [x] Screen sharing publishes as a separate LiveKit track
- [x] Participants can view camera and screen tracks independently
- [x] Screen sharing does not replace camera publication
- [x] Existing background processing remains client-side
- [x] Device switching does not require leaving the meeting

Estimated duration: 3–5 days

---

## Milestone 6 — Waiting room and moderation

**Goal:** Preserve TSMeet’s custom meeting-management features.

Tasks:

- [x] Waiting-room state in Redis/MySQL
- [x] Host approval and denial
- [x] Promote/demote co-host
- [x] Remove participant
- [x] Force participant mute
- [x] Disable participant video
- [x] Request permission to unmute
- [x] End meeting for everyone
- [x] Lock meeting
- [x] Participant roles
- [x] Prevent unauthorized moderation commands
- [x] Synchronize application roles with LiveKit permissions

Recommended separation:

```text
LiveKit:
- Media publication/subscription
- Participant connection
- Track state

Express + Socket.IO:
- Waiting room
- Chat
- Host approval
- Application roles
- Business rules
```

Acceptance criteria:

- [x] Only hosts/co-hosts can moderate
- [x] Server validates every moderation request
- [x] Waiting participants do not receive room media
- [x] Ending the meeting disconnects everyone
- [x] Roles survive temporary reconnects

Estimated duration: 4–6 days

---

## Milestone 7 — Self-hosted recording

**Goal:** Replace the custom mesh recorder with LiveKit Egress.

Tasks:

- [x] Deploy LiveKit Egress
- [x] Connect Egress to Redis and LiveKit
- [x] Configure room-composite recording
- [x] Create a TSMeet recording layout
- [x] Add start, pause strategy, resume strategy, and stop workflows
- [x] Save recording metadata in MySQL
- [x] Upload artifacts to MinIO
- [x] Generate authorized download links
- [x] Add recording failure/retry handling
- [x] Add recording retention policies
- [x] Remove the hidden mesh recorder after migration

Recording topology:

```text
LiveKit room
    │
    ▼
Egress worker
    │
    ├── Composite layout
    ├── Encode MP4/WebM
    └── Upload to MinIO
```

Important: LiveKit Egress pause/resume behavior may require segment-based recording or stopping and restarting recordings. TSMeet can join segments after completion with FFmpeg.

Acceptance criteria:

- [x] Recording does not create a peer connection with every browser
- [x] Composite recording includes active participants
- [x] Audio is mixed correctly
- [x] Screen share appears in the recording
- [x] Recording files remain on your infrastructure
- [x] Only authorized room owners can access recordings

Estimated duration: 5–8 days

---

## Milestone 8 — Self-hosted object storage

**Goal:** Keep recordings and application files under your control.

Tasks:

- [x] Deploy MinIO
- [x] Create private recording bucket
- [x] Configure access and secret keys
- [x] Store recording artifacts through Egress
- [x] Generate short-lived signed download URLs
- [x] Add storage quota enforcement
- [x] Add retention/automatic deletion
- [x] Add backup strategy
- [x] Prevent public bucket access
- [x] Add storage health monitoring

Acceptance criteria:

- [x] Recordings are not stored by a third party
- [x] Files are private by default
- [x] Expired links stop working
- [x] Deleted recording metadata also removes the artifact
- [x] Backup restoration is documented and tested

Estimated duration: 2–4 days

---

## Milestone 9 — Production TURN and networking

**Goal:** Make meetings work behind restrictive NATs and firewalls.

Tasks:

- [x] Configure LiveKit embedded TURN or Coturn
- [x] Create separate media and TURN domains
- [x] Configure trusted TLS certificates
- [x] Open required UDP/TCP ports
- [ ] Test TURN/UDP
- [ ] Test TURN/TLS over port 443
- [x] Remove public Google STUN dependencies
- [x] Configure public IP advertisement
- [x] Add firewall rules
- [x] Add TURN credential rotation
- [ ] Test mobile and corporate networks

Recommended domains:

```text
meet.example.com      → Next.js
api.example.com       → Express
media.example.com     → LiveKit
turn.example.com      → TURN
storage.example.com   → MinIO private gateway
```

Acceptance criteria:

- [x] No Google STUN or paid TURN dependency
- [ ] TURN-only test succeeds
- [x] WebRTC works over UDP where possible
- [ ] Restricted networks fall back to TURN/TLS
- [x] TLS renewal is automatic

Estimated duration: 3–5 days

---

## Milestone 10 — Security hardening

**Goal:** Secure the complete self-hosted media platform.

Tasks:

- [ ] Rotate all secrets
- [x] Use separate secrets for JWT, LiveKit, Redis, MinIO and recorder
- [x] Remove credentials from URLs
- [x] Short-lived LiveKit tokens
- [x] Webhook signature validation
- [x] Rate limiting
- [x] Input validation
- [x] Content Security Policy
- [x] Secure cookies or hardened token storage
- [x] Audit logs for host actions
- [x] Recording consent indicators
- [x] Private MinIO buckets
- [x] Network isolation between services
- [x] Container non-root users
- [x] Dependency and container scanning
- [x] Backup encryption

Acceptance criteria:

- [x] No default credentials in production
- [x] Secrets are not committed
- [x] Guests cannot escalate permissions
- [x] Internal Redis/MySQL/MinIO ports are not publicly exposed
- [x] Security-sensitive actions create audit records
- [x] Recording cannot start silently

Estimated duration: 4–6 days

---

## Milestone 11 — Observability

**Goal:** Operate the platform without paid monitoring services.

Tasks:

- [x] Prometheus metrics
- [x] Grafana dashboards
- [x] Loki log collection
- [x] Node Exporter
- [x] Container metrics
- [x] LiveKit metrics
- [x] MySQL and Redis exporters
- [x] Alerts for CPU, memory, bandwidth and disk
- [x] Alerts for recording failures
- [x] Room and participant statistics
- [x] Network-quality dashboards
- [x] Log retention limits

Acceptance criteria:

- [x] Current rooms and participants are visible
- [x] SFU ingress/egress bandwidth is visible
- [x] Recording failures trigger alerts
- [x] Disk capacity alerts occur before storage fills
- [x] Logs contain request/room IDs without exposing tokens

Estimated duration: 3–5 days

---

## Milestone 12 — Load, failure and recovery testing

**Goal:** Prove the system’s capacity before production.

Test scenarios:

- [x] 2-person meeting
- [x] 8-person gallery
- [x] 20-person meeting
- [ ] 50-person meeting
- [x] Multiple concurrent rooms
- [x] Screen sharing
- [x] Audio-only participants
- [ ] TURN-only connections
- [ ] Packet loss and latency
- [x] LiveKit restart
- [x] Redis restart
- [x] MySQL restart
- [x] Egress failure
- [x] Storage outage
- [x] Full disk
- [x] Client reconnect
- [x] Host disconnect and recovery

Measurements:

```text
SFU CPU
SFU memory
Ingress bandwidth
Egress bandwidth
Packet loss
Round-trip time
Participant connection time
Recording CPU
Recording completion time
```

Acceptance criteria:

- [x] Documented participant capacity per server
- [x] No host privilege corruption after reconnect
- [x] No recording data loss during normal completion
- [x] Recovery procedures tested
- [x] Scaling threshold and server specification documented

Estimated duration: 5–7 days

---

## Milestone 13 — Controlled production rollout

**Goal:** Move users from mesh to SFU safely.

Tasks:

- [x] Add `MEDIA_PROVIDER=mesh|livekit` feature flag
- [x] Deploy LiveKit for internal testing
- [x] Run selected rooms on LiveKit
- [x] Compare quality and bandwidth
- [x] Monitor errors and recording output
- [x] Migrate all new rooms
- [x] Keep mesh rollback temporarily
- [x] Remove mesh code after stabilization
- [x] Remove obsolete recorder code
- [x] Finalize operations handbook

Acceptance criteria:

- [x] LiveKit is the default media provider
- [x] Rollback has been tested
- [x] No production room depends on mesh
- [x] `simple-peer` and custom WebRTC signaling are removed
- [x] Old recorder worker is removed
- [x] Documentation reflects the final topology

Estimated duration: 3–5 days plus observation time

# Recommended implementation order

```text
Milestone 0
    ↓
Milestones 1–3: core SFU migration
    ↓
Milestones 4–6: meeting features
    ↓
Milestones 7–9: recording, storage, networking
    ↓
Milestones 10–12: security and operations
    ↓
Milestone 13: production rollout
```

## Estimated total

For one experienced developer:

```text
Core SFU video meetings:       2–3 weeks
Feature parity and recording:  2–3 weeks
Production hardening/testing:  2–3 weeks
Total:                         approximately 6–9 weeks
```

## Important definition of “free”

The software stack can remain open-source and license-fee-free. You will still directly pay for:

- Servers
- Network transfer
- Domain registration
- Backup storage
- Electricity or data-center resources

No third party needs to receive your meeting media, recordings, credentials, or application data. All components can run on infrastructure you own or rent.
