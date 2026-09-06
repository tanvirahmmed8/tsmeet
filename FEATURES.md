# TSMeet Features

TSMeet is a self-hosted, open-source meeting and scheduling platform built with Next.js, Node.js, Socket.IO, and LiveKit.

## Meeting experience

- Camera and microphone preview before joining, with selectable input/output devices.
- Live audio/video meetings with gallery, active-speaker, pinned-participant, and hide-your-tile views.
- Screen sharing for a tab, window, or entire screen, with optional system/tab audio.
- Adaptive video quality and low-data mode that respond to network conditions.
- In-meeting chat, hand raising, participant status, and responsive controls.

## Host and participant controls

- Waiting room with admit, deny, and request-again flow.
- Mute all, stop video, remove participants, lock meeting, co-hosts, host transfer, and end-for-everyone.
- Searchable participant panel with host badges, mute state, raised-hand state, and pinning.
- Legacy WebRTC mesh fallback for controlled small rooms (`MAX_MESH_PARTICIPANTS`, 8 by default).

## Scheduling and accounts

- Calendar availability, holidays, public booking pages, confirmations, cancellations, and meeting links.
- Registration, sign-in/sign-out, protected dashboard, and guest links without an account.
- Dashboard for meetings, calendars, bookings, participants, and recordings.

## Recording

- Optional self-hosted LiveKit Egress/recorder workflow with consent prompts and lifecycle controls.
- Private MinIO-backed recording archive, metadata APIs, retention, download, and deletion controls.

## Infrastructure and security

- Next.js same-origin API proxy, Express REST API, Socket.IO application events, MySQL persistence, and Redis coordination.
- No LiveKit Cloud or paid communications SDK is required. Production LiveKit uses UDP mux on `7882/udp` and TCP fallback on `7881/tcp`.
- WebRTC media is encrypted in transit with DTLS-SRTP; service credentials and LiveKit secrets never reach the browser.
