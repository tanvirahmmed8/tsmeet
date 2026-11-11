# M05 — Chat delivery

Updated: 2026-11-11. Scope: [M05](BUG_FIXING_MILESTONES.md) / BUG-11.

## Verified local cause

The meeting page appended outgoing text only to component-local state and had
no transport call. The normal LiveKit hook had no chat receiver. The old mesh
sender was not wired to this UI either. Thus the visible sender-side message
was not proof of delivery. Separately, the backend trusted client-supplied
sender name and timestamp and did not validate message length/type.

## Local implementation

- Shared `useMeetingChat` sends/receives Socket.IO chat on the existing meeting
  socket for LiveKit and explicit mesh rollback; no second connection or
  LiveKit data-channel migration.
- Server handler verifies authenticated user, admitted visible membership and
  socket room membership. Pending/cross-room/hidden recorder sends are rejected.
  Identity comes from the admitted participant, not the message's claimed sender.
- Server generates message ID/time and broadcasts to the room, including sender.
  UI renders server echo with functional state updates, ID deduplication and a
  bounded 200-message live history. Text is not interpreted as HTML.
- Validation, per-socket rate limiting, optional request ID deduplication and
  acknowledgement provide failure feedback. Draft stays on failure; offline
  sends are not queued. Ambiguous timeout may mean delivery happened; manual
  retries create a new request and may duplicate it.
- Mobile chat stays inside the main meeting area, with a labelled close control
  and wrapping text/input. Real browser/Safari interaction still needs testing.

Exact payloads, limits, cache bounds and acknowledgement semantics:
[API.md — Chat delivery semantics](../API.md#chat-delivery-semantics).
User behaviour: [USER_GUIDE.md](USER_GUIDE.md#in-meeting-chat).

## Checks and limits

Final `pnpm check` passed on 2026-11-11: lint (0 errors, 10 existing warnings),
frontend/backend typecheck, existing regression suites, three chat tests and
production build. Existing middleware deprecation warning remains. The initial
chat test fixture had a Socket.IO event typing mismatch; it was corrected before
the final passing run. No dependency or lockfile regeneration was needed.

`pnpm test:chat` uses real loopback Socket.IO server/client connections, not a
mocked transport. It checks two-way room delivery, server sender/time, no
cross-room broadcast, malformed/empty/oversized input, unauthorized/pending/
recorder sends, duplicate request suppression, rate limiting, reconnected
socket sends and revoked membership. Client-state tests cover duplicate and
wrong-room events, malformed values and bounded history.
The handler also reads the current verified identity rather than freezing the
handshake value, preserving the existing verified request-join token fallback;
the transport fixture checks identity becoming available after connection.

The fixture controls authentication/admission directly; it does not test real
cookie/proxy/login or request-join approval flows. A new connection represents
reconnect; automatic reconnection and production re-admission require the
real-client test below. There is no persistent history, late-join history or
replay of messages missed while disconnected. No delivery/read guarantee is
claimed for every recipient.

## Release and real-client acceptance — pending

No Git command or production deployment was executed by the agent. Both
**frontend rebuild/deploy** and **backend restart** are required, since client
wiring and server handlers/contracts changed. Native service user, ExecStart,
environment loading and standalone asset paths must be inspected before exact
deployment commands are chosen. Use the manual process in
[BUG_FIXING_MILESTONES.md](BUG_FIXING_MILESTONES.md). No database migration,
volume deletion, secrets change or LiveKit restart is required by M05 itself.

On laptop host + guest + iPhone Safari: send both ways, check names and a
single sender echo, Bengali/long/plain-text markup messages, waiting-room and
cross-room isolation, offline error with preserved draft, re-admission after
reconnect, and new sends after recovery. Refresh should not imply historical
chat recovery. Repeat with the chat panel in fullscreen/mobile layouts. Verify
the deployed backend was restarted: old handlers will not provide the new
acknowledgement/identity contract. Keep M05 open until release acceptance passes.
