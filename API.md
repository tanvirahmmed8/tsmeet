# API Documentation (Fully Updated)

Canonical source for backend HTTP + realtime contracts in this repo.

Base backend URL (local): `http://localhost:3002`

Auth:
- Protected endpoints require `Authorization: Bearer <jwt>`
- JWT is issued by `/api/auth/register` and `/api/auth/login`

---

## Feature Support Matrix

- User auth (register/login/verify): `REST backend`
- Rooms CRUD (create/list/get/end): `REST backend`
- Realtime room join/moderation/signaling: `Socket.IO backend`
- Calendars + slots + bookings: `REST backend`
- Calendar types (`personal`, `event`, `round_robin`): `REST backend`
- Calendar auto-record prompt flag (`settings.autoRecordMeeting`): `REST backend` (controls room-start prompt behavior)
- Round-robin assignee resolution (id/email + per-member availability): `REST backend`
- Meeting recording controls (host start/pause/resume/stop): `REST backend session manager`
- Hidden recorder worker orchestration: `REST backend + Socket.IO hidden participant`
- Screen share with optional device audio: `Frontend media capture + WebRTC track replace`

---

## REST API

### Health

### GET `/api/health`
Response `200`:
```json
{ "status": "ok", "timestamp": "2026-06-02T12:00:00.000Z" }
```

---

### Auth

### POST `/api/auth/register`
Body:
```json
{ "email": "user@example.com", "password": "secret123", "name": "User" }
```
Response `201`:
```json
{
  "token": "<jwt>",
  "user": { "id": 1, "email": "user@example.com", "name": "User" }
}
```

### POST `/api/auth/login`
Body:
```json
{ "email": "user@example.com", "password": "secret123" }
```
Response `200`:
```json
{
  "token": "<jwt>",
  "user": { "id": 1, "email": "user@example.com", "name": "User" }
}
```

### GET `/api/auth/verify`
Headers:
- `Authorization: Bearer <jwt>`

Response `200`:
```json
{ "valid": true, "user": { "userId": 1, "email": "user@example.com", "name": "User", "iat": 0, "exp": 0 } }
```

---

### Rooms (Protected)

### POST `/api/rooms`
Create meeting room.

Body:
```json
{ "title": "Team sync", "description": "Weekly call" }
```

Response `201`:
```json
{
  "id": "uuid",
  "title": "Team sync",
  "description": "Weekly call",
  "creator_id": 1,
  "created_at": "...",
  "ended_at": null
}
```

### GET `/api/rooms/user/rooms`
List rooms created by authenticated user.

### GET `/api/rooms/:roomId`
Get room metadata.

### POST `/api/rooms/:roomId/end`
End room (creator only).

Response `200`:
```json
{ "message": "Room ended successfully" }
```

---

### Recording Sessions (Protected Host API)

Recording is now modeled as a backend session lifecycle. The web client only controls the session. A separate recorder worker is expected to claim the session and join the room as a hidden participant.

Session statuses:
- `awaiting_recorder`
- `recording`
- `paused`
- `stopping`
- `completed`
- `failed`

### GET `/api/recordings/rooms/:roomId/active`
Returns the active recording session for a room owned by the authenticated user.

Response `200`:
```json
{
  "session": {
    "id": "uuid",
    "roomId": "uuid",
    "creatorId": "1",
    "startedByUserId": "1",
    "status": "awaiting_recorder",
    "hiddenRecorderSocketId": null,
    "recorderServiceInstanceId": null,
    "startedAt": "2026-06-03T12:00:00.000Z",
    "updatedAt": "2026-06-03T12:00:00.000Z",
    "completedAt": null,
    "lastHeartbeatAt": null,
    "failureReason": null
  }
}
```

### GET `/api/recordings/sessions/:sessionId`
Returns a single session if the authenticated user owns the room.

### POST `/api/recordings/sessions/start`
Body:
```json
{ "roomId": "uuid" }
```

Response `201`:
```json
{
  "id": "uuid",
  "roomId": "uuid",
  "creatorId": "1",
  "startedByUserId": "1",
  "status": "awaiting_recorder"
}
```

### POST `/api/recordings/sessions/:sessionId/pause`
Pauses an active session.

### POST `/api/recordings/sessions/:sessionId/resume`
Resumes a paused session.

### POST `/api/recordings/sessions/:sessionId/stop`
Moves a session into `stopping`. The recorder worker should finalize and then call `complete` or `fail`.

### GET `/api/recordings`
Lists archived recordings owned by the authenticated user.

Response `200`:
```json
[
  {
    "id": "uuid",
    "room_id": "uuid",
    "room_title": "Team sync",
    "status": "ready",
    "started_at": "2026-06-03T12:00:00.000Z",
    "completed_at": "2026-06-03T12:45:00.000Z",
    "video_path": "storage/recordings/uuid-video.webm",
    "audio_path": "storage/recordings/uuid-audio.webm"
  }
]
```

### GET `/api/recordings/:recordingId/video`
Downloads the archived video artifact for a completed recording.

### GET `/api/recordings/:recordingId/audio`
Downloads the archived audio artifact for a completed recording.

### DELETE `/api/recordings/:recordingId`
Deletes a recording archive row plus any saved video/audio files owned by the authenticated user.

Response `200`:
```json
{ "message": "Recording deleted successfully" }
```

### Recorder Service API

These endpoints are for the hidden recorder worker, not for end users.

Auth:
- `Authorization: Bearer <RECORDER_SERVICE_TOKEN>`
- or `x-recorder-service-token: <RECORDER_SERVICE_TOKEN>`

### GET `/api/recording-service/sessions/claimable`
Lists sessions currently in `awaiting_recorder`.

### POST `/api/recording-service/sessions/:sessionId/claim`
Body:
```json
{
  "serviceInstanceId": "recorder-worker-1",
  "recorderSocketId": "socket-id"
}
```

Effect:
- assigns the worker to the session
- stores the hidden recorder socket id
- changes status to `recording`

### POST `/api/recording-service/sessions/:sessionId/heartbeat`
Body:
```json
{ "serviceInstanceId": "recorder-worker-1" }
```

### PUT `/api/recording-service/sessions/:sessionId/artifacts/video`
Raw request body:
- content type: worker recorder mime type, typically `video/webm`

### PUT `/api/recording-service/sessions/:sessionId/artifacts/audio`
Raw request body:
- content type: worker recorder mime type, typically `audio/webm`

### POST `/api/recording-service/sessions/:sessionId/complete`
Marks the session `completed`.

### POST `/api/recording-service/sessions/:sessionId/fail`
Body:
```json
{ "reason": "ffmpeg pipeline exited unexpectedly" }
```

Marks the session `failed`.

### Hidden Recorder Socket Contract

Socket event:
- `join-recorder`

Payload:
```json
{
  "roomId": "uuid",
  "sessionId": "uuid",
  "serviceInstanceId": "recorder-worker-1",
  "serviceToken": "<RECORDER_SERVICE_TOKEN>"
}
```

Behavior:
- backend joins the recorder socket to the room
- recorder is added as a hidden participant
- recorder is excluded from visible participant lists
- recorder can continue recording even if the host disconnects, as long as the meeting itself continues

### Recorder Worker Runtime

This repo now includes a server-side worker launcher:
- run from `server/`
- `npm run recorder:worker`

Behavior:
- polls `/api/recording-service/sessions/claimable`
- opens a backend-served hidden browser page at `/recorder/:sessionId`
- page joins with `join-recorder`
- page records remote media composite and audio mix
- page uploads video/audio artifacts through the recorder-service API
- backend startup reloads unfinished `recording_sessions` rows from MySQL so workers can reclaim them after restart

---

### Calendars (Protected)

## Calendar Types

`settings.calendarType` supports:
- `personal`
- `event`
- `round_robin`

Type behavior:
- `personal`: slot capacity is 1
- `event`: slot capacity is `settings.eventCapacity` (>=1)
- `round_robin`: slot capacity is number of available round-robin members for that slot

Recording prompt behavior:
- `settings.autoRecordMeeting: true` enables host confirmation prompt on room entry
- Prompt options: start recording now, or cancel and record later
- Manual host recording controls remain available in-room (`Record`, `Pause`, `Resume`, `Stop recording`)

Round-robin booking behavior:
- Member list is provided in `settings.roundRobinMembers`
- Each member needs valid `id` or `email` (must exist in `users` table)
- Backend resolves and stores normalized member entries (`id`, `name`, `email`)
- On booking creation, backend assigns one available member to slot and stores:
  - `assigned_user_id`
  - `assigned_user_name`
  - `assigned_user_email`

Per-member availability (round robin):
- Optional per member:
```json
{
  "availability": {
    "monday": [{ "start": "10:00", "end": "12:00" }],
    "tuesday": [{ "start": "09:00", "end": "11:00" }]
  }
}
```
- Slot capacity/count for round-robin uses members available for that day/time.

### POST `/api/calendars`
Create calendar.

Body example:
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
    "roundRobinMembers": [
      {
        "email": "alex@example.com",
        "availability": {
          "monday": [{ "start": "10:00", "end": "12:00" }]
        }
      },
      {
        "id": 12,
        "availability": {
          "monday": [{ "start": "09:00", "end": "11:00" }]
        }
      }
    ],
    "slotDurationMinutes": 30,
    "slotIntervalMinutes": 30,
    "bufferBeforeMinutes": 0,
    "bookingWindowDays": 30,
    "dailySlotLimit": 8,
    "availability": {
      "monday": [{ "start": "09:00", "end": "17:00" }]
    },
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

### GET `/api/calendars`
List creator calendars.

### GET `/api/calendars/:calendarId`
Get one calendar with related data.

Response includes:
- calendar details
- `disabledSlots`
- `holidays`
- `bookings` (includes `assignedUserId`, `assignedUserName`, `assignedUserEmail` when present)

### PATCH `/api/calendars/:calendarId`
Update calendar metadata/settings/form.

### POST `/api/calendars/:calendarId/disabled-slots`
Body:
```json
{ "startAt": "2026-06-02T09:00:00.000Z", "endAt": "2026-06-02T10:00:00.000Z", "reason": "maintenance" }
```

### POST `/api/calendars/:calendarId/holidays`
Body:
```json
{ "holidayDate": "2026-06-17", "label": "Holiday", "isFullDay": true }
```

### GET `/api/calendars/:calendarId/slots?date=YYYY-MM-DD`
Generate slots for date.

Slot example:
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

### POST `/api/calendars/:calendarId/bookings`
Create booking.

Body:
```json
{
  "slotStartAt": "2026-06-03T04:00:00.000Z",
  "bookerName": "Alice",
  "bookerEmail": "alice@example.com",
  "responses": { "company": "Acme" }
}
```

Response `201`:
```json
{
  "booking": {
    "id": "uuid",
    "calendar_id": "uuid",
    "assigned_user_id": 12,
    "assigned_user_name": "Alex",
    "assigned_user_email": "alex@example.com",
    "status": "confirmed"
  },
  "meetingUrl": "http://localhost:3000/meetings/<bookingId>",
  "confirmationMessage": "...",
  "reminders": [{ "minutesBefore": 10, "remindAt": "..." }]
}
```

### GET `/api/calendars/:calendarId/bookings?date=YYYY-MM-DD&status=confirmed`
Creator booking list with optional filters.

---

### Booking Management (Protected)

### POST `/api/bookings/:bookingId/cancel`
Cancel booking (calendar creator only).

Body:
```json
{ "cancelReason": "Canceled by creator" }
```

---

### Public Calendar API (No Auth)

### GET `/api/public/calendars/:slug`
Public calendar details for share/embed.

### GET `/api/public/calendars/:slug/slots?date=YYYY-MM-DD`
Public slot generation.

### POST `/api/public/calendars/:slug/bookings`
Public booking creation.

Body:
```json
{
  "slotStartAt": "2026-06-03T04:00:00.000Z",
  "bookerName": "Alice",
  "bookerEmail": "alice@example.com",
  "responses": { "company": "Acme" }
}
```

### GET `/api/public/calendars/meetings/:bookingId`
Public meeting lookup by booking ID.

Response includes calendar recording/type hints:
```json
{
  "booking": {
    "id": "uuid",
    "status": "confirmed",
    "slotStartAt": "2026-06-03T04:00:00.000Z",
    "slotEndAt": "2026-06-03T04:30:00.000Z",
    "bookerName": "Alice",
    "meetingUrl": "http://localhost:3000/meetings/<bookingId>"
  },
  "calendar": {
    "id": "uuid",
    "title": "Consultation",
    "timezone": "Asia/Dhaka",
    "slug": "consultation-abc123",
    "settings": {
      "calendarType": "round_robin",
      "autoRecordMeeting": true
    }
  }
}
```

---

## Error Conventions

Common statuses:
- `400` bad request / invalid input
- `401` missing auth
- `403` forbidden
- `404` not found
- `409` conflict (e.g. slot unavailable)
- `500` server error

Typical body:
```json
{ "error": "Human readable message" }
```

---

## Socket.IO Realtime Contract (Server)

Connection:
- Connect to server URL (default `http://localhost:3001`)
- Send JWT in `auth.token` (client currently uses localStorage token)

Client -> Server:
- `request-join` `{ roomId, userId, userData, isHost }`
- `approve-join` `{ roomId, targetSocketId }`
- `deny-join` `{ roomId, targetSocketId }`
- `approve-all` `{ roomId }`
- `host-mute` `{ roomId, targetSocketId }`
- `host-mute-all` `{ roomId }`
- `host-stop-video` `{ roomId, targetSocketId }`
- `transfer-host` `{ roomId, targetSocketId }`
- `raise-hand` `{ roomId, userId, userData }`
- `lower-hand` `{ roomId }`
- `request-unmute` `{ roomId, userId, userData }`
- `approve-unmute` `{ roomId, targetSocketId }`
- `deny-unmute` `{ roomId, targetSocketId }`
- `send-offer` `{ roomId, targetSocketId, offer }`
- `send-answer` `{ roomId, targetSocketId, answer }`
- `send-ice-candidate` `{ roomId, targetSocketId, candidate }`
- `send-message` `{ roomId, message, senderName, timestamp }`
- `toggle-camera` `{ roomId, enabled }`
- `toggle-microphone` `{ roomId, enabled }`
- `start-screen-share` `{ roomId, offer }` (legacy event currently unused by hook)
- `stop-screen-share` `{ roomId }` (legacy event currently unused by hook)
- `leave-room` `(roomId, userId)`
- `end-meeting` `{ roomId }`
- `join-recorder` `{ roomId, sessionId, serviceInstanceId, serviceToken }`

Server -> Client:
- `join-pending` `{ roomId, waitingForHost }`
- `join-approved` `{ roomId, isHost }`
- `join-denied` `{ roomId }`
- `join-request` `{ roomId, socketId, userId, userData }`
- `room-participants` `Participant[]`
- `user-joined` `{ userId, socketId, userData }`
- `user-left` `{ socketId, userId }`
- `receive-offer` `{ socketId, offer }`
- `receive-answer` `{ socketId, answer }`
- `receive-ice-candidate` `{ socketId, candidate }`
- `force-mute` `{ roomId }`
- `force-video-off` `{ roomId }`
- `unmute-request` `{ roomId, socketId, userId, userData }`
- `allow-unmute` `{ roomId }`
- `unmute-denied` `{ roomId }`
- `hand-raised` `{ roomId, socketId, userId, userData }`
- `hand-lowered` `{ roomId, socketId }`
- `host-changed` `{ hostSocketId, hostUserId }`
- `visible-participants-updated` `Participant[]`
- `recording-session-updated` `RecordingSession | null`
- `recorder-joined` `{ roomId, sessionId, socketId }`
- `recorder-join-denied` `{ roomId, sessionId }`
- `meeting-ended` `{ roomId }`
- `meeting-end-failed` `{ roomId }`
- `auth-error` `{ message }`

---

## Media / Recording Notes

- Host recording UI now controls a backend session manager.
- The browser is no longer the source of truth for recording lifecycle.
- A hidden recorder worker is expected to join the room and execute the actual capture pipeline.
- If the host leaves but the meeting remains active, the recorder worker can continue because it is a separate hidden participant.
- Screen share still has frontend option to include device audio (`getDisplayMedia({ audio: true })` when enabled).
- Device audio availability depends on browser and capture target (tab/window/system constraints).

---

## Source of Truth Files

- HTTP routes: `server/routes/*.ts`
- Socket handlers: `server/index.ts`
- Calendar slot logic/types: `server/services/calendarService.ts`
- Frontend media controls (recording session control, share-audio option): `app/room/[roomId]/page.tsx`, `hooks/useWebRTC.ts`
