# API Documentation (Fully Updated)

Canonical source for backend HTTP + realtime contracts in this repo.

Base backend URL (local): `http://localhost:3001`

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
- Meeting recording controls (host start/pause/resume/stop): `Frontend only (browser MediaRecorder)`
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
- `meeting-ended` `{ roomId }`
- `meeting-end-failed` `{ roomId }`
- `auth-error` `{ message }`

---

## Media / Recording Notes

- Host recording UI exists in frontend room page and uses browser `MediaRecorder`.
- Start/pause/resume/stop are frontend controls.
- Recording is **not persisted by backend API** currently.
- Screen share has frontend option to include device audio (`getDisplayMedia({ audio: true })` when enabled).
- Device audio availability depends on browser and capture target (tab/window/system constraints).

---

## Source of Truth Files

- HTTP routes: `server/routes/*.ts`
- Socket handlers: `server/index.ts`
- Calendar slot logic/types: `server/services/calendarService.ts`
- Frontend media controls (recording, share-audio option): `app/room/[roomId]/page.tsx`, `hooks/useWebRTC.ts`
