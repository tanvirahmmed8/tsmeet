# TSMeet Features

TSMeet is a self-hosted, open-source meeting and scheduling platform built with Next.js, Node.js, Socket.IO, and LiveKit.

## Meetings

- Self-hosted LiveKit SFU audio/video with adaptive quality and efficient per-track subscriptions.
- Screen sharing with optional tab/system audio, camera and microphone controls, hand raising, chat, pinning, and responsive gallery layouts.
- Waiting room, host/co-host moderation, participant mute/remove, lock meeting, and end-meeting controls.
- Legacy WebRTC mesh fallback for controlled small rooms (`MAX_MESH_PARTICIPANTS`, 8 by default).

## Scheduling and accounts

- Calendar availability, holidays, public booking pages, confirmations, cancellations, and meeting links.
- Registration/login with bcrypt and HttpOnly `tsmeet_session` cookies; guest links can join without an account.
- Dashboard for meetings, calendars, bookings, participants, and recordings.

## Recording

- Optional self-hosted LiveKit Egress/recorder workflow with consent prompts and lifecycle controls.
- Private MinIO-backed recording archive, metadata APIs, retention, download, and deletion controls.

## Infrastructure and security

- Next.js same-origin API proxy, Express REST API, Socket.IO application events, MySQL persistence, and Redis coordination.
- No LiveKit Cloud or paid communications SDK is required. Production LiveKit uses UDP mux on `7882/udp` and TCP fallback on `7881/tcp`.
- WebRTC media is encrypted in transit with DTLS-SRTP; service credentials and LiveKit secrets never reach the browser.
