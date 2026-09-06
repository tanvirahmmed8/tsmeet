# TSMeet Features

A complete inventory of what TSMeet does today. Anything not listed here is not
implemented — this file is not a roadmap.

For *how to use* these features, read the [User Guide](docs/USER_GUIDE.md).
For *how they work*, read [ARCHITECTURE.md](ARCHITECTURE.md).

Legend: **Available** — shipped and covered by the default stack ·
**Optional** — requires a Docker profile or extra configuration ·
**Rollback only** — exists for controlled fallback, not normal use.

---

## Meeting experience

| Feature | Status | Notes |
|---|---|---|
| Camera and microphone preview before joining | Available | Choose devices before entering |
| Input/output device selection | Available | Microphone, camera, and speaker pickers |
| Gallery layout | Available | Grid of participants |
| Active-speaker layout | Available | Current speaker on stage |
| Pinned participant | Available | Pin from the participants panel |
| Hide your own tile | Available | Local only; others still see you |
| Screen sharing | Available | Tab, window, or entire screen |
| Screen share with system audio | Available | Browser- and target-dependent |
| Adaptive video quality | Available | Reacts to measured network conditions |
| Low-data mode | Available | For constrained connections |
| In-meeting chat | Available | Text chat over Socket.IO |
| Hand raising | Available | With host visibility |
| Participant status indicators | Available | Mute, camera, hand, host badges |
| Network quality indicator | Available | Shown in the meeting header |
| Responsive mobile layout | Available | Verified down to 320 px |

<p align="center">
  <img src="docs/images/share-options.png" alt="Share menu with screen or window sharing, with or without system audio" width="620">
</p>

---

## Host and participant controls

| Feature | Status | Who can use it |
|---|---|---|
| Waiting room with admit / deny | Available | Host, co-host |
| Admit all | Available | Host, co-host |
| Request to join again after denial | Available | Participant |
| Mute one participant | Available | Host, co-host |
| Mute all | Available | Host, co-host |
| Stop a participant's video | Available | Host, co-host |
| Remove a participant | Available | Host, co-host |
| Request to unmute, with approval | Available | Participant asks, host decides |
| Lock meeting | Available | Host |
| Promote / demote co-host | Available | Host |
| Transfer host | Available | Host |
| End meeting for everyone | Available | Host |
| Automatic host failover on disconnect | Available | Creator reclaims host on rejoin |
| Searchable participant panel | Available | Everyone |
| Audit log of moderation actions | Available | Written server-side |

<p align="center">
  <img src="docs/images/participants-panel.png" alt="Participants panel with search, invite, mute, and pin controls" width="620">
</p>

---

## Accounts, rooms, and access

| Feature | Status | Notes |
|---|---|---|
| Registration and sign-in | Available | bcrypt password hashing |
| Protected dashboard | Available | Meetings, calendars, recordings |
| Room creation with title and description | Available | — |
| Optional room password | Available | bcrypt-hashed, checked at join |
| Guest join via shareable link | Available | No account; token bound to that one room |
| Meeting history | Available | Rooms you created |
| Participant limit | Available | `MAX_PARTICIPANTS`, default 50 |

---

## Scheduling and booking

| Feature | Status | Notes |
|---|---|---|
| Weekly availability per calendar | Available | Per-weekday time ranges |
| Slot duration, interval, and buffer | Available | Configurable per calendar |
| Booking window and daily slot limit | Available | Limits how far ahead and how many |
| Holidays | Available | Full-day or partial blocks |
| Disabled slots | Available | One-off blocked ranges with a reason |
| Personal calendars | Available | One booking per slot |
| Event calendars | Available | Capacity per slot |
| Round-robin calendars | Available | Assignment across team members |
| Per-member availability in round robin | Available | Slot offered only if a member is free |
| Public booking page | Available | Shareable by slug |
| Embeddable booking widget | Available | `/embed/<slug>` |
| Custom booking form fields | Available | Defined per calendar |
| Confirmation message with variables | Available | e.g. `{{bookerName}}` |
| Reminder offsets | Available | Returned with the booking |
| Booking cancellation | Available | Calendar owner |
| Overbooking protection | Available | Per-calendar advisory lock in MySQL |
| Meeting link per booking | Available | `/meetings/<bookingId>` |

---

## Recording

| Feature | Status | Notes |
|---|---|---|
| Server-side composite recording | Optional | LiveKit Egress; `recording` Docker profile |
| Consent confirmation before start | Available | Enforced by the API, not just the UI |
| Pause and resume | Optional | Each resume opens a new segment |
| Recording status visible to participants | Available | Broadcast over Socket.IO |
| Auto-record prompt from a calendar | Available | Prompts the host; never silent |
| Private recording archive | Optional | Owner-only listing |
| Short-lived presigned download URLs | Optional | Bucket stays private |
| Recording deletion | Optional | Removes rows, objects, and local files |
| Storage quota enforcement | Optional | `507` when exhausted |
| Session recovery after backend restart | Available | Unfinished sessions rehydrated at startup |
| Retention configuration | Optional | `RECORDING_RETENTION_DAYS` |

Recording is **off by default** because compositing is CPU-intensive. Enable it
per [docs/OPTIONAL_DOCKER_PROFILES.md](docs/OPTIONAL_DOCKER_PROFILES.md).

---

## Infrastructure and security

| Feature | Status | Notes |
|---|---|---|
| Self-hosted LiveKit SFU | Available | No LiveKit Cloud or paid media API |
| LiveKit UDP mux on `7882/udp` | Available | TCP fallback on `7881/tcp` |
| Embedded TURN | Optional | `3478/udp`, `5349/tcp` when enabled |
| Legacy WebRTC mesh | Rollback only | `MAX_MESH_PARTICIPANTS`, default 8 |
| HttpOnly session cookie | Available | Not readable from JavaScript |
| Same-origin Next.js API proxy | Available | Keeps the cookie same-origin |
| Server-derived meeting roles | Available | Clients cannot claim host |
| Five-minute LiveKit join tokens | Available | Issued only after waiting-room approval |
| DTLS-SRTP media encryption | Available | WebRTC in transit |
| Helmet security headers | Available | — |
| Rate limiting | Available | Auth and public APIs |
| CORS restricted to `FRONTEND_URL` | Available | — |
| Signed LiveKit webhooks | Available | Idempotent via `livekit_webhook_events` |
| Parameterised SQL throughout | Available | — |
| Prometheus metrics | Optional | `/metrics`; keep it private |
| Grafana, Loki, Promtail dashboards | Optional | `observability` Docker profile |
| Automated TLS renewal timer | Available | systemd timer with LiveKit reload hook |

---

## Verified limits

| Limit | Value | Basis |
|---|---|---|
| Participants per room, verified | **20** | Measured on an 8-vCPU node: 38.1 Mbps, 0% loss |
| Participants per room, configured cap | 50 | `MAX_PARTICIPANTS` — a ceiling, not a tested guarantee |
| Mesh rollback rooms | 8 | `MAX_MESH_PARTICIPANTS` |
| Backend replicas | 1 | Live room state is in process memory |
| Visible remote video tiles | 9 desktop / 4 mobile | Layout policy |

The 50-participant test did not pass on the reference node. Size hardware from
[docs/CAPACITY_AND_SCALING.md](docs/CAPACITY_AND_SCALING.md), not from the
configured ceiling.

---

## Not implemented

Stated plainly so nobody plans around them:

- Email delivery of booking confirmations and reminders (the API returns reminder
  schedules; sending is not wired up)
- Rescheduling an existing booking (`allowRescheduling` is accepted but the flow
  is not built)
- Breakout rooms, live captions, transcription, virtual backgrounds
- Multiple backend replicas / horizontal API scaling
- Splitting one meeting across several SFU nodes
