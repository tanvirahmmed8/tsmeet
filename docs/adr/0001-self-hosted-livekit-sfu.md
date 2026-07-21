# ADR 0001: Self-hosted LiveKit SFU

- Status: Accepted
- Date: 2026-07-20
- Decision owners: TSMeet project

## Context

TSMeet currently uses peer-to-peer WebRTC mesh connections. Upload cost grows with every participant, the hidden recorder adds another peer, and large rooms are not practical. The product must remain self-hosted, open-source, and free of managed communication APIs.

## Decision

TSMeet will migrate live media to a self-hosted LiveKit SFU. Express, MySQL, Redis, Next.js, and Socket.IO remain responsible for application data and business workflows. LiveKit Cloud and other paid media APIs are prohibited dependencies.

### Capacity targets

- Maximum participants per room: 50
- Initial expected concurrent rooms: 10
- Initial expected concurrent connected users: 200
- Initial deployment: one region
- A LiveKit room remains on one SFU node; additional rooms may be distributed across nodes later

These are product targets, not guaranteed server capacity. Milestone 12 must establish tested limits for the selected hardware.

### Media targets

- Camera simulcast layers: 180p, 360p, and 720p
- Screen share: up to 1080p
- Desktop visible video tiles: 9
- Mobile visible video tiles: 4
- Pinned and active-speaker layouts are required
- Off-screen video tracks must be unsubscribed or paused
- Audio-only and low-data modes are required

### Performance targets

- Interactive media latency target: below 500 ms under healthy network conditions
- Meeting join target: below 3 seconds after admission
- Reconnect target: below 10 seconds after a short network interruption
- Video packet-loss adaptation must reduce quality automatically
- No participant should upload a separate stream for every subscriber

### Recording and retention

- Default output: 720p MP4 room composite
- Optional output: individual tracks when explicitly requested
- Default retention: 30 days, configurable per deployment
- Storage: self-hosted MinIO
- Recording: self-hosted LiveKit Egress

### Browser support

- Latest two stable releases of Chrome and Edge
- Latest two stable releases of Firefox
- Current and previous major Safari release
- Current Chrome on Android and Safari on iOS

### TURN decision

Use LiveKit embedded TURN for the initial deployment. A standalone Coturn deployment remains an allowed future option if traffic isolation, independent scaling, or operational requirements justify it.

## Consequences

- Clients publish media once to the SFU and subscribe only to relevant tracks.
- Server bandwidth becomes a primary capacity constraint.
- LiveKit, Redis, TURN, Egress, and MinIO become production infrastructure.
- The existing mesh implementation remains behind a temporary migration flag until controlled rollout is complete.
- Live recording composition moves from the custom hidden mesh recorder to LiveKit Egress.

## Non-goals

- No LiveKit Cloud dependency
- No Twilio, Agora, Daily, Zoom, or other paid media API
- No server-side composite stream for normal interactive viewing
- No multi-region deployment before single-region capacity and recovery tests pass
