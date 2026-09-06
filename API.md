# TSMeet API Reference

Contracts for the TSMeet backend: REST endpoints, the Next.js same-origin proxy,
and the Socket.IO realtime protocol.

> **Scope.** This file documents what the code actually implements. Every route
> below is mounted in [`server/index.ts`](server/index.ts); every socket event is
> handled there too. If a behaviour is not listed here, treat it as unsupported.

**Contents**

| Section | What it covers |
|---|---|
| [Base URLs and transports](#base-urls-and-transports) | Which port serves what |
| [Authentication](#authentication) | Cookie sessions, bearer tokens, guests |
| [Request and error conventions](#request-and-error-conventions) | Status codes, error body shape |
| [Auth API](#auth-api) | Register, login, guest, verify |
| [Rooms API](#rooms-api) | Create, read, list, end meetings |
| [Media token API](#media-token-api) | The LiveKit join credential |
| [Recording API](#recording-api) | Host session lifecycle and archive |
| [Calendars API](#calendars-api) | Availability, slots, bookings |
| [Public booking API](#public-booking-api) | Unauthenticated share/embed pages |
| [Webhooks and operations](#webhooks-and-operations) | LiveKit webhook, health, metrics |
| [Socket.IO realtime contract](#socketio-realtime-contract) | Every client and server event |
| [Next.js proxy layer](#nextjs-proxy-layer) | How the browser really calls the API |

---

## Base URLs and transports

| Transport | Local URL | Purpose |
|---|---|---|
| Next.js frontend + `/api` proxy | `http://localhost:3001` | Everything the browser calls |
| Express REST + Socket.IO | `http://localhost:3002` | Backend origin, integrations |
| LiveKit SFU | `ws://localhost:7880` | WebRTC media only |

The browser never calls port 3002 directly. It calls same-origin `/api/*` routes
on the Next.js server, which forward to Express with the session cookie attached.
Server-to-server integrations may call Express directly with a bearer token.

---

## Authentication

TSMeet accepts three credential forms, checked in this order on the socket
handshake and honoured by [`server/middleware/auth.ts`](server/middleware/auth.ts):

1. **`tsmeet_session` cookie** — HttpOnly, set by the Next.js auth routes. This is
   what browsers use. It is never readable from JavaScript.
2. **`Authorization: Bearer <jwt>`** — for server-side integrations and scripts.
3. **Socket handshake `auth.token`** — used by the legacy mesh client only.

JWT payloads carry `userId`, `email`, `name`, and, for guests, `guest: true` and
the `roomId` the token is bound to. Account tokens expire in **7 days**; guest
tokens in **12 hours**.

> **Guest tokens are room-scoped.** A guest JWT minted for room A is rejected by
> `POST /api/media/token` and by `request-join` for room B.

---

## Request and error conventions

Request bodies are JSON and capped at **256 KB**. Rate limits:

| Path prefix | Window | Limit |
|---|---|---|
| `/api/auth` | 15 minutes | 30 requests |
| `/api/public` | 1 minute | 120 requests |

Errors always use this shape:

```json
{ "error": "Human readable message" }
```

Some errors add a machine-readable `code`:

| Status | Meaning | Notable `code` values |
|---|---|---|
| `400` | Invalid input or missing consent | — |
| `401` | Missing or invalid credentials | — |
| `403` | Authenticated but not permitted | — |
| `404` | Not found | — |
| `409` | Conflict | `MEDIA_PROVIDER_MESH` |
| `410` | Meeting already ended | — |
| `507` | Storage quota exhausted | `RECORDING_STORAGE_FULL` |

---

## Auth API

Mounted at `/api/auth`. Public.

### `POST /api/auth/register`

Validated with Zod: email is trimmed, lower-cased, max 191 chars; password is
8–128 chars; name is 1–191 chars.

```json
{ "email": "user@example.com", "password": "secret1234", "name": "User" }
```

`201`:

```json
{
  "token": "<jwt, 7d>",
  "user": { "id": 1, "email": "user@example.com", "name": "User" }
}
```

`400` if the payload is invalid **or** the email already exists.

### `POST /api/auth/login`

```json
{ "email": "user@example.com", "password": "secret1234" }
```

`200` returns the same `{ token, user }` shape. `401` on bad credentials — the
message is identical for unknown email and wrong password, by design.

### `POST /api/auth/guest`

Creates a short-lived identity so someone can join a meeting from a shared link
without an account. A real `users` row is inserted so meeting foreign keys and
audit records stay valid.

```json
{ "roomId": "<uuid>", "name": "Alice" }
```

`201`:

```json
{
  "token": "<jwt, 12h, bound to roomId>",
  "user": { "id": 42, "name": "Alice", "guest": true }
}
```

| Status | Cause |
|---|---|
| `400` | `roomId` is not a UUID, or name is empty / over 100 chars |
| `404` | Room does not exist |
| `410` | Meeting has already ended |

### `GET /api/auth/verify`

Requires `Authorization: Bearer <jwt>`. Returns `200` with the decoded payload,
`401` when no token is supplied, `403` when it is invalid or expired.

```json
{ "valid": true, "user": { "userId": 1, "email": "user@example.com", "name": "User", "iat": 0, "exp": 0 } }
```

---

## Rooms API

Mounted at `/api/rooms`. **All routes require authentication.**

### `POST /api/rooms`

Creates the durable room row *and* the LiveKit room. If LiveKit rejects the
create, the database row is rolled back so you never get an unusable meeting.

```json
{ "title": "Team sync", "description": "Weekly call", "password": "optional" }
```

A non-empty `password` is bcrypt-hashed and enforced later at socket join time,
not here. `201`:

```json
{
  "id": "<uuid>",
  "title": "Team sync",
  "description": "Weekly call",
  "creator_id": 1,
  "created_at": "2026-06-02T12:00:00.000Z",
  "ended_at": null
}
```

### `GET /api/rooms/:roomId`

Returns the room row plus the resolved media provider for that room:

```json
{ "id": "<uuid>", "title": "Team sync", "creator_id": 1, "ended_at": null, "media_provider": "livekit" }
```

`media_provider` is `livekit` or `mesh`, decided by
[`server/services/mediaProvider.ts`](server/services/mediaProvider.ts) from the
`MEDIA_PROVIDER_MESH_ROOMS` / `MEDIA_PROVIDER_LIVEKIT_ROOMS` allow-lists.

### `GET /api/rooms/user/rooms`

Rooms created by the authenticated user, newest first.

### `POST /api/rooms/:roomId/end`

Creator only. Deletes the LiveKit room — which disconnects every participant's
media immediately — then stamps `ended_at`. `403` for non-creators.

```json
{ "message": "Room ended successfully" }
```

---

## Media token API

### `POST /api/media/token`

The most important endpoint in the product: it exchanges a TSMeet session for a
short-lived LiveKit join credential. Requires authentication.

```json
{ "roomId": "<uuid>", "displayName": "Alice" }
```

`200`:

```json
{
  "token": "<livekit jwt, 5 minute ttl>",
  "url": "wss://media.example.com",
  "room": "tsmeet-<roomId>",
  "identity": "user:42",
  "role": "guest",
  "provider": "livekit"
}
```

**Authorisation rules, all enforced server-side:**

- The room creator is always `host`.
- A `meeting_roles` row of `co-host` grants `co-host`.
- Everyone else must have an `approved` row in `meeting_waiting_participants`,
  otherwise `403 Waiting-room approval is required`.
- Client-supplied role or grant fields are **ignored**. Privileges are derived
  only from trusted database state.
- A guest token bound to a different room gets `403`.

`role` maps to LiveKit grants like this:

| Role | `canPublish` | `roomAdmin` | `hidden` |
|---|---|---|---|
| `host` | yes | yes | no |
| `co-host` | yes | yes | no |
| `guest` | yes | no | no |
| `recorder` | no | no | yes |

| Status | Cause |
|---|---|
| `400` | Missing `roomId`/`displayName`, or name over 100 chars |
| `403` | No waiting-room approval, or guest token for another room |
| `404` | Room not found |
| `409` | Room is assigned to the mesh provider (`code: MEDIA_PROVIDER_MESH`) |
| `410` | Meeting has ended |

The token TTL is five minutes; it authorises the *join*, not the whole meeting.
LiveKit reclaims empty rooms after `empty_timeout` (300s), so this endpoint
recreates the room only after the participant has been authorised.

---

## Recording API

Mounted at `/api/recordings`. **All routes require authentication and room
ownership.** Recording is performed by **LiveKit Egress**, which composites the
room server-side and writes to the private MinIO bucket. No browser and no hidden
participant performs the capture.

### Session lifecycle

```text
                 start                stop
  (none) ──────────────► recording ──────────► completed
                            │  ▲
                      pause │  │ resume
                            ▼  │
                          paused
```

Each `start` and each `resume` opens a **new Egress segment**; each `pause` and
`stop` closes the current one. A recording is therefore one archive row with one
or more `recording_segments`.

Session statuses: `awaiting_recorder`, `recording`, `paused`, `stopping`,
`completed`, `failed`.

### `POST /api/recordings/sessions/start`

```json
{ "roomId": "<uuid>", "consentConfirmed": true }
```

`consentConfirmed: true` is **mandatory** — omitting it returns `400`. The call
also checks the owner's storage quota before starting.

`201` returns the session object:

```json
{
  "id": "<uuid>",
  "roomId": "<uuid>",
  "creatorId": "1",
  "startedByUserId": "1",
  "status": "recording",
  "startedAt": "2026-06-03T12:00:00.000Z",
  "updatedAt": "2026-06-03T12:00:00.000Z",
  "completedAt": null,
  "failureReason": null
}
```

Side effects: a `recordings` archive row is created, Egress is started, an
audit-log entry `recording.started` is written, and every participant receives
`recording-session-updated` over Socket.IO.

| Status | Cause |
|---|---|
| `400` | Missing `roomId`, or `consentConfirmed` not `true` |
| `403` | Not the room owner |
| `507` | `RECORDING_STORAGE_FULL` |

### `POST /api/recordings/sessions/:sessionId/pause`

Stops the current Egress segment and moves the session to `paused`.

### `POST /api/recordings/sessions/:sessionId/resume`

Re-checks quota, starts a new Egress segment, returns to `recording`. Can return
`507`.

### `POST /api/recordings/sessions/:sessionId/stop`

Stops the final segment, marks the session `completed`, and flips the archive row
to `status = 'ready'` with `completed_at` set.

### `GET /api/recordings/rooms/:roomId/active`

```json
{ "session": { "id": "<uuid>", "status": "recording" } }
```

`session` is `null` when nothing is recording.

### `GET /api/recordings/sessions/:sessionId`

Returns one session. `404` if unknown, `403` if you do not own the room.

### `GET /api/recordings`

Archived recordings owned by the caller, newest first, joined with the room title:

```json
[
  {
    "id": "<uuid>",
    "room_id": "<uuid>",
    "room_title": "Team sync",
    "status": "ready",
    "started_at": "2026-06-03T12:00:00.000Z",
    "completed_at": "2026-06-03T12:45:00.000Z",
    "object_key": "recordings/<uuid>.mp4",
    "video_path": null,
    "audio_path": null
  }
]
```

### `GET /api/recordings/:recordingId/video` · `GET /api/recordings/:recordingId/audio`

Two delivery paths, depending on where the artifact lives:

- **Object storage** (production): responds `302` to a short-lived presigned MinIO
  URL. The bucket itself stays private.
- **Local disk** (development): streams the file with `Content-Disposition:
  attachment`.

`404` if that artifact kind was never produced; `403` if you do not own it.

### `DELETE /api/recordings/:recordingId`

Deletes the archive row, the session row, every stored object for its segments,
and any local files. Owner only.

```json
{ "message": "Recording deleted successfully" }
```

---

## Calendars API

Mounted at `/api/calendars`. **All routes require authentication.**

### Calendar types

`settings.calendarType` controls how slot capacity is computed:

| Type | Capacity per slot |
|---|---|
| `personal` | Always 1 |
| `event` | `settings.eventCapacity` (>= 1) |
| `round_robin` | Number of round-robin members available for that slot |

### Round-robin members

Members go in `settings.roundRobinMembers`. Each needs a valid `id` **or** `email`
that exists in `users`; the backend resolves and stores a normalized
`{ id, name, email }`. Members may carry per-weekday availability:

```json
{
  "email": "alex@example.com",
  "availability": {
    "monday": [{ "start": "10:00", "end": "12:00" }],
    "tuesday": [{ "start": "09:00", "end": "11:00" }]
  }
}
```

On booking, one available member is assigned and stored on the booking as
`assigned_user_id`, `assigned_user_name`, `assigned_user_email`.

### `POST /api/calendars`

```json
{
  "title": "Consultation",
  "description": "Public booking page",
  "timezone": "Asia/Dhaka",
  "slug": "consultation",
  "confirmationMessage": "Thanks {{bookerName}}, your booking is confirmed.",
  "settings": {
    "calendarType": "round_robin",
    "eventCapacity": 1,
    "autoRecordMeeting": true,
    "roundRobinMembers": [{ "email": "alex@example.com" }],
    "slotDurationMinutes": 30,
    "slotIntervalMinutes": 30,
    "bufferBeforeMinutes": 0,
    "bookingWindowDays": 30,
    "dailySlotLimit": 8,
    "availability": { "monday": [{ "start": "09:00", "end": "17:00" }] },
    "notificationPreferences": { "creatorEmailEnabled": true, "bookerEmailEnabled": true },
    "reminderOffsetsMinutes": [10, 5, 1],
    "embedEnabled": true,
    "shareEnabled": true,
    "allowCancellation": true,
    "allowRescheduling": false,
    "customFields": []
  },
  "bookingForm": {
    "fields": [{ "id": "company", "type": "text", "label": "Company", "required": false }]
  }
}
```

`settings.autoRecordMeeting: true` makes the room prompt the host to start
recording on entry. It does **not** start recording automatically — the host still
confirms consent.

### `GET /api/calendars`

List calendars owned by the caller.

### `GET /api/calendars/:calendarId`

One calendar plus `disabledSlots`, `holidays`, and `bookings` (including
`assignedUserId`, `assignedUserName`, `assignedUserEmail` when set).

### `PATCH /api/calendars/:calendarId`

Update metadata, `settings`, or `bookingForm`.

### `POST /api/calendars/:calendarId/disabled-slots`

```json
{ "startAt": "2026-06-02T09:00:00.000Z", "endAt": "2026-06-02T10:00:00.000Z", "reason": "maintenance" }
```

### `POST /api/calendars/:calendarId/holidays`

```json
{ "holidayDate": "2026-06-17", "label": "Holiday", "isFullDay": true }
```

### `GET /api/calendars/:calendarId/slots?date=YYYY-MM-DD`

```json
{
  "startAt": "2026-06-03T04:00:00.000Z",
  "endAt": "2026-06-03T04:30:00.000Z",
  "startLocal": "10:00",
  "endLocal": "10:30",
  "timezone": "Asia/Dhaka",
  "status": "available",
  "reason": null,
  "capacity": 3,
  "remainingCapacity": 2,
  "bookedCount": 1
}
```

### `POST /api/calendars/:calendarId/bookings`

```json
{
  "slotStartAt": "2026-06-03T04:00:00.000Z",
  "bookerName": "Alice",
  "bookerEmail": "alice@example.com",
  "responses": { "company": "Acme" }
}
```

`201`:

```json
{
  "booking": {
    "id": "<uuid>",
    "calendar_id": "<uuid>",
    "assigned_user_id": 12,
    "assigned_user_name": "Alex",
    "assigned_user_email": "alex@example.com",
    "status": "confirmed"
  },
  "meetingUrl": "http://localhost:3001/meetings/<bookingId>",
  "confirmationMessage": "Thanks Alice, your booking is confirmed.",
  "reminders": [{ "minutesBefore": 10, "remindAt": "2026-06-03T03:50:00.000Z" }]
}
```

> **Overbooking is prevented at the database level.** The availability check and
> the insert run inside a MySQL advisory lock scoped to the calendar, so two
> simultaneous bookings for the last seat cannot both succeed. The loser gets `409`.

### `GET /api/calendars/:calendarId/bookings?date=YYYY-MM-DD&status=confirmed`

Owner booking list with optional filters.

### `POST /api/bookings/:bookingId/cancel`

Mounted at `/api/bookings`. Calendar owner only.

```json
{ "cancelReason": "Canceled by creator" }
```

---

## Public booking API

Mounted at `/api/public/calendars`. **No authentication.** Rate limited to 120
requests per minute.

| Endpoint | Purpose |
|---|---|
| `GET /api/public/calendars/:slug` | Calendar details for a share or embed page |
| `GET /api/public/calendars/:slug/slots?date=YYYY-MM-DD` | Public slot generation |
| `POST /api/public/calendars/:slug/bookings` | Public booking creation |
| `GET /api/public/calendars/meetings/:bookingId` | Look up a booking's meeting |

The booking body matches the authenticated version. The meeting lookup returns:

```json
{
  "booking": {
    "id": "<uuid>",
    "status": "confirmed",
    "slotStartAt": "2026-06-03T04:00:00.000Z",
    "slotEndAt": "2026-06-03T04:30:00.000Z",
    "bookerName": "Alice",
    "meetingUrl": "http://localhost:3001/meetings/<bookingId>"
  },
  "calendar": {
    "id": "<uuid>",
    "title": "Consultation",
    "timezone": "Asia/Dhaka",
    "slug": "consultation-abc123",
    "settings": { "calendarType": "round_robin", "autoRecordMeeting": true }
  }
}
```

---

## Webhooks and operations

### `POST /api/webhooks/livekit`

Receives LiveKit server events (room finished, egress ended, participant
lifecycle). The body is read **raw** and its signature is verified with
`LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`; unsigned requests are rejected.
Processed event IDs are recorded in `livekit_webhook_events` so retries are
idempotent.

Accepted content types: `application/webhook+json`, `application/json`. Max 256 KB.

### `GET /api/health`

Public. Used by Docker health checks and uptime probes.

```json
{
  "status": "ok",
  "redis": "ready",
  "storage": "ready",
  "timestamp": "2026-06-02T12:00:00.000Z"
}
```

`redis` is `ready` or `disabled`. `storage` is `ready`, `missing-bucket`, or
`unavailable`.

### `GET /metrics`

Prometheus exposition format: active rooms, participants, and the counters in
[`server/services/metrics.ts`](server/services/metrics.ts). **Do not expose this
publicly** — bind it to your private monitoring network.

---

## Socket.IO realtime contract

Socket.IO carries application events only: waiting room, moderation, chat,
presence, and recording status. **It never carries meeting media.** Media is
LiveKit's job.

**Connect to the backend origin — `http://localhost:3002` locally**, not the
frontend port. The handshake credential is resolved in this order:

1. `tsmeet_session` cookie (browsers)
2. `auth.token` (legacy mesh client)
3. `Authorization: Bearer` header

An unusable token emits `auth-error` and leaves the socket unauthenticated —
`request-join` will then reject it.

### Participant object

Sent in `room-participants` and `visible-participants-updated`:

```ts
{
  userId: string;
  socketId: string;
  userData: { name: string; avatar?: string };
  joinedAt: string;
  hidden?: boolean;            // recorder identities are hidden
  role?: 'user' | 'recorder';
}
```

### Joining a meeting

```text
client                          server                        host client
  │  request-join ───────────────►│
  │                               │  password set & wrong?
  │◄──────── password-incorrect ──┤
  │                               │  password set & absent?
  │◄──────── password-required ───┤
  │                               │  locked / full / unauthenticated?
  │◄──────── join-denied ─────────┤   { roomId, message }
  │                               │
  │◄──────── join-pending ────────┤   host must approve
  │                               ├───── join-request ─────────►│
  │                               │◄──── approve-join ──────────┤
  │◄──────── join-approved ───────┤
  │◄──────── room-participants ───┤
```

Only after `join-approved` will `POST /api/media/token` issue a LiveKit token.
The waiting room is the authorisation gate for media, not just a UI step.

### Client → server

| Event | Payload | Who may send it |
|---|---|---|
| `request-join` | `{ roomId, userId, userData, isHost, token?, roomPassword? }` | anyone |
| `approve-join` | `{ roomId, targetSocketId }` | host / co-host |
| `deny-join` | `{ roomId, targetSocketId }` | host / co-host |
| `approve-all` | `{ roomId }` | host / co-host |
| `host-mute` | `{ roomId, targetSocketId }` | host / co-host |
| `host-mute-all` | `{ roomId }` | host / co-host |
| `host-stop-video` | `{ roomId, targetSocketId }` | host / co-host |
| `remove-participant` | `{ roomId, targetSocketId }` | host / co-host |
| `set-meeting-lock` | `{ roomId, locked }` | host |
| `transfer-host` | `{ roomId, targetSocketId }` | host |
| `promote-cohost` | `{ roomId, targetSocketId }` | host |
| `demote-cohost` | `{ roomId, targetSocketId }` | host |
| `end-meeting` | `{ roomId }` | host |
| `raise-hand` | `{ roomId, userId, userData }` | participant |
| `lower-hand` | `{ roomId }` | participant |
| `request-unmute` | `{ roomId, userId, userData }` | participant |
| `approve-unmute` | `{ roomId, targetSocketId }` | host / co-host |
| `deny-unmute` | `{ roomId, targetSocketId }` | host / co-host |
| `send-message` | `{ roomId, message, senderName, timestamp? }` | participant |
| `toggle-camera` | `{ roomId, enabled }` | participant |
| `toggle-microphone` | `{ roomId, enabled }` | participant |
| `network-quality` | `{ roomId, quality }` | participant |
| `leave-room` | `(roomId, userId)` — positional args, not an object | participant |
| `send-offer` | `{ roomId, targetSocketId, offer }` | mesh provider only |
| `send-answer` | `{ roomId, targetSocketId, answer }` | mesh provider only |
| `send-ice-candidate` | `{ roomId, targetSocketId, candidate }` | mesh provider only |
| `start-screen-share` | `{ roomId, offer }` | mesh provider only |
| `stop-screen-share` | `{ roomId }` | mesh provider only |

Every moderation event verifies that the sender **and** the target are current
participants of that room before acting, and writes a `security_audit_logs` row.

### Server → client

**Join and presence**

| Event | Payload |
|---|---|
| `join-pending` | `{ roomId, waitingForHost }` |
| `join-approved` | `{ roomId, isHost, iceServers }` — `iceServers` is `[]` unless the room uses mesh |
| `join-denied` | `{ roomId, message }` |
| `join-request` | `{ roomId, socketId, userId, userData }` — sent to the host |
| `password-required` | `{ roomId }` |
| `password-incorrect` | `{ roomId }` |
| `room-participants` | `Participant[]` — excludes the recipient |
| `visible-participants-updated` | `Participant[]` — hidden identities filtered out |
| `user-joined` | `{ userId, socketId, userData }` |
| `user-left` | `{ socketId, userId }` |

**Moderation and roles**

| Event | Payload |
|---|---|
| `force-mute` | `{ roomId }` |
| `force-video-off` | `{ roomId }` |
| `participant-removed` | `{ roomId }` — sent to the removed socket |
| `meeting-lock-changed` | `{ roomId, locked }` |
| `host-changed` | `{ hostSocketId, hostUserId }` |
| `cohost-promoted` | `{ userId, socketId }` |
| `cohost-demoted` | `{ userId, socketId }` |
| `hand-raised` | `{ roomId, socketId, userId, userData }` |
| `hand-lowered` | `{ roomId, socketId }` |
| `unmute-request` | `{ roomId, socketId, userId, userData }` |
| `allow-unmute` | `{ roomId }` |
| `unmute-denied` | `{ roomId }` |

**Chat, device state, and lifecycle**

| Event | Payload |
|---|---|
| `receive-message` | `{ socketId, message, senderName, timestamp }` |
| `user-camera-toggled` | `{ socketId, enabled }` |
| `user-microphone-toggled` | `{ socketId, enabled }` |
| `user-screen-share-started` | `{ socketId, offer }` — mesh only |
| `user-screen-share-stopped` | `{ socketId }` — mesh only |
| `recording-session-updated` | `RecordingSession \| null` |
| `meeting-ended` | `{ roomId }` |
| `meeting-end-failed` | `{ roomId }` |
| `auth-error` | `{ message }` |

> **Host failover.** If the host socket disconnects, `RoomManager` promotes a
> replacement and broadcasts `host-changed`. When the original creator
> reconnects, they reclaim host automatically — a temporary fallback host does not
> permanently own the meeting.

---

## Next.js proxy layer

Browser code calls same-origin `/api/*` routes under [`app/api/`](app/api/). Each
one forwards to Express through [`app/api/_proxy.ts`](app/api/_proxy.ts),
preserving the `tsmeet_session` cookie and disabling caching.

Why this layer exists:

- The session cookie stays **HttpOnly and same-origin**. No JWT touches
  `localStorage` on the LiveKit path.
- The Express origin does not need permissive CORS for browsers.
- The backend URL is server-side configuration (`BACKEND_URL`), not a public
  build-time value.

If Express is unreachable the proxy returns `502` with
`{ "error": "Backend server is unavailable. Is it running on port 3002?" }`.

---

## Source of truth

| Concern | File |
|---|---|
| Route mounting, socket handlers | [`server/index.ts`](server/index.ts) |
| REST handlers | [`server/routes/`](server/routes/) |
| Slot and booking logic | [`server/services/calendarService.ts`](server/services/calendarService.ts) |
| LiveKit tokens, grants, room admin | [`server/services/livekit.ts`](server/services/livekit.ts) |
| Egress recording | [`server/services/egress.ts`](server/services/egress.ts) |
| In-memory room and role state | [`server/services/roomManager.ts`](server/services/roomManager.ts) |
| Browser media | [`hooks/useLiveKitRoom.ts`](hooks/useLiveKitRoom.ts) |
| Proxy routes | [`app/api/`](app/api/) |
